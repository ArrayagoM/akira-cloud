// local-api/routes/exportacion.routes.js
// Exportación automática a una carpeta (ver main/exportacion-auto.js): estado, configuración y "actualizar ahora".
'use strict';

const express = require('express');
const ex = require('../../exportacion-auto');

module.exports = function crearRouter({ requerirSesion, userDataDir, appHooks = {}, servicioExportacion }) {
  const router = express.Router();
  router.use(requerirSesion);

  router.get('/', (_req, res) => res.json({ ...ex.leerConfig(userDataDir), horas: ex.HORAS }));
  router.put('/', (req, res) => { const r = ex.guardarConfig(userDataDir, req.body || {}); res.status(r.ok ? 200 : 400).json(r.ok ? { ...r.config, horas: ex.HORAS } : { error: r.error }); });
  router.post('/elegir-carpeta', async (_req, res) => { const carpeta = await appHooks.elegirCarpeta?.(); res.json({ carpeta: carpeta || null }); });
  router.post('/ahora', async (_req, res) => {
    if (!servicioExportacion) return res.status(503).json({ error: 'El servicio de exportación no está disponible.' });
    const r = await servicioExportacion.ejecutar();
    res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true, archivos: r.archivos, ...ex.leerConfig(userDataDir) } : { error: r.error || 'No se pudo exportar' });
  });
  router.post('/abrir-carpeta', async (_req, res) => { const { carpeta } = ex.leerConfig(userDataDir); if (carpeta) await appHooks.abrirCarpeta?.(carpeta); res.json({ ok: !!carpeta }); });

  return router;
};
