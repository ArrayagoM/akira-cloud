// local-api/routes/ventas.routes.js
// Ventas rápidas del mostrador: vender (descuenta stock + suma a la Caja), ver las últimas y anular.
'use strict';

const express = require('express');
const Config = require('../../bot-engine/models/Config');
const Movimiento = require('../../bot-engine/models/Movimiento');
const ventas = require('../../gestion/ventas');
const stock = require('../../gestion/stock');
const Sucursal = require('../../bot-engine/models/Sucursal');

module.exports = function crearRouter({ requerirSesion, botService }) {
  const router = express.Router();
  router.use(requerirSesion);
  const uid = (req) => String(req.user._id);

  // Productos a la venta + últimas ventas (para anular una equivocada)
  router.get('/', async (req, res) => {
    try {
      const userId = uid(req);
      const cfg = await Config.findOne({ userId }).lean();
      const productos = (cfg?.catalogo || []).filter((p) => p.disponible !== false).map((p) => ({ nombre: p.nombre, precio: p.precio, stock: p.stock >= 0 ? p.stock : -1, categoria: p.categoria || '', codigo: p.codigo || '' }));
      const recientes = (await Movimiento.find({ userId, origen: 'venta' }).lean())
        .sort((a, b) => String(b.createdAt || b.fecha).localeCompare(String(a.createdAt || a.fecha))).slice(0, 8)
        .map((v) => ({ _id: String(v._id), fecha: v.fecha, monto: v.monto, metodo: v.metodo, descripcion: v.descripcion, items: v.items || [] }));
      res.json({ productos, recientes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const sucursalId = req.body?.sucursalId && (await Sucursal.findOne({ _id: String(req.body.sucursalId), userId: uid(req) })) ? String(req.body.sucursalId) : '';
      const r = await ventas.vender({ Config, Movimiento }, uid(req), { ...(req.body || {}), por: req.perfil?.nombre || '', sucursalId });
      if (!r.ok) return res.status(r.sinStock ? 409 : 400).json({ error: r.error, faltantes: r.faltantes || [] });
      if (!r.yaEstaba) botService?.recargarConfig?.(); // el bot tiene que ver el stock nuevo
      res.json({ ok: true, yaEstaba: r.yaEstaba, id: String(r.venta._id), total: r.venta.monto, aviso: stock.textoPocoStock(r.bajos), faltantes: r.faltantes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const r = await ventas.anular({ Config, Movimiento }, uid(req), req.params.id);
      if (!r.ok) return res.status(404).json({ error: r.error });
      botService?.recargarConfig?.();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
