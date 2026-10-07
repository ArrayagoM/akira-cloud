// local-api/routes/webhooks.routes.js
// Webhooks de salida (ver main/webhooks.js): destinos, secretos, pruebas y las últimas entregas.
'use strict';

const express = require('express');
const { EVENTOS } = require('../../webhooks');

module.exports = function crearRouter({ requerirSesion, servicioWebhooks }) {
  const router = express.Router();
  router.use(requerirSesion);
  const sin = (res) => res.status(503).json({ error: 'El servicio de webhooks no está disponible.' });
  const responder = (res, r, ok = 200) => res.status(r.ok ? ok : (r.status || 400)).json(r.ok ? r : { error: r.error });

  router.get('/', (req, res) => (servicioWebhooks ? res.json({ destinos: servicioWebhooks.lista(), eventos: EVENTOS, entregas: servicioWebhooks.entregas() }) : sin(res)));
  router.post('/', (req, res) => (servicioWebhooks ? responder(res, servicioWebhooks.crear(req.body || {})) : sin(res)));
  router.put('/:id', (req, res) => (servicioWebhooks ? responder(res, servicioWebhooks.actualizar(req.params.id, req.body || {})) : sin(res)));
  router.post('/:id/secreto', (req, res) => (servicioWebhooks ? responder(res, servicioWebhooks.regenerarSecreto(req.params.id)) : sin(res)));
  router.post('/:id/probar', async (req, res) => { if (!servicioWebhooks) return sin(res); const r = await servicioWebhooks.probar(req.params.id); res.status(r.error === 'Destino no encontrado' ? 404 : 200).json(r); });
  router.delete('/:id', (req, res) => (servicioWebhooks ? responder(res, servicioWebhooks.eliminar(req.params.id)) : sin(res)));

  return router;
};
