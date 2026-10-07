// local-api/routes/caja.routes.js
// Caja del negocio: ingresos y gastos por mes. Los ingresos por turnos cobrados
// salen solos de la agenda; el resto (gastos, cobros en efectivo…) se carga a mano,
// se importa de una planilla o se registra desde un comprobante de la bandeja.
'use strict';

const express = require('express');
const Movimiento = require('../../bot-engine/models/Movimiento');
const Turno = require('../../bot-engine/models/Turno');
const Documento = require('../../bot-engine/models/Documento');
const Config = require('../../bot-engine/models/Config');
const caja = require('../../gestion/caja');
const exp = require('../../gestion/exportador-caja');

const CATEGORIAS = {
  gasto: ['Alquiler', 'Servicios (luz, agua, internet)', 'Sueldos', 'Insumos y mercadería', 'Impuestos', 'Marketing', 'Mantenimiento', 'Transporte', 'Otros gastos'],
  ingreso: ['Ventas', 'Cobros en efectivo', 'Otros ingresos'],
};

module.exports = function crearRouter({ requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);

  const uid = (req) => String(req.user._id);
  const mesDe = (req) => (caja.esMes(req.query.mes) ? req.query.mes : caja.mesActual());

  // Movimientos del mes (manuales + ingresos de turnos) y su resumen.
  async function armarMes(userId, mes) {
    const manuales = (await Movimiento.find({ userId }).lean()).filter((m) => String(m.fecha || '').startsWith(mes)).map((m) => ({ ...m, origen: m.origen || 'manual' }));
    const turnos = await Turno.find({ userId }).lean();
    const movimientos = caja.ordenar([...manuales, ...caja.ingresosDeTurnos(turnos, mes)]);
    return { mes, movimientos, resumen: caja.resumen(movimientos, mes), porCobrar: caja.porCobrar(turnos), todos: manuales };
  }

  router.get('/', async (req, res) => {
    try {
      const userId = uid(req); const mes = mesDe(req);
      const { movimientos, resumen, porCobrar } = await armarMes(userId, mes);
      const usadas = (await Movimiento.find({ userId }).lean()).reduce((a, m) => { (a[m.tipo] = a[m.tipo] || new Set()).add(m.categoria); return a; }, {});
      const cat = (t) => [...new Set([...(CATEGORIAS[t] || []), ...(usadas[t] || [])])];
      res.json({ mes, movimientos, resumen, porCobrar, categorias: { gasto: cat('gasto'), ingreso: cat('ingreso') } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/movimiento', async (req, res) => {
    try {
      const userId = uid(req);
      const r = caja.sanearMovimiento(req.body);
      if (!r.ok) return res.status(400).json({ error: r.error });
      if (r.dato.documentoId) {
        const doc = await Documento.findOne({ _id: r.dato.documentoId, userId });
        if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
        if (await Movimiento.findOne({ userId, documentoId: String(doc._id) })) return res.status(409).json({ error: 'Este documento ya está registrado en la Caja' });
        if (doc.estado === 'nuevo') { doc.estado = 'revisado'; await doc.save(); }
      }
      const mov = await Movimiento.create({ ...r.dato, userId, origen: r.dato.documentoId ? 'documento' : 'manual' });
      res.json({ ok: true, movimiento: mov });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/movimiento/:id', async (req, res) => {
    try {
      if (String(req.params.id).startsWith('turno-')) return res.status(400).json({ error: 'Este ingreso viene de un turno cobrado: se corrige desde la Agenda.' });
      const mov = await Movimiento.findOne({ _id: req.params.id, userId: uid(req) });
      if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' });
      const r = caja.sanearMovimiento({ ...mov.toJSON?.() ?? mov, ...req.body });
      if (!r.ok) return res.status(400).json({ error: r.error });
      Object.assign(mov, { ...r.dato, documentoId: mov.documentoId || null });
      await mov.save();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/movimiento/:id', async (req, res) => {
    try {
      if (String(req.params.id).startsWith('turno-')) return res.status(400).json({ error: 'Este ingreso viene de un turno cobrado: no se borra desde la Caja.' });
      const r = await Movimiento.deleteOne({ _id: req.params.id, userId: uid(req) });
      if (!r.deletedCount) return res.status(404).json({ error: 'Movimiento no encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/exportar', async (req, res) => {
    try {
      const userId = uid(req); const mes = mesDe(req);
      const formato = ['csv', 'pdf'].includes(req.query.formato) ? req.query.formato : 'xlsx';
      const datos = await armarMes(userId, mes);
      datos.negocio = (await Config.findOne({ userId }))?.negocio || '';
      const buf = formato === 'csv' ? exp.exportarCsv(datos) : formato === 'pdf' ? await exp.exportarPdf(datos) : await exp.exportarXlsx(datos);
      const tipos = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8', pdf: 'application/pdf' };
      res.set('Content-Type', tipos[formato]);
      res.set('Content-Disposition', `attachment; filename="caja-${mes}.${formato}"`);
      res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
