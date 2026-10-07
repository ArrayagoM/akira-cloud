// main/resumen-web.js
// "Ver tu negocio desde la web" — OPCIONAL, apagado por defecto. Si el usuario lo activa, junto con la
// señal de vida que ya manda la app cada 15 minutos se envían unos pocos NÚMEROS agregados (cuántos
// turnos, cuánto entró y salió, cuánto te deben…), para que pueda mirarlos desde el celular.
// Nunca se envían nombres, teléfonos, conversaciones ni documentos. Al desactivarlo, la app le pide
// al servidor que borre lo que tenía. El servidor vuelve a filtrar todo (backend-desktop/lib/resumen-negocio.js).
'use strict';

const fs = require('fs');
const path = require('path');
const caja = require('./gestion/caja');
const ctacte = require('./gestion/ctacte');

const archivo = (dir) => path.join(dir, 'resumen-web.json');

function activo(userDataDir) {
  try { return JSON.parse(fs.readFileSync(archivo(userDataDir), 'utf8')).activo === true; } catch { return false; }
}
function guardar(userDataDir, valor) {
  fs.writeFileSync(archivo(userDataDir), JSON.stringify({ activo: valor === true, cambiadoEn: new Date().toISOString() }));
}

async function calcular(userId, { mensajesHoy = 0, ahora = new Date() } = {}) {
  const Turno = require('./bot-engine/models/Turno');
  const Movimiento = require('./bot-engine/models/Movimiento');
  const CtaCte = require('./bot-engine/models/CtaCte');
  const BotCliente = require('./bot-engine/models/BotCliente');
  const Documento = require('./bot-engine/models/Documento');
  const uid = String(userId);
  const mes = caja.fechaLocal(ahora).slice(0, 7);
  const hoy = caja.fechaLocal(ahora);

  const turnos = await Turno.find({ userId: uid }).lean();
  const vigentes = turnos.filter((t) => t.estado !== 'cancelado');
  const manuales = (await Movimiento.find({ userId: uid }).lean()).filter((m) => String(m.fecha || '').startsWith(mes));
  const mov = [...manuales, ...caja.ingresosDeTurnos(turnos, mes)];
  const r = caja.resumen(mov, mes);

  const cc = (await CtaCte.find({ userId: uid }).lean()).filter((m) => m.tipo === 'cargo' || m.tipo === 'pago');
  const clave = (m) => (m.entidad === 'proveedor' ? `prov:${m.proveedorId}` : m.entidadClave);
  const saldo = (ent) => ctacte.totalSaldo(ctacte.saldos(cc.filter((m) => m.entidad === ent).map((m) => ({ ...m, entidadClave: clave(m) })), ahora));

  return {
    mes, mensajesHoy,
    turnosHoy: vigentes.filter((t) => caja.fechaLocal(t.fechaInicio) === hoy).length,
    turnosMes: vigentes.filter((t) => caja.fechaLocal(t.fechaInicio).startsWith(mes)).length,
    ingresosMes: r.ingresos, gastosMes: r.gastos,
    teDeben: saldo('cliente'), debes: saldo('proveedor'),
    clientes: (await BotCliente.find({ userId: uid }).lean()).length,
    documentosPendientes: (await Documento.find({ userId: uid, estado: 'nuevo' }).lean()).length,
  };
}

// Lo que se agrega a cada señal de vida: la versión instalada y, solo si está activado, el resumen.
// resumen:null le indica al servidor que borre lo que tuviera guardado.
async function datosHeartbeat({ userDataDir, userId, botService, version }) {
  const base = { version };
  if (!activo(userDataDir)) return { ...base, resumen: null };
  try { return { ...base, resumen: await calcular(userId, { mensajesHoy: botService?.mensajesHoy?.() || 0 }) }; }
  catch { return base; } // si falla el cálculo no se toca lo que ya hubiera
}

module.exports = { activo, guardar, calcular, datosHeartbeat };
