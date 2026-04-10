// services/bot/mongo-auth.service.js
// Auth state de Baileys persistido en MongoDB.
// Soluciona la pérdida de sesión al reiniciar el servidor (filesystem ephemeral en Render).
'use strict';

const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const WAAuth = require('../../models/WAAuth');

/**
 * useMongoAuthState(userId)
 * Mismo contrato que useMultiFileAuthState de Baileys, pero usa MongoDB.
 *
 * @param {string} userId  — ID del usuario propietario del bot
 * @returns {{ state, saveCreds, clearAuth }}
 */
async function useMongoAuthState(userId) {
  // ── Retry helper — reintentar operaciones de MongoDB ante errores transitorios ──
  async function withRetry(fn, label, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === maxRetries) {
          console.error(`[MongoAuth] ❌ ${label} falló después de ${maxRetries + 1} intentos: ${err.message}`);
          throw err;
        }
        // Esperar antes de reintentar (200ms, 500ms)
        await new Promise(r => setTimeout(r, (i + 1) * 200));
      }
    }
  }

  // ── Helpers de lectura/escritura ─────────────────────────────
  async function read(file) {
    try {
      const doc = await withRetry(
        () => WAAuth.findById(`${userId}:${file}`).lean(),
        `read(${file})`
      );
      return doc?.data ? JSON.parse(doc.data, BufferJSON.reviver) : null;
    } catch {
      return null;
    }
  }

  async function write(data, file) {
    try {
      await withRetry(
        () => WAAuth.updateOne(
          { _id: `${userId}:${file}` },
          { $set: { data: JSON.stringify(data, BufferJSON.replacer) } },
          { upsert: true }
        ),
        `write(${file})`
      );
    } catch (e) {
      // CRÍTICO: Si falla el write de 'creds', la sesión se perderá al reiniciar.
      // Loggeamos con más contexto para poder diagnosticar.
      console.error(`[MongoAuth] ❌ Error PERSISTENTE escribiendo ${file} para user ${userId}: ${e.message}`);
    }
  }

  async function remove(file) {
    try {
      await WAAuth.deleteOne({ _id: `${userId}:${file}` });
    } catch {}
  }

  // ── Cargar credenciales ───────────────────────────────────────
  const creds = (await read('creds')) || initAuthCreds();

  const state = {
    creds,
    keys: {
      /**
       * Obtiene una o varias keys por tipo e IDs.
       * @param {string} type
       * @param {string[]} ids
       */
      async get(type, ids) {
        const result = {};
        await Promise.all(
          ids.map(async (id) => {
            const val = await read(`${type}-${id}`);
            if (val !== null) result[id] = val;
          })
        );
        return result;
      },

      /**
       * Persiste un mapa de tipo → { id → valor }.
       * Valor null/undefined = borrar la key.
       * @param {Object} data
       */
      async set(data) {
        const tasks = [];
        for (const [type, entries] of Object.entries(data)) {
          for (const [id, val] of Object.entries(entries)) {
            tasks.push(val != null ? write(val, `${type}-${id}`) : remove(`${type}-${id}`));
          }
        }
        await Promise.all(tasks);
      },
    },
  };

  return {
    state,
    /** Persiste las credenciales actualizadas (llamar en creds.update). */
    saveCreds: async () => {
      try {
        await write(state.creds, 'creds');
      } catch (e) {
        console.error(`[MongoAuth] ❌ FALLO CRÍTICO saveCreds para user ${userId}: ${e.message}`);
        // No relanzar — Baileys no maneja errores en saveCreds y crashearía
      }
    },
    /** Borra toda la sesión de este usuario de MongoDB (logout). */
    clearAuth: () => WAAuth.deleteMany({ _id: new RegExp(`^${userId}:`) }),
  };
}

module.exports = { useMongoAuthState };
