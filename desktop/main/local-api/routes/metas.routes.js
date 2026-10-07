// local-api/routes/metas.routes.js — metas del mes (ingresos y turnos) y su avance.
'use strict';

const express = require('express');
const Movimiento = require('../../bot-engine/models/Movimiento');
const Turno = require('../../bot-engine/models/Turno');
const caja = require('../../gestion/caja');
const metas = require('../../gestion/metas');

module.exports = function crearRouter({ requerirSesion, userDataDir }) {
  const router = express.Router();
  router.use(requerirSesion);

  async function armar(userId) {
    const hoy = caja.fechaLocal(new Date()); const mes = hoy.slice(0, 7);
    const m = metas.leer(userDataDir);
    const manuales = (await Movimiento.find({ userId }).lean()).filter((x) => String(x.fecha || '').startsWith(mes));
    const turnos = await Turno.find({ userId }).lean();
    const ingresosMes = caja.resumen([...manuales, ...caja.ingresosDeTurnos(turnos, mes)]).ingresos;
    const { desde, hasta } = caja.rangoMes(mes);
    const turnosMes = turnos.filter((t) => t.estado !== 'cancelado' && new Date(t.fechaInicio) >= desde && new Date(t.fechaInicio) < hasta).length;
    return { metas: m, progreso: metas.progreso(m, { ingresosMes, turnosMes }, mes, hoy), mes };
  }

  router.get('/', async (req, res) => { try { res.json(await armar(String(req.user._id))); } catch (e) { res.status(500).json({ error: e.message }); } });
  router.put('/', async (req, res) => {
    try {
      const r = metas.guardar(userDataDir, req.body || {});
      if (!r.ok) return res.status(400).json({ error: r.error });
      res.json({ ok: true, ...(await armar(String(req.user._id))) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  return router;
};
