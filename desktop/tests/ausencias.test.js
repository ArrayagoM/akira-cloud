// tests/ausencias.test.js — "no vino": se marca desde la ficha del cliente, queda en la ficha y el bot
// le pide el pago por adelantado a quien falta seguido (solo si hay cómo cobrarlo).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-aus-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const aus = require('../main/bot-engine/services/bot/ausencias.service');

(async () => {
  console.log('\n[ausencias] Tests:');

  // ── lógica pura ──
  const turnos = [
    { clienteTelefono: '2241497226', ausente: true }, { clienteTelefono: '5492241497226', ausente: true }, { clienteTelefono: '+54 9 2241 49-7226', ausente: false },
    { clienteTelefono: '2241000001', ausente: true }, { clienteTelefono: '2241497226' },
  ];
  assert(aus.contar(turnos, '5492241497226') === 2, 'cuenta las ausencias de ese cliente aunque el teléfono venga en distintos formatos');
  assert(aus.contar(turnos, '2241000001') === 1 && aus.contar(turnos, '') === 0 && aus.contar(turnos, '123') === 0 && aus.contar([], '5492241497226') === 0, 'no mezcla clientes y no rompe con datos vacíos');
  assert(aus.notaAusencias(1, { puedeCobrarAdelantado: true }) === '', 'con 1 sola ausencia el bot no cambia nada');
  const nota = aus.notaAusencias(2, { puedeCobrarAdelantado: true });
  assert(/faltó 2 turnos/.test(nota) && /seña/.test(nota) && /sin reproches/.test(nota), 'con 2 ausencias le pide la seña por adelantado, con amabilidad');
  assert(aus.notaAusencias(5, { puedeCobrarAdelantado: false }) === '', 'si el negocio no tiene cómo cobrar por adelantado, no inventa un pago imposible');

  // ── API: marcar / desmarcar ──
  const Turno = require('../main/bot-engine/models/Turno');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const dia = (n) => new Date(Date.now() + n * 86400000);
  const t = (n, extra) => Turno.create({ userId: 'u1', calendarId: 'p', clienteTelefono: '2241497226', fechaInicio: dia(n), fechaFin: dia(n + 0.04), resumen: 'Corte', estado: 'confirmado', pago: { monto: 5000, metodo: 'mercadopago' }, ...extra });
  const pasado1 = await t(-10); const pasado2 = await t(-5); const futuro = await t(4); const ajeno = await Turno.create({ userId: 'u2', calendarId: 'p', clienteTelefono: '2241497226', fechaInicio: dia(-3), fechaFin: dia(-3), resumen: 'x', estado: 'confirmado' });
  await BotCliente.create({ userId: 'u1', jid: '5492241497226@s.whatsapp.net', nombre: 'Ana', telefono: '5492241497226', numeroReal: '5492241497226', historial: [], turnosConfirmados: [] });

  const app = express(); app.use(express.json());
  const deps = { botService: { silenciarCliente() {}, recargarConfig() {}, getBotStatus: () => ({}), slotsActivos: () => [] }, requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, userDataDir: dir };
  app.use('/api/turnos', require('../main/local-api/routes/turnos.routes')(deps));
  app.use('/api/bot', require('../main/local-api/routes/bot.routes')(deps));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (p, body, method) => { const x = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };

  let r = await j(`/turnos/${pasado1._id}`, { ausente: true }, 'PATCH');
  assert(r.status === 200 && r.body.turno.ausente === true && r.body.turno.estado === 'confirmado', 'marcar "no vino": queda ausente y SIGUE confirmado (la seña ya cobrada sigue contando en la Caja)');
  r = await j(`/turnos/${futuro._id}`, { ausente: true }, 'PATCH');
  assert(r.status === 400 && /todavía no pasó/.test(r.body.error), 'no se puede marcar "no vino" un turno que todavía no pasó');
  r = await j(`/turnos/${pasado2._id}`, { ausente: 'si' }, 'PATCH');
  assert(r.status === 400, 'valor que no es verdadero/falso → 400');
  r = await j(`/turnos/${ajeno._id}`, { ausente: true }, 'PATCH');
  assert(r.status === 404, 'no se puede marcar un turno de otro negocio');

  r = await j('/bot/clientes/5492241497226%40s.whatsapp.net/ficha');
  assert(r.body.ausencias === 1 && r.body.umbralAusencias === 2, 'la ficha cuenta 1 ausencia (no cuenta la del otro negocio)');
  await j(`/turnos/${pasado2._id}`, { ausente: true }, 'PATCH');
  r = await j('/bot/clientes/5492241497226%40s.whatsapp.net/ficha');
  assert(r.body.ausencias === 2, 'con la segunda ausencia, ya llega al umbral');
  r = await j('/bot/clientes/5492241497226%40s.whatsapp.net/detalle');
  assert(r.body.turnos.filter((x) => x.ausente).length === 2 && r.body.stats.totalGastado === 15000, 'el historial muestra cuáles faltó y el "gastado" sigue contando lo cobrado');
  await j(`/turnos/${pasado2._id}`, { ausente: false }, 'PATCH');
  r = await j('/bot/clientes/5492241497226%40s.whatsapp.net/ficha');
  assert(r.body.ausencias === 1, 'se puede deshacer la marca (si fue un error)');

  // ── la Caja no se entera: sigue contando el turno cobrado ──
  const caja = require('../main/gestion/caja');
  const mes = caja.fechaLocal(new Date()).slice(0, 7);
  const ing = caja.ingresosDeTurnos(await Turno.find({ userId: 'u1' }).lean(), mes);
  assert(ing.some((m) => m.turnoId === String(pasado1._id)) || caja.fechaLocal(pasado1.fechaInicio).slice(0, 7) !== mes, 'un turno marcado "no vino" con seña cobrada sigue sumando a la Caja');

  srv.close();
  console.log('\n✅ Todos los tests de ausencias pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
