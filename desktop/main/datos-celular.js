// main/datos-celular.js
// "Ver los datos de mi negocio en el celular" — OPCIONAL, apagado por defecto. A diferencia de "Ver tu negocio desde el celular"
// (que manda solo números), ESTA opción sube una copia de lo que el usuario elija — agenda, caja, clientes y deudores, catálogo — para
// poder verlo en el .apk y en la página del celular. Incluye nombres, teléfonos y montos de los clientes del negocio.
// El servidor la guarda cifrada y solo la lee la cuenta dueña (backend-desktop/lib/datos-negocio.js revalida todo). Al apagarla se
// pide al servidor que borre lo subido. Acá solo se arma el contenido; el envío está en datos-celular-vivo.js.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const caja = require('./gestion/caja');
const ctacte = require('./gestion/ctacte');
const TM = require('./gestion/turnos-manual');

const TIPOS = ['agenda', 'caja', 'clientes', 'catalogo'];
const ETIQUETAS = {
  agenda: 'Agenda: turnos de hoy y de los próximos días',
  caja: 'Caja: movimientos del mes, ingresos y gastos',
  clientes: 'Clientes y deudores',
  catalogo: 'Catálogo y stock',
};
const DIAS_ATRAS = 1;
const DIAS_ADELANTE = 14;

const archivo = (dir) => path.join(dir, 'datos-celular.json');
function leer(dir) { try { return JSON.parse(fs.readFileSync(archivo(dir), 'utf8')) || {}; } catch { return {}; } }

function sanearTipos(t) {
  if (!Array.isArray(t)) return null;
  const pedidos = new Set(t.filter((x) => typeof x === 'string'));
  return TIPOS.filter((x) => pedidos.has(x));
}

function activo(dir) { return leer(dir).activo === true; }
// Qué tipos están elegidos. Sin elección guardada: los cuatro (el usuario los ve tildados al activar y puede sacar los que no quiera).
function tipos(dir) { return sanearTipos(leer(dir).tipos) ?? TIPOS.slice(); }
// Se envía algo solo si está activa y hay al menos un tipo elegido.
function enviaAlgo(dir) { return activo(dir) && tipos(dir).length > 0; }

function guardar(dir, { activo: nuevoActivo, tipos: nuevosTipos } = {}) {
  const actual = leer(dir);
  const t = sanearTipos(nuevosTipos);
  const salida = {
    activo: typeof nuevoActivo === 'boolean' ? nuevoActivo : actual.activo === true,
    tipos: t ?? sanearTipos(actual.tipos) ?? TIPOS.slice(),
    cambiadoEn: new Date().toISOString(),
  };
  fs.writeFileSync(archivo(dir), JSON.stringify(salida));
  return { activo: salida.activo, tipos: salida.tipos };
}

const iso = (f) => { const t = new Date(f); return Number.isFinite(t.getTime()) ? t.toISOString() : null; };

async function calcularAgenda(userId, { ahora, general }) {
  const Turno = require('./bot-engine/models/Turno');
  const desde = new Date(ahora); desde.setHours(0, 0, 0, 0); desde.setDate(desde.getDate() - DIAS_ATRAS);
  const hasta = new Date(desde); hasta.setDate(hasta.getDate() + DIAS_ATRAS + DIAS_ADELANTE + 1);
  const todos = await Turno.find({ userId }).lean();
  const turnos = todos
    .filter((t) => t.estado !== 'cancelado' && new Date(t.fechaInicio) >= desde && new Date(t.fechaInicio) < hasta)
    .sort((a, b) => new Date(a.fechaInicio) - new Date(b.fechaInicio))
    .map((t) => {
      const manual = !String(t.descripcion || '').startsWith('WhatsApp:'); // en los turnos del bot la descripción repite teléfono y email: no se manda
      return {
        id: String(t._id), inicio: iso(t.fechaInicio), fin: iso(t.fechaFin),
        cliente: t.clienteNombre || '', telefono: t.clienteTelefono || '',
        titulo: t.resumen || '', detalle: manual ? (t.descripcion || '') : '',
        puesto: TM.nombrePuesto(t.calendarId, general), estado: t.estado,
        monto: Number(t.pago?.monto) > 0 ? Number(t.pago.monto) : Number(t.precioInformativo) > 0 ? Number(t.precioInformativo) : 0,
        cobrado: t.estado === 'confirmado' && Number(t.pago?.monto) > 0, metodo: t.pago?.metodo || '',
      };
    });
  return { desde: caja.fechaLocal(desde), hasta: caja.fechaLocal(new Date(hasta.getTime() - 1)), turnos };
}

async function calcularCaja(userId, { ahora }) {
  const Movimiento = require('./bot-engine/models/Movimiento');
  const Turno = require('./bot-engine/models/Turno');
  const mes = caja.fechaLocal(ahora).slice(0, 7);
  const manuales = (await Movimiento.find({ userId }).lean()).filter((m) => String(m.fecha || '').startsWith(mes));
  const turnos = await Turno.find({ userId }).lean();
  const movimientos = caja.ordenar([...manuales, ...caja.ingresosDeTurnos(turnos, mes)]);
  const r = caja.resumen(movimientos, mes);
  return {
    mes, resumen: { ingresos: r.ingresos, gastos: r.gastos },
    movimientos: movimientos.map((m) => ({ fecha: m.fecha, tipo: m.tipo, monto: m.monto, categoria: m.categoria || '', detalle: m.descripcion || '', metodo: m.metodo || '', origen: m.origen || 'manual' })),
  };
}

const telDeCliente = (c) => String(c.numeroReal || c.telefono || (/@s\.whatsapp\.net$/.test(c.jid || '') ? String(c.jid).split('@')[0] : '') || '').replace(/\D/g, '');

async function calcularClientes(userId, { ahora }) {
  const BotCliente = require('./bot-engine/models/BotCliente');
  const CtaCte = require('./bot-engine/models/CtaCte');
  const shared = require('./local-api/routes/ctacte.shared');
  const clientes = (await BotCliente.find({ userId }).lean()).map((c) => ({ nombre: c.nombre || '', telefono: telDeCliente(c) })).filter((c) => c.nombre || c.telefono);
  const todos = await CtaCte.find({ userId, entidad: 'cliente' }).lean();
  const info = new Map();
  for (const m of [...todos].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))) info.set(m.entidadClave, { nombre: m.nombre, telefono: m.telefono || '' });
  const lista = ctacte.saldos(shared.soloSaldo(todos), ahora);
  const deudores = lista.filter((d) => d.saldo > 0.005).sort((a, b) => b.saldo - a.saldo)
    .map((d) => ({ nombre: (info.get(d.clave) || {}).nombre || '', telefono: (info.get(d.clave) || {}).telefono || '', saldo: d.saldo, dias: d.antiguedadDias || 0 }));
  return { clientes, deudores, totalDeben: ctacte.totalSaldo(lista) };
}

async function calcularCatalogo(userId) {
  const Config = require('./bot-engine/models/Config');
  const cfg = await Config.findOne({ userId }).lean();
  return {
    productos: (cfg?.catalogo || []).map((p) => ({
      nombre: p.nombre, precio: p.precio, moneda: p.moneda || 'ARS', categoria: p.categoria || '',
      stock: Number.isInteger(p.stock) ? p.stock : -1, disponible: p.disponible !== false, codigo: p.codigo || '',
    })),
  };
}

// Arma el contenido de los tipos pedidos. `general` = id del calendario principal (para poner "General" al puesto del bot).
async function calcular(userId, listaTipos, { ahora = new Date(), general = 'primary' } = {}) {
  const uid = String(userId); const salida = {};
  for (const t of (sanearTipos(listaTipos) || [])) {
    if (t === 'agenda') salida.agenda = await calcularAgenda(uid, { ahora, general });
    else if (t === 'caja') salida.caja = await calcularCaja(uid, { ahora });
    else if (t === 'clientes') salida.clientes = await calcularClientes(uid, { ahora });
    else if (t === 'catalogo') salida.catalogo = await calcularCatalogo(uid);
  }
  return salida;
}

// Huella de cada tipo, para mandar solo lo que cambió.
const huella = (contenido) => crypto.createHash('sha256').update(JSON.stringify(contenido)).digest('hex');

module.exports = { TIPOS, ETIQUETAS, activo, tipos, enviaAlgo, guardar, calcular, huella, sanearTipos };
