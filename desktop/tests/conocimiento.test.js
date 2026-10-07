// tests/conocimiento.test.js — base de conocimiento propia: el dueño sube sus preguntas frecuentes y el bot usa
// SOLO los fragmentos relevantes para cada pregunta.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-conoc-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const svc = require('../main/bot-engine/services/bot/conocimiento.service');

const FAQ = `Preguntas frecuentes de Barbería Tincho

¿Dónde están? Estamos en Av. San Martín 1234, Ranchos, a una cuadra de la plaza. Hay estacionamiento sobre la calle.

Formas de pago: aceptamos efectivo, transferencia y MercadoPago. No aceptamos tarjetas de crédito en cuotas. Los turnos se señan con el 30% del valor.

Política de cancelación: podés cancelar o reprogramar hasta 12 horas antes sin costo. Si faltás sin avisar, se pierde la seña y para el próximo turno se pide pago completo por adelantado.

Cuidados después del color: no te laves el pelo durante las primeras 48 horas y usá shampoo sin sulfatos. Evitá la pileta y el sol directo la primera semana.

Productos: vendemos shampoo sin sulfatos, cera modeladora y aceite para barba. Los precios están en el catálogo.

Menores de edad: los menores de 12 años deben venir acompañados por un adulto responsable.`;

(async () => {
  console.log('\n[conocimiento] Tests:');

  // ── fragmentar ──
  const frags = svc.fragmentar(FAQ);
  assert(frags.length >= 1 && frags.every((f) => f.length <= svc.MAX_FRAGMENTO), 'parte el documento en fragmentos que no superan el máximo');
  assert(svc.fragmentar('').length === 0 && svc.fragmentar('   \n\n  ').length === 0, 'texto vacío → sin fragmentos');
  const largo = svc.fragmentar('Esta es una oración bastante larga que se repite. '.repeat(60));
  assert(largo.length >= 3 && largo.every((f) => f.length <= svc.MAX_FRAGMENTO), 'un párrafo gigante se corta en oraciones sin pasarse del máximo');
  assert(svc.fragmentar('x'.repeat(2000)).every((f) => f.length <= svc.MAX_FRAGMENTO), 'incluso una "palabra" interminable se corta');
  const chico = svc.fragmentar('Uno.\n\nDos.\n\nTres.');
  assert(chico.length === 1, 'párrafos cortos se agrupan en un solo fragmento');

  // ── tokens ──
  assert(svc.tokens('¿Dónde están ubicados?').join() === 'ubicado' || svc.tokens('¿Dónde están ubicados?').includes('ubicado'), 'normaliza tildes, signos y plurales; descarta palabras vacías');
  assert(!svc.tokens('hola buenas quiero saber').length, 'un saludo no genera palabras de búsqueda');

  // ── búsqueda ──
  const doc = { _id: 'd1', titulo: 'Preguntas frecuentes', fragmentos: svc.fragmentar(FAQ, 260) };
  const top = (q) => svc.buscar([doc], q)[0]?.texto || '';
  assert(/San Martín 1234/.test(top('¿dónde queda la barbería?')) || /San Martín 1234/.test(top('cual es la direccion')), 'pregunta por la dirección → trae el fragmento de dónde están');
  assert(/MercadoPago/.test(top('aceptan mercadopago o tarjeta')), 'pregunta por medios de pago → trae formas de pago');
  assert(/48 horas/.test(top('puedo lavarme el pelo después del color')), 'pregunta por cuidados del color → trae esos cuidados');
  assert(/12 horas/.test(top('si cancelo el turno pierdo la seña')), 'pregunta por cancelación → trae la política');
  assert(/menores de 12/i.test(top('puedo llevar a mi hijo de 8 años')) || /acompañados/.test(top('puedo llevar a mi hijo menor')), 'pregunta por menores → trae esa regla');
  assert(svc.buscar([doc], 'hola buenas').length === 0, 'un saludo no trae nada (el bot sigue su flujo normal)');
  assert(svc.buscar([doc], 'cuánto sale un viaje a la luna en cohete').length === 0, 'una pregunta que el documento no cubre no trae fragmentos irrelevantes');
  const unico = [{ _id: 'u', titulo: 'FAQ', fragmentos: ['Aceptamos efectivo, transferencia y MercadoPago.'] }];
  assert(svc.buscar(unico, 'aceptan mercadopago').length === 1 && svc.buscar(unico, 'cuánto sale el corte').length === 0, 'un documento corto (un solo fragmento) también se encuentra, y no trae cosas que no tienen que ver');
  assert(svc.buscar([doc], 'formas de pago', { k: 2 }).length <= 2 && svc.buscar([], 'pago').length === 0, 'respeta el máximo y no rompe sin documentos');
  const dos = svc.buscar([doc, { _id: 'd2', titulo: 'Promos', fragmentos: ['Los martes hay 20% de descuento en cortes para jubilados.'] }], 'hay descuento para jubilados');
  assert(dos[0].docId === 'd2' && /jubilados/.test(dos[0].texto), 'busca en TODOS los documentos y trae el que corresponde');

  // ── prompt y consulta ──
  const nota = svc.notaParaPrompt(svc.buscar([doc], 'formas de pago'));
  assert(/INFORMACIÓN DEL NEGOCIO/.test(nota) && /no inventes/.test(nota) && /consultás con el dueño/.test(nota) && /\[1\]/.test(nota), 'la nota para la IA le dice que use el documento, que no invente y que consulte al dueño si no alcanza');
  assert(svc.notaParaPrompt([]) === '', 'sin fragmentos relevantes no agrega nada al prompt');
  const h = [{ role: 'user', content: '¿Aceptan MercadoPago?' }, { role: 'assistant', content: 'Sí' }, { role: 'user', content: 'y tarjeta?' }];
  assert(/MercadoPago/.test(svc.consultaDesdeHistorial(h)) && /tarjeta/.test(svc.consultaDesdeHistorial(h)), 'si el último mensaje es muy corto ("y tarjeta?") le suma el anterior para entender el contexto');
  assert(svc.consultaDesdeHistorial([{ role: 'user', content: 'quiero saber el horario de atención de los sábados' }, { role: 'assistant', content: 'x' }]) === 'quiero saber el horario de atención de los sábados' && svc.consultaDesdeHistorial([]) === '', 'un mensaje largo se usa solo; sin historial no hay consulta');

  // ── rutas ──
  const Conocimiento = require('../main/bot-engine/models/Conocimiento');
  let usuario = 'u1';
  const app = express(); app.use(express.json({ limit: '25mb' }));
  app.use('/api/app/conocimiento', require('../main/local-api/routes/conocimiento.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: usuario }; n(); } }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/conocimiento`;
  const j = async (p, body, method) => { const x = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };

  let r = await j('/texto', { titulo: 'Preguntas frecuentes', texto: FAQ });
  assert(r.status === 200 && r.body.documento.fragmentos >= 1 && r.body.documento.titulo === 'Preguntas frecuentes', 'pegar texto: se guarda partido en fragmentos');
  r = await j('/texto', { titulo: 'x', texto: 'corto' });
  assert(r.status === 422 && /No encontré texto/.test(r.body.error), 'un texto casi vacío se rechaza con un mensaje claro');
  r = await j('/archivo', { nombre: 'faq.txt', base64: Buffer.from(FAQ + '\n\nHorario: lunes a sábados de 9 a 19.').toString('base64') });
  assert(r.status === 200 && r.body.documento.titulo === 'faq' && r.body.documento.origen === 'txt', 'subir un .txt (el título sale del nombre del archivo)');
  const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'lista-precios.pdf')).toString('base64');
  r = await j('/archivo', { nombre: 'lista.pdf', base64: pdf });
  assert(r.status === 200 && r.body.documento.caracteres > 20, 'subir un PDF con texto');
  r = await j('/archivo', { nombre: 'virus.exe', base64: Buffer.from('MZ').toString('base64') });
  assert(r.status === 415, 'otros formatos se rechazan');
  r = await j('/archivo', { nombre: 'x.pdf', base64: Buffer.from('no es un pdf').toString('base64') });
  assert(r.status >= 400 && /No se pudo leer|No encontré/.test(r.body.error), 'un PDF dañado da un error claro y no rompe');
  r = await j('/archivo', { nombre: 'faq.txt' });
  assert(r.status === 400, 'sin archivo → 400');

  r = await j('');
  assert(r.body.documentos.length === 3 && r.body.limites.maxDocumentos === 10 && !JSON.stringify(r.body).includes('fragmentos":["'), 'el listado muestra un resumen de cada documento (no todo el texto)');
  r = await j('/probar', { pregunta: '¿aceptan mercadopago?' });
  assert(r.body.hayDocumentos && r.body.fragmentos.length >= 1 && /MercadoPago/.test(r.body.fragmentos[0].texto), '"probar" muestra qué fragmentos usaría el bot para esa pregunta');
  assert((await j('/probar', { pregunta: 'a' })).status === 400, 'una pregunta vacía → 400');
  usuario = 'u2';
  r = await j('');
  assert(r.body.documentos.length === 0 && (await j('/probar', { pregunta: 'aceptan mercadopago' })).body.fragmentos.length === 0, 'otro usuario no ve ni usa los documentos del primero');
  usuario = 'u1';
  const id = (await j('')).body.documentos[0]._id;
  usuario = 'u2'; await j(`/${id}`, null, 'DELETE'); usuario = 'u1';
  assert((await j('')).body.documentos.length === 3, 'otro usuario no puede borrar documentos ajenos');
  await j(`/${id}`, null, 'DELETE');
  assert((await j('')).body.documentos.length === 2, 'borrar un documento');

  // límites
  for (let i = 0; i < 9; i++) await Conocimiento.create({ userId: 'u3', titulo: `d${i}`, origen: 'texto', caracteres: 100, fragmentos: ['x'] });
  usuario = 'u3';
  assert((await j('/texto', { titulo: 'uno más', texto: 'Texto de prueba suficientemente largo para guardarlo.' })).status === 200, 'el décimo documento entra');
  r = await j('/texto', { titulo: 'once', texto: 'Texto de prueba suficientemente largo para guardarlo.' });
  assert(r.status === 409 && /10 documentos/.test(r.body.error), 'el undécimo se rechaza con un mensaje claro');
  usuario = 'u4';
  r = await j('/texto', { titulo: 'gigante', texto: 'palabra '.repeat(30000) });
  assert(r.status === 413 && /demasiado largo/.test(r.body.error), 'un documento enorme se rechaza');

  srv.close();
  console.log('\n✅ Todos los tests de conocimiento pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
