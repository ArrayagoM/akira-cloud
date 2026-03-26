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

// ── useMongoClientesState: API async pura usando ClienteMemoria ──────────
// Alternativa sin caché RAM; adecuada cuando se prefiere persistencia
// directa a MongoDB sin estado en memoria.
const ClienteMemoria = require('../../models/ClienteMemoria');

/**
 * useMongoClientesState(userId)
 * Devuelve { cargarMemoria, guardarMemoria, listarClientes } — funciones async.
 */
function useMongoClientesState(userId) {
  const uid = String(userId);

  async function cargarMemoria(telefono) {
    try {
      const doc = await ClienteMemoria.findById(`${uid}:${telefono}`).lean();
      return doc ? {
        nombre:            doc.nombre,
        telefono:          doc.telefono,
        numeroReal:        doc.numeroReal,
        email:             doc.email,
        silenciado:        doc.silenciado,
        historial:         doc.historial || [],
        turnosConfirmados: doc.turnosConfirmados || [],
      } : null;
    } catch (e) {
      console.error('[MongoClientes] cargarMemoria error:', e.message);
      return null;
    }
  }

  async function guardarMemoria(telefono, data) {
    try {
      await ClienteMemoria.findByIdAndUpdate(
        `${uid}:${telefono}`,
        {
          $set: {
            userId:            uid,
            telefono,
            numeroReal:        data.numeroReal        || '',
            nombre:            data.nombre            || '',
            email:             data.email             || '',
            silenciado:        data.silenciado        || false,
            historial:         data.historial         || [],
            turnosConfirmados: data.turnosConfirmados || [],
          },
        },
        { upsert: true, new: true }
      );
    } catch (e) {
      console.error('[MongoClientes] guardarMemoria error:', e.message);
    }
  }

  async function listarClientes() {
    try {
      return await ClienteMemoria.find({ userId: uid }).lean();
    } catch (e) {
      console.error('[MongoClientes] listarClientes error:', e.message);
      return [];
    }
  }

  return { cargarMemoria, guardarMemoria, listarClientes };
}

module.exports = crearMongoClientesService;
module.exports.useMongoClientesState = useMongoClientesState;
