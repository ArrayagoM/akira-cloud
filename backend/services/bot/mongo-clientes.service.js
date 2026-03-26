// services/bot/mongo-clientes.service.js
// Memoria de clientes WhatsApp persistida en MongoDB.
// API 100% sincrónica (usa caché en RAM) — MongoDB se actualiza en background.
// Reemplaza el sistema de archivos JSON (persistence.service.js cargarMemoria/guardarMemoria).
'use strict';

const BotCliente = require('../../models/BotCliente');

function crearMongoClientesService(userId, log) {
  // ── Caché en RAM: jid → datos del cliente ───────────────────
  const cache = new Map();

  // ── Normalizar historial cargado desde DB ────────────────────
  // Mongoose puede devolver tool_calls como objeto; Groq necesita
  // que tool_calls[].function.arguments sea un string JSON.
  function normalizarHistorial(historial = []) {
    return historial.map(m => {
      const item = { role: m.role };
      if (m.content !== undefined && m.content !== null) item.content = m.content;
      if (m.tool_call_id) item.tool_call_id = m.tool_call_id;
      if (m.name)         item.name         = m.name;
      if (m.tool_calls?.length) {
        item.tool_calls = m.tool_calls.map(tc => {
          const t = { ...tc };
          if (!t.type) t.type = 'function';
          if (t.function && typeof t.function.arguments === 'object') {
            t.function = { ...t.function, arguments: JSON.stringify(t.function.arguments) };
          }
          return t;
        });
      }
      return item;
    });
  }

  // ── Inicializar: cargar TODOS los clientes del negocio ───────
  async function inicializar() {
    try {
      const clientes = await BotCliente.find({ userId }).lean();
      for (const c of clientes) {
        const datos = {
          jid:              c.jid,
          nombre:           c.nombre       || '',
          telefono:         c.telefono     || '',
          numeroReal:       c.numeroReal   || '',
          email:            c.email        || null,
          silenciado:       c.silenciado   || false,
          historial:        normalizarHistorial(c.historial || []),
          turnosConfirmados:c.turnosConfirmados || [],
        };
        cache.set(c.jid, datos);
      }
      log(`[DB] ${cache.size} clientes cargados desde MongoDB`);
    } catch (e) {
      log(`[DB] ⚠️ Error cargando clientes: ${e.message}`);
    }
  }

  // ── Leer desde caché (SYNC) ─────────────────────────────────
  function cargarMemoria(jid) {
    return cache.get(jid) || null;
  }

  // ── Escribir en caché + persistir en MongoDB (SYNC para el bot) ──
  function guardarMemoria(jid, datos) {
    // 1. Actualizar caché inmediatamente (sync)
    cache.set(jid, { ...datos, jid });

    // 2. Persistir en MongoDB en background (async, sin bloquear)
    // Solo guardamos los últimos 20 mensajes del historial
    const historialReducido = (datos.historial || []).slice(-20);
    const payload = {
      userId,
      jid,
      nombre:            datos.nombre            || '',
      telefono:          datos.telefono          || '',
      numeroReal:        datos.numeroReal        || '',
      email:             datos.email             || null,
      silenciado:        datos.silenciado        || false,
      historial:         historialReducido,
      turnosConfirmados: datos.turnosConfirmados || [],
    };

    BotCliente.findOneAndUpdate(
      { userId, jid },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch(e => log(`[DB] ⚠️ guardarMemoria ${jid}: ${e.message}`));
  }

  // ── Listar todos los clientes del negocio ───────────────────
  function listarClientes() {
    return Array.from(cache.values());
  }

  return { inicializar, cargarMemoria, guardarMemoria, listarClientes };
}

module.exports = crearMongoClientesService;
