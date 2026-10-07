// local-api/routes/analitica.routes.js
// Análisis de conversaciones: qué preguntan más los clientes y qué no supo responder el bot.
'use strict';

const express = require('express');
const Analitica = require('../../bot-engine/models/Analitica');
const svc = require('../../bot-engine/services/bot/analitica.service');

module.exports = function crearRouter({ requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);

  router.get('/', async (req, res) => {
    const dias = [7, 30, 90].includes(parseInt(req.query.dias, 10)) ? parseInt(req.query.dias, 10) : 30;
    res.json(svc.resumir(await Analitica.find({ userId: String(req.user._id) }).lean(), { dias }));
  });

  // Borra todo el historial del análisis (el dueño decide).
  router.delete('/', async (req, res) => {
    const r = await Analitica.deleteMany({ userId: String(req.user._id) });
    res.json({ ok: true, borrados: r?.deletedCount ?? 0 });
  });

  return router;
};
