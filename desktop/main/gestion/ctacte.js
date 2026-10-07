// gestion/ctacte.js
// Cuentas corrientes: lo que los clientes le deben al negocio (Deudores) y lo que
// el negocio le debe a sus proveedores. Lógica pura, probada en tests/ctacte.test.js.
//
//  · "cargo" = aumenta la deuda (venta fiada / compra a crédito).
//  · "pago"  = la baja (pago a cuenta o total).
//  · saldo   = cargos − pagos. Positivo = hay deuda pendiente.
//  · Antigüedad: los pagos cancelan primero los cargos más viejos (FIFO), y la
//    antigüedad es la del cargo más viejo que todavía no se pagó.
'use strict';

const caja = require('./caja');

const redondear = caja.redondear;
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizarNombre = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Teléfono → últimos 10 dígitos (Argentina: código de área + número, sin 54/9/0/15).
// Así "+54 9 2241 49-7226", "2241497226" y el jid "5492241497226@s.whatsapp.net" son la misma persona.
function telClave(tel) {
  const d = String(tel ?? '').replace(/@.*$/, '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
// Número completo para escribirle por WhatsApp (549 + 10 dígitos), o null si no alcanza.
function telWhatsApp(tel) {
  const d = String(tel ?? '').replace(/@.*$/, '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('549') && d.length === 13 ? d : `549${d.slice(-10)}`;
}

// Identidad estable de un cliente deudor: por teléfono si hay, si no por nombre.
function claveCliente({ telefono, jid, nombre }) {
  const t = telClave(jid || telefono);
  if (t) return `tel:${t}`;
  const n = normalizarNombre(nombre);
  return n ? `nom:${n}` : '';
}

// Valida un movimiento de cuenta corriente. `entidad` = 'cliente' | 'proveedor'.
function sanearMovimiento(entidad, b = {}) {
  const tipo = ['cargo', 'pago'].includes(b.tipo) ? b.tipo : null;
  if (!tipo) return { ok: false, error: 'Indicá si es una deuda nueva o un pago' };
  const monto = redondear(b.monto);
  if (!(monto > 0) || monto > 1e10) return { ok: false, error: 'El monto tiene que ser mayor a cero' };
  const fecha = b.fecha || caja.fechaLocal(new Date());
  if (!caja.esFechaValida(fecha)) return { ok: false, error: 'La fecha no es válida' };
  const metodo = caja.METODOS.includes(b.metodo) ? b.metodo : (tipo === 'pago' ? 'efectivo' : '');
  return {
    ok: true,
    dato: { entidad, tipo, monto, fecha, metodo, concepto: texto(b.concepto, 200) || (tipo === 'cargo' ? (entidad === 'cliente' ? 'Venta a cuenta' : 'Compra a crédito') : 'Pago a cuenta') },
  };
}

// Agrupa los movimientos por entidad y calcula saldo y antigüedad.
// `movs`: [{ entidadClave, tipo, monto, fecha, ... }]
function saldos(movs, hoy = new Date()) {
  const porEntidad = new Map();
  for (const m of movs) {
    if (m.tipo !== 'cargo' && m.tipo !== 'pago') continue; // los recordatorios enviados no mueven el saldo
    const k = m.entidadClave;
    if (!porEntidad.has(k)) porEntidad.set(k, []);
    porEntidad.get(k).push(m);
  }
  const salida = [];
  for (const [clave, lista] of porEntidad) {
    const orden = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const cargos = redondear(orden.filter((m) => m.tipo === 'cargo').reduce((s, m) => s + m.monto, 0));
    const pagos = redondear(orden.filter((m) => m.tipo === 'pago').reduce((s, m) => s + m.monto, 0));
    const saldo = redondear(cargos - pagos);

    // FIFO: los pagos cubren los cargos más viejos primero
    let aPagar = pagos; let masViejoPendiente = null;
    for (const c of orden.filter((m) => m.tipo === 'cargo')) {
      if (aPagar >= c.monto - 0.005) { aPagar = redondear(aPagar - c.monto); continue; }
      masViejoPendiente = c.fecha; break;
    }
    const dias = masViejoPendiente && saldo > 0.005
      ? Math.max(0, Math.floor((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - new Date(+masViejoPendiente.slice(0, 4), +masViejoPendiente.slice(5, 7) - 1, +masViejoPendiente.slice(8, 10))) / 86400000))
      : 0;
    salida.push({
      clave, cargos, pagos, saldo, antiguedadDias: dias,
      ultimoMovimiento: orden[orden.length - 1].fecha,
      cantidad: orden.length,
    });
  }
  return salida;
}

const totalSaldo = (lista) => redondear(lista.filter((x) => x.saldo > 0.005).reduce((s, x) => s + x.saldo, 0));

// Texto del recordatorio de pago (el dueño lo ve y lo puede editar antes de enviarlo).
function mensajeRecordatorio({ nombre = '', saldo, negocio = '', alias = '', cbu = '', banco = '', detalle = [] }) {
  const monto = `$${saldo.toLocaleString('es-AR', Number.isInteger(saldo) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lineas = [`Hola${nombre ? ` ${nombre.split(' ')[0]}` : ''} 👋`, `Te escribimos${negocio ? ` de *${negocio}*` : ''} para recordarte que tenés un saldo pendiente de *${monto}*.`];
  if (detalle.length) lineas.push('', ...detalle.slice(0, 5).map((d) => `• ${d}`));
  if (alias || cbu) {
    lineas.push('', 'Podés abonarlo por transferencia:');
    if (alias) lineas.push(`Alias: ${alias}`);
    if (cbu) lineas.push(`CBU: ${cbu}${banco ? ` (${banco})` : ''}`);
    lineas.push('Y mandanos el comprobante por acá. ¡Gracias!');
  } else lineas.push('', 'Avisanos cuándo podés pasar o cómo preferís abonarlo. ¡Gracias!');
  return lineas.join('\n');
}

module.exports = { telClave, telWhatsApp, claveCliente, normalizarNombre, sanearMovimiento, saldos, totalSaldo, mensajeRecordatorio, texto };
