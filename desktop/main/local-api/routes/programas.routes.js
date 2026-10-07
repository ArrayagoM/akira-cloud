// local-api/routes/programas.routes.js
// Programas con tus clientes: fidelidad y reseñas (opcionales, apagados por defecto).
'use strict';

const express = require('express');
const BotCliente = require('../../bot-engine/models/BotCliente');
const Turno = require('../../bot-engine/models/Turno');
const programas = require('../../programas');

module.exports = function crearRouter({ requerirSesion, userDataDir }) {
  const router = express.Router();
  router.use(requerirSesion);

  router.get('/', async (req, res) => {
    const cfg = programas.leer(userDataDir);
    let premios = [];
    if (cfg.fidelidad.activa) {
      const uid = String(req.user._id);
      premios = programas.clientesConPremio(await BotCliente.find({ userId: uid }).lean(), await Turno.find({ userId: uid }).lean(), cfg.fidelidad.cada);
    }
    res.json({ ...cfg, premios });
  });

  router.put('/', (req, res) => {
    try { res.json(programas.guardar(userDataDir, { fidelidad: req.body?.fidelidad, resenas: req.body?.resenas })); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // El cliente retiró su premio: se anota (el contador de visitas del ciclo vuelve a empezar).
  router.post('/canjear', async (req, res) => {
    try {
      const cfg = programas.leer(userDataDir).fidelidad;
      if (!cfg.activa) return res.status(409).json({ error: 'El programa de fidelidad está apagado.' });
      const uid = String(req.user._id);
      const jid = String(req.body?.jid || '');
      const c = await BotCliente.findOne({ userId: uid, jid }).lean();
      if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
      const r = programas.clientesConPremio([c], await Turno.find({ userId: uid }).lean(), cfg.cada)[0];
      if (!r) return res.status(409).json({ error: 'Este cliente todavía no tiene un premio para canjear.' });
      await BotCliente.findOneAndUpdate({ userId: uid, jid }, { $set: { canjesFidelidad: (c.canjesFidelidad || 0) + 1 } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
