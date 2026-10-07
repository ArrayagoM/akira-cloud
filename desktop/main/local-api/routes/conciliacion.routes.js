// local-api/routes/conciliacion.routes.js
// Conciliación con MercadoPago: ver qué cobros entraron a la cuenta y cuáles faltan anotar en la Caja.
'use strict';

const express = require('express');
const Config = require('../../bot-engine/models/Config');
const Turno = require('../../bot-engine/models/Turno');
const Pedido = require('../../bot-engine/models/Pedido');
const Movimiento = require('../../bot-engine/models/Movimiento');
const caja = require('../../gestion/caja');
const conc = require('../../gestion/conciliacion');

// La petición real a MercadoPago (en los tests se reemplaza)
const mpFetchReal = (token) => async (url) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

module.exports = function crearRouter({ requerirSesion, mpFetchPara = mpFetchReal }) {
  const router = express.Router();
  router.use(requerirSesion);
  const uid = (req) => String(req.user._id);

  const periodo = (q) => {
    const hoy = caja.fechaLocal(new Date());
    const desde = caja.esFechaValida(q.desde) ? q.desde : `${hoy.slice(0, 7)}-01`;
    const hasta = caja.esFechaValida(q.hasta) ? q.hasta : hoy;
    return { desde, hasta };
  };

  async function armar(userId, { desde, hasta }) {
    const cfg = await Config.findOne({ userId });
    const token = cfg?.getKey?.('keyMP');
    if (!token) throw Object.assign(new Error('Todavía no conectaste MercadoPago: cargá tu Access Token en Config.'), { status: 400 });
    if (desde > hasta) throw Object.assign(new Error('La fecha "desde" es posterior a "hasta".'), { status: 400 });
    const pagos = await conc.traerCobros(mpFetchPara(token), { desde, hasta });
    const [turnos, pedidos, movs] = await Promise.all([Turno.find({ userId }).lean(), Pedido.find({ userId }).lean(), Movimiento.find({ userId }).lean()]);
    return { desde, hasta, ...conc.cruzar({ pagos, turnos, pedidos, movimientos: movs, ventana: { desde, hasta } }) };
  }

  router.get('/', async (req, res) => {
    try { res.json(await armar(uid(req), periodo(req.query))); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  // Anota en la Caja los cobros que faltaban (se vuelve a consultar a MercadoPago: no se confía en los montos del navegador)
  router.post('/registrar', async (req, res) => {
    try {
      const userId = uid(req);
      const pedidos = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 200) : null;
      const r = await armar(userId, periodo(req.body || {}));
      const aRegistrar = r.sinRegistrar.filter((p) => !pedidos || pedidos.includes(p.id));
      let registrados = 0;
      for (const p of aRegistrar) {
        if (await Movimiento.findOne({ userId, mpId: p.id })) continue; // idempotente
        await Movimiento.create(conc.movimientoDeCobro(userId, p)); registrados++;
      }
      res.json({ ok: true, registrados });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  return router;
};
