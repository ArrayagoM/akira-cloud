// main/resumen-diario.js
// "Resumen del día": a la hora elegida el bot le escribe al DUEÑO (a su celular de notificaciones) cómo
// fue el día: mensajes, turnos, lo que entró y salió, quién le debe y qué documentos faltan revisar.
// Es OPCIONAL (apagado por defecto). Los datos se calculan acá, en la PC, y van directo a tu WhatsApp:
// no pasan por ningún servidor.
'use strict';

const fs = require('fs');
const path = require('path');
const caja = require('./gestion/caja');
const ctacte = require('./gestion/ctacte');

const archivo = (dir) => path.join(dir, 'avisos.json');
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function leerConfig(userDataDir) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(archivo(userDataDir), 'utf8')); } catch { /* sin configurar */ }
  const r = j.resumenDiario || {};
  return { resumenDiario: { activo: r.activo === true, hora: HORA_RE.test(r.hora) ? r.hora : '21:00' }, ultimoResumen: j.ultimoResumen || null };
}
function guardarConfig(userDataDir, { activo, hora }) {
  const actual = leerConfig(userDataDir);
  if (hora !== undefined && !HORA_RE.test(String(hora))) throw new Error('La hora no es válida (usá el formato 21:00)');
  const nuevo = { ...actual, resumenDiario: { activo: activo === undefined ? actual.resumenDiario.activo : activo === true, hora: hora !== undefined ? String(hora) : actual.resumenDiario.hora } };
  fs.writeFileSync(archivo(userDataDir), JSON.stringify(nuevo));
  return nuevo;
}
function marcarEnviado(userDataDir, fecha) {
  const actual = leerConfig(userDataDir);
  fs.writeFileSync(archivo(userDataDir), JSON.stringify({ ...actual, ultimoResumen: fecha }));
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// Se envía una vez por día, pasada la hora elegida (si la PC o el bot estaban apagados, sale en cuanto vuelven, el mismo día).
function debeEnviar(cfg, ahora = new Date()) {
  const r = cfg.resumenDiario;
  return r.activo && hhmm(ahora) >= r.hora && cfg.ultimoResumen !== caja.fechaLocal(ahora);
}

async function calcularDia(userId, { mensajesHoy = 0, ahora = new Date(), cadaFidelidad = 0 } = {}) {
  const Turno = require('./bot-engine/models/Turno');
  const Movimiento = require('./bot-engine/models/Movimiento');
  const CtaCte = require('./bot-engine/models/CtaCte');
  const Documento = require('./bot-engine/models/Documento');
  const BotCliente = require('./bot-engine/models/BotCliente');
  const uid = String(userId);
  const hoy = caja.fechaLocal(ahora);
  const manana = caja.fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1));
  const mes = hoy.slice(0, 7);

  const turnos = await Turno.find({ userId: uid }).lean();
  const vigentes = turnos.filter((t) => t.estado !== 'cancelado');
  const delDia = (f) => vigentes.filter((t) => caja.fechaLocal(t.fechaInicio) === f).length;
  const movs = [...(await Movimiento.find({ userId: uid }).lean()), ...caja.ingresosDeTurnos(turnos, mes)].filter((m) => m.fecha === hoy);
  const r = caja.resumen(movs);

  const cc = (await CtaCte.find({ userId: uid }).lean()).filter((m) => m.tipo === 'cargo' || m.tipo === 'pago');
  const clave = (m) => (m.entidad === 'proveedor' ? `prov:${m.proveedorId}` : m.entidadClave);
  const conClave = (ent) => cc.filter((m) => m.entidad === ent).map((m) => ({ ...m, entidadClave: clave(m) }));
  const deudores = ctacte.saldos(conClave('cliente'), ahora).filter((s) => s.saldo > 0.005).sort((a, b) => b.saldo - a.saldo);
  const nombreDe = (c) => (cc.find((m) => m.entidad === 'cliente' && clave(m) === c) || {}).nombre || 'Cliente';

  return {
    fecha: hoy, mensajesHoy,
    turnosHoy: delDia(hoy), turnosManiana: delDia(manana),
    ingresosHoy: r.ingresos, gastosHoy: r.gastos,
    teDeben: ctacte.totalSaldo(ctacte.saldos(conClave('cliente'), ahora)), cantidadDeudores: deudores.length,
    topDeudores: deudores.slice(0, 3).map((d) => ({ nombre: nombreDe(d.clave), saldo: d.saldo, dias: d.antiguedadDias })),
    debes: ctacte.totalSaldo(ctacte.saldos(conClave('proveedor'), ahora)),
    documentosPendientes: (await Documento.find({ userId: uid, estado: 'nuevo' }).lean()).length,
    premiosFidelidad: cadaFidelidad ? require('./programas').clientesConPremio(await BotCliente.find({ userId: uid }).lean(), turnos, cadaFidelidad, ahora).map((p) => p.nombre || 'Un cliente').slice(0, 5) : [],
    cumpleanios: (await BotCliente.find({ userId: uid }).lean()).filter((c) => c.cumple === `${hoy.slice(5, 7)}-${hoy.slice(8, 10)}`).map((c) => String(c.nombre || '').trim() || 'Un cliente').slice(0, 5),
  };
}

const pesos = (n) => '$' + Math.round(n).toLocaleString('es-AR');

function redactar(d, { negocio = '', ahora = new Date() } = {}) {
  const dia = ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const L = [`📊 *Resumen del día${negocio ? ' — ' + negocio : ''}*`, `_${dia}_`, ''];
  L.push(`💬 Mensajes atendidos: *${d.mensajesHoy}*`);
  L.push(`📅 Turnos de hoy: *${d.turnosHoy}*${d.turnosManiana ? ` · mañana: *${d.turnosManiana}*` : ''}`);
  L.push(`💰 Ingresos de hoy: *${pesos(d.ingresosHoy)}*`);
  if (d.gastosHoy > 0) L.push(`🧾 Gastos de hoy: *${pesos(d.gastosHoy)}*`);
  if (d.teDeben > 0) {
    L.push(`📌 Te deben: *${pesos(d.teDeben)}* (${d.cantidadDeudores} ${d.cantidadDeudores === 1 ? 'cliente' : 'clientes'})`);
    for (const t of d.topDeudores) L.push(`   • ${t.nombre} — ${pesos(t.saldo)}${t.dias > 0 ? ` (${t.dias} ${t.dias === 1 ? 'día' : 'días'})` : ''}`);
  }
  if (d.debes > 0) L.push(`🚚 Debés a proveedores: *${pesos(d.debes)}*`);
  if (d.documentosPendientes > 0) L.push(`📄 Documentos sin revisar: *${d.documentosPendientes}*`);
  if (d.premiosFidelidad?.length) L.push(`🎁 Con premio de fidelidad para entregar: *${d.premiosFidelidad.join(', ')}*`);
  if (d.cumpleanios?.length) L.push(`🎂 Hoy cumple${d.cumpleanios.length > 1 ? 'n' : ''} años: *${d.cumpleanios.join(', ')}* (podés saludar desde Clientes → Escribir a un grupo)`);
  if (!d.mensajesHoy && !d.turnosHoy && !d.ingresosHoy && !d.gastosHoy) L.push('', 'Hoy fue un día tranquilo. 🌙');
  L.push('', '_Akira — podés apagar este aviso desde el Inicio de la app._');
  return L.join('\n');
}

// enviar(texto) → Promise<{ ok, motivo? }>   (motivo: 'sin-celular' | 'bot-desconectado')
function crearServicio({ userDataDir, obtenerUserId, mensajesHoy = () => 0, obtenerNegocio = async () => '', enviar, log = () => {}, ahora = () => new Date(), setI = setInterval }) {
  let enCurso = false; let timer = null; let proximoIntento = 0;

  async function enviarAhora({ prueba = false } = {}) {
    if (enCurso) return { ok: false, motivo: 'en-curso' };
    const uid = obtenerUserId(); if (!uid) return { ok: false, motivo: 'sin-sesion' };
    enCurso = true;
    try {
      const ya = ahora();
      const fid = require('./programas').leer(userDataDir).fidelidad;
      const d = await calcularDia(uid, { mensajesHoy: mensajesHoy(), ahora: ya, cadaFidelidad: fid.activa ? fid.cada : 0 });
      const texto = redactar(d, { negocio: await obtenerNegocio(uid), ahora: ya });
      const r = await enviar(prueba ? `${texto}\n\n_(mensaje de prueba)_` : texto);
      if (r.ok && !prueba) marcarEnviado(userDataDir, caja.fechaLocal(ya));
      return r;
    } catch (e) { log('[resumen-diario] FALLÓ', e.message); return { ok: false, motivo: 'error', error: e.message }; } finally { enCurso = false; }
  }

  async function revisar() {
    if (!debeEnviar(leerConfig(userDataDir), ahora()) || ahora().getTime() < proximoIntento) return null;
    const r = await enviarAhora();
    if (!r.ok) proximoIntento = ahora().getTime() + 10 * 60 * 1000; // si no se pudo (bot caído, sin celular…), reintenta cada 10 min
    return r;
  }
  const programar = () => { timer = setI(() => { revisar().catch(() => {}); }, 60 * 1000); };
  const detener = () => { if (timer) clearInterval(timer); };

  return { enviarAhora, revisar, programar, detener, estado: () => leerConfig(userDataDir), configurar: (c) => guardarConfig(userDataDir, c) };
}

module.exports = { leerConfig, guardarConfig, debeEnviar, calcularDia, redactar, crearServicio, HORA_RE };
