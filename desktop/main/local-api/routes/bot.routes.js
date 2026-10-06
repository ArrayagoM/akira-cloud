// local-api/routes/bot.routes.js
// Mismas rutas y respuestas que backend/routes/bot.routes.js, contra la base
// local y el bot-service (bots en este mismo proceso). Los slots permitidos
// salen de la licencia activa (slotsMax del plan), no de una tabla local
// editable.
'use strict';

const path = require('path');
const fs = require('fs');
const Log = require('../../bot-engine/models/Log');
const Config = require('../../bot-engine/models/Config');
const BotCliente = require('../../bot-engine/models/BotCliente');
const Turno = require('../../bot-engine/models/Turno');
const WaitlistEntry = require('../../bot-engine/models/WaitlistEntry');
const Documento = require('../../bot-engine/models/Documento');
const licenseClient = require('../../license/license-client');

module.exports = function crearRouter({ botService, requerirSesion, userDataDir }) {
  const router = require('express').Router();
  router.use(requerirSesion);

  const maxSlots = () => licenseClient.getEstado()?.slotsMax ?? 1;
  const getSlot = (req) => { const s = parseInt(req.query.slot ?? req.body?.slot ?? '0'); return isNaN(s) ? 0 : Math.max(0, Math.min(4, s)); };

  // Nombres de cuentas de WhatsApp (por slot) — preferencia de la interfaz, guardada local.
  const archivoCuentas = path.join(userDataDir, 'cuentas-wa.json');
  const leerCuentas = () => { try { return JSON.parse(fs.readFileSync(archivoCuentas, 'utf-8')); } catch { return {}; } };

  // Solo se listan las cuentas que el usuario creó (la principal siempre existe);
  // el plan define cuántas puede crear (maxSlots), no que ya existan todas.
  router.get('/accounts', (req, res) => {
    const max = maxSlots();
    const nombres = leerCuentas();
    const slots = Array.from({ length: max }, (_, i) => i).filter((slot) => slot === 0 || nombres[slot] !== undefined || botService.getBotStatus(slot).activo);
    const accounts = slots.map((slot) => {
      const st = botService.getBotStatus(slot);
      return { slot, nombre: nombres[slot] || (slot === 0 ? 'Principal' : `Cuenta ${slot + 1}`), activo: st.activo, conectado: st.conectado, enMemoria: st.activo };
    });
    res.json({ accounts, maxSlots: max });
  });

  router.post('/accounts', (req, res) => {
    const max = maxSlots();
    const slotNum = parseInt(req.body.slot);
    if (isNaN(slotNum) || slotNum < 0 || slotNum >= max) return res.status(400).json({ error: `Tu plan permite hasta ${max} cuenta(s) (slots 0–${max - 1})` });
    const nombres = leerCuentas();
    nombres[slotNum] = req.body.nombre || `Cuenta ${slotNum + 1}`;
    fs.writeFileSync(archivoCuentas, JSON.stringify(nombres));
    res.json({ ok: true });
  });

  router.delete('/accounts/:slot', async (req, res) => {
    const slotNum = parseInt(req.params.slot);
    if (slotNum === 0) return res.status(400).json({ error: 'No podés eliminar la cuenta principal (slot 0)' });
    await botService.resetSession(req.user._id, slotNum);
    const nombres = leerCuentas();
    delete nombres[slotNum];
    fs.writeFileSync(archivoCuentas, JSON.stringify(nombres));
    res.json({ ok: true, msg: `Cuenta ${slotNum} eliminada` });
  });

  router.get('/status', (req, res) => {
    const slot = getSlot(req);
    const st = botService.getBotStatus(slot);
    res.json({ slot, activo: st.activo, conectado: st.conectado, instanciaEnMemoria: st.activo });
  });

  router.post('/start', async (req, res) => {
    const slot = getSlot(req);
    if (slot >= maxSlots()) return res.status(403).json({ ok: false, msg: `Tu plan solo permite ${maxSlots()} cuenta(s) de WhatsApp` });
    res.json(await botService.startBot(req.user._id, slot));
  });

  router.post('/stop', async (req, res) => {
    res.json(await botService.stopBot(req.user._id, getSlot(req)));
  });

  router.post('/reset-session', async (req, res) => {
    try {
      const deleted = await botService.resetSession(req.user._id, getSlot(req));
      res.json({ ok: true, msg: 'Sesión eliminada. Iniciá el bot de nuevo para escanear el QR.', deleted });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/logs', async (req, res) => {
    try {
      const logs = await Log.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(parseInt(req.query.limit) || 50).lean();
      res.json({ logs });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Contadores del día, calculados con datos reales: mensajes del contador del
  // bot; reservas = turnos creados hoy (sin cancelados); cobros = turnos pagados hoy.
  router.get('/stats', async (req, res) => {
    try {
      const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
      const turnos = await Turno.find({ userId: req.user._id }).lean();
      const hoy = (f) => f && new Date(f) >= inicio;
      const reservas = turnos.filter((t) => hoy(t.createdAt) && t.estado !== 'cancelado').length;
      const pagos = turnos.filter((t) => hoy(t.updatedAt) && t.estado === 'confirmado' && t.pago?.monto > 0).length;
      res.json({ mensajes: botService.mensajesHoy(), reservas, pagos });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/agenda', async (req, res) => {
    try {
      const reservasPath = path.join(userDataDir, 'sessions', 'principal', 'data', '_reservas.json');
      let reservasPendientes = {};
      if (fs.existsSync(reservasPath)) { try { reservasPendientes = JSON.parse(fs.readFileSync(reservasPath, 'utf8')); } catch {} }

      const [turnosLogs, config, turnos] = await Promise.all([
        Log.find({ userId: req.user._id, tipo: { $in: ['bot_reservation', 'bot_payment'] } }).sort({ createdAt: -1 }).limit(100).lean(),
        Config.findOne({ userId: req.user._id }).lean(),
        Turno.find({ userId: req.user._id, estado: { $ne: 'cancelado' } }).sort({ fechaInicio: 1 }).lean(),
      ]);

      // Argentina es UTC-3 fijo (sin cambio horario)
      const arISO = (d, part) => new Date(new Date(d).getTime() - 3 * 3600000).toISOString().slice(...(part === 'date' ? [0, 10] : [11, 16]));
      const mapTurno = (t) => ({
        nombre: t.clienteNombre || 'Sin nombre', telefono: t.clienteTelefono || '', email: t.clienteEmail || '',
        fecha: arISO(t.fechaInicio, 'date'), hora: arISO(t.fechaInicio, 'time'), horaFin: arISO(t.fechaFin, 'time'),
        unidad: t.calendarId !== 'principal' ? t.calendarId : '',
        totalPrecio: t.pago?.monto || 0, total: t.pago?.monto || 0,
        estado: t.estado, turnoId: String(t._id), _id: String(t._id),
      });

      const confirmadas = turnos.filter((t) => t.estado === 'confirmado').map(mapTurno);
      const idsEnArchivo = new Set(Object.values(reservasPendientes).map((r) => r.turnoId).filter(Boolean));
      const pendientesDb = turnos.filter((t) => t.estado === 'pendiente' && !idsEnArchivo.has(String(t._id))).map(mapTurno);

      res.json({
        pendientes: [...Object.values(reservasPendientes), ...pendientesDb],
        logs: turnosLogs, confirmadas,
        tipoNegocio: config?.tipoNegocio || 'turnos',
        unidadesAlojamiento: config?.unidadesAlojamiento || [],
        checkInHora: config?.checkInHora || '14:00',
        checkOutHora: config?.checkOutHora || '10:00',
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  const extraerNum = (jid) => (jid || '').split('@')[0].replace(/\D/g, '');

  router.get('/clientes', async (req, res) => {
    try {
      const { q, filtro, page = 1 } = req.query;
      const limit = 30;
      const skip = (Math.max(1, parseInt(page)) - 1) * limit;

      const base = { userId: req.user._id };
      if (q) {
        const re = new RegExp(String(q).slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        base.$or = [{ nombre: re }, { telefono: re }, { numeroReal: re }];
      }
      if (filtro === 'silenciados') base.silenciado = true;
      if (filtro === 'con_turno') base['turnosConfirmados.0'] = { $exists: true };
      if (filtro === 'vip') base.etiquetas = 'VIP';
      if (filtro === 'frecuentes') base['turnosConfirmados.4'] = { $exists: true };
      if (filtro === 'inactivos') base.updatedAt = { $lt: new Date(Date.now() - 30 * 86400000) };

      const cfg = await Config.findOne({ userId: req.user._id }, 'chatsIgnorados').lean();
      const ignorados = new Set(cfg?.chatsIgnorados || []);
      if (filtro === 'bloqueados') {
        if (ignorados.size === 0) return res.json({ clientes: [], total: 0 });
        base.jid = { $in: [...ignorados].map((n) => `${n}@s.whatsapp.net`) };
      }

      const [clientes, total] = await Promise.all([
        BotCliente.find(base).sort({ updatedAt: -1 }).skip(skip).limit(limit).select('-historial').lean(),
        BotCliente.countDocuments(base),
      ]);
      res.json({ clientes: clientes.map((c) => ({ ...c, bloqueado: ignorados.has(extraerNum(c.jid)) })), total });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/clientes/:jid', async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const num = extraerNum(jid);
      const { silenciado, bloqueado } = req.body;
      const dbUpdate = {};
      if (silenciado !== undefined) dbUpdate.silenciado = !!silenciado;

      const cliente = await BotCliente.findOneAndUpdate({ userId: req.user._id, jid }, dbUpdate, { new: true, select: '-historial' });
      if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
      if (silenciado !== undefined) botService.silenciarCliente(jid, !!silenciado);

      if (bloqueado !== undefined) {
        const upd = bloqueado ? { $addToSet: { chatsIgnorados: num } } : { $pull: { chatsIgnorados: num } };
        await Config.findOneAndUpdate({ userId: req.user._id }, upd, { upsert: true });
        botService.recargarConfig(0);
      }
      const cfgFinal = await Config.findOne({ userId: req.user._id }, 'chatsIgnorados').lean();
      res.json({ ok: true, cliente: { ...cliente.toObject(), bloqueado: new Set(cfgFinal?.chatsIgnorados || []).has(num) } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/clientes/:jid/notas', async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const { notas, etiquetas, intervaloRecordatorioDias, ultimoServicio } = req.body;
      const upd = {};
      if (notas !== undefined) upd.notas = String(notas).slice(0, 1000);
      if (Array.isArray(etiquetas)) upd.etiquetas = etiquetas.map((t) => String(t).trim().slice(0, 32)).filter(Boolean).slice(0, 12);
      if (intervaloRecordatorioDias !== undefined) { const n = parseInt(intervaloRecordatorioDias); upd.intervaloRecordatorioDias = (isNaN(n) || n <= 0) ? null : n; }
      if (ultimoServicio !== undefined) upd.ultimoServicio = String(ultimoServicio).slice(0, 80);
      const cliente = await BotCliente.findOneAndUpdate({ userId: req.user._id, jid }, { $set: upd }, { new: true, select: '-historial' });
      if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
      res.json({ ok: true, cliente });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/clientes/:jid/detalle', async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const cliente = await BotCliente.findOne({ userId: req.user._id, jid }).lean();
      if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

      const tel = (cliente.numeroReal || cliente.telefono || extraerNum(jid)).replace(/\D/g, '');
      const turnos = await Turno.find({
        userId: req.user._id,
        $or: [{ clienteTelefono: tel }, { clienteTelefono: { $regex: tel.slice(-8), $options: 'i' } }],
      }).sort({ fechaInicio: -1 }).limit(50).lean();

      const totalGastado = turnos.filter((t) => t.estado === 'confirmado').reduce((s, t) => s + (t.pago?.monto || 0), 0);
      const ultimoTurno = turnos.find((t) => t.estado === 'confirmado');
      res.json({
        cliente: { ...cliente, historial: undefined },
        turnos,
        stats: {
          totalTurnos: turnos.filter((t) => t.estado === 'confirmado').length,
          totalCancelados: turnos.filter((t) => t.estado === 'cancelado').length,
          totalGastado,
          ultimoTurno: ultimoTurno?.fechaInicio || null,
          diasDesdeUltimoTurno: ultimoTurno ? Math.floor((Date.now() - new Date(ultimoTurno.fechaInicio).getTime()) / 86400000) : null,
        },
        ultimosMensajes: (cliente.historial || []).slice(-20).map((m) => ({ role: m.role, content: (m.content || '').slice(0, 500) })),
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Bandeja de documentos (PDF/imágenes que mandan los clientes) ──
  const docDelUsuario = (req) => Documento.findOne({ _id: req.params.id, userId: String(req.user._id) });
  // Solo se sirven/borran archivos que estén dentro de la carpeta de datos de la app.
  const rutaSegura = (ruta) => { const r = path.resolve(String(ruta || '')); return r.startsWith(path.resolve(userDataDir) + path.sep) ? r : null; };

  router.get('/documentos', async (req, res) => {
    try {
      const filtro = { userId: String(req.user._id) };
      if (req.query.estado === 'nuevo') filtro.estado = 'nuevo';
      const documentos = await Documento.find(filtro).sort({ createdAt: -1 }).limit(300).lean();
      const nuevos = await Documento.countDocuments({ userId: String(req.user._id), estado: 'nuevo' });
      res.json({ documentos: documentos.map(({ ruta, ...d }) => d), nuevos });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/documentos/:id/archivo', async (req, res) => {
    try {
      const doc = await docDelUsuario(req);
      const ruta = doc && rutaSegura(doc.ruta);
      if (!ruta || !fs.existsSync(ruta)) return res.status(404).json({ error: 'Archivo no encontrado' });
      res.set('Content-Type', doc.mimetype || 'application/octet-stream');
      res.set('Content-Disposition', `inline; filename="${encodeURIComponent(doc.nombreOriginal || 'archivo')}"`);
      res.set('X-Content-Type-Options', 'nosniff');
      fs.createReadStream(ruta).pipe(res);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/documentos/:id', async (req, res) => {
    try {
      const doc = await docDelUsuario(req);
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
      const { tipo, estado, notas, monto } = req.body || {};
      if (monto === null || monto === '') doc.montoManual = null;
      else if (monto !== undefined && Number.isFinite(Number(monto)) && Number(monto) >= 0) doc.montoManual = Math.round(Number(monto) * 100) / 100;
      if (['comprobante', 'factura', 'otro', 'sin_clasificar'].includes(tipo)) doc.tipo = tipo;
      if (['nuevo', 'revisado'].includes(estado)) doc.estado = estado;
      if (typeof notas === 'string') doc.notas = notas.slice(0, 500);
      await doc.save();
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // El dueño revisó el comprobante y confirma el turno asociado (transferencia).
  router.post('/documentos/:id/confirmar-turno', async (req, res) => {
    try {
      const doc = await docDelUsuario(req);
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
      if (!doc.turnoId) return res.status(400).json({ error: 'Este documento no tiene un turno pendiente asociado' });
      const turno = await Turno.findOneAndUpdate(
        { _id: doc.turnoId, userId: req.user._id, estado: 'pendiente' },
        { estado: 'confirmado', 'pago.metodo': 'transferencia', 'pago.comprobante': String(doc._id) },
        { new: true },
      );
      if (!turno) return res.status(409).json({ error: 'El turno ya no está pendiente (se confirmó, venció o se canceló)' });
      doc.tipo = 'comprobante'; doc.estado = 'revisado';
      await doc.save();
      const cuando = new Date(turno.fechaInicio).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      const avisado = botService.enviarTexto(botService.slotsActivos()[0] ?? 0, doc.jid, `✅ ¡Listo${doc.clienteNombre ? ', ' + doc.clienteNombre : ''}! Recibimos tu comprobante y tu turno del *${cuando}* quedó confirmado.`);
      res.json({ ok: true, avisado });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/documentos/:id', async (req, res) => {
    try {
      const doc = await docDelUsuario(req);
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
      const ruta = rutaSegura(doc.ruta);
      if (ruta) { try { fs.unlinkSync(ruta); } catch { /* ya no estaba */ } }
      await Documento.deleteOne({ _id: doc._id });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/waitlist', async (req, res) => {
    try {
      const entries = await WaitlistEntry.find({ userId: req.user._id, estado: { $in: ['esperando', 'contactado'] } }).sort({ fecha: 1, createdAt: 1 }).lean();
      res.json({ entries });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/waitlist/:id', async (req, res) => {
    try {
      const r = await WaitlistEntry.deleteOne({ _id: req.params.id, userId: req.user._id });
      if (r.deletedCount === 0) return res.status(404).json({ error: 'Entrada no encontrada' });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/clientes/:jid', async (req, res) => {
    try {
      const r = await BotCliente.deleteOne({ userId: req.user._id, jid: decodeURIComponent(req.params.jid) });
      if (r.deletedCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
