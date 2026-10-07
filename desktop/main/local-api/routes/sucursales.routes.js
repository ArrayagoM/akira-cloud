// local-api/routes/sucursales.routes.js
// Sucursales (locales): alta/edición, resumen de plata y turnos por local, y asignación de un turno a un local.
'use strict';

const express = require('express');
const Sucursal = require('../../bot-engine/models/Sucursal');
const Profesional = require('../../bot-engine/models/Profesional');
const Turno = require('../../bot-engine/models/Turno');
const Movimiento = require('../../bot-engine/models/Movimiento');
const suc = require('../../gestion/sucursales');
const caja = require('../../gestion/caja');

module.exports = function crearRouter({ requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);
  const uid = (req) => String(req.user._id);
  const vista = (s) => ({ _id: String(s._id), nombre: s.nombre, direccion: s.direccion || '', telefono: s.telefono || '', activo: s.activo !== false });

  router.get('/', async (req, res) => {
    try { res.json({ sucursales: (await Sucursal.find({ userId: uid(req) }).lean()).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(vista) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const userId = uid(req);
      const r = suc.sanear(req.body);
      if (!r.ok) return res.status(400).json({ error: r.error });
      const todas = await Sucursal.find({ userId }).lean();
      if (todas.length >= suc.MAX_SUCURSALES) return res.status(400).json({ error: `Llegaste al máximo de ${suc.MAX_SUCURSALES} sucursales.` });
      if (todas.some((s) => s.nombre.toLowerCase() === r.dato.nombre.toLowerCase())) return res.status(400).json({ error: 'Ya hay una sucursal con ese nombre.' });
      const s = await Sucursal.create({ ...r.dato, userId });
      res.json({ ok: true, id: String(s._id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/:id', async (req, res) => {
    try {
      const userId = uid(req);
      const previo = await Sucursal.findOne({ _id: req.params.id, userId }).lean();
      if (!previo) return res.status(404).json({ error: 'Sucursal no encontrada' });
      const r = suc.sanear(req.body, previo);
      if (!r.ok) return res.status(400).json({ error: r.error });
      if ((await Sucursal.find({ userId }).lean()).some((s) => String(s._id) !== String(previo._id) && s.nombre.toLowerCase() === r.dato.nombre.toLowerCase())) return res.status(400).json({ error: 'Ya hay una sucursal con ese nombre.' });
      await Sucursal.findOneAndUpdate({ _id: previo._id, userId }, { $set: r.dato });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Si tiene movimientos, turnos o profesionales no se borra (se perdería la separación del historial): se desactiva
  router.delete('/:id', async (req, res) => {
    try {
      const userId = uid(req);
      const s = await Sucursal.findOne({ _id: req.params.id, userId }).lean();
      if (!s) return res.status(404).json({ error: 'Sucursal no encontrada' });
      const id = String(s._id);
      const [movs, turnos, profs] = await Promise.all([Movimiento.find({ userId }).lean(), Turno.find({ userId }).lean(), Profesional.find({ userId }).lean()]);
      const usada = movs.some((m) => m.sucursalId === id) || turnos.some((t) => t.sucursalId === id) || profs.some((p) => p.sucursalId === id);
      if (usada) { await Sucursal.findOneAndUpdate({ _id: s._id, userId }, { $set: { activo: false } }); return res.json({ ok: true, desactivada: true }); }
      await Sucursal.deleteOne({ _id: s._id, userId });
      res.json({ ok: true, desactivada: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/resumen', async (req, res) => {
    try {
      const userId = uid(req);
      const mes = caja.esMes(req.query.mes) ? req.query.mes : caja.mesActual();
      const [movimientos, turnos, profesionales, sucursales] = await Promise.all([Movimiento.find({ userId }).lean(), Turno.find({ userId }).lean(), Profesional.find({ userId }).lean(), Sucursal.find({ userId }).lean()]);
      res.json(suc.resumen({ movimientos, turnos, profesionales, sucursales, mes }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Un turno a un local (o sacarlo, con sucursalId vacío)
  router.post('/turno', async (req, res) => {
    try {
      const userId = uid(req);
      const t = await Turno.findOne({ _id: String(req.body?.turnoId || ''), userId }).lean();
      if (!t) return res.status(404).json({ error: 'Turno no encontrado' });
      const id = String(req.body?.sucursalId || '');
      if (id && !(await Sucursal.findOne({ _id: id, userId }))) return res.status(404).json({ error: 'Sucursal no encontrada' });
      await Turno.findOneAndUpdate({ _id: t._id, userId }, { $set: { sucursalId: id } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
