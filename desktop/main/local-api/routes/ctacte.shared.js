// local-api/routes/ctacte.shared.js
// Alta y baja de movimientos de cuenta corriente, compartido por Deudores y Proveedores.
// Un PAGO también mueve la Caja (porque es plata que realmente entró o salió):
//   · cliente que paga  → ingreso "Cobro de deudas"
//   · pago a proveedor  → gasto "Proveedores"
// Un CARGO (fiado / compra a crédito) NO toca la Caja: todavía no se cobró ni se pagó.
'use strict';

const CtaCte = require('../../bot-engine/models/CtaCte');
const Movimiento = require('../../bot-engine/models/Movimiento');
const ct = require('../../gestion/ctacte');

const CATEGORIA_CAJA = { cliente: { tipo: 'ingreso', categoria: 'Cobro de deudas', verbo: 'Cobro a' }, proveedor: { tipo: 'gasto', categoria: 'Proveedores', verbo: 'Pago a' } };

async function crear({ userId, entidad, clave, identidad, body, proveedorId = null }) {
  const r = ct.sanearMovimiento(entidad, body);
  if (!r.ok) return { status: 400, error: r.error };
  const d = r.dato;
  const doc = await CtaCte.create({
    userId, entidad, entidadClave: clave,
    nombre: identidad.nombre, telefono: identidad.telefono || '', jid: identidad.jid || '', proveedorId,
    tipo: d.tipo, monto: d.monto, fecha: d.fecha, metodo: d.metodo, concepto: d.concepto, cajaId: null,
  });
  // Un pago se refleja en la Caja salvo que se pida lo contrario (ej. ya estaba cargado a mano).
  if (d.tipo === 'pago' && body.enCaja !== false) {
    const c = CATEGORIA_CAJA[entidad];
    const mov = await Movimiento.create({
      userId, origen: 'ctacte', ctacteId: String(doc._id), proveedorId, proveedorNombre: entidad === 'proveedor' ? identidad.nombre : '',
      tipo: c.tipo, monto: d.monto, fecha: d.fecha, metodo: d.metodo || 'efectivo', categoria: c.categoria,
      descripcion: `${c.verbo} ${identidad.nombre}${d.concepto && d.concepto !== 'Pago a cuenta' ? ` — ${d.concepto}` : ''}`.slice(0, 200),
      cliente: entidad === 'cliente' ? identidad.nombre : '', documentoId: null,
    });
    doc.cajaId = String(mov._id);
    await doc.save();
  }
  return { status: 200, doc };
}

// Borra un movimiento de cuenta corriente y, si había generado uno en la Caja, también ese.
async function borrar({ userId, id, entidad }) {
  const doc = await CtaCte.findOne({ _id: id, userId, entidad });
  if (!doc) return { status: 404, error: 'Movimiento no encontrado' };
  if (doc.cajaId) await Movimiento.deleteOne({ _id: doc.cajaId, userId });
  await CtaCte.deleteOne({ _id: doc._id, userId });
  return { status: 200 };
}

// Solo cargos y pagos cuentan para el saldo (los recordatorios enviados quedan aparte).
const soloSaldo = (movs) => movs.filter((m) => m.tipo === 'cargo' || m.tipo === 'pago');

module.exports = { crear, borrar, soloSaldo };
