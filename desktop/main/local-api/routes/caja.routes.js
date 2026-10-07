// local-api/routes/caja.routes.js
// Caja del negocio: ingresos y gastos por mes. Los ingresos por turnos cobrados
// salen solos de la agenda; el resto (gastos, cobros en efectivo…) se carga a mano,
// se importa de una planilla o se registra desde un comprobante de la bandeja.
'use strict';

const express = require('express');
const Movimiento = require('../../bot-engine/models/Movimiento');
const Turno = require('../../bot-engine/models/Turno');
const Documento = require('../../bot-engine/models/Documento');
const Config = require('../../bot-engine/models/Config');
const Proveedor = require('../../bot-engine/models/Proveedor');
const CtaCte = require('../../bot-engine/models/CtaCte');
const ctacte = require('../../gestion/ctacte');
const caja = require('../../gestion/caja');
const exp = require('../../gestion/exportador-caja');
const ventas = require('../../gestion/ventas');
const Sucursal = require('../../bot-engine/models/Sucursal');
const Profesional = require('../../bot-engine/models/Profesional');
const sucursalesLib = require('../../gestion/sucursales');

const CATEGORIAS = {
  gasto: ['Alquiler', 'Servicios (luz, agua, internet)', 'Sueldos', 'Insumos y mercadería', 'Impuestos', 'Marketing', 'Mantenimiento', 'Transporte', 'Otros gastos'],
  ingreso: ['Ventas', 'Cobros en efectivo', 'Otros ingresos'],
};

module.exports = function crearRouter({ requerirSesion, botService, servicioWebhooks }) {
  const router = express.Router();
  router.use(requerirSesion);

  const uid = (req) => String(req.user._id);
  const mesDe = (req) => (caja.esMes(req.query.mes) ? req.query.mes : caja.mesActual());

  // Movimientos del mes (manuales + ingresos de turnos) y su resumen.
  // sucursal: '' = todas | 'sin' = sin sucursal | id de una sucursal
  async function armarMes(userId, mes, sucursal = '') {
    let manuales = (await Movimiento.find({ userId }).lean()).filter((m) => String(m.fecha || '').startsWith(mes)).map((m) => ({ ...m, origen: m.origen || 'manual' }));
    let turnos = await Turno.find({ userId }).lean();
    if (sucursal) { manuales = sucursalesLib.filtrarMovimientos(manuales, sucursal); turnos = sucursalesLib.filtrarTurnos(turnos, await Profesional.find({ userId }).lean(), sucursal); }
    const movimientos = caja.ordenar([...manuales, ...caja.ingresosDeTurnos(turnos, mes)]);
    return { mes, movimientos, resumen: caja.resumen(movimientos, mes), porCobrar: caja.porCobrar(turnos), todos: manuales };
  }

  router.get('/', async (req, res) => {
    try {
      const userId = uid(req); const mes = mesDe(req);
      const sucursal = String(req.query.sucursal || '').slice(0, 40);
      const { movimientos, resumen, porCobrar } = await armarMes(userId, mes, sucursal);
      const usadas = (await Movimiento.find({ userId }).lean()).reduce((a, m) => { (a[m.tipo] = a[m.tipo] || new Set()).add(m.categoria); return a; }, {});
      const cat = (t) => [...new Set([...(CATEGORIAS[t] || []), ...(usadas[t] || [])])];
      // Lo que te deben (clientes) y lo que debés (proveedores): saldos totales, no solo del mes.
      const cc = (await CtaCte.find({ userId }).lean()).filter((m) => m.tipo === 'cargo' || m.tipo === 'pago');
      const clave = (m) => (m.entidad === 'proveedor' ? `prov:${m.proveedorId}` : m.entidadClave);
      const por = (ent) => ctacte.totalSaldo(ctacte.saldos(cc.filter((m) => m.entidad === ent).map((m) => ({ ...m, entidadClave: clave(m) }))));
      const proveedores = (await Proveedor.find({ userId }).lean()).filter((p) => p.activo !== false).map((p) => ({ _id: String(p._id), nombre: p.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
      res.json({ mes, movimientos, resumen, porCobrar, cuentas: { teDeben: por('cliente'), debes: por('proveedor') }, proveedores, categorias: { gasto: cat('gasto'), ingreso: cat('ingreso') }, sucursales: (await Sucursal.find({ userId }).lean()).filter((x) => x.activo !== false).map((x) => ({ _id: String(x._id), nombre: x.nombre })), sucursal });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/movimiento', async (req, res) => {
    try {
      const userId = uid(req);
      const r = caja.sanearMovimiento(req.body);
      if (!r.ok) return res.status(400).json({ error: r.error });
      if (r.dato.documentoId) {
        const doc = await Documento.findOne({ _id: r.dato.documentoId, userId });
        if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
        if (await Movimiento.findOne({ userId, documentoId: String(doc._id) })) return res.status(409).json({ error: 'Este documento ya está registrado en la Caja' });
        if (doc.estado === 'nuevo') { doc.estado = 'revisado'; await doc.save(); }
      }
      if (r.dato.sucursalId && !(await Sucursal.findOne({ _id: r.dato.sucursalId, userId }))) return res.status(400).json({ error: 'Sucursal no encontrada' });
      let proveedorNombre = '';
      if (r.dato.proveedorId) {
        const prov = await Proveedor.findOne({ _id: r.dato.proveedorId, userId });
        if (!prov || prov.activo === false) return res.status(404).json({ error: 'Proveedor no encontrado' });
        proveedorNombre = prov.nombre;
      }
      const mov = await Movimiento.create({ ...r.dato, proveedorNombre, userId, origen: r.dato.documentoId ? 'documento' : 'manual' });
      servicioWebhooks?.emitir('movimiento.creado', { movimientoId: String(mov._id), tipo: mov.tipo, monto: mov.monto, fecha: mov.fecha, metodo: mov.metodo, categoria: mov.categoria, descripcion: mov.descripcion || '', sucursalId: mov.sucursalId || '' });
      res.json({ ok: true, movimiento: mov });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/movimiento/:id', async (req, res) => {
    try {
      if (String(req.params.id).startsWith('turno-')) return res.status(400).json({ error: 'Este ingreso viene de un turno cobrado: se corrige desde la Agenda.' });
      const mov = await Movimiento.findOne({ _id: req.params.id, userId: uid(req) });
      if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' });
      if (mov.origen === 'venta') return res.status(400).json({ error: 'Esta es una venta rápida: si te equivocaste, anulala y cargala de nuevo.' });
      if (mov.origen === 'recibo') return res.status(400).json({ error: 'Este ingreso viene de un recibo: se corrige desde Presupuestos y recibos.' });
      if (mov.origen === 'pedido') return res.status(400).json({ error: 'Este ingreso viene de un pedido: se corrige desde Pedidos.' });
      if (mov.origen === 'ctacte') return res.status(400).json({ error: 'Este movimiento viene de una cuenta corriente (Deudores o Proveedores): se corrige desde ahí.' });
      const r = caja.sanearMovimiento({ ...mov.toJSON?.() ?? mov, ...req.body });
      if (!r.ok) return res.status(400).json({ error: r.error });
      if (r.dato.sucursalId && !(await Sucursal.findOne({ _id: r.dato.sucursalId, userId: uid(req) }))) return res.status(400).json({ error: 'Sucursal no encontrada' });
      let proveedorNombre = '';
      if (r.dato.proveedorId) {
        const prov = await Proveedor.findOne({ _id: r.dato.proveedorId, userId: uid(req) });
        if (!prov) return res.status(404).json({ error: 'Proveedor no encontrado' });
        proveedorNombre = prov.nombre;
      }
      Object.assign(mov, { ...r.dato, proveedorNombre, documentoId: mov.documentoId || null });
      await mov.save();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/movimiento/:id', async (req, res) => {
    try {
      if (String(req.params.id).startsWith('turno-')) return res.status(400).json({ error: 'Este ingreso viene de un turno cobrado: no se borra desde la Caja.' });
      const previo = await Movimiento.findOne({ _id: req.params.id, userId: uid(req) });
      if (previo?.origen === 'venta') { const r = await ventas.anular({ Config, Movimiento }, uid(req), req.params.id); botService?.recargarConfig?.(); return res.json({ ok: true, aviso: r.ok ? 'Venta anulada: el stock volvió al catálogo.' : '' }); }
      if (previo?.origen === 'recibo') return res.status(400).json({ error: 'Este ingreso viene de un recibo: se anula desde Presupuestos y recibos.' });
      if (previo?.origen === 'pedido') return res.status(400).json({ error: 'Este ingreso viene de un pedido: se cancela desde Pedidos.' });
      if (previo?.origen === 'ctacte') return res.status(400).json({ error: 'Este movimiento viene de una cuenta corriente (Deudores o Proveedores): se borra desde ahí.' });
      const r = await Movimiento.deleteOne({ _id: req.params.id, userId: uid(req) });
      if (!r.deletedCount) return res.status(404).json({ error: 'Movimiento no encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/exportar', async (req, res) => {
    try {
      const userId = uid(req); const mes = mesDe(req);
      const formato = ['csv', 'pdf'].includes(req.query.formato) ? req.query.formato : 'xlsx';
      const datos = await armarMes(userId, mes, String(req.query.sucursal || '').slice(0, 40));
      datos.negocio = (await Config.findOne({ userId }))?.negocio || '';
      const buf = formato === 'csv' ? exp.exportarCsv(datos) : formato === 'pdf' ? await exp.exportarPdf(datos) : await exp.exportarXlsx(datos);
      const tipos = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8', pdf: 'application/pdf' };
      res.set('Content-Type', tipos[formato]);
      res.set('Content-Disposition', `attachment; filename="caja-${mes}.${formato}"`);
      res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
