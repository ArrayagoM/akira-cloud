// local-api/routes/marketing.routes.js
// Equipo de marketing: lista de especialistas y generación de borradores (ver main/marketing/).
'use strict';

const express = require('express');

module.exports = function crearRouter({ requerirSesion, servicioMarketing }) {
  const router = express.Router();
  router.use(requerirSesion);
  const sin = (res) => res.status(503).json({ error: 'El equipo de marketing no está disponible.' });

  router.get('/', async (req, res) => {
    if (!servicioMarketing) return sin(res);
    try { res.json(await servicioMarketing.estado(String(req.user._id))); } catch (e) { res.status(500).json({ error: 'No se pudo cargar.' }); }
  });
  router.post('/generar', async (req, res) => {
    if (!servicioMarketing) return sin(res);
    try { res.json(await servicioMarketing.generar(String(req.user._id), req.body || {})); }
    catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo generar el borrador.', codigo: e.codigo }); }
  });
  return router;
};
