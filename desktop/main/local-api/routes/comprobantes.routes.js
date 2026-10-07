// local-api/routes/comprobantes.routes.js
// Presupuestos y recibos en PDF: crear, ver, descargar, mandar por WhatsApp, aceptar / anular y convertir en recibo.
'use strict';

const express = require('express');
const Comprobante = require('../../bot-engine/models/Comprobante');
const Config = require('../../bot-engine/models/Config');
const Movimiento = require('../../bot-engine/models/Movimiento');
const BotCliente = require('../../bot-engine/models/BotCliente');
const comp = require('../../gestion/comprobantes');
const logo = require('../../logo-negocio');

module.exports = function crearRouter({ requerirSesion, botService, userDataDir, servicioWebhooks }) {
  const router = express.Router();
  router.use(requerirSesion);
  const uid = (req) => String(req.user._id);
  const vista = (c) => ({ _id: String(c._id), tipo: c.tipo, numero: c.numero, codigo: comp.formatoNumero(c.tipo, c.numero), estado: c.estado, fecha: c.fecha, venceEl: c.venceEl || '', clienteNombre: c.clienteNombre, clienteTelefono: c.clienteTelefono, items: c.items, total: c.total, metodo: c.metodo || '', nota: c.nota || '', concepto: c.concepto || '', reciboId: c.reciboId || '', enviadoEn: c.enviadoEn || '' });
  const itemsDisponibles = (cfg) => [
    ...(cfg?.catalogo || []).filter((p) => p.disponible !== false && p.precio > 0).map((p) => ({ nombre: p.nombre, precio: p.precio, tipo: 'producto' })),
    ...(cfg?.serviciosList || []).filter((s) => s.precio > 0).map((s) => ({ nombre: s.nombre, precio: s.precio, tipo: 'servicio' })),
  ];

  // Para armar un comprobante: productos y servicios con precio, y datos del negocio
  router.get('/opciones', async (req, res) => {
    try {
      const cfg = await Config.findOne({ userId: uid(req) }).lean();
      res.json({ items: itemsDisponibles(cfg), negocio: cfg?.negocio || '', tieneLogo: !!logo.leer(userDataDir), datosDePago: !!(cfg?.aliasTransferencia || cfg?.cbuTransferencia) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/', async (req, res) => {
    try {
      const filtro = { userId: uid(req) }; if (comp.TIPOS.includes(req.query.tipo)) filtro.tipo = req.query.tipo;
      const lista = (await Comprobante.find(filtro).lean()).sort((a, b) => String(b.createdAt || b.fecha).localeCompare(String(a.createdAt || a.fecha)) || b.numero - a.numero);
      res.json({ comprobantes: lista.slice(0, 200).map(vista) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  async function crear(userId, body) {
    const cfg = await Config.findOne({ userId }).lean();
    const r = comp.sanear(body, itemsDisponibles(cfg));
    if (!r.ok) return r;
    const numero = await comp.proximoNumero(Comprobante, userId, r.dato.tipo);
    const c = await Comprobante.create({ ...r.dato, userId, numero, estado: r.dato.tipo === 'recibo' ? 'cobrado' : 'emitido' });
    if (r.dato.tipo === 'recibo' && body.registrarEnCaja) {
      const mov = await Movimiento.create({ userId, origen: 'recibo', comprobanteId: String(c._id), tipo: 'ingreso', monto: r.dato.total, fecha: r.dato.fecha, metodo: r.dato.metodo, categoria: 'Ventas', descripcion: `Recibo ${comp.formatoNumero('recibo', numero)}${r.dato.concepto ? ` — ${r.dato.concepto}` : ''}`.slice(0, 200), cliente: r.dato.clienteNombre, documentoId: null });
      await Comprobante.findOneAndUpdate({ _id: c._id, userId }, { $set: { cajaId: String(mov._id) } });
    }
    servicioWebhooks?.emitir('comprobante.creado', { comprobanteId: String(c._id), tipo: r.dato.tipo, codigo: comp.formatoNumero(r.dato.tipo, numero), cliente: r.dato.clienteNombre, total: r.dato.total, fecha: r.dato.fecha });
    return { ok: true, id: String(c._id), codigo: comp.formatoNumero(r.dato.tipo, numero) };
  }

  router.post('/', async (req, res) => {
    try { const r = await crear(uid(req), req.body || {}); if (!r.ok) return res.status(400).json({ error: r.error }); res.json(r); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  async function pdfDe(userId, id) {
    const c = await Comprobante.findOne({ _id: id, userId }).lean();
    if (!c) return null;
    const cfg = await Config.findOne({ userId }).lean();
    const buf = await comp.generarPdf({ comprobante: c, negocio: cfg?.negocio || '', logo: logo.leer(userDataDir), pago: c.tipo === 'presupuesto' ? { alias: cfg?.aliasTransferencia, cbu: cfg?.cbuTransferencia, banco: cfg?.bancoTransferencia } : {} });
    return { c, cfg, buf, nombre: `${c.tipo === 'presupuesto' ? 'Presupuesto' : 'Recibo'}-${comp.formatoNumero(c.tipo, c.numero)}.pdf` };
  }

  router.get('/:id/pdf', async (req, res) => {
    try {
      const p = await pdfDe(uid(req), req.params.id);
      if (!p) return res.status(404).json({ error: 'Comprobante no encontrado' });
      res.set('Content-Type', 'application/pdf'); res.set('Content-Disposition', `attachment; filename="${p.nombre}"`); res.send(p.buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Se lo manda al cliente por WhatsApp (el dueño lo pide a propósito: nunca sale solo)
  router.post('/:id/enviar', async (req, res) => {
    try {
      const userId = uid(req);
      const p = await pdfDe(userId, req.params.id);
      if (!p) return res.status(404).json({ error: 'Comprobante no encontrado' });
      if (p.c.estado === 'anulado') return res.status(400).json({ error: 'Este comprobante está anulado.' });
      let jid = p.c.clienteJid;
      if (!jid && p.c.clienteTelefono.length >= 10) {
        const cli = (await BotCliente.find({ userId }).lean()).find((x) => String(x.numeroReal || x.telefono || '').replace(/\D/g, '').slice(-10) === p.c.clienteTelefono.slice(-10));
        jid = cli?.jid;
      }
      if (!jid && p.c.clienteTelefono.length >= 10) jid = `${p.c.clienteTelefono.startsWith('54') ? p.c.clienteTelefono : `549${p.c.clienteTelefono.slice(-10)}`}@s.whatsapp.net`;
      if (!jid) return res.status(400).json({ error: 'El cliente no tiene teléfono: agregalo para poder enviarlo por WhatsApp (o descargá el PDF).' });
      const ok = await botService?.enviarDocumento?.(jid, p.buf, p.nombre, comp.textoWhatsApp(p.c, p.cfg?.negocio || ''));
      if (!ok) return res.status(409).json({ error: 'No se pudo enviar: el bot no está conectado a WhatsApp.' });
      await Comprobante.findOneAndUpdate({ _id: p.c._id, userId }, { $set: { enviadoEn: new Date().toISOString() } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/estado', async (req, res) => {
    try {
      const userId = uid(req); const nuevo = req.body?.estado;
      const c = await Comprobante.findOne({ _id: req.params.id, userId }).lean();
      if (!c) return res.status(404).json({ error: 'Comprobante no encontrado' });
      if (!['aceptado', 'anulado'].includes(nuevo)) return res.status(400).json({ error: 'Estado no válido' });
      if (c.estado === 'anulado') return res.status(400).json({ error: 'Ya está anulado.' });
      if (nuevo === 'aceptado' && (c.tipo !== 'presupuesto' || c.estado !== 'emitido')) return res.status(400).json({ error: 'Solo un presupuesto emitido se puede marcar como aceptado.' });
      if (nuevo === 'anulado' && c.cajaId) await Movimiento.deleteOne({ _id: c.cajaId, userId }); // se saca el ingreso que había generado el recibo
      await Comprobante.findOneAndUpdate({ _id: c._id, userId }, { $set: { estado: nuevo } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Presupuesto → recibo (cuando el cliente paga). Copia los ítems y marca el presupuesto como cobrado.
  router.post('/:id/recibo', async (req, res) => {
    try {
      const userId = uid(req);
      const p = await Comprobante.findOne({ _id: req.params.id, userId }).lean();
      if (!p || p.tipo !== 'presupuesto') return res.status(404).json({ error: 'Presupuesto no encontrado' });
      if (p.estado === 'anulado') return res.status(400).json({ error: 'El presupuesto está anulado.' });
      if (p.reciboId) return res.status(409).json({ error: 'Este presupuesto ya tiene su recibo.' });
      const r = await crear(userId, { tipo: 'recibo', cliente: { nombre: p.clienteNombre, telefono: p.clienteTelefono, jid: p.clienteJid }, items: p.items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio })), descuentoPct: p.descuentoPct, metodo: req.body?.metodo, registrarEnCaja: req.body?.registrarEnCaja !== false, concepto: `Presupuesto ${comp.formatoNumero('presupuesto', p.numero)}`, nota: '' });
      if (!r.ok) return res.status(400).json({ error: r.error });
      await Comprobante.findOneAndUpdate({ _id: p._id, userId }, { $set: { estado: 'cobrado', reciboId: r.id } });
      res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/logo', express.json({ limit: '25mb' }), (req, res) => {
    try {
      const b64 = req.body?.base64;
      if (typeof b64 !== 'string' || !b64) return res.status(400).json({ error: 'Falta la imagen' });
      logo.guardar(userDataDir, Buffer.from(b64, 'base64'));
      res.json({ ok: true });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  router.get('/logo/ver', (req, res) => {
    const b = logo.leer(userDataDir); if (!b) return res.status(404).json({ error: 'Sin logo' });
    res.set('Content-Type', b[0] === 0xff ? 'image/jpeg' : 'image/png'); res.set('Cache-Control', 'no-store'); res.send(b);
  });
  router.delete('/logo', (req, res) => { logo.quitar(userDataDir); res.json({ ok: true }); });

  return router;
};
