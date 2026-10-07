// local-api/routes/reportes.routes.js — reportes del negocio (servicios, clientes, horas pico, ausencias, evolución) y su exportación.
'use strict';

const express = require('express');
const Movimiento = require('../../bot-engine/models/Movimiento');
const Turno = require('../../bot-engine/models/Turno');
const Config = require('../../bot-engine/models/Config');
const caja = require('../../gestion/caja');
const reportes = require('../../gestion/reportes');
const exp = require('../../gestion/exportador-reportes');

module.exports = function crearRouter({ requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);

  async function armar(req) {
    const userId = String(req.user._id);
    const hoy = caja.fechaLocal(new Date());
    const periodo = ['mes', '3m', '6m', '12m'].includes(req.query.periodo) ? req.query.periodo : 'mes';
    const { desde, hasta, meses } = reportes.rangoPeriodo(periodo, hoy);
    const [turnos, movimientos] = await Promise.all([Turno.find({ userId }).lean(), Movimiento.find({ userId }).lean()]);
    return { periodo, ...reportes.armar({ turnos, movimientos, desde, hasta, meses }) };
  }

  router.get('/', async (req, res) => { try { res.json(await armar(req)); } catch (e) { res.status(500).json({ error: e.message }); } });

  router.get('/exportar', async (req, res) => {
    try {
      const r = await armar(req);
      const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
      const negocio = (await Config.findOne({ userId: String(req.user._id) }))?.negocio || '';
      const buf = formato === 'csv' ? exp.exportarCsv(r) : await exp.exportarXlsx(r, { negocio });
      res.set('Content-Type', formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="reportes-${r.hasta}.${formato}"`);
      res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  return router;
};
