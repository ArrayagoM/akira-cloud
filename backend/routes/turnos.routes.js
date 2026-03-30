// routes/turnos.routes.js
'use strict';

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const Turno   = require('../models/Turno');

// Todas las rutas requieren autenticación
router.use(auth);

// GET /api/turnos?mes=2026-03 — turnos del usuario en un mes
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
      // Por defecto: mes actual
      const now = new Date();
      ini = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      fin = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
    }

    const turnos = await Turno.find({
      userId:      req.user._id,
      estado:      { $ne: 'cancelado' },
      fechaInicio: { $gte: ini, $lt: fin },
    }).sort({ fechaInicio: 1 }).lean();

    res.json({ turnos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/turnos/proximos — próximos 10 turnos desde hoy
router.get('/proximos', async (req, res) => {
  try {
    const turnos = await Turno.find({
      userId:      req.user._id,
      estado:      { $ne: 'cancelado' },
      fechaInicio: { $gte: new Date() },
    }).sort({ fechaInicio: 1 }).limit(10).lean();

    res.json({ turnos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/turnos/:id — actualizar estado o datos
router.patch('/:id', async (req, res) => {
  try {
    const { estado, notas } = req.body;
    const update = {};
    if (estado) update.estado = estado;
    if (notas !== undefined) update['pago.notas'] = notas;

    const turno = await Turno.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: update },
      { new: true }
    );
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
    res.json({ turno });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/turnos/:id — cancelar turno
router.delete('/:id', async (req, res) => {
  try {
    const turno = await Turno.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { estado: 'cancelado' } },
      { new: true }
    );
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
