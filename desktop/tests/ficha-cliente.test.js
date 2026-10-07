// tests/ficha-cliente.test.js — Ficha 360: lo que debe, sus documentos y su próximo turno en un solo lugar,
// sin mezclar datos de otros clientes ni de otros usuarios.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-ficha-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[ficha-cliente] Tests:');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const CtaCte = require('../main/bot-engine/models/CtaCte');
  const Documento = require('../main/bot-engine/models/Documento');
  const Turno = require('../main/bot-engine/models/Turno');

  const JID = '5492241497226@s.whatsapp.net'; const OTRO = '5492241000001@s.whatsapp.net';
  const hoy = new Date(); const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hace = (n) => iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - n));
  await BotCliente.create({ userId: 'u1', jid: JID, nombre: 'Ana López', telefono: '5492241497226', numeroReal: '5492241497226', historial: [{ role: 'user', content: 'MENSAJE PRIVADO' }], turnosConfirmados: [] });
  await BotCliente.create({ userId: 'u1', jid: OTRO, nombre: 'Luis', telefono: '5492241000001', historial: [], turnosConfirmados: [] });
  await BotCliente.create({ userId: 'u1', jid: '999888777666555@lid', nombre: 'Sin teléfono real', historial: [], turnosConfirmados: [] });
  const cc = (extra) => CtaCte.create({ userId: 'u1', entidad: 'cliente', entidadClave: 'tel:2241497226', nombre: 'Ana López', telefono: '2241497226', jid: JID, ...extra });
  await cc({ tipo: 'cargo', monto: 30000, fecha: hace(12), concepto: 'Tintura' });
  await cc({ tipo: 'cargo', monto: 10000, fecha: hace(3), concepto: 'Corte' });
  await cc({ tipo: 'pago', monto: 8000, fecha: hace(1), concepto: 'Pago a cuenta' });
  await CtaCte.create({ userId: 'u1', entidad: 'cliente', entidadClave: 'tel:2241000001', nombre: 'Luis', jid: OTRO, tipo: 'cargo', monto: 5555, fecha: hace(2), concepto: 'Otro cliente' });
  await CtaCte.create({ userId: 'u2', entidad: 'cliente', entidadClave: 'tel:2241497226', nombre: 'Ana de otro negocio', tipo: 'cargo', monto: 99999, fecha: hace(2) });
  await Documento.create({ userId: 'u1', jid: JID, nombreOriginal: 'comprobante.pdf', estado: 'nuevo', montoSugerido: 12500 });
  await Documento.create({ userId: 'u1', jid: OTRO, nombreOriginal: 'de-luis.pdf', estado: 'nuevo' });
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1, 10);
  const pasado = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 5, 10);
  await Turno.create({ userId: 'u1', calendarId: 'p', clienteTelefono: '2241497226', fechaInicio: pasado, fechaFin: new Date(pasado.getTime() + 3600e3), resumen: 'Color', estado: 'confirmado', pago: { monto: 20000 } });
  await Turno.create({ userId: 'u1', calendarId: 'p', clienteTelefono: '2241497226', fechaInicio: manana, fechaFin: new Date(manana.getTime() + 3600e3), resumen: 'Corte', estado: 'pendiente', pago: { monto: 7000 } });
  await Turno.create({ userId: 'u1', calendarId: 'p', clienteTelefono: '2241497226', fechaInicio: new Date(hoy.getTime() + 2 * 86400e3), fechaFin: new Date(hoy.getTime() + 2 * 86400e3 + 3600e3), resumen: 'Cancelado', estado: 'cancelado', pago: { monto: 1 } });

  const app = express(); app.use(express.json());
  app.use('/api/bot', require('../main/local-api/routes/bot.routes')({ botService: { silenciarCliente() {}, recargarConfig() {}, getBotStatus: () => ({}), slotsActivos: () => [] }, requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, userDataDir: dir }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const get = async (jid) => { const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/bot/clientes/${encodeURIComponent(jid)}/ficha`); return { status: r.status, body: await r.json() }; };

  let r = await get(JID);
  assert(r.status === 200, 'la ficha responde');
  assert(r.body.deuda.saldo === 32000 && r.body.deuda.tiene === true, 'deuda: 30.000 + 10.000 − 8.000 = $32.000 (sin sumar a otros clientes ni a otros negocios)');
  assert(r.body.deuda.antiguedadDias === 12, 'la antigüedad cuenta desde el cargo más viejo que sigue sin pagar (12 días)');
  assert(r.body.deuda.movimientos.length === 3 && r.body.deuda.movimientos[0].tipo === 'pago', 'últimos movimientos, el más nuevo primero');
  assert(r.body.documentos.length === 1 && r.body.documentos[0].nombre === 'comprobante.pdf' && r.body.documentos[0].monto === 12500, 'solo sus documentos');
  assert(r.body.proximoTurno && r.body.proximoTurno.resumen === 'Corte' && r.body.proximoTurno.estado === 'pendiente', 'el próximo turno es el más cercano, sin contar cancelados ni los más lejanos');
  assert(!JSON.stringify(r.body).includes('MENSAJE PRIVADO'), 'la ficha no expone el contenido de las conversaciones');

  r = await get(OTRO);
  assert(r.body.deuda.saldo === 5555 && r.body.documentos[0].nombre === 'de-luis.pdf' && r.body.proximoTurno === null, 'otro cliente: sus propios datos y sin turno');
  r = await get('999888777666555@lid');
  assert(r.status === 200 && r.body.deuda.saldo === 0 && r.body.deuda.tiene === false && r.body.proximoTurno === null, 'cliente con id interno (@lid) y sin teléfono: no se confunde con nadie');
  r = await get('5490000000000@s.whatsapp.net');
  assert(r.status === 404, 'cliente inexistente → 404');

  srv.close();
  console.log('\n✅ Todos los tests de ficha-cliente pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
