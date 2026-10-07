// local-api/routes/codigos.routes.js
// Códigos de barras del catálogo: códigos propios para los productos que no traen uno y etiquetas imprimibles en PDF.
// No guarda nada: la pantalla del Catálogo asigna los códigos y los guarda junto con el resto de la lista.
'use strict';

const express = require('express');
const Config = require('../../bot-engine/models/Config');
const cb = require('../../gestion/codigo-barras');

module.exports = function crearRouter({ requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);

  // N códigos nuevos que no choquen con los que ya existen
  router.post('/generar', (req, res) => {
    try {
      const existentes = Array.isArray(req.body?.existentes) ? req.body.existentes.slice(0, 5000).map(String) : [];
      const n = Math.min(500, Math.max(0, Math.floor(Number(req.body?.cantidad)) || 0));
      const codigos = []; const usados = [...existentes];
      for (let i = 0; i < n; i++) { const c = cb.generar(usados); usados.push(c); codigos.push(c); }
      res.json({ codigos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Etiquetas en PDF. productos: [{ nombre, precio, codigo }]
  router.post('/etiquetas', express.json({ limit: '2mb' }), async (req, res) => {
    try {
      const lista = (Array.isArray(req.body?.productos) ? req.body.productos : []).slice(0, 2000).map((p) => ({ nombre: String(p.nombre || '').slice(0, 80), precio: Number(p.precio) || 0, codigo: cb.sanear(p.codigo) })).filter((p) => p.codigo);
      if (!lista.length) return res.status(400).json({ error: 'Ningún producto tiene código de barras todavía.' });
      const negocio = (await Config.findOne({ userId: String(req.user._id) }))?.negocio || '';
      const buf = await cb.generarEtiquetas(lista, { negocio });
      res.set('Content-Type', 'application/pdf'); res.set('Content-Disposition', 'attachment; filename="etiquetas.pdf"'); res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
