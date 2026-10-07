// local-api/routes/cierres.routes.js
// Cierre de caja diario: el sistema calcula el efectivo que debería haber y el dueño anota lo que contó.
'use strict';

const express = require('express');
const Movimiento = require('../../bot-engine/models/Movimiento');
const Turno = require('../../bot-engine/models/Turno');
const CierreCaja = require('../../bot-engine/models/CierreCaja');
const caja = require('../../gestion/caja');
const cierre = require('../../gestion/cierre');

module.exports = function crearRouter({ requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);
  const uid = (req) => String(req.user._id);

  async function movimientosDelDia(userId, fecha) {
    const manuales = (await Movimiento.find({ userId }).lean()).filter((m) => m.fecha === fecha);
    const turnos = await Turno.find({ userId }).lean();
    return [...manuales, ...caja.ingresosDeTurnos(turnos, fecha.slice(0, 7)).filter((m) => m.fecha === fecha)];
  }

  async function armar(userId, fecha) {
    const cierres = await CierreCaja.find({ userId }).lean();
    const hecho = cierres.find((c) => c.fecha === fecha) || null;
    const inicial = hecho && hecho.inicial !== null && hecho.inicial !== undefined ? hecho.inicial : cierre.fondoInicial(cierres, fecha);
    const c = cierre.calcular(await movimientosDelDia(userId, fecha), fecha, { inicial, contado: hecho ? hecho.contado : null });
    const recientes = [...cierres].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10).map((x) => ({ fecha: x.fecha, esperado: x.esperado, contado: x.contado, diferencia: x.diferencia, nota: x.nota || '' }));
    return { cierre: c, cerrado: !!hecho, nota: hecho?.nota || '', recientes };
  }

  router.get('/', async (req, res) => {
    try {
      const fecha = req.query.fecha || caja.fechaLocal(new Date());
      if (!caja.esFechaValida(fecha)) return res.status(400).json({ error: 'La fecha no es válida' });
      res.json({ ...(await armar(uid(req), fecha)), fecha });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const userId = uid(req);
      const fecha = req.body?.fecha || caja.fechaLocal(new Date());
      const r = cierre.sanear(req.body, fecha);
      if (!r.ok) return res.status(400).json({ error: r.error });
      const previos = await CierreCaja.find({ userId }).lean();
      const inicial = r.dato.inicial !== null ? r.dato.inicial : cierre.fondoInicial(previos, fecha);
      const c = cierre.calcular(await movimientosDelDia(userId, fecha), fecha, { inicial, contado: r.dato.contado });
      const datos = { userId, fecha, inicial: r.dato.inicial, esperado: c.esperado, contado: c.contado, diferencia: c.diferencia, estado: c.estado, nota: r.dato.nota, porMetodo: c.porMetodo, cerradoEn: new Date().toISOString() };
      const existente = previos.find((x) => x.fecha === fecha);
      if (existente) await CierreCaja.findOneAndUpdate({ _id: existente._id, userId }, { $set: datos }); else await CierreCaja.create(datos);
      res.json({ ok: true, ...(await armar(userId, fecha)), mensaje: cierre.textoDiferencia(c) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
