// local-api/routes/turnos.routes.js — igual a backend/routes/turnos.routes.js
// contra la base local.
'use strict';

const Turno = require('../../bot-engine/models/Turno');

module.exports = function crearRouter({ requerirSesion }) {
  const router = require('express').Router();
  router.use(requerirSesion);

  router.get('/', async (req, res) => {
    try {
      const { mes, desde, hasta } = req.query;
      let ini, fin;
      if (mes) {
        const [y, m] = mes.split('-').map(Number);
        ini = new Date(Date.UTC(y, m - 1, 1));
        fin = new Date(Date.UTC(y, m, 1));
      } else if (desde && hasta) {
        ini = new Date(desde);
        fin = new Date(hasta);
      } else {
        const now = new Date();
        ini = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        fin = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
      }
      const turnos = await Turno.find({ userId: req.user._id, estado: { $ne: 'cancelado' }, fechaInicio: { $gte: ini, $lt: fin } }).sort({ fechaInicio: 1 }).lean();
      res.json({ turnos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/proximos', async (req, res) => {
    try {
      const turnos = await Turno.find({ userId: req.user._id, estado: { $ne: 'cancelado' }, fechaInicio: { $gte: new Date() } }).sort({ fechaInicio: 1 }).limit(10).lean();
      res.json({ turnos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const { estado, notas } = req.body;
      const update = {};
      if (estado) update.estado = estado;
      if (notas !== undefined) update['pago.notas'] = notas;
      const turno = await Turno.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: update }, { new: true });
      if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
      res.json({ turno });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const turno = await Turno.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { estado: 'cancelado' } }, { new: true });
      if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
