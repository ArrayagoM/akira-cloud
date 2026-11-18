// local-api/routes/turnos.routes.js — igual a backend/routes/turnos.routes.js
// contra la base local. Además: turnos cargados a mano, edición/reprogramación y "puestos" (lugares o equipos de trabajo que
// atienden en paralelo). La lógica pura vive en gestion/turnos-manual.js (probada en tests/turnos-manual*.test.js).
'use strict';

const Turno = require('../../bot-engine/models/Turno');
const Config = require('../../bot-engine/models/Config');
const Profesional = require('../../bot-engine/models/Profesional');
const credenciales = require('../../security/credentials-store');
const TM = require('../../gestion/turnos-manual');

const MSG_500 = 'No se pudo completar la operación. Probá de nuevo en unos segundos.';

module.exports = function crearRouter({ requerirSesion }) {
  const router = require('express').Router();
  router.use(requerirSesion);

  // Nunca se devuelve el detalle técnico al cliente: va al log.
  const fallo = (res, e, donde) => { console.error(`[turnos] ${donde}:`, e); res.status(500).json({ error: MSG_500 }); };

  // Calendario que usa el bot (el "puesto General"), puestos guardados y puestos que ya aparecen en turnos.
  async function contexto(userId) {
    const [cfg, turnos] = await Promise.all([Config.findOne({ userId }).lean(), Turno.find({ userId }).lean()]);
    const general = TM.calendarioGeneral(cfg, credenciales.decrypt);
    const alojamiento = cfg?.tipoNegocio === 'alojamiento';
    const configurados = Array.isArray(cfg?.puestosAgenda) ? cfg.puestosAgenda.filter((x) => typeof x === 'string') : [];
    const lista = TM.listarPuestos({ configurados, turnos, general, incluirDeTurnos: !alojamiento });
    return { general, alojamiento, configurados, lista, conocidos: lista.filter((p) => !p.general).map((p) => p.valor) };
  }

  // Choque de horario en el MISMO puesto (turnos que se pisan; los cancelados no cuentan). Igual que crearEvento del bot.
  async function buscarChoque(userId, { ini, fin, calendarId, general, excluirId }) {
    const ids = TM.idsDelPuesto(calendarId, general);
    const candidatos = await Turno.find({ userId, estado: { $ne: 'cancelado' }, calendarId: { $in: ids }, fechaInicio: { $lt: fin }, fechaFin: { $gt: ini } }).lean();
    return TM.buscarChoque(candidatos, { ini, fin, calendarIds: ids, excluirId });
  }

  const profesionalActivo = async (userId, id) => {
    const p = await Profesional.findOne({ _id: String(id), userId }).lean();
    return p && p.activo !== false ? p : null;
  };

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
    } catch (e) { fallo(res, e, 'GET /'); }
  });

  router.get('/proximos', async (req, res) => {
    try {
      const turnos = await Turno.find({ userId: req.user._id, estado: { $ne: 'cancelado' }, fechaInicio: { $gte: new Date() } }).sort({ fechaInicio: 1 }).limit(10).lean();
      res.json({ turnos });
    } catch (e) { fallo(res, e, 'GET /proximos'); }
  });

  // ── Puestos ──────────────────────────────────────────────────────────
  // Lectura: el puesto "General" (el del bot, siempre existe), los guardados y los que ya tienen turnos. `valor` es lo que se manda como "puesto".
  const respuestaPuestos = (c) => ({ puestos: c.lista, configurados: c.configurados, maximo: TM.MAX_PUESTOS });

  router.get('/puestos', async (req, res) => {
    try { res.json(respuestaPuestos(await contexto(req.user._id))); }
    catch (e) { fallo(res, e, 'GET /puestos'); }
  });

  // Escritura: reemplaza la lista guardada. Body { puestos: ['Puesto 1', 'Box A'] } (máximo 20, 1 a 40 caracteres, sin repetidos).
  router.put('/puestos', async (req, res) => {
    try {
      const r = TM.validarPuestos(req.body?.puestos);
      if (!r.ok) return res.status(400).json({ error: r.error });
      const userId = req.user._id;
      if (!(await Config.findOne({ userId }).lean())) await Config.create({ userId, ...Config.DEFAULTS });
      await Config.findOneAndUpdate({ userId }, { puestosAgenda: r.puestos }, { new: true });
      res.json(respuestaPuestos(await contexto(userId)));
    } catch (e) { fallo(res, e, 'PUT /puestos'); }
  });

  // ── Alta manual ──────────────────────────────────────────────────────
  // Body: { clienteNombre, clienteTelefono?, titulo, detalle?, fecha:'YYYY-MM-DD', hora:'HH:mm', duracionMin (5 a 1440), puesto?, profesionalId?, precioInformativo? }
  // Fecha y hora son de Argentina (UTC-3). No se sincroniza con Google Calendar ni avisa al bot. El precio es solo informativo (no entra a la Caja).
  router.post('/', async (req, res) => {
    try {
      const userId = req.user._id;
      const v = TM.validarAlta(req.body);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const ctx = await contexto(userId);
      if (ctx.alojamiento) return res.status(400).json({ error: 'En alojamientos las reservas se cargan por el bot; acá no se pueden crear turnos a mano.' });
      const rp = TM.resolverPuesto(v.puesto, { general: ctx.general, conocidos: ctx.conocidos });
      if (!rp.ok) return res.status(400).json({ error: rp.error });
      if (rp.nuevo && ctx.conocidos.length >= TM.MAX_PUESTOS) return res.status(400).json({ error: `Ya tenés ${TM.MAX_PUESTOS} puestos. Usá uno de los que ya existen.` });
      let prof = null;
      if (v.profesionalId) {
        prof = await profesionalActivo(userId, v.profesionalId);
        if (!prof) return res.status(400).json({ error: 'Ese profesional no existe o está dado de baja.' });
      }
      const { fechaInicio: ini, fechaFin: fin } = v.dato;
      const choque = await buscarChoque(userId, { ini, fin, calendarId: rp.calendarId, general: ctx.general });
      if (choque) return res.status(409).json({ error: TM.mensajeChoque(choque, TM.nombrePuesto(rp.calendarId, ctx.general)), choque: { id: String(choque._id) } });
      let turno;
      try {
        const { precioInformativo, ...dato } = v.dato;
        turno = await Turno.create({
          userId, calendarId: rp.calendarId, ...dato, clienteEmail: '', estado: 'confirmado', origen: 'manual', googleSyncStatus: null,
          ...(precioInformativo != null ? { precioInformativo } : {}),
          ...(prof ? TM.camposProfesional(prof) : {}),
        });
      } catch (e) {
        if (e && e.code === 11000) return res.status(409).json({ error: TM.mensajeMismoInicio(TM.nombrePuesto(rp.calendarId, ctx.general)) });
        throw e;
      }
      res.status(201).json({ turno });
    } catch (e) { fallo(res, e, 'POST /'); }
  });

  // ── Edición ──────────────────────────────────────────────────────────
  // Sigue aceptando { estado, notas, ausente } igual que siempre. Además, datos del turno: clienteNombre, clienteTelefono, titulo,
  // detalle, fecha, hora, duracionMin, puesto, profesionalId, precioInformativo (solo cambia lo que se manda).
  router.patch('/:id', async (req, res) => {
    try {
      const b = req.body || {};
      const { estado, notas, ausente } = b;
      const userId = req.user._id;
      const update = {};
      let puestoTxt = '';
      // "No vino": solo para turnos que ya pasaron. El turno sigue siendo "confirmado" (si había seña, sigue contando en la Caja).
      if (ausente !== undefined) {
        if (typeof ausente !== 'boolean') return res.status(400).json({ error: 'Valor inválido' });
        const t = await Turno.findOne({ _id: req.params.id, userId }).lean();
        if (!t) return res.status(404).json({ error: 'Turno no encontrado' });
        if (ausente && new Date(t.fechaInicio) > new Date()) return res.status(400).json({ error: 'Ese turno todavía no pasó.' });
        update.ausente = ausente;
      }
      if (estado) update.estado = estado;
      if (notas !== undefined) update['pago.notas'] = notas;

      if (TM.hayEdicion(b)) {
        const t = await Turno.findOne({ _id: req.params.id, userId }).lean();
        if (!t) return res.status(404).json({ error: 'Turno no encontrado' });
        if (t.estado === 'cancelado') return res.status(400).json({ error: 'Ese turno está cancelado y no se puede editar. Creá uno nuevo.' });
        const ctx = await contexto(userId);
        const v = TM.validarEdicion(b, t, { general: ctx.general });
        if (!v.ok) return res.status(400).json({ error: v.error });
        Object.assign(update, v.set);

        if (v.profesionalId !== undefined) {
          if (v.profesionalId === '') Object.assign(update, TM.camposProfesional(null));
          else if (String(t.profesionalId || '') !== v.profesionalId) {
            const prof = await profesionalActivo(userId, v.profesionalId);
            if (!prof) return res.status(400).json({ error: 'Ese profesional no existe o está dado de baja.' });
            Object.assign(update, TM.camposProfesional(prof));
          }
        }

        if (v.horario) {
          let calendarId = t.calendarId;
          let cambiaPuesto = false;
          if (v.horario.puesto !== undefined) {
            const rp = TM.resolverPuesto(v.horario.puesto, { general: ctx.general, conocidos: ctx.conocidos });
            if (!rp.ok) return res.status(400).json({ error: rp.error });
            const mismo = (TM.esGeneral(t.calendarId, ctx.general) && rp.esGeneral) || String(t.calendarId) === rp.calendarId;
            if (!mismo) {
              if (rp.nuevo && ctx.conocidos.length >= TM.MAX_PUESTOS) return res.status(400).json({ error: `Ya tenés ${TM.MAX_PUESTOS} puestos. Usá uno de los que ya existen.` });
              cambiaPuesto = true; calendarId = rp.calendarId;
            }
          }
          if (v.horario.cambiaHora || cambiaPuesto) {
            if (ctx.alojamiento) return res.status(400).json({ error: 'En alojamientos las fechas se cambian cancelando y cargando la reserva de nuevo.' });
            if (t.googleEventId) return res.status(400).json({ error: 'Este turno ya está en tu Google Calendar, así que no se le puede cambiar el día, la hora ni el puesto desde acá. Cancelalo y creá uno nuevo; el detalle y los datos del cliente sí se pueden editar.' });
            if (t.estado !== 'confirmado') return res.status(400).json({ error: 'Este turno todavía espera el pago, así que no se puede reprogramar. Podés cambiar el detalle y los datos del cliente.' });
            const choque = await buscarChoque(userId, { ini: v.horario.ini, fin: v.horario.fin, calendarId, general: ctx.general, excluirId: t._id });
            if (choque) return res.status(409).json({ error: TM.mensajeChoque(choque, TM.nombrePuesto(calendarId, ctx.general)), choque: { id: String(choque._id) } });
            puestoTxt = TM.nombrePuesto(calendarId, ctx.general);
            update.fechaInicio = v.horario.ini; update.fechaFin = v.horario.fin;
            if (cambiaPuesto) update.calendarId = calendarId;
          }
        }
      }

      let turno;
      try {
        turno = await Turno.findOneAndUpdate({ _id: req.params.id, userId }, { $set: update }, { new: true });
      } catch (e) {
        // El índice único de la base (mismo puesto y misma hora de inicio) cubre la carrera con el bot.
        if (e && e.code === 11000) return res.status(409).json({ error: TM.mensajeMismoInicio(puestoTxt) });
        throw e;
      }
      if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
      res.json({ turno });
    } catch (e) { fallo(res, e, 'PATCH /:id'); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const turno = await Turno.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { estado: 'cancelado' } }, { new: true });
      if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
      res.json({ ok: true });
    } catch (e) { fallo(res, e, 'DELETE /:id'); }
  });

  return router;
};
