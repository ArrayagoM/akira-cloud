// local-api/routes/proveedores.routes.js
// Proveedores: a quién se le compra, qué compras se hicieron y cuánto se les debe.
//  · Compra a crédito  = "cargo" (suma deuda, no toca la Caja).
//  · Pago al proveedor = "pago" (baja la deuda y sale de la Caja como gasto "Proveedores").
//  · Un gasto pagado al contado puede vincularse al proveedor desde la Caja (queda en su historial).
'use strict';

const express = require('express');
const Proveedor = require('../../bot-engine/models/Proveedor');
const CtaCte = require('../../bot-engine/models/CtaCte');
const Movimiento = require('../../bot-engine/models/Movimiento');
const Config = require('../../bot-engine/models/Config');
const caja = require('../../gestion/caja');
const ct = require('../../gestion/ctacte');
const shared = require('./ctacte.shared');
const exp = require('../../gestion/exportador-deudas');

const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '');

// Datos del proveedor que acepta el formulario (todo opcional salvo el nombre).
function sanearProveedor(b = {}) {
  const nombre = ct.texto(b.nombre, 80);
  if (!nombre) return { ok: false, error: 'Poné el nombre del proveedor' };
  const cuit = soloDigitos(b.cuit);
  if (cuit && cuit.length !== 11) return { ok: false, error: 'El CUIT tiene que tener 11 números (sin guiones)' };
  return { ok: true, dato: { nombre, telefono: ct.texto(b.telefono, 30), cuit, rubro: ct.texto(b.rubro, 40), notas: ct.texto(b.notas, 500) } };
}

module.exports = function crearRouter({ requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);
  const uid = (req) => String(req.user._id);

  async function armarLista(userId, { incluirArchivados = false } = {}) {
    const provs = (await Proveedor.find({ userId }).lean()).filter((p) => incluirArchivados || p.activo !== false);
    const cc = shared.soloSaldo(await CtaCte.find({ userId, entidad: 'proveedor' }).lean());
    const gastos = (await Movimiento.find({ userId }).lean()).filter((m) => m.proveedorId && m.tipo === 'gasto' && m.origen !== 'ctacte');
    const saldos = Object.fromEntries(ct.saldos(cc.map((m) => ({ ...m, entidadClave: String(m.proveedorId) }))).map((s) => [s.clave, s]));
    const mes = caja.mesActual();
    return provs.map((p) => {
      const id = String(p._id); const s = saldos[id];
      const misCargos = cc.filter((m) => String(m.proveedorId) === id && m.tipo === 'cargo');
      const misGastos = gastos.filter((g) => String(g.proveedorId) === id);
      const compras = [...misCargos.map((m) => ({ fecha: m.fecha, monto: m.monto })), ...misGastos.map((g) => ({ fecha: g.fecha, monto: g.monto }))];
      return {
        ...p, _id: id, saldo: s ? s.saldo : 0, antiguedadDias: s ? s.antiguedadDias : 0,
        compradoMes: caja.redondear(compras.filter((c) => c.fecha.startsWith(mes)).reduce((t, c) => t + c.monto, 0)),
        ultimaCompra: compras.length ? compras.map((c) => c.fecha).sort().pop() : null,
        movimientos: (s ? s.cantidad : 0) + misGastos.length,
      };
    }).sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre));
  }

  router.get('/', async (req, res) => {
    try {
      const proveedores = await armarLista(uid(req));
      res.json({ proveedores, totalDeuda: caja.redondear(proveedores.filter((p) => p.saldo > 0.005).reduce((s, p) => s + p.saldo, 0)), compradoMes: caja.redondear(proveedores.reduce((s, p) => s + p.compradoMes, 0)) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const userId = uid(req);
      const r = sanearProveedor(req.body);
      if (!r.ok) return res.status(400).json({ error: r.error });
      const existentes = await Proveedor.find({ userId }).lean();
      if (existentes.some((p) => p.activo !== false && ct.normalizarNombre(p.nombre) === ct.normalizarNombre(r.dato.nombre))) return res.status(409).json({ error: 'Ya tenés un proveedor con ese nombre' });
      const p = await Proveedor.create({ ...r.dato, userId, activo: true });
      res.json({ ok: true, proveedor: p });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/:id', async (req, res) => {
    try {
      const p = await Proveedor.findOne({ _id: req.params.id, userId: uid(req) });
      if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' });
      const r = sanearProveedor({ ...(p.toJSON?.() ?? p), ...req.body });
      if (!r.ok) return res.status(400).json({ error: r.error });
      const otros = (await Proveedor.find({ userId: uid(req) }).lean()).filter((x) => String(x._id) !== String(p._id) && x.activo !== false);
      if (otros.some((x) => ct.normalizarNombre(x.nombre) === ct.normalizarNombre(r.dato.nombre))) return res.status(409).json({ error: 'Ya tenés un proveedor con ese nombre' });
      Object.assign(p, r.dato);
      if (req.body.activo === true) p.activo = true;
      await p.save();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Con historial se archiva (para no perder compras y pagos); sin historial se borra.
  router.delete('/:id', async (req, res) => {
    try {
      const userId = uid(req);
      const p = await Proveedor.findOne({ _id: req.params.id, userId });
      if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' });
      const tieneHistorial = (await CtaCte.find({ userId, proveedorId: String(p._id) }).lean()).length
        || (await Movimiento.find({ userId }).lean()).some((m) => String(m.proveedorId) === String(p._id));
      if (tieneHistorial) {
        const lista = await armarLista(userId);
        const s = lista.find((x) => x._id === String(p._id));
        if (s && s.saldo > 0.005) return res.status(409).json({ error: `Todavía le debés $${s.saldo.toLocaleString('es-AR')}. Registrá el pago antes de archivarlo.` });
        p.activo = false; await p.save();
        return res.json({ ok: true, archivado: true });
      }
      await Proveedor.deleteOne({ _id: p._id, userId });
      res.json({ ok: true, archivado: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/exportar', async (req, res) => {
    try {
      const formato = ['csv', 'pdf'].includes(req.query.formato) ? req.query.formato : 'xlsx';
      const items = await armarLista(uid(req));
      const datos = { items, total: caja.redondear(items.filter((p) => p.saldo > 0.005).reduce((s, p) => s + p.saldo, 0)), negocio: (await Config.findOne({ userId: uid(req) }))?.negocio || '' };
      const buf = formato === 'csv' ? exp.csv('proveedores', datos) : formato === 'pdf' ? await exp.pdf('proveedores', datos) : await exp.xlsx('proveedores', datos);
      const tipos = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8', pdf: 'application/pdf' };
      res.set('Content-Type', tipos[formato]);
      res.set('Content-Disposition', `attachment; filename="proveedores-${new Date().toISOString().slice(0, 10)}.${formato}"`);
      res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id', async (req, res) => {
    try {
      const userId = uid(req);
      const proveedor = (await armarLista(userId, { incluirArchivados: true })).find((p) => p._id === req.params.id);
      if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
      const cc = (await CtaCte.find({ userId, proveedorId: req.params.id }).lean()).map(({ userId: _u, ...m }) => ({ ...m, origen: 'cuenta' }));
      const gastos = (await Movimiento.find({ userId }).lean())
        .filter((m) => String(m.proveedorId) === req.params.id && m.origen !== 'ctacte')
        .map((m) => ({ _id: m._id, tipo: 'gasto', monto: m.monto, fecha: m.fecha, concepto: m.descripcion || m.categoria, metodo: m.metodo, origen: 'caja' }));
      const movimientos = [...cc.filter((m) => m.tipo === 'cargo' || m.tipo === 'pago'), ...gastos]
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      res.json({ proveedor, movimientos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/movimiento', async (req, res) => {
    try {
      const userId = uid(req);
      const p = await Proveedor.findOne({ _id: req.params.id, userId });
      if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' });
      if (p.activo === false) return res.status(409).json({ error: 'Este proveedor está archivado' });
      const r = await shared.crear({ userId, entidad: 'proveedor', clave: `prov:${p._id}`, identidad: { nombre: p.nombre, telefono: p.telefono }, body: req.body, proveedorId: String(p._id) });
      if (r.error) return res.status(r.status).json({ error: r.error });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/movimiento/:id', async (req, res) => {
    try {
      const r = await shared.borrar({ userId: uid(req), id: req.params.id, entidad: 'proveedor' });
      res.status(r.status).json(r.error ? { error: r.error } : { ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
module.exports.sanearProveedor = sanearProveedor;
