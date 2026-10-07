// local-api/routes/recurrentes.routes.js
// Gastos fijos y vencimientos (alquiler, internet, monotributo…): lista, alta, edición y baja.
'use strict';

const express = require('express');
const Recurrente = require('../../bot-engine/models/Recurrente');
const Movimiento = require('../../bot-engine/models/Movimiento');
const rec = require('../../gestion/recurrentes');
const caja = require('../../gestion/caja');

const CATEGORIAS = ['Alquiler', 'Servicios (luz, agua, internet)', 'Sueldos', 'Impuestos', 'Seguros', 'Otros gastos'];

module.exports = function crearRouter({ requerirSesion, servicioRecurrentes }) {
  const router = express.Router();
  router.use(requerirSesion);
  const uid = (req) => String(req.user._id);

  const vista = (r, hoy) => ({ _id: String(r._id), descripcion: r.descripcion, monto: r.monto, dia: r.dia, avisoDias: r.avisoDias ?? 3, registrar: r.registrar !== false, categoria: r.categoria, metodo: r.metodo, activo: r.activo !== false, proximo: rec.proximoVencimiento(r, hoy) });

  router.get('/', async (req, res) => {
    try {
      const hoy = caja.fechaLocal(new Date());
      const lista = (await Recurrente.find({ userId: uid(req) }).lean()).map((r) => vista(r, hoy)).sort((a, b) => a.proximo.fecha.localeCompare(b.proximo.fecha));
      res.json({ recurrentes: lista, categorias: CATEGORIAS });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const userId = uid(req);
      const r = rec.sanear(req.body);
      if (!r.ok) return res.status(400).json({ error: r.error });
      if ((await Recurrente.find({ userId }).lean()).length >= rec.MAX_ACTIVOS) return res.status(400).json({ error: `Llegaste al máximo de ${rec.MAX_ACTIVOS} gastos fijos.` });
      const nuevo = await Recurrente.create({ ...r.dato, userId, creadoEn: caja.fechaLocal(new Date()), mesesCargados: [] });
      res.json({ ok: true, id: String(nuevo._id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/:id', async (req, res) => {
    try {
      const userId = uid(req);
      const actual = await Recurrente.findOne({ _id: req.params.id, userId }).lean();
      if (!actual) return res.status(404).json({ error: 'No encontrado' });
      const r = rec.sanear({ ...actual, ...req.body });
      if (!r.ok) return res.status(400).json({ error: r.error });
      // si cambia el día, el aviso de este mes se vuelve a evaluar
      const extra = r.dato.dia !== actual.dia ? { avisadoPara: '' } : {};
      await Recurrente.findOneAndUpdate({ _id: req.params.id, userId }, { $set: { ...r.dato, ...extra } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const r = await Recurrente.deleteOne({ _id: req.params.id, userId: uid(req) });
      if (!r.deletedCount) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true }); // los gastos que ya se cargaron a la Caja quedan como están
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // "Revisar ahora": carga lo que ya venció (útil justo después de crear un fijo)
  router.post('/revisar', async (req, res) => {
    try { res.json({ ok: true, ...(await (servicioRecurrentes?.revisar?.() ?? { cargados: [] })) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
