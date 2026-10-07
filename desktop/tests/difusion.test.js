// tests/difusion.test.js — mensajes a grupos de clientes: SIEMPRE con confirmación, solo a quien corresponde,
// con baja, ritmo lento y tope diario (para no hacer que WhatsApp bloquee el número).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-dif-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const dif = require('../main/difusion');

(async () => {
  console.log('\n[difusion] Tests:');
  const ahora = new Date(2026, 9, 8, 12, 0); // 8/10/2026
  const hace = (n) => new Date(ahora.getTime() - n * 86400000);
  const cli = (o) => ({ jid: `549${'22410010' + o.n}@s.whatsapp.net`, nombre: `Cliente ${o.n}`, historial: [{ role: 'user', content: 'hola' }], turnosConfirmados: [], etiquetas: [], silenciado: false, updatedAt: hace(5), ...o });
  const turnosPor = (mapa) => new Map(Object.entries(mapa));
  const ctx = (extra = {}) => ({ ahora, ignorados: new Set(), ultimaDifusion: {}, ...extra });

  // ── texto ──
  assert(dif.primerNombre('  María José López ') === 'María' && dif.primerNombre('') === '' && dif.primerNombre('Ana<script>') === 'Anascript', 'toma solo el primer nombre y lo limpia');
  const t = dif.redactar('Hola {nombre}, te espera {negocio}', { nombre: 'Ana López' }, { negocio: 'Barbería Tincho' });
  assert(t.startsWith('Hola Ana, te espera Barbería Tincho') && /BAJA/.test(t), 'reemplaza nombre y negocio, y agrega cómo darse de baja');
  assert((dif.redactar('Respondé BAJA para salir', { nombre: 'X' }).match(/BAJA/g) || []).length === 1, 'si el mensaje ya explica la baja, no la repite');
  assert(dif.redactar('   ', { nombre: 'X' }) === '', 'un mensaje vacío sigue vacío');

  // ── elegibilidad ──
  assert(dif.esElegible(cli({ n: '01' }), ctx()).ok, 'un cliente que habló con el bot es elegible');
  assert(dif.esElegible(cli({ n: '02', jid: '123456@lid' }), ctx()).motivo === 'sin-numero', 'sin número real de WhatsApp (@lid) → no');
  assert(dif.esElegible(cli({ n: '03', noMolestar: true }), ctx()).motivo === 'baja', 'pidió la baja → no');
  assert(dif.esElegible(cli({ n: '04', silenciado: true }), ctx()).motivo === 'silenciado', 'chat silenciado (lo atiende el dueño) → no');
  assert(dif.esElegible(cli({ n: '05' }), ctx({ ignorados: new Set(['54922410005'.replace('54922410005', '5492241005')]) })).ok, 'un número parecido pero distinto no se confunde');
  assert(dif.esElegible(cli({ n: '06' }), ctx({ ignorados: new Set(['5492241006']) })).motivo === 'bloqueado' || dif.esElegible(cli({ n: '06' }), ctx({ ignorados: new Set([dif.numeroDe(cli({ n: '06' }).jid)]) })).motivo === 'bloqueado', 'chat bloqueado → no');
  const importado = cli({ n: '07', historial: [], origenImport: true });
  assert(dif.esElegible(importado, ctx()).motivo === 'nunca-hablo', 'importado desde una planilla que nunca escribió ni vino → no (sería spam)');
  assert(dif.esElegible(importado, ctx({ incluirImportados: true })).ok, 'salvo que el dueño lo incluya a propósito');
  assert(dif.esElegible(importado, ctx({ turnosPorTel: new Set([dif.numeroDe(importado.jid).slice(-10)]) })).ok, 'o que ya tenga turnos');
  assert(dif.esElegible(cli({ n: '08' }), ctx({ ultimaDifusion: { [cli({ n: '08' }).jid]: hace(3).getTime() } })).motivo === 'reciente', 'si recibió un mensaje de este tipo hace 3 días → todavía no');
  assert(dif.esElegible(cli({ n: '08' }), ctx({ ultimaDifusion: { [cli({ n: '08' }).jid]: hace(20).getTime() } })).ok, 'pasados 14 días sí');

  // ── segmentos ──
  const turno = (dias, estado = 'confirmado') => ({ estado, fechaInicio: hace(dias) });
  const clientes = [
    cli({ n: '10', nombre: 'Vino ayer' }), cli({ n: '11', nombre: 'Vino hace 90 días' }), cli({ n: '12', nombre: 'Solo charló', updatedAt: hace(200) }),
    cli({ n: '13', nombre: 'Cumple hoy', cumple: '10-08', etiquetas: ['VIP'] }), cli({ n: '14', nombre: 'Cumple en octubre', cumple: '10-25' }), cli({ n: '15', nombre: 'Cumple otro mes', cumple: '03-02' }),
    cli({ n: '16', nombre: 'Baja', noMolestar: true, updatedAt: hace(300) }),
  ];
  const porTel = turnosPor({ '2241001010': [turno(1)], '2241001011': [turno(90), turno(200)], '2241001013': [turno(100, 'cancelado')] });
  let r = dif.seleccionar(clientes, porTel, { tipo: 'inactivos', dias: 45 }, ctx());
  assert(r.elegibles.map((e) => e.nombre).join() === 'Vino hace 90 días,Solo charló', 'inactivos (45 días): usa el último turno CONFIRMADO; sin turnos, la última charla (un turno cancelado no cuenta como visita, pero si charló hace 5 días no está inactivo)');
  assert(r.excluidos.baja === 1, 'y cuenta cuántos se dejaron afuera y por qué (1 pidió la baja)');
  r = dif.seleccionar(clientes, porTel, { tipo: 'inactivos', dias: 120 }, ctx());
  assert(r.elegibles.map((e) => e.nombre).join() === 'Solo charló', 'con 120 días solo queda el que lleva más sin venir');
  const conAusente = new Map([...porTel, ['2241001011', [turno(90), { ...turno(10), ausente: true }]]]);
  assert(dif.seleccionar(clientes, conAusente, { tipo: 'inactivos', dias: 45 }, ctx()).elegibles.some((e) => e.nombre === 'Vino hace 90 días'), 'un turno al que NO vino no cuenta como visita para saber si está inactivo')
  assert(dif.seleccionar(clientes, porTel, { tipo: 'cumple-hoy' }, ctx()).elegibles.map((e) => e.nombre).join() === 'Cumple hoy', 'cumpleaños de hoy');
  assert(dif.seleccionar(clientes, porTel, { tipo: 'cumple-mes' }, ctx()).elegibles.map((e) => e.nombre).join() === 'Cumple hoy,Cumple en octubre', 'cumpleaños del mes');
  assert(dif.seleccionar(clientes, porTel, { tipo: 'etiqueta', etiqueta: 'vip' }, ctx()).total === 1 && dif.seleccionar(clientes, porTel, { tipo: 'etiqueta', etiqueta: '' }, ctx()).total === 0, 'por etiqueta (sin distinguir mayúsculas); sin etiqueta no elige a nadie');
  assert(dif.seleccionar(clientes, porTel, { tipo: 'todos' }, ctx()).total === 6, '"todos" igual deja afuera a quien pidió la baja');

  // ── baja ──
  for (const x of ['BAJA', 'Baja!', 'stop', 'No me escriban más', 'quiero la baja', '¿Dar de baja?']) assert(dif.esPedidoDeBaja(x), `pedido de baja: "${x}"`);
  for (const x of ['quiero dar de baja mi turno', 'baja el precio?', 'hola', 'cuánto sale', 'no puedo ir, me escribís mañana']) assert(!dif.esPedidoDeBaja(x), `NO es baja: "${x}"`);

  // ── envío: lento, con tope y cancelable ──
  const enviados = []; const pausas = []; let conexion = true;
  const dormir = async (ms) => { pausas.push(ms); await new Promise((r2) => setImmediate(r2)); };
  const esperarFin = async (sv) => { for (let i = 0; i < 200 && sv.estado().enCurso; i++) await new Promise((r2) => setTimeout(r2, 5)); };
  const sv = dif.crearServicio({ userDataDir: dir, enviar: async (jid, tx) => { if (!conexion) return false; enviados.push({ jid, tx }); return true; }, esperar: dormir, azar: () => 0.5, ahora: () => ahora, tope: 5 });
  const dest = (n) => Array.from({ length: n }, (_, i) => ({ jid: `54922410${String(i).padStart(4, '0')}@s.whatsapp.net`, nombre: `Ana${String.fromCharCode(97 + (i % 26))} Apellido` }));
  let fallo = null; try { await sv.iniciar([], 'x'); } catch (e) { fallo = e; }
  assert(fallo?.codigo === 'VACIO', 'sin destinatarios no hace nada');
  await sv.iniciar(dest(3), 'Hola {nombre} desde {negocio}', { negocio: 'Mi Local' });
  await esperarFin(sv);
  assert(enviados.length === 3 && enviados[0].tx.startsWith('Hola Anaa desde Mi Local') && /BAJA/.test(enviados[0].tx), 'envía a cada uno con su nombre y la leyenda de baja');
  assert(pausas.length === 2 && pausas.every((p) => p >= 12000 && p <= 25000), 'entre mensaje y mensaje espera 12–25 segundos (no manda ráfagas)');
  assert(sv.estado().enviadosHoy === 3 && sv.estado().enviados === 3, 'cuenta lo enviado hoy');
  const e1 = dif.leerEstado(dir, ahora);
  assert(Object.keys(e1.ultimaDifusion).length === 3, 'recuerda a quién le escribió (para no repetirle en 14 días)');
  enviados.length = 0;
  await sv.iniciar(dest(10), 'Hola');
  await esperarFin(sv);
  assert(enviados.length === 2 && sv.estado().motivoCorte === 'tope' && sv.estado().saltados === 8, 'respeta el tope diario: manda solo los 2 que faltaban hasta 5 y avisa que el resto queda para otro día');
  fallo = null; try { await sv.iniciar(dest(2), 'Hola'); } catch (e) { fallo = e; }
  assert(fallo?.codigo === 'TOPE' && /mañana/.test(fallo.message), 'con el tope cumplido, no deja enviar más hoy');
  const mañana = new Date(ahora.getTime() + 86400000);
  const sv2 = dif.crearServicio({ userDataDir: dir, enviar: async () => true, esperar: dormir, ahora: () => mañana, tope: 5 });
  assert(sv2.estado().enviadosHoy === 0, 'al día siguiente el contador arranca de cero');

  // sin conexión: corta rápido en vez de insistir
  conexion = false; enviados.length = 0;
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-difB-'));
  const sv3 = dif.crearServicio({ userDataDir: dirB, enviar: async () => false, esperar: dormir, ahora: () => ahora, tope: 40 });
  await sv3.iniciar(dest(10), 'Hola'); await esperarFin(sv3);
  assert(sv3.estado().motivoCorte === 'sin-conexion' && sv3.estado().fallidos === 3 && sv3.estado().enviados === 0, 'si el bot no está conectado, corta después de 3 intentos fallidos');

  // cancelar
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-difC-'));
  let n = 0; let sv4;
  sv4 = dif.crearServicio({ userDataDir: dirC, enviar: async () => { n++; if (n === 2) sv4.detener(); return true; }, esperar: dormir, ahora: () => ahora, tope: 40 });
  await sv4.iniciar(dest(10), 'Hola'); await esperarFin(sv4);
  assert(n === 2 && sv4.estado().motivoCorte === 'cancelado', 'se puede cancelar a mitad de camino');

  // ── rutas ──
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const Turno = require('../main/bot-engine/models/Turno');
  const Config = require('../main/bot-engine/models/Config');
  const dirR = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-difR-'));
  const mk = (jid, extra) => BotCliente.create({ userId: 'u1', jid, nombre: extra.nombre, telefono: '', historial: [{ role: 'user', content: 'hola' }], turnosConfirmados: [], silenciado: false, ...extra });
  await mk('5492241111111@s.whatsapp.net', { nombre: 'Inactiva Ana', etiquetas: ['VIP'] });
  await mk('5492242222222@s.whatsapp.net', { nombre: 'Activa Beto' });
  await mk('5492243333333@s.whatsapp.net', { nombre: 'De Baja', noMolestar: true });
  await mk('5492244444444@s.whatsapp.net', { nombre: 'Ajena' }); await BotCliente.deleteOne({ jid: '5492244444444@s.whatsapp.net' });
  await BotCliente.create({ userId: 'otro', jid: '5492245555555@s.whatsapp.net', nombre: 'De otro negocio', historial: [{ role: 'user', content: 'x' }], turnosConfirmados: [] });
  const dd = (d) => new Date(Date.now() - d * 86400000);
  await Turno.create({ userId: 'u1', calendarId: 'p', clienteTelefono: '2241111111', fechaInicio: dd(100), fechaFin: dd(100), resumen: 'x', estado: 'confirmado' });
  await Turno.create({ userId: 'u1', calendarId: 'p', clienteTelefono: '2242222222', fechaInicio: dd(3), fechaFin: dd(3), resumen: 'x', estado: 'confirmado' });
  await Config.create({ userId: 'u1', negocio: 'Barbería Tincho', chatsIgnorados: [] });
  const enviadosR = []; let conectado = true;
  const botService = { hayConexion: () => conectado };
  const servicio = dif.crearServicio({ userDataDir: dirR, enviar: async (jid, tx) => { enviadosR.push({ jid, tx }); return true; }, esperar: async () => {}, tope: 40 });
  const app = express(); app.use(express.json());
  app.use('/api/app/difusion', require('../main/local-api/routes/difusion.routes')({ requerirSesion: (q, _r, nx) => { q.user = { _id: 'u1' }; nx(); }, servicioDifusion: servicio, botService }));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/difusion`;
  const j = async (p, body) => { const x = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };

  let x = await j('/vista-previa', { tipo: 'inactivos', dias: 45 });
  assert(x.status === 200 && x.body.total === 1 && x.body.elegibles[0].nombre === 'Inactiva Ana', 'vista previa: solo la clienta que hace 100 días que no viene (no la activa, no la que pidió la baja, no la de otro negocio)');
  assert(x.body.excluidos.baja === undefined && /\{nombre\}/.test(x.body.plantilla) && x.body.negocio === 'Barbería Tincho' && x.body.whatsappConectado === true && x.body.disponibleHoy === 40, 'trae un texto sugerido, el negocio y cuánto se puede mandar hoy');
  assert((await j('/vista-previa', { tipo: 'inventado' })).status === 400 && (await j('/vista-previa', { tipo: 'etiqueta' })).status === 400, 'tipos inválidos o etiqueta vacía → 400');
  x = await j('/enviar', { tipo: 'inactivos', dias: 45, mensaje: 'Hola {nombre}!' });
  assert(x.status === 400 && /confirmar/.test(x.body.error) && enviadosR.length === 0, 'sin confirmación explícita NO se envía nada');
  x = await j('/enviar', { tipo: 'inactivos', dias: 45, mensaje: 'ey', confirmar: true });
  assert(x.status === 400, 'un mensaje demasiado corto se rechaza');
  conectado = false;
  x = await j('/enviar', { tipo: 'inactivos', dias: 45, mensaje: 'Hola {nombre}, ¿te espero?', confirmar: true });
  assert(x.status === 409 && x.body.codigo === 'SIN_WHATSAPP', 'con el bot desconectado no se envía');
  conectado = true;
  x = await j('/enviar', { tipo: 'inactivos', dias: 45, mensaje: 'Hola {nombre}, ¿te espero?', confirmar: true, excluir: [] });
  for (let i = 0; i < 100 && servicio.estado().enCurso; i++) await new Promise((r2) => setTimeout(r2, 5));
  assert(x.status === 200 && enviadosR.length === 1 && enviadosR[0].jid === '5492241111111@s.whatsapp.net' && /Hola Inactiva/.test(enviadosR[0].tx), 'confirmado: sale el mensaje a la persona correcta con su nombre');
  x = await j('/vista-previa', { tipo: 'inactivos', dias: 45 });
  assert(x.body.total === 0 && x.body.excluidos.reciente === 1, 'ya no aparece de nuevo: recibió un mensaje hace instantes (14 días de descanso)');
  x = await j('/enviar', { tipo: 'etiqueta', etiqueta: 'VIP', mensaje: 'Novedad para vos {nombre}', confirmar: true, excluir: ['5492241111111@s.whatsapp.net'] });
  assert(x.status === 400, 'si no queda nadie (todos excluidos o con descanso) responde claro y no envía');
  x = await j('/estado');
  assert(x.status === 200 && x.body.tope === 40, 'estado del envío disponible para la barra de progreso');
  srv.close();

  console.log('\n✅ Todos los tests de difusion pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
