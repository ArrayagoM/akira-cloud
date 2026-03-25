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
  // ── Helpers de lectura/escritura ─────────────────────────────
  async function read(file) {
    try {
      const doc = await WAAuth.findById(`${userId}:${file}`).lean();
      return doc?.data ? JSON.parse(doc.data, BufferJSON.reviver) : null;
    } catch {
      return null;
    }
  }

  async function write(data, file) {
    try {
      await WAAuth.updateOne(
        { _id: `${userId}:${file}` },
        { $set: { data: JSON.stringify(data, BufferJSON.replacer) } },
        { upsert: true }
      );
    } catch (e) {
      console.error(`[MongoAuth] Error escribiendo ${file}:`, e.message);
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
    saveCreds: () => write(state.creds, 'creds'),
    /** Borra toda la sesión de este usuario de MongoDB (logout). */
    clearAuth:  () => WAAuth.deleteMany({ _id: new RegExp(`^${userId}:`) }),
  };
}

module.exports = { useMongoAuthState };
