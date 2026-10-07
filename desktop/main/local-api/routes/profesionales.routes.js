// local-api/routes/profesionales.routes.js
// Profesionales del negocio: alta/edición, asignación de turnos y liquidación de comisiones.
'use strict';

const express = require('express');
const Profesional = require('../../bot-engine/models/Profesional');
const Turno = require('../../bot-engine/models/Turno');
const Config = require('../../bot-engine/models/Config');
const prof = require('../../gestion/profesionales');
const exp = require('../../gestion/exportador-profesionales');
const caja = require('../../gestion/caja');

module.exports = function crearRouter({ requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);
  const uid = (req) => String(req.user._id);
  const vista = (p) => ({ _id: String(p._id), nombre: p.nombre, color: p.color, comisionPct: p.comisionPct || 0, servicios: p.servicios || [], sucursalId: p.sucursalId || '', horario: p.horario || {}, activo: p.activo !== false, telefono: p.telefono || '' });

  router.get('/', async (req, res) => {
    try {
      const userId = uid(req);
      const lista = (await Profesional.find({ userId }).lean()).sort((a, b) => a.nombre.localeCompare(b.nombre));
      const cfg = await Config.findOne({ userId }).lean();
      res.json({ profesionales: lista.map(vista), servicios: (cfg?.serviciosList || []).map((s) => s.nombre), colores: prof.COLORES });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const userId = uid(req);
      const r = prof.sanear({ color: prof.COLORES[(await Profesional.find({ userId }).lean()).length % prof.COLORES.length], ...req.body });
      if (!r.ok) return res.status(400).json({ error: r.error });
      const todos = await Profesional.find({ userId }).lean();
      if (todos.length >= prof.MAX_PROFESIONALES) return res.status(400).json({ error: `Llegaste al máximo de ${prof.MAX_PROFESIONALES} profesionales.` });
      if (todos.some((p) => p.nombre.toLowerCase() === r.dato.nombre.toLowerCase())) return res.status(400).json({ error: 'Ya hay un profesional con ese nombre.' });
      const p = await Profesional.create({ ...r.dato, userId });
      res.json({ ok: true, id: String(p._id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/:id', async (req, res) => {
    try {
      const userId = uid(req);
      const previo = await Profesional.findOne({ _id: req.params.id, userId }).lean();
      if (!previo) return res.status(404).json({ error: 'Profesional no encontrado' });
      const r = prof.sanear(req.body, previo);
      if (!r.ok) return res.status(400).json({ error: r.error });
      if ((await Profesional.find({ userId }).lean()).some((p) => String(p._id) !== String(previo._id) && p.nombre.toLowerCase() === r.dato.nombre.toLowerCase())) return res.status(400).json({ error: 'Ya hay un profesional con ese nombre.' });
      await Profesional.findOneAndUpdate({ _id: previo._id, userId }, { $set: r.dato });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Si ya tiene turnos asignados no se borra (se perdería su historial de comisiones): se desactiva
  router.delete('/:id', async (req, res) => {
    try {
      const userId = uid(req);
      const p = await Profesional.findOne({ _id: req.params.id, userId }).lean();
      if (!p) return res.status(404).json({ error: 'Profesional no encontrado' });
      const usado = (await Turno.find({ userId }).lean()).some((t) => String(t.profesionalId) === String(p._id));
      if (usado) { await Profesional.findOneAndUpdate({ _id: p._id, userId }, { $set: { activo: false } }); return res.json({ ok: true, desactivado: true }); }
      await Profesional.deleteOne({ _id: p._id, userId });
      res.json({ ok: true, desactivado: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Asigna (o quita, con profesionalId null) el profesional de un turno. Queda anotada la comisión de ese momento.
  router.post('/asignar', async (req, res) => {
    try {
      const userId = uid(req);
      const { turnoId, profesionalId } = req.body || {};
      const t = await Turno.findOne({ _id: String(turnoId || ''), userId }).lean();
      if (!t) return res.status(404).json({ error: 'Turno no encontrado' });
      if (!profesionalId) { await Turno.findOneAndUpdate({ _id: t._id, userId }, { $set: { profesionalId: '', profesionalNombre: '', comisionPct: null } }); return res.json({ ok: true }); }
      const p = await Profesional.findOne({ _id: String(profesionalId), userId }).lean();
      if (!p || p.activo === false) return res.status(404).json({ error: 'Profesional no encontrado' });
      await Turno.findOneAndUpdate({ _id: t._id, userId }, { $set: { profesionalId: String(p._id), profesionalNombre: p.nombre, comisionPct: p.comisionPct || 0 } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  const periodo = (q) => {
    const hoy = caja.fechaLocal(new Date());
    return { desde: caja.esFechaValida(q.desde) ? q.desde : `${hoy.slice(0, 7)}-01`, hasta: caja.esFechaValida(q.hasta) ? q.hasta : hoy };
  };

  router.get('/liquidacion', async (req, res) => {
    try {
      const userId = uid(req); const p = periodo(req.query);
      if (p.desde > p.hasta) return res.status(400).json({ error: 'La fecha "desde" es posterior a "hasta".' });
      const [turnos, profs] = await Promise.all([Turno.find({ userId }).lean(), Profesional.find({ userId }).lean()]);
      res.json(prof.liquidacion(turnos, profs, p));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/liquidacion/exportar', async (req, res) => {
    try {
      const userId = uid(req); const p = periodo(req.query);
      const [turnos, profs, cfg] = await Promise.all([Turno.find({ userId }).lean(), Profesional.find({ userId }).lean(), Config.findOne({ userId }).lean()]);
      const liq = prof.liquidacion(turnos, profs, p);
      const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
      const detalles = {}; for (const pr of profs) detalles[String(pr._id)] = prof.detalle(turnos, pr, p);
      const buf = formato === 'csv' ? exp.exportarCsv(liq) : await exp.exportarXlsx(liq, detalles, { negocio: cfg?.negocio || '' });
      res.set('Content-Type', formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="comisiones-${p.hasta}.${formato}"`);
      res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
