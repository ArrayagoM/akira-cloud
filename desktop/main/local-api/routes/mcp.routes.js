// local-api/routes/mcp.routes.js
// Pantalla "Integraciones → Asistentes de IA (MCP)": activar/desactivar, crear y revocar conexiones y ver la actividad.
// Solo el dueño (los perfiles de encargado y empleado no tienen acceso: ver ENCARGADO_NO en perfiles.js).
'use strict';

const express = require('express');

module.exports = function crearRouter({ requerirSesion, servicioMcp }) {
  const router = express.Router();
  router.use(requerirSesion);
  const sin = (res) => res.status(503).json({ error: 'La conexión con asistentes de IA no está disponible.' });

  router.get('/', (req, res) => (servicioMcp ? res.json(servicioMcp.estado()) : sin(res)));
  router.put('/activo', async (req, res) => {
    if (!servicioMcp) return sin(res);
    try { res.json(await servicioMcp.activar(req.body?.activo === true)); } catch (e) { res.status(500).json({ error: 'No se pudo cambiar: ' + e.message }); }
  });
  router.post('/conexiones', (req, res) => {
    if (!servicioMcp) return sin(res);
    const r = servicioMcp.crearConexion(req.body || {});
    res.status(r.ok ? 201 : 400).json(r.ok ? { llave: r.llave, conexion: r.conexion, url: servicioMcp.estado().url } : { error: r.error });
  });
  router.delete('/conexiones/:id', (req, res) => { if (!servicioMcp) return sin(res); const r = servicioMcp.revocar(req.params.id); res.status(r.ok ? 200 : (r.status || 400)).json(r.ok ? r : { error: r.error }); });
  router.delete('/conexiones', (req, res) => (servicioMcp ? res.json(servicioMcp.revocarTodas()) : sin(res)));

  return router;
};
