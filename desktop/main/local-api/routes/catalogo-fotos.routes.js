// local-api/routes/catalogo-fotos.routes.js
// Fotos de productos del catálogo (ver main/catalogo-fotos.js).
'use strict';

const express = require('express');
const fotos = require('../../catalogo-fotos');

module.exports = function crearRouter({ requerirSesion, userDataDir }) {
  const router = express.Router();
  router.use(requerirSesion);

  router.post('/', express.json({ limit: '25mb' }), (req, res) => {
    try {
      const b64 = req.body?.base64;
      if (typeof b64 !== 'string' || !b64) return res.status(400).json({ error: 'Falta la imagen' });
      res.json({ ref: fotos.guardar(userDataDir, Buffer.from(b64, 'base64')) });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  // La miniatura: el navegador la pide con la sesión (ref sin el "local:")
  router.get('/:archivo', (req, res) => {
    const buf = fotos.leer(userDataDir, `local:${req.params.archivo}`);
    if (!buf) return res.status(404).json({ error: 'Foto no encontrada' });
    res.set('Content-Type', fotos.tipoDeImagen(buf) === 'png' ? 'image/png' : fotos.tipoDeImagen(buf) === 'webp' ? 'image/webp' : 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  });

  return router;
};
