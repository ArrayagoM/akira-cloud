// local-api/routes/difusion.routes.js
// Mensajes a grupos de clientes con confirmación del dueño (ver main/difusion.js).
'use strict';

const express = require('express');
const BotCliente = require('../../bot-engine/models/BotCliente');
const Turno = require('../../bot-engine/models/Turno');
const Config = require('../../bot-engine/models/Config');
const dif = require('../../difusion');

const TIPOS = ['inactivos', 'cumple-hoy', 'cumple-mes', 'etiqueta', 'todos'];

module.exports = function crearRouter({ requerirSesion, servicioDifusion, botService }) {
  const router = express.Router();
  router.use(requerirSesion);

  // Arma el segmento a partir de lo que HOY hay en la base (los destinatarios nunca vienen de la pantalla).
  async function calcular(req) {
    const uid = String(req.user._id);
    const { tipo, dias, etiqueta, incluirImportados } = req.body || {};
    if (!TIPOS.includes(tipo)) throw Object.assign(new Error('Elegí a quién querés escribirle.'), { status: 400 });
    if (tipo === 'etiqueta' && !String(etiqueta || '').trim()) throw Object.assign(new Error('Elegí una etiqueta.'), { status: 400 });
    const [clientes, turnos, cfg] = await Promise.all([BotCliente.find({ userId: uid }).lean(), Turno.find({ userId: uid }).lean(), Config.findOne({ userId: uid }).lean()]);
    const porTel = new Map();
    for (const t of turnos) { const k = String(t.clienteTelefono || '').replace(/\D/g, '').slice(-10); if (k.length === 10) { if (!porTel.has(k)) porTel.set(k, []); porTel.get(k).push(t); } }
    const estado = servicioDifusion.leerEstado();
    const sel = dif.seleccionar(clientes, porTel, { tipo, dias, etiqueta }, {
      ahora: new Date(), ignorados: new Set(cfg?.chatsIgnorados || []), ultimaDifusion: estado.ultimaDifusion, incluirImportados: incluirImportados === true,
    });
    return { sel, negocio: cfg?.negocio || '', estado };
  }

  router.post('/vista-previa', async (req, res) => {
    try {
      const { sel, negocio, estado } = await calcular(req);
      const e = servicioDifusion.estado();
      res.json({
        total: sel.total, elegibles: sel.elegibles.slice(0, 100), truncado: sel.total > 100, excluidos: sel.excluidos,
        plantilla: dif.PLANTILLAS[req.body.tipo === 'cumple-hoy' || req.body.tipo === 'cumple-mes' ? 'cumple' : req.body.tipo === 'etiqueta' || req.body.tipo === 'todos' ? 'etiqueta' : 'inactivos'],
        negocio, enviadosHoy: estado.enviadosHoy, tope: e.tope, disponibleHoy: Math.max(0, e.tope - estado.enviadosHoy), minutosEstimados: Math.ceil((Math.min(sel.total, Math.max(0, e.tope - estado.enviadosHoy)) * 19) / 60),
        whatsappConectado: !!botService.hayConexion?.(),
      });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  router.post('/enviar', async (req, res) => {
    try {
      const { mensaje, excluir = [], confirmar } = req.body || {};
      if (confirmar !== true) return res.status(400).json({ error: 'Falta confirmar el envío.' });
      const texto = String(mensaje || '').trim();
      if (texto.length < 5) return res.status(400).json({ error: 'Escribí el mensaje.' });
      if (texto.length > 700) return res.status(400).json({ error: 'El mensaje es muy largo (máximo 700 caracteres).' });
      if (!botService.hayConexion?.()) return res.status(409).json({ error: 'El bot no está conectado a WhatsApp en este momento.', codigo: 'SIN_WHATSAPP' });
      const { sel, negocio } = await calcular(req);
      const fuera = new Set(Array.isArray(excluir) ? excluir : []);
      const destinatarios = sel.elegibles.filter((d) => !fuera.has(d.jid));
      const estado = await servicioDifusion.iniciar(destinatarios, texto, { negocio });
      res.json({ ok: true, ...estado, total: destinatarios.length });
    } catch (e) { res.status(e.codigo === 'EN_CURSO' ? 409 : e.codigo === 'TOPE' || e.codigo === 'VACIO' ? 400 : e.status || 500).json({ error: e.message, codigo: e.codigo }); }
  });

  router.get('/estado', (_req, res) => res.json(servicioDifusion.estado()));
  router.post('/cancelar', (_req, res) => { servicioDifusion.detener(); res.json({ ok: true }); });

  return router;
};
