// local-api/routes/respaldo.routes.js
// Respaldo cifrado y restauración de los datos del negocio (ver main/respaldo.js).
'use strict';

const express = require('express');
const fs = require('fs');
const respaldo = require('../../respaldo');

module.exports = function crearRouter({ requerirSesion, servicioRespaldo, appHooks = {} }) {
  const router = express.Router();
  router.use(requerirSesion);

  // OJO: nunca 401 — la interfaz lo toma como "sesión vencida" y desloguea al usuario. Contraseña mala = 422.
  const error = (res, e, status = 400) => res.status(e.codigo === 'CLAVE' ? 422 : status).json({ error: e.message || 'No se pudo completar la operación', codigo: e.codigo });
  const archivoValido = (a) => typeof a === 'string' && a.toLowerCase().endsWith(respaldo.EXT) && fs.existsSync(a) && fs.statSync(a).isFile();

  router.get('/', (_req, res) => res.json(servicioRespaldo.estado()));

  router.put('/', (req, res) => {
    try { res.json(servicioRespaldo.configurar({ activo: req.body?.activo, carpeta: req.body?.carpeta, clave: req.body?.clave })); }
    catch (e) { error(res, e); }
  });

  router.post('/elegir-carpeta', async (_req, res) => {
    const carpeta = await appHooks.elegirCarpeta?.();
    res.json({ carpeta: carpeta || null });
  });
  router.post('/elegir-archivo', async (_req, res) => {
    const archivo = await appHooks.elegirArchivo?.();
    res.json({ archivo: archivo || null });
  });
  router.post('/abrir-carpeta', async (_req, res) => {
    const { carpeta } = servicioRespaldo.estado();
    if (carpeta) await appHooks.abrirCarpeta?.(carpeta);
    res.json({ ok: !!carpeta });
  });

  router.post('/ahora', async (_req, res) => {
    try { res.json(await servicioRespaldo.respaldarAhora()); } catch (e) { error(res, e); }
  });

  // Comprueba un respaldo (contraseña y contenido) sin tocar nada.
  router.post('/verificar', (req, res) => {
    const { archivo, clave } = req.body || {};
    if (!archivoValido(archivo)) return res.status(400).json({ error: 'No encontré ese archivo de respaldo' });
    try { res.json(respaldo.verificar(archivo, String(clave || ''))); } catch (e) { error(res, e); }
  });

  // Deja la restauración lista y reinicia la app: al volver a abrir se aplica (y se guarda una copia de lo anterior).
  router.post('/restaurar', (req, res) => {
    const { archivo, clave, confirmar } = req.body || {};
    if (confirmar !== true) return res.status(400).json({ error: 'Falta confirmar la restauración' });
    if (!archivoValido(archivo)) return res.status(400).json({ error: 'No encontré ese archivo de respaldo' });
    try {
      const man = respaldo.prepararRestauracion({ userDataDir: appHooks.userDataDir, archivo, clave: String(clave || '') });
      res.json({ ok: true, reiniciando: !!appHooks.reiniciar, creado: man.creado, version: man.version });
      setTimeout(() => appHooks.reiniciar?.(), 1500);
    } catch (e) { error(res, e); }
  });

  return router;
};
