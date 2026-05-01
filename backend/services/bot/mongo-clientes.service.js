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
  // También elimina entradas ERROR_CALENDAR que corrompían conversaciones futuras.
  function normalizarHistorial(historial = []) {
    const h = (historial || []).slice(-20);

    // 1. Identificar tool_call_ids de resultados ERROR_CALENDAR
    const errorCallIds = new Set();
    for (const m of h) {
      if (m.role === 'tool' && typeof m.content === 'string' && m.content.startsWith('ERROR_CALENDAR')) {
        errorCallIds.add(m.tool_call_id);
      }
    }

    // 2. Filtrar tanto el resultado de error como el assistant que lo llamó
    const filtrado = errorCallIds.size === 0 ? h : h.filter(m => {
      if (m.role === 'tool' && errorCallIds.has(m.tool_call_id)) return false;
      if (m.role === 'assistant' && m.tool_calls?.some(tc => errorCallIds.has(tc.id))) return false;
      return true;
    });

    return filtrado.map(m => {
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
  // Retry automático: si MongoDB no responde al arrancar (Atlas cold start + latencia
  // argentina puede demorar 5-10s), reintentamos hasta 5 veces con backoff.
  async function inicializar(maxRetries = 5) {
    for (let intento = 1; intento <= maxRetries; intento++) {
    try {
      // maxTimeMS(12s): Atlas free tier + latencia Argentina puede tardar varios segundos
      const clientes = await BotCliente.find({ userId }).maxTimeMS(12000).lean();
      const silenciadosALimpiar = [];

      for (const c of clientes) {
        // IMPORTANTE: silenciado se resetea siempre al arrancar el bot.
        // Los silencios son temporales (30 min máx) y se manejan en RAM.
        // Si el servidor se reinició, los timers de auto-reactivación se perdieron
        // y los clientes quedarían bloqueados para siempre sin este reset.
        const silenciado = false;
        if (c.silenciado) silenciadosALimpiar.push(c.jid);

        const datos = {
          jid:              c.jid,
          nombre:           c.nombre       || '',
          telefono:         c.telefono     || '',
          numeroReal:       c.numeroReal   || '',
          email:            c.email        || null,
          silenciado,
          historial:        normalizarHistorial(c.historial || []),
          turnosConfirmados:c.turnosConfirmados || [],
        };
        cache.set(c.jid, datos);
      }

      // Limpiar silenciados en DB en background (no bloquear el arranque)
      if (silenciadosALimpiar.length > 0) {
        BotCliente.updateMany(
          { userId, jid: { $in: silenciadosALimpiar } },
          { $set: { silenciado: false } }
        ).catch(e => log(`[DB] ⚠️ Error limpiando silenciados: ${e.message}`));
        log(`[DB] 🔓 ${silenciadosALimpiar.length} cliente(s) des-silenciado(s) al arrancar`);
      }

      log(`[DB] ✅ ${cache.size} clientes cargados desde MongoDB`);
      return; // éxito — salir del loop
    } catch (e) {
      log(`[DB] ⚠️ Error cargando clientes (intento ${intento}/${maxRetries}): ${e.message}`);
      if (intento < maxRetries) {
        const waitMs = 4000 * intento; // 4s, 8s, 12s, 16s
        log(`[DB] 🔄 Reintentando en ${waitMs / 1000}s...`);
        await new Promise(r => setTimeout(r, waitMs));
      } else {
        log(`[DB] ❌ No se pudieron cargar clientes después de ${maxRetries} intentos. Los clientes existentes van a parecer nuevos hasta que MongoDB responda — cargarMemoriaAsync recupera usuarios individualmente.`);
      }
    }
    } // fin for
  }

  // ── Leer desde caché (SYNC) ─────────────────────────────────
  function cargarMemoria(jid) {
    return cache.get(jid) || null;
  }

  // ── Fallback async: busca en MongoDB si no está en cache ─────
  // Usado cuando inicializar() falló (MongoDB tardó) y llegó un mensaje
  // de un usuario que ya tiene historial pero la cache RAM está vacía.
  async function cargarMemoriaAsync(jid) {
    if (cache.has(jid)) return cache.get(jid);

    const mongoose = require('mongoose');
    const state = mongoose.connection.readyState;
    // readyState: 0=disconnected 1=connected 2=connecting 3=disconnecting
    log(`[DB] cargarMemoriaAsync jid=${jid} readyState=${state} cacheSize=${cache.size}`);

    if (state !== 1) {
      log(`[DB] ⚠️ cargarMemoriaAsync → skip (readyState=${state} — no conectado, retorno inmediato)`);
      return null;
    }

    // readyState===1 pero Atlas puede tener conexión TCP zombie (no responde queries).
    // Promise.race garantiza que nunca bloqueamos más de 3.5s independientemente de Mongoose.
    const TIMEOUT_MS = 3500;
    const tsInicio = Date.now();
    try {
      log(`[DB] cargarMemoriaAsync → lanzando query con timeout ${TIMEOUT_MS}ms...`);
      const doc = await Promise.race([
        BotCliente.findOne({ userId, jid }).maxTimeMS(3000).lean(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`local-timeout-${TIMEOUT_MS}ms`)), TIMEOUT_MS)
        ),
      ]);
      const elapsed = Date.now() - tsInicio;
      if (doc) {
        const datos = {
          jid:              doc.jid,
          nombre:           doc.nombre       || '',
          telefono:         doc.telefono     || '',
          numeroReal:       doc.numeroReal   || '',
          email:            doc.email        || null,
          silenciado:       false,
          historial:        normalizarHistorial(doc.historial || []),
          turnosConfirmados:doc.turnosConfirmados || [],
        };
        cache.set(jid, datos);
        log(`[DB] ✅ cargarMemoriaAsync → usuario ${doc.nombre||jid} recuperado en ${elapsed}ms`);
        return datos;
      }
      log(`[DB] cargarMemoriaAsync → usuario no encontrado en DB (${elapsed}ms)`);
    } catch (e) {
      const elapsed = Date.now() - tsInicio;
      log(`[DB] ⚠️ cargarMemoriaAsync ${jid} (${elapsed}ms): ${e.message}`);
    }
    return null;
  }

  // ── Escribir en caché + persistir en MongoDB (SYNC para el bot) ──
  function guardarMemoria(jid, datos) {
    // Calcular historialReducido primero — sin entradas ERROR_CALENDAR
    const errorIds = new Set(
      (datos.historial || [])
        .filter(m => m.role === 'tool' && typeof m.content === 'string' && m.content.startsWith('ERROR_CALENDAR'))
        .map(m => m.tool_call_id)
    );
    const historialReducido = (datos.historial || [])
      .filter(m => {
        if (m.role === 'tool' && errorIds.has(m.tool_call_id)) return false;
        if (m.role === 'assistant' && m.tool_calls?.some(tc => errorIds.has(tc.id))) return false;
        return true;
      })
      .slice(-20);

    // 1. Actualizar caché inmediatamente (sync) — ya sin ERROR_CALENDAR
    cache.set(jid, { ...datos, jid, historial: historialReducido });

    // 2. Persistir en MongoDB en background (async, sin bloquear)
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

    // Solo intentar persistir si MongoDB está realmente conectado.
    // Si readyState !== 1 (zombie TCP, Atlas frío, etc.) la operación
    // bufferiza 10s antes de fallar — innecesario porque la cache RAM ya tiene los datos.
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      Promise.race([
        BotCliente.findOneAndUpdate(
          { userId, jid },
          payload,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('guardar-timeout-4s')), 4000)),
      ]).catch(e => log(`[DB] ⚠️ guardarMemoria ${jid}: ${e.message}`));
    } else {
      log(`[DB] ⏭️ guardarMemoria ${jid} → skip (mongoState=${mongoose.connection.readyState})`);
    }
  }

  // ── Listar todos los clientes del negocio ───────────────────
  function listarClientes() {
    return Array.from(cache.values());
  }

  // ── Registrar chat si no existe (desde chats.set / contacts.upsert) ────
  // Usa $setOnInsert: nunca pisa historial ni datos de clientes existentes.
  async function registrarNuevo(jid, datos) {
    if (cache.has(jid)) return; // ya en cache — nada que hacer
    const entry = {
      userId,
      jid,
      nombre:            datos.nombre    || '',
      telefono:          datos.telefono  || '',
      numeroReal:        datos.numeroReal || '',
      email:             null,
      silenciado:        false,
      historial:         [],
      turnosConfirmados: [],
    };
    try {
      await BotCliente.findOneAndUpdate(
        { userId, jid },
        { $setOnInsert: entry },
        { upsert: true, new: false, setDefaultsOnInsert: true }
      );
      // Añadir al cache solo si realmente no estaba
      if (!cache.has(jid)) cache.set(jid, { ...entry });
    } catch (e) {
      // DuplicateKey = ya existe → cargar al cache
      if (e.code === 11000) {
        try {
          const doc = await BotCliente.findOne({ userId, jid }, '-historial').lean();
          if (doc) cache.set(jid, { ...doc });
        } catch {}
      } else {
        log(`[DB] ⚠️ registrarNuevo ${jid}: ${e.message}`);
      }
    }
  }

  return { inicializar, cargarMemoria, cargarMemoriaAsync, guardarMemoria, listarClientes, registrarNuevo };
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
