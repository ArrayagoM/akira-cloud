// tests/programas-clientes.test.js — fidelidad ("a la décima visita, una gratis") y reseñas después del servicio.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-prog-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const programas = require('../main/programas');
const res = require('../main/bot-engine/services/bot/resenas.service');

(async () => {
  console.log('\n[programas-clientes] Tests:');

  // ── configuración ──
  let c = programas.leer(dir);
  assert(c.fidelidad.activa === false && c.resenas.activa === false && c.fidelidad.cada === 10, 'ambos programas vienen apagados (fidelidad: cada 10 visitas)');
  c = programas.guardar(dir, { fidelidad: { activa: true, cada: 5, premio: 'Un corte gratis' }, resenas: { link: 'https://g.page/r/abc123/review', horasDespues: 24, activa: true } });
  assert(c.fidelidad.cada === 5 && c.fidelidad.premio === 'Un corte gratis' && c.resenas.link.startsWith('https://') && c.resenas.activa && programas.leer(dir).resenas.horasDespues === 24, 'se guardan y se leen');
  for (const [x, patron] of [[{ fidelidad: { cada: 1 } }, /entre 2 y 100/], [{ fidelidad: { cada: 'mucho' } }, /entre 2 y 100/], [{ fidelidad: { premio: '   ' } }, /premio/], [{ resenas: { link: 'javascript:alert(1)' } }, /https/], [{ resenas: { link: 'http://inseguro.com/x' } }, /https/], [{ resenas: { horasDespues: 3 } }, /Horario/]]) {
    let e = null; try { programas.guardar(dir, x); } catch (er) { e = er; }
    assert(e && patron.test(e.message), `rechaza ${JSON.stringify(x)}`);
  }
  assert(programas.leer(dir).fidelidad.cada === 5, 'un cambio inválido no pisa lo guardado');
  assert(programas.guardar(dir, { resenas: { link: '' } }).resenas.link === '', 'se puede quitar el enlace');

  // ── fidelidad ──
  const p = (visitas, canjes = 0, cada = 10) => programas.progreso({ visitas, canjes, cada });
  assert(p(3).enCiclo === 3 && p(3).faltan === 7 && !p(3).premioDisponible, '3 visitas de 10: faltan 7');
  assert(p(10).premioDisponible && p(10).premiosDisponibles === 1 && p(10).faltan === 0, 'a las 10 visitas: premio disponible');
  assert(!p(10, 1).premioDisponible && p(10, 1).enCiclo === 0 && p(10, 1).faltan === 10, 'después de canjear, el ciclo vuelve a empezar');
  assert(p(23, 1).enCiclo === 3 && p(23, 1).premiosDisponibles === 1, 'si vino mucho sin que le entreguen el premio, se acumulan');
  const ahora = new Date(2026, 9, 8, 12);
  const dia = (n) => new Date(ahora.getTime() + n * 86400000);
  const tt = (n, extra) => ({ estado: 'confirmado', fechaInicio: dia(n), ...extra });
  assert(programas.contarVisitas([tt(-5), tt(-3), tt(2), tt(-2, { estado: 'cancelado' }), tt(-1, { ausente: true }), tt(-9, { estado: 'pendiente' })], ahora) === 2, 'visitas = turnos confirmados que ya pasaron y a los que vino (no cuenta futuros, cancelados, pendientes ni ausencias)');

  // ── premios por cliente y API ──
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const Turno = require('../main/bot-engine/models/Turno');
  const tel = (n) => `22410${n}0000`; // 10 dígitos (código de área + número)
  const mkCli = (n, extra) => BotCliente.create({ userId: 'u1', jid: `549${tel(n)}@s.whatsapp.net`, nombre: `Cliente${n}`, telefono: `549${tel(n)}`, numeroReal: `549${tel(n)}`, historial: [], turnosConfirmados: [], ...extra });
  await mkCli('1'); await mkCli('2'); await mkCli('3');
  const cc = [];
  const crearTurnos = async (n, cuantos, extra = {}) => { for (let i = 0; i < cuantos; i++) cc.push(await Turno.create({ userId: 'u1', calendarId: 'p' + n, clienteTelefono: tel(n), fechaInicio: new Date(Date.now() - (i + 1) * 86400000 * 3), fechaFin: new Date(Date.now() - (i + 1) * 86400000 * 3 + 3600e3), resumen: 'Corte', estado: 'confirmado', pago: { monto: 100 }, ...extra })); };
  await crearTurnos('1', 5); await crearTurnos('2', 4); await crearTurnos('3', 7);
  await Turno.create({ userId: 'u2', calendarId: 'p', clienteTelefono: tel('2'), fechaInicio: new Date(Date.now() - 86400000), fechaFin: new Date(), resumen: 'ajeno', estado: 'confirmado' });

  const app = express(); app.use(express.json());
  app.use('/api/app/programas', require('../main/local-api/routes/programas.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, userDataDir: dir }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/programas`;
  const j = async (pth, body, method) => { const x = await fetch(base + pth, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };

  let r = await j('');
  assert(r.body.fidelidad.cada === 5 && r.body.premios.map((x) => x.nombre).sort().join() === 'Cliente1,Cliente3', 'lista a quién ya le toca el premio (5 visitas y 7 visitas de 5; el de 4 no; sin contar turnos de otro negocio)');
  r = await j('/canjear', { jid: '5492241020000@s.whatsapp.net' });
  assert(r.status === 409 && /todavía no tiene/.test(r.body.error), 'no se puede canjear si todavía no le toca');
  r = await j('/canjear', { jid: '5492241010000@s.whatsapp.net' });
  assert(r.status === 200, 'canjear el premio de Cliente1');
  r = await j('');
  assert(r.body.premios.map((x) => x.nombre).join() === 'Cliente3', 'después de canjear ya no figura con premio pendiente');
  r = await j('/canjear', { jid: '5492241010000@s.whatsapp.net' });
  assert(r.status === 409, 'no se puede canjear dos veces el mismo');
  assert((await j('/canjear', { jid: 'inexistente@s.whatsapp.net' })).status === 404, 'cliente inexistente → 404');
  await j('', { fidelidad: { activa: false } }, 'PUT');
  assert((await j('/canjear', { jid: '5492241030000@s.whatsapp.net' })).status === 409 && (await j('')).body.premios.length === 0, 'con el programa apagado no se canjea ni se listan premios');
  assert((await j('', { fidelidad: { cada: 0 } }, 'PUT')).status === 400, 'configuración inválida → 400');
  srv.close();

  // ── reseñas: interpretar la respuesta ──
  for (const [txt, n] of [['5', 5], ['4', 4], ['1', 1], ['5 estrellas', 5], ['4/5', 4], ['3 puntos', 3], ['Excelente!!', 5], ['muy bueno todo', 5], ['Bien', 4], ['regular', 3], ['mas o menos', 3], ['malo', 2], ['Pésimo', 1], ['10', 5], ['9', 5], ['no me gustó', 2], ['no estuvo bien', 2], ['me encantó', 5]]) {
    assert(res.interpretarRespuesta(txt).puntaje === n, `"${txt}" → ${n}`);
  }
  for (const txt of ['quiero otro turno para el sábado', 'hola', '', 'gracias, a qué hora abren? porque necesito pasar a buscar un producto y no sé si llego', '6', '0', 'jaja']) {
    assert(res.interpretarRespuesta(txt).puntaje === null, `NO es un puntaje: "${txt}"`);
  }
  assert(res.interpretarRespuesta('2 la espera fue larga').comentario === 'la espera fue larga', 'guarda el comentario que acompaña al número');

  // ── textos ──
  assert(/Ana/.test(res.mensajePedido({ nombre: 'Ana López', negocio: 'Barbería Tincho' })) && /1 al 5/.test(res.mensajePedido({ nombre: 'Ana', negocio: 'X' })), 'el pedido saluda por el nombre y explica cómo responder');
  assert(/https:\/\/g\.page/.test(res.respuestaAlCliente({ puntaje: 5, nombre: 'Ana', link: 'https://g.page/r/x/review', dueno: 'Martín' })), 'si respondió bien, se le pasa el enlace de Google');
  assert(!/http/.test(res.respuestaAlCliente({ puntaje: 2, nombre: 'Ana', link: 'https://g.page/r/x/review', dueno: 'Martín' })) && /Martín/.test(res.respuestaAlCliente({ puntaje: 2, nombre: 'Ana', link: 'https://g.page/x', dueno: 'Martín' })), 'si respondió mal NO se le pide reseña pública: se le agradece y se avisa al dueño');
  assert(!/http/.test(res.respuestaAlCliente({ puntaje: 5, nombre: 'Ana', link: '', dueno: 'Martín' })), 'sin enlace configurado, solo agradece');
  assert(/calificó con 2\/5/.test(res.avisoAlDueno({ puntaje: 2, nombre: 'Ana', numero: '549224', comentario: 'tardaron' })) && /tardaron/.test(res.avisoAlDueno({ puntaje: 2, nombre: 'Ana', numero: '549224', comentario: 'tardaron' })), 'el dueño se entera con el comentario cuando fue malo');
  assert(/Google/.test(res.avisoAlDueno({ puntaje: 5, nombre: 'Ana', numero: '1' })), 'y cuando fue bueno también');

  // ── qué turnos se piden ──
  const at = new Date(2026, 9, 8, 12);
  const fin = (h, extra) => ({ estado: 'confirmado', fechaFin: new Date(at.getTime() - h * 3600e3), ...extra });
  const sel = res.turnosParaPedir([fin(25), fin(10), fin(60), fin(30, { ausente: true }), fin(30, { estado: 'cancelado' }), fin(30, { resenaEnviada: 'x' }), fin(21)], at, 20);
  assert(sel.length === 2, 'se piden los que terminaron hace entre 20 y 48 h (no los de hace 10 h, ni los de hace más de 2 días, ni ausentes, cancelados o ya pedidos)');
  assert(res.horaAdecuada(new Date(2026, 9, 8, 10)) && !res.horaAdecuada(new Date(2026, 9, 8, 23)) && !res.horaAdecuada(new Date(2026, 9, 8, 7)), 'solo se pregunta entre las 9 y las 21 h');

  // ── el servicio ──
  const Config = require('../main/bot-engine/models/Config');
  await Config.create({ userId: 'u1', negocio: 'Barbería Tincho', chatsIgnorados: [] });
  programas.guardar(dir, { resenas: { activa: true, link: 'https://g.page/r/abc/review', horasDespues: 20 } });
  const { crearServicio } = require('../main/resenas');
  const reloj = new Date(); reloj.setHours(12, 0, 0, 0);
  const t0 = new Date(reloj.getTime() - 26 * 3600e3);
  const nuevoTurno = (n, extra) => Turno.create({ userId: 'u1', calendarId: `r${n}`, clienteTelefono: tel(n), fechaInicio: new Date(t0.getTime() - 3600e3), fechaFin: t0, resumen: 'Corte', estado: 'confirmado', pago: { monto: 1 }, ...extra });
  const tA = await nuevoTurno('1'); const tB = await nuevoTurno('2', { ausente: true }); const tC = await nuevoTurno('9'); // el 9 no es cliente conocido
  await BotCliente.findOneAndUpdate({ userId: 'u1', jid: '5492241030000@s.whatsapp.net' }, { $set: { noMolestar: true } });
  const tD = await nuevoTurno('3');
  const enviados = []; const pendientes = []; let conectado = true;
  const sv = crearServicio({ userDataDir: dir, obtenerUserId: () => 'u1', modelos: { Turno, BotCliente, Config }, enviar: async (jid, tx) => { if (!conectado) return false; enviados.push({ jid, tx }); return true; }, marcarPendiente: (jid, turnoId, link) => pendientes.push({ jid, turnoId, link }), ahora: () => reloj, esperar: async () => {}, setI: () => 1 });
  conectado = false;
  let rr = await sv.revisar();
  assert(rr.enviados === 0 && rr.motivo === 'sin-conexion' && !(await Turno.findOne({ _id: tA._id })).resenaEnviada, 'si el bot no está conectado no marca nada: se reintenta en la próxima tanda');
  conectado = true;
  rr = await sv.revisar();
  assert(rr.enviados === 1 && enviados.length === 1 && enviados[0].jid === '5492241010000@s.whatsapp.net' && /Hola Cliente/.test(enviados[0].tx) && /Barbería Tincho/.test(enviados[0].tx), 'pide la reseña solo a quien corresponde (vino y terminó hace ~1 día)');
  assert(pendientes.length === 1 && pendientes[0].turnoId === String(tA._id) && pendientes[0].link === 'https://g.page/r/abc/review', 'le avisa al bot que ese cliente tiene una reseña pendiente (con el enlace)');
  assert((await Turno.findOne({ _id: tD._id })).resenaEnviada === 'omitida-baja' && (await Turno.findOne({ _id: tC._id })).resenaEnviada === 'sin-cliente', 'a quien pidió la baja o no es un cliente conocido NO se le escribe (y no se reintenta)');
  rr = await sv.revisar();
  assert(rr.enviados === 0 && enviados.length === 1, 'no se le pide dos veces por el mismo turno');
  programas.guardar(dir, { resenas: { activa: false } });
  assert((await sv.revisar()).motivo === 'apagado', 'apagado: no hace nada');

  console.log('\n✅ Todos los tests de programas-clientes pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
