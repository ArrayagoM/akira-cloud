// local-api/routes/deudores.routes.js
// Deudores: qué clientes le deben al negocio y cuánto. Cada venta fiada es un "cargo",
// cada pago a cuenta un "pago" (que además entra a la Caja como ingreso).
// El recordatorio de cobro se manda por WhatsApp SOLO cuando el dueño lo confirma.
'use strict';

const express = require('express');
const CtaCte = require('../../bot-engine/models/CtaCte');
const BotCliente = require('../../bot-engine/models/BotCliente');
const Config = require('../../bot-engine/models/Config');
const ct = require('../../gestion/ctacte');
const shared = require('./ctacte.shared');
const exp = require('../../gestion/exportador-deudas');

const DIAS_ENTRE_RECORDATORIOS = 3;

module.exports = function crearRouter({ botService, requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);
  const uid = (req) => String(req.user._id);

  // Agrupa todo lo del usuario por cliente y arma la lista con saldo, antigüedad y datos de contacto.
  async function armarLista(userId) {
    const todos = await CtaCte.find({ userId, entidad: 'cliente' }).lean();
    const movs = shared.soloSaldo(todos);
    const info = new Map(); const recordatorios = new Map();
    for (const m of [...todos].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))) {
      info.set(m.entidadClave, { nombre: m.nombre, telefono: m.telefono, jid: m.jid }); // el dato más nuevo gana
      if (m.tipo === 'recordatorio') recordatorios.set(m.entidadClave, m.fecha);
    }
    const lista = ct.saldos(movs).map((s) => {
      const i = info.get(s.clave) || {};
      return { ...s, nombre: i.nombre || '', telefono: i.telefono || '', jid: i.jid || '', whatsapp: !!ct.telWhatsApp(i.jid || i.telefono), ultimoRecordatorio: recordatorios.get(s.clave) || null };
    });
    return { lista, todos };
  }

  router.get('/', async (req, res) => {
    try {
      const { lista } = await armarLista(uid(req));
      const deudores = lista.filter((d) => d.saldo > 0.005).sort((a, b) => b.saldo - a.saldo);
      const aFavor = lista.filter((d) => d.saldo < -0.005);
      res.json({
        deudores, total: ct.totalSaldo(lista), cantidad: deudores.length,
        mayorAtraso: deudores.reduce((m, d) => Math.max(m, d.antiguedadDias), 0),
        conSaldoAFavor: aFavor.length,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Clientes del bot para elegir al cargar una deuda (busca por nombre o teléfono).
  router.get('/clientes', async (req, res) => {
    try {
      const q = ct.normalizarNombre(req.query.q || '');
      const todos = await BotCliente.find({ userId: uid(req) }).lean();
      const out = todos.map((c) => ({ nombre: c.nombre || '', jid: c.jid, telefono: ct.telClave(c.jid) }))
        .filter((c) => c.nombre && (!q || ct.normalizarNombre(c.nombre).includes(q) || c.telefono.includes(q.replace(/\s/g, ''))))
        .slice(0, 20);
      res.json({ clientes: out });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/detalle', async (req, res) => {
    try {
      const clave = String(req.query.clave || '');
      const { lista, todos } = await armarLista(uid(req));
      const d = lista.find((x) => x.clave === clave);
      if (!d) return res.status(404).json({ error: 'Cliente no encontrado' });
      const movimientos = todos.filter((m) => m.entidadClave === clave && m.tipo !== 'recordatorio')
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map(({ userId, ...m }) => m);
      const cfg = await Config.findOne({ userId: uid(req) });
      const pendientes = movimientos.filter((m) => m.tipo === 'cargo').slice(0, 4).map((m) => `${m.concepto} (${m.fecha.split('-').reverse().slice(0, 2).join('/')}) $${m.monto.toLocaleString('es-AR')}`);
      res.json({
        cliente: d, movimientos,
        mensaje: d.saldo > 0 ? ct.mensajeRecordatorio({ nombre: d.nombre, saldo: d.saldo, negocio: cfg?.negocio || '', alias: cfg?.aliasTransferencia || '', cbu: cfg?.cbuTransferencia || '', banco: cfg?.bancoTransferencia || '', detalle: pendientes }) : '',
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/movimiento', async (req, res) => {
    try {
      const userId = uid(req); const b = req.body || {};
      let identidad;
      let clave = String(b.clave || '');
      if (clave) {
        const previo = await CtaCte.findOne({ userId, entidad: 'cliente', entidadClave: clave });
        if (!previo) return res.status(404).json({ error: 'Cliente no encontrado' });
        identidad = { nombre: previo.nombre, telefono: previo.telefono, jid: previo.jid };
      } else {
        const nombre = ct.texto(b.nombre, 80);
        if (!nombre) return res.status(400).json({ error: 'Poné el nombre del cliente' });
        identidad = { nombre, telefono: ct.texto(b.telefono, 30), jid: /@s\.whatsapp\.net$/.test(String(b.jid || '')) ? String(b.jid) : '' };
        clave = ct.claveCliente({ telefono: identidad.telefono, jid: identidad.jid, nombre });
        if (!clave) return res.status(400).json({ error: 'Poné el nombre del cliente' });
      }
      const r = await shared.crear({ userId, entidad: 'cliente', clave, identidad, body: b });
      if (r.error) return res.status(r.status).json({ error: r.error });
      res.json({ ok: true, clave });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/movimiento/:id', async (req, res) => {
    try {
      const r = await shared.borrar({ userId: uid(req), id: req.params.id, entidad: 'cliente' });
      res.status(r.status).json(r.error ? { error: r.error } : { ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Manda el recordatorio por WhatsApp (el dueño ya lo vio y lo confirmó en pantalla).
  router.post('/recordar', async (req, res) => {
    try {
      const userId = uid(req); const { clave, texto, forzar } = req.body || {};
      const { lista } = await armarLista(userId);
      const d = lista.find((x) => x.clave === clave);
      if (!d) return res.status(404).json({ error: 'Cliente no encontrado' });
      if (d.saldo <= 0.005) return res.status(400).json({ error: 'Este cliente no tiene saldo pendiente' });
      const numero = ct.telWhatsApp(d.jid || d.telefono);
      if (!numero) return res.status(400).json({ error: 'Este cliente no tiene un teléfono válido. Agregáselo al cargar una deuda.' });
      const msg = String(texto || '').split(String.fromCharCode(13)).join('').trim().slice(0, 1000); // se respetan los saltos de línea que el dueño confirmó
      if (!msg) return res.status(400).json({ error: 'El mensaje está vacío' });
      if (d.ultimoRecordatorio && !forzar) {
        const dias = Math.floor((Date.now() - new Date(`${d.ultimoRecordatorio}T12:00:00`).getTime()) / 86400000);
        if (dias < DIAS_ENTRE_RECORDATORIOS) return res.status(409).json({ error: `Ya le recordaste el pago hace ${dias === 0 ? 'menos de un día' : `${dias} día(s)`}. ¿Querés enviarlo igual?`, requiereConfirmar: true });
      }
      const slot = botService.slotsActivos()[0];
      if (slot === undefined) return res.status(409).json({ error: 'El bot no está conectado. Iniciá el bot desde el Dashboard para poder enviar mensajes.' });
      const ok = botService.enviarTexto(slot, `${numero}@s.whatsapp.net`, msg);
      if (!ok) return res.status(409).json({ error: 'No se pudo enviar: el bot no está listo.' });
      const hoy = require('../../gestion/caja').fechaLocal(new Date());
      await CtaCte.create({ userId, entidad: 'cliente', entidadClave: clave, nombre: d.nombre, telefono: d.telefono, jid: d.jid, tipo: 'recordatorio', monto: 0, fecha: hoy, concepto: 'Recordatorio de pago enviado' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/exportar', async (req, res) => {
    try {
      const formato = ['csv', 'pdf'].includes(req.query.formato) ? req.query.formato : 'xlsx';
      const { lista } = await armarLista(uid(req));
      const items = lista.filter((d) => d.saldo > 0.005).sort((a, b) => b.saldo - a.saldo);
      const datos = { items, total: ct.totalSaldo(lista), negocio: (await Config.findOne({ userId: uid(req) }))?.negocio || '' };
      const buf = formato === 'csv' ? exp.csv('deudores', datos) : formato === 'pdf' ? await exp.pdf('deudores', datos) : await exp.xlsx('deudores', datos);
      const tipos = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8', pdf: 'application/pdf' };
      res.set('Content-Type', tipos[formato]);
      res.set('Content-Disposition', `attachment; filename="deudores-${new Date().toISOString().slice(0, 10)}.${formato}"`);
      res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
