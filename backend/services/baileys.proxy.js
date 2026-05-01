// services/baileys.proxy.js
// "Socket Baileys" virtual que vive en el backend y delega TODA la operación
// real al worker en la PC del usuario via Socket.io.
//
// akira.bot.js puede recibir esto como su `sock` y operar normalmente:
//   - sock.sendMessage(jid, content)        → emite worker:exec-send-text
//   - sock.sendPresenceUpdate(estado, jid)  → emite worker:exec-presence
//   - sock.getCatalog(opts)                 → emite worker:exec-get-catalog
//   - sock.ev.on('messages.upsert', cb)     → registra callback que se
//                                             dispara cuando el worker emite
//                                             worker:msg-incoming
//   - sock.end(reason)                      → emite worker:stop-bot
//
// Es la "abstracción Baileys" que estaba mezclada en akira.bot.js, ahora
// reemplazada por un proxy que respeta la separación worker/backend.
'use strict';

const { EventEmitter } = require('events');

/**
 * Crea un proxy Baileys para un bot dado.
 * @param {object} opts
 * @param {string} opts.userId - ID del usuario
 * @param {object} opts.workerSocket - Socket.io del worker (el que está conectado)
 * @param {function} opts.log - función de log del bot
 */
function crearBaileysProxy({ userId, workerSocket, log }) {
  const ev = new EventEmitter();
  ev.setMaxListeners(50);

  let cerrado = false;

  function emitirAlWorker(evento, payload) {
    return new Promise((resolve) => {
      try {
        if (!workerSocket || !workerSocket.connected) {
          return resolve({ ok: false, error: 'worker_disconnected' });
        }
        // Usamos ack de socket.io con timeout
        const t = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 30000);
        workerSocket.emit(evento, payload, (ack) => {
          clearTimeout(t);
          resolve(ack || { ok: false, error: 'no_ack' });
        });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  }

  // ── API pública (mimica un sock de Baileys) ─────────────────
  const sock = {
    // Envío de mensaje
    sendMessage: async (jid, content) => {
      if (cerrado) return { key: { id: null } };

      if (content?.text !== undefined) {
        const r = await emitirAlWorker('worker:exec-send-text', {
          userId, jid, texto: content.text,
        });
        if (!r.ok) {
          log?.(`⚠️ [Proxy] sendMessage(text) falló: ${r.error}`);
          throw new Error(r.error || 'send_failed');
        }
        return { key: { id: r.id, remoteJid: jid, fromMe: true }, message: { conversation: content.text } };
      }

      if (content?.audio) {
        const buf = Buffer.isBuffer(content.audio) ? content.audio : Buffer.from(content.audio);
        const r = await emitirAlWorker('worker:exec-send-audio', {
          userId, jid, bufferBase64: buf.toString('base64'),
        });
        if (!r.ok) {
          log?.(`⚠️ [Proxy] sendMessage(audio) falló: ${r.error}`);
          throw new Error(r.error || 'send_failed');
        }
        return { key: { id: r.id, remoteJid: jid, fromMe: true } };
      }

      log?.(`⚠️ [Proxy] sendMessage con tipo no soportado: ${Object.keys(content || {}).join(',')}`);
      throw new Error('content_type_no_soportado');
    },

    sendPresenceUpdate: async (estado, jid) => {
      if (cerrado) return;
      await emitirAlWorker('worker:exec-presence', { userId, estado, jid });
    },

    getCatalog: async (opts) => {
      if (cerrado) return { products: [] };
      const r = await emitirAlWorker('worker:exec-get-catalog', { userId, opts: opts || {} });
      if (!r.ok) throw new Error(r.error || 'get_catalog_failed');
      return r;
    },

    end: (reason) => {
      cerrado = true;
      ev.removeAllListeners();
      try {
        if (workerSocket?.connected) {
          workerSocket.emit('worker:stop-bot', { userId });
        }
      } catch {}
    },

    // ws.ping — el worker maneja su propio watchdog Baileys, este es solo un stub
    // para compatibilidad. Devuelve true porque si el worker está conectado al
    // backend via socket.io, asumimos que el WhatsApp del worker también lo está
    // (el watchdog del worker se encarga del lado WhatsApp).
    ws: {
      ping: () => {
        if (!workerSocket || !workerSocket.connected) {
          throw new Error('worker_disconnected');
        }
        // ok
      },
    },

    ev,
  };

  // ── Recibir eventos del worker y forward al `sock.ev` ──────
  // Los handlers se registran en `worker.handler.js` y delegan acá llamando
  // a las funciones de inyección de eventos.
  function inyectarEvento(nombre, payload) {
    if (cerrado) return;
    ev.emit(nombre, payload);
  }

  return { sock, inyectarEvento, cerrar: () => sock.end() };
}

module.exports = { crearBaileysProxy };
