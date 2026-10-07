// local-api/routes/plantillas.routes.js
// Plantillas por rubro (ver main/plantillas-rubro.js): se ve qué cambiaría ANTES de aplicarla.
'use strict';

const express = require('express');
const Config = require('../../bot-engine/models/Config');
const Log = require('../../bot-engine/models/Log');
const plantillas = require('../../plantillas-rubro');

module.exports = function crearRouter({ requerirSesion, botService }) {
  const router = express.Router();
  router.use(requerirSesion);
  const recargar = () => { for (let s = 0; s < 5; s++) { try { botService.recargarConfig(s); } catch { /* cuenta inactiva */ } } };
  const modoValido = (m) => (m === 'reemplazar' ? 'reemplazar' : 'completar');

  router.get('/', (_req, res) => res.json({ rubros: plantillas.listar().map(({ id, nombre, icono, descripcion }) => ({ id, nombre, icono, descripcion })) }));

  router.post('/vista-previa', async (req, res) => {
    const r = plantillas.obtener(req.body?.id);
    if (!r) return res.status(404).json({ error: 'Plantilla inexistente' });
    const cfg = (await Config.findOne({ userId: String(req.user._id) }).lean()) || {};
    const { cambios, resumen } = plantillas.planificar(cfg, r, modoValido(req.body?.modo));
    const full = plantillas.listar().find((x) => x.id === r.id);
    res.json({ id: r.id, nombre: r.nombre, icono: r.icono, resumen, servicios: cambios.serviciosList || [], hayCambios: Object.keys(cambios).length > 0, yaTieneServicios: Array.isArray(cfg.serviciosList) && cfg.serviciosList.length > 0, estilo: full.prompt });
  });

  router.post('/aplicar', async (req, res) => {
    try {
      if (req.body?.confirmar !== true) return res.status(400).json({ error: 'Falta confirmar.' });
      const r = plantillas.obtener(req.body?.id);
      if (!r) return res.status(404).json({ error: 'Plantilla inexistente' });
      const uid = String(req.user._id);
      const cfg = (await Config.findOne({ userId: uid }).lean()) || {};
      const { cambios, resumen } = plantillas.planificar(cfg, r, modoValido(req.body?.modo));
      if (!Object.keys(cambios).length) return res.status(409).json({ error: 'No hay nada para completar: ya tenés todo cargado. Si querés cambiarlo igual, elegí "reemplazar".' });
      await Config.findOneAndUpdate({ userId: uid }, { $set: cambios }, { upsert: true });
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Plantilla "${r.nombre}" aplicada (${modoValido(req.body?.modo)})` });
      recargar();
      res.json({ ok: true, resumen });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
