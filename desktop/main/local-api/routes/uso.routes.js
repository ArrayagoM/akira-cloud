// local-api/routes/uso.routes.js — estadísticas de uso anónimas (opcionales): estado, activar/apagar y contar una pantalla abierta.
'use strict';

const express = require('express');
const uso = require('../../uso-estadisticas');

module.exports = function crearRouter({ requerirSesion, userDataDir }) {
  const router = express.Router();
  router.use(requerirSesion);
  router.get('/', (_req, res) => res.json({ activo: uso.activo(userDataDir) }));
  router.put('/', (req, res) => res.json({ activo: uso.activar(userDataDir, req.body?.activo === true) }));
  router.post('/pantalla', (req, res) => res.json({ ok: uso.contar(userDataDir, String(req.body?.pantalla || '')) }));
  return router;
};
