// local-api/routes/avisos.routes.js
// Avisos al dueño: resumen del día por WhatsApp (opcional, apagado por defecto).
'use strict';

const express = require('express');
const Config = require('../../bot-engine/models/Config');

module.exports = function crearRouter({ requerirSesion, servicioResumenDiario, botService, servicioCelular }) {
  const router = express.Router();
  router.use(requerirSesion);

  const celular = async (req) => { const c = await Config.findOne({ userId: String(req.user._id) }); return String(c?.celularNotificaciones || '').replace(/\D/g, ''); };
  const estado = async (req) => ({ resumenDiario: servicioResumenDiario.estado().resumenDiario, celularConfigurado: (await celular(req)).length >= 10, whatsappConectado: !!botService.getBotStatus(0)?.conectado });

  router.get('/', async (req, res) => res.json(await estado(req)));

  router.put('/resumen-diario', async (req, res) => {
    try {
      const { activo, hora } = req.body || {};
      servicioResumenDiario.configurar({ activo: typeof activo === 'boolean' ? activo : undefined, hora });
      res.json(await estado(req));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Envía ahora uno de prueba (no cuenta como el del día).
  router.post('/resumen-diario/probar', async (req, res) => {
    if ((await celular(req)).length < 10) return res.status(400).json({ error: 'Primero cargá tu celular en Config → Notificaciones al dueño.', motivo: 'sin-celular' });
    const r = await servicioResumenDiario.enviarAhora({ prueba: true });
    if (r.ok) return res.json({ ok: true });
    res.status(r.motivo === 'bot-desconectado' ? 409 : 400).json({ error: r.motivo === 'bot-desconectado' ? 'El bot no está conectado a WhatsApp en este momento.' : 'No se pudo enviar el resumen.', motivo: r.motivo });
  });

  // Control desde el celular (app móvil): pausar/reanudar y vacaciones. Opcional, apagado por defecto.
  router.get('/celular', (_req, res) => res.json(servicioCelular ? servicioCelular.estado() : { activo: false }));
  router.put('/celular', (req, res) => {
    if (!servicioCelular) return res.status(404).json({ error: 'No disponible' });
    res.json(servicioCelular.configurar(req.body?.activo === true));
  });

  return router;
};
