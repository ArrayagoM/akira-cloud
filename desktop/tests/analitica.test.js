// tests/analitica.test.js — análisis de conversaciones: temas, preguntas repetidas y "el bot no supo", todo anonimizado.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-anal-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const an = require('../main/bot-engine/services/bot/analitica.service');

(async () => {
  console.log('\n[analitica] Tests:');

  // ── privacidad ──
  const sucio = 'Hola, soy Ana, mi cel es +54 9 2241 49-7226 y mi mail ana.lopez@gmail.com, el CBU 0000003100012345678901 y mi DNI 30123456';
  const limpio = an.anonimizar(sucio);
  assert(!/2241|ana\.lopez|gmail|0000003100|30123456/.test(limpio) && /\[mail\]/.test(limpio) && /\[número\]/.test(limpio), 'se quitan teléfonos, mails, CBU y DNI antes de guardar');
  assert(an.anonimizar('x'.repeat(500)).length === 200 && an.anonimizar(null) === '', 'se acota a 200 caracteres y tolera datos vacíos');
  assert(/turno para el 15\/10/.test(an.anonimizar('quiero un turno para el 15/10')), 'los números cortos (fechas) se conservan');

  // ── temas ──
  for (const [t, tema] of [['¿Cuánto sale el corte?', 'Precios'], ['a qué hora abren los sábados', 'Horarios'], ['¿dónde están ubicados?', 'Ubicación'], ['quiero sacar un turno para mañana', 'Turnos y reservas'], ['aceptan mercadopago o solo efectivo', 'Medios de pago'], ['necesito cancelar mi turno del jueves', 'Cancelar o cambiar'], ['tienen stock del shampoo', 'Productos y stock'], ['hay algún descuento para jubilados', 'Promos y descuentos'], ['cuánto dura la coloración', 'Servicios'], ['hacen envío a domicilio', 'Pedidos y envíos'], ['quiero hacer un reclamo', 'Reclamos'], ['jajaja qué lindo día', 'Otras consultas']]) {
    assert(an.clasificarTema(t) === tema, `"${t}" → ${tema}`);
  }

  // ── "no supo responder" ──
  assert(an.noSupoResponder('¿Atienden con obra social?', 'Esa información no la tengo, pero le consulto con Martín y te aviso. 🙏') === true, 'si el bot dice que va a consultar, cuenta como "no supo"');
  assert(an.noSupoResponder('¿Cuánto sale el corte?', 'El corte sale $9.000 y dura 30 minutos.') === false, 'una respuesta concreta no cuenta');
  assert(an.noSupoResponder('hola buenas', 'No tengo esa información') === false && an.noSupoResponder('gracias!', 'te aviso cualquier cosa') === false, 'un saludo o un agradecimiento nunca cuenta como pregunta sin respuesta');
  assert(an.noSupoResponder('¿hacen tratamientos para el pelo graso?', '¡Ups! Tuve un problema. ¿Me repetís la consulta?') === true, 'si el bot falló con una pregunta real, también cuenta');

  // ── resumen ──
  const ahora = new Date('2026-10-08T12:00:00Z').getTime();
  const d = (dias, pregunta, extra = {}) => ({ ts: new Date(ahora - dias * 86400000).toISOString(), pregunta, tema: an.clasificarTema(pregunta), sinRespuesta: false, ...extra });
  const docs = [
    d(1, '¿Cuánto sale el corte?'), d(2, 'cuánto cuesta un corte'), d(3, '¿cuánto sale el corte de pelo?'), d(1, 'a qué hora abren'), d(4, 'hola'),
    d(1, '¿Atienden con obra social?', { sinRespuesta: true }), d(5, 'atienden con obra social?', { sinRespuesta: true }), d(2, '¿hacen tratamientos con keratina?', { sinRespuesta: true }),
    d(60, '¿Cuánto sale el color?'),
  ];
  let r = an.resumir(docs, { dias: 30, ahora });
  assert(r.total === 8 && r.sinRespuesta === 3 && r.porcentajeResuelto === 63, 'cuenta las consultas de los últimos 30 días (la de hace 60 queda afuera) y el % que el bot resolvió');
  assert(r.temas[0].tema === 'Precios' && r.temas[0].n === 3 && r.temas[0].ejemplos.length >= 1, 'el tema más consultado es Precios');
  assert(r.masPreguntadas[0].veces >= 2 && /cuánto|cuanto/i.test(r.masPreguntadas[0].pregunta), 'agrupa preguntas parecidas ("cuánto sale el corte" ≈ "cuánto cuesta un corte")');
  assert(r.sinResponder[0].veces === 2 && /obra social/i.test(r.sinResponder[0].pregunta) && r.sinResponder.length === 2, 'las preguntas sin respuesta se agrupan: "obra social" 2 veces; "keratina" 1');
  assert(an.resumir(docs, { dias: 90, ahora }).total === 9 && an.resumir(docs, { dias: 7, ahora }).total === 8, 'filtra por 7 / 30 / 90 días');
  r = an.resumir([], { ahora });
  assert(r.total === 0 && r.porcentajeResuelto === null && r.temas.length === 0, 'sin datos no rompe');

  // ── rutas ──
  const Analitica = require('../main/bot-engine/models/Analitica');
  for (const x of docs) await Analitica.create({ userId: 'u1', ...x, ts: new Date(Date.now() - (ahora - new Date(x.ts).getTime())).toISOString() });
  await Analitica.create({ userId: 'u2', ts: new Date().toISOString(), pregunta: 'de otro negocio', tema: 'Otras consultas', sinRespuesta: true });
  const app = express(); app.use(express.json());
  app.use('/api/app/analitica', require('../main/local-api/routes/analitica.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); } }));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/analitica`;
  let x = await (await fetch(base + '?dias=30')).json();
  assert(x.total === 8 && !JSON.stringify(x).includes('de otro negocio'), 'la API resume solo los datos del negocio');
  x = await (await fetch(base + '?dias=999')).json();
  assert(x.dias === 30, 'un período inválido usa 30 días');
  x = await (await fetch(base, { method: 'DELETE' })).json();
  assert(x.ok && (await Analitica.find({ userId: 'u1' }).lean()).length === 0 && (await Analitica.find({ userId: 'u2' }).lean()).length === 1, 'el dueño puede borrar todo su historial (sin tocar el de otros)');
  srv.close();

  console.log('\n✅ Todos los tests de analitica pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
