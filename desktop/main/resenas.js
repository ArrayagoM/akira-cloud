// main/resenas.js
// Servicio de "reseñas después del servicio" (OPCIONAL, apagado por defecto): cada 15 min mira qué turnos terminaron
// hace ~un día y le pregunta al cliente cómo le fue. La respuesta la procesa el bot (ver bot/resenas.service.js).
// Reglas: solo de 9 a 21 h, solo a quien vino, a quien no pidió la baja, y como mucho unos pocos por tanda.
'use strict';

const resenasLib = require('./bot-engine/services/bot/resenas.service');
const difusion = require('./difusion');
const programas = require('./programas');

const MAX_POR_TANDA = 5;

function crearServicio({ userDataDir, obtenerUserId, modelos, enviar, marcarPendiente, obtenerNegocio = async () => '', ahora = () => new Date(), setI = setInterval, esperar = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  let timer = null; let enCurso = false;

  async function revisar() {
    if (enCurso) return { enviados: 0, motivo: 'en-curso' };
    const cfg = programas.leer(userDataDir).resenas;
    if (!cfg.activa) return { enviados: 0, motivo: 'apagado' };
    const ya = ahora();
    if (!resenasLib.horaAdecuada(ya)) return { enviados: 0, motivo: 'fuera-de-hora' };
    const uid = obtenerUserId(); if (!uid) return { enviados: 0, motivo: 'sin-sesion' };
    enCurso = true;
    try {
      const { Turno, BotCliente, Config } = modelos;
      const pendientes = resenasLib.turnosParaPedir(await Turno.find({ userId: uid }).lean(), ya, cfg.horasDespues).slice(0, MAX_POR_TANDA);
      if (!pendientes.length) return { enviados: 0, motivo: 'nada-para-pedir' };
      const [clientes, conf] = await Promise.all([BotCliente.find({ userId: uid }).lean(), Config.findOne({ userId: uid }).lean()]);
      const negocio = (await obtenerNegocio(uid)) || conf?.negocio || '';
      const ctx = { ahora: ya, ignorados: new Set(conf?.chatsIgnorados || []), ultimaDifusion: {}, minDiasEntreDifusiones: 0, incluirImportados: true, turnosPorTel: new Set() };
      let enviados = 0;
      for (const t of pendientes) {
        const tel10 = String(t.clienteTelefono || '').replace(/\D/g, '').slice(-10);
        const cliente = tel10.length === 10 ? clientes.find((c) => String(c.numeroReal || c.telefono || difusion.numeroDe(c.jid)).replace(/\D/g, '').slice(-10) === tel10) : null;
        if (!cliente) { await Turno.findOneAndUpdate({ _id: t._id, userId: uid }, { $set: { resenaEnviada: 'sin-cliente' } }); continue; }
        const el = difusion.esElegible(cliente, ctx);
        if (!el.ok) { await Turno.findOneAndUpdate({ _id: t._id, userId: uid }, { $set: { resenaEnviada: `omitida-${el.motivo}` } }); continue; }
        const ok = await enviar(cliente.jid, resenasLib.mensajePedido({ nombre: cliente.nombre, negocio }));
        if (!ok) return { enviados, motivo: 'sin-conexion' }; // el bot no está conectado: se reintenta en la próxima tanda
        await Turno.findOneAndUpdate({ _id: t._id, userId: uid }, { $set: { resenaEnviada: ya.toISOString() } });
        marcarPendiente(cliente.jid, String(t._id), cfg.link);
        enviados++;
        log('[resenas] pedido enviado', cliente.jid);
        await esperar(20000 + Math.floor(Math.random() * 20000)); // pausa entre mensajes
      }
      return { enviados, motivo: 'ok' };
    } catch (e) { log('[resenas] FALLÓ', e.message); return { enviados: 0, motivo: 'error', error: e.message }; } finally { enCurso = false; }
  }

  const programar = () => { timer = setI(() => { revisar().catch(() => {}); }, 15 * 60 * 1000); };
  const detener = () => { if (timer) clearInterval(timer); };
  return { revisar, programar, detener };
}

module.exports = { crearServicio, MAX_POR_TANDA };
