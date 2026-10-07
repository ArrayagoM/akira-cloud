// local-api/routes/gestion.routes.js
// Gestión del negocio: productos y servicios con importación (Excel, CSV, PDF,
// foto) y exportación. Lee y escribe el MISMO catálogo y lista de servicios que
// usa el bot (Config.catalogo / Config.serviciosList), así que lo que se importa
// acá lo usa el bot al instante. Todo es local: ningún archivo sale de la PC.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const Config = require('../../bot-engine/models/Config');
const Log = require('../../bot-engine/models/Log');
const Movimiento = require('../../bot-engine/models/Movimiento');
const Proveedor = require('../../bot-engine/models/Proveedor');
const CtaCte = require('../../bot-engine/models/CtaCte');
const caja = require('../../gestion/caja');
const { leerArchivo } = require('../../gestion/lector-archivos');
const mapeoLib = require('../../gestion/mapeo');
const { exportarXlsx, exportarCsv } = require('../../gestion/exportador');

const CAMPO = { productos: 'catalogo', servicios: 'serviciosList' };
const TIPOS_IMPORT = ['productos', 'servicios', 'movimientos', 'proveedores']; // 'movimientos' = Caja (ver caja.routes.js)
const OBLIGATORIOS = { productos: ['nombre', 'precio'], servicios: ['nombre', 'precio'], movimientos: ['fecha', 'monto'], proveedores: ['nombre'] };
const TTL_MS = 30 * 60 * 1000;
const MAX_VISTA = 300;

function sanitizarLista(tipo, lista) {
  if (tipo === 'productos') {
    return lista.map((p) => ({
      waProductId: String(p.waProductId || '').trim(),
      nombre: String(p.nombre || '').trim(),
      descripcion: String(p.descripcion || '').trim(),
      precio: Math.max(0, parseFloat(p.precio) || 0),
      moneda: String(p.moneda || 'ARS').trim(),
      categoria: String(p.categoria || '').trim(),
      stock: parseInt(p.stock) >= 0 ? parseInt(p.stock) : -1,
      imagen: String(p.imagen || '').trim(),
      disponible: p.disponible !== false,
      fuente: ['manual', 'wa_catalog', 'status'].includes(p.fuente) ? p.fuente : 'manual',
    })).filter((p) => p.nombre);
  }
  return lista.map((s) => ({
    nombre: String(s.nombre || '').trim(),
    precio: Math.max(0, parseFloat(s.precio) || 0),
    duracion: Math.min(1440, Math.max(5, parseInt(s.duracion) || 60)),
    intervaloRecordatorioDias: Math.max(0, parseInt(s.intervaloRecordatorioDias) || 0),
    mensajeRecordatorio: String(s.mensajeRecordatorio || '').trim().slice(0, 500),
  })).filter((s) => s.nombre);
}

module.exports = function crearRouter({ botService, requerirSesion, userDataDir }) {
  const router = express.Router();
  router.use(requerirSesion);

  const importaciones = new Map(); // id → { userId, hojas, origen, ts }
  const dirSnap = path.join(userDataDir, 'importaciones');
  const tipoValido = (t) => (CAMPO[t] ? t : null);                       // listas editables (Catálogo)
  const tipoImportable = (t) => (TIPOS_IMPORT.includes(t) ? t : null);   // lo que se puede importar

  const limpiarVencidas = () => { const ya = Date.now(); for (const [id, v] of importaciones) if (ya - v.ts > TTL_MS) importaciones.delete(id); };
  const recargarBots = () => { for (let s = 0; s < 5; s++) { try { botService.recargarConfig(s); } catch { /* slot inactivo */ } } };

  async function leerLista(userId, tipo) {
    if (tipo === 'movimientos') return JSON.parse(JSON.stringify(await Movimiento.find({ userId: String(userId) }).lean()));
    if (tipo === 'proveedores') return JSON.parse(JSON.stringify(await Proveedor.find({ userId: String(userId) }).lean()));
    const cfg = await Config.findOne({ userId });
    const lista = cfg?.[CAMPO[tipo]];
    return Array.isArray(lista) ? JSON.parse(JSON.stringify(lista)) : [];
  }
  async function guardarLista(userId, tipo, lista) {
    if (tipo === 'proveedores') {
      // Altas y cambios de la importación; al deshacer, los que no estaban se borran (o se archivan si ya tienen historial).
      const uid = String(userId);
      const actuales = await Proveedor.find({ userId: uid }).lean();
      const porId = new Map(actuales.map((p) => [String(p._id), p]));
      const quedan = new Set(lista.filter((p) => p._id).map((p) => String(p._id)));
      for (const p of actuales) {
        if (quedan.has(String(p._id))) continue;
        const usado = (await CtaCte.find({ userId: uid, proveedorId: String(p._id) }).lean()).length || (await Movimiento.find({ userId: uid }).lean()).some((m) => String(m.proveedorId) === String(p._id));
        if (usado) await Proveedor.findOneAndUpdate({ _id: p._id, userId: uid }, { $set: { activo: false } }); else await Proveedor.deleteOne({ _id: p._id, userId: uid });
      }
      for (const p of lista) {
        const dato = { nombre: String(p.nombre || '').trim(), telefono: String(p.telefono || ''), cuit: String(p.cuit || ''), rubro: String(p.rubro || ''), notas: String(p.notas || ''), activo: p.activo !== false };
        if (!dato.nombre) continue;
        if (p._id && porId.has(String(p._id))) await Proveedor.findOneAndUpdate({ _id: p._id, userId: uid }, { $set: dato });
        else if (!p._id) await Proveedor.create({ ...dato, userId: uid });
      }
      return lista;
    }
    if (tipo === 'movimientos') {
      // Caja: solo se suman movimientos nuevos (los que no traen _id) o se quitan los que ya no están (deshacer).
      const uid = String(userId);
      const actuales = await Movimiento.find({ userId: uid }).lean();
      const quedan = new Set(lista.filter((m) => m._id).map((m) => String(m._id)));
      for (const m of actuales) if (!quedan.has(String(m._id))) await Movimiento.deleteOne({ _id: m._id, userId: uid });
      for (const m of lista.filter((x) => !x._id)) {
        const r = caja.sanearMovimiento(m);
        if (r.ok) await Movimiento.create({ ...r.dato, userId: uid, origen: m.origen || 'importado' });
      }
      return lista;
    }
    const limpia = sanitizarLista(tipo, lista);
    await Config.findOneAndUpdate({ userId }, { [CAMPO[tipo]]: limpia }, { upsert: true, new: true });
    recargarBots();
    return limpia;
  }

  // ── Listas (lo que muestra la pantalla Catálogo) ──
  router.get('/lista', async (req, res) => {
    const tipo = tipoValido(req.query.tipo);
    if (!tipo) return res.status(400).json({ error: 'tipo inválido' });
    try { res.json({ lista: await leerLista(req.user._id, tipo) }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/lista', async (req, res) => {
    const tipo = tipoValido(req.body?.tipo);
    if (!tipo || !Array.isArray(req.body?.lista)) return res.status(400).json({ error: 'tipo o lista inválidos' });
    try {
      const lista = await guardarLista(req.user._id, tipo, req.body.lista);
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `${tipo === 'productos' ? 'Productos' : 'Servicios'} actualizados: ${lista.length}` });
      res.json({ ok: true, lista });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Importar: 1) analizar el archivo ──
  router.post('/analizar', express.json({ limit: '25mb' }), async (req, res) => {
    try {
      const { nombre, mimetype, base64 } = req.body || {};
      if (!base64 || typeof base64 !== 'string') return res.status(400).json({ error: 'Falta el archivo' });
      const buffer = Buffer.from(base64, 'base64');
      const ocr = require('../../bot-engine/services/bot/ocr.service');
      const r = await leerArchivo({ buffer, nombre, mimetype }, { leerTexto: ocr.leerTexto });
      if (!r.hojas.length) return res.status(422).json({ error: r.aviso || 'No encontré datos en el archivo.' });

      limpiarVencidas();
      const id = crypto.randomBytes(8).toString('hex');
      importaciones.set(id, { userId: String(req.user._id), hojas: r.hojas, origen: r.origen, ts: Date.now() });
      if (importaciones.size > 8) importaciones.delete(importaciones.keys().next().value);

      const tipoSugerido = mapeoLib.sugerirTipo(r.hojas[0].columnas);
      res.json({
        importacionId: id, origen: r.origen, aviso: r.aviso || '', tipoSugerido,
        hojas: r.hojas.map((h, i) => ({
          indice: i, nombre: h.nombre, columnas: h.columnas, totalFilas: h.filas.length, muestra: h.filas.slice(0, 5),
          mapeoSugerido: { productos: mapeoLib.sugerirMapeo('productos', h.columnas, h.filas), servicios: mapeoLib.sugerirMapeo('servicios', h.columnas, h.filas), movimientos: mapeoLib.sugerirMapeo('movimientos', h.columnas, h.filas), proveedores: mapeoLib.sugerirMapeo('proveedores', h.columnas, h.filas) },
        })),
      });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  async function filasValidadas(req) {
    const { importacionId, hoja = 0, tipo: t, mapeo = {} } = req.body || {};
    const tipo = tipoImportable(t);
    if (!tipo) throw Object.assign(new Error('tipo inválido'), { status: 400 });
    const imp = importaciones.get(importacionId);
    if (!imp || imp.userId !== String(req.user._id)) throw Object.assign(new Error('La importación venció. Volvé a subir el archivo.'), { status: 410 });
    const h = imp.hojas[hoja];
    if (!h) throw Object.assign(new Error('Hoja inexistente'), { status: 400 });
    if (OBLIGATORIOS[tipo].some((c) => mapeo[c] == null)) {
      const faltan = tipo === 'movimientos' ? 'la fecha y cuál es el monto' : 'el nombre y cuál es el precio';
      throw Object.assign(new Error(`Indicá qué columna es ${faltan}.`), { status: 400 });
    }
    const existentes = await leerLista(req.user._id, tipo);
    return { tipo, existentes, filas: mapeoLib.construirFilas(tipo, h.filas, mapeo, existentes) };
  }

  // 2) vista previa con errores marcados
  router.post('/previsualizar', async (req, res) => {
    try {
      const { filas } = await filasValidadas(req);
      res.json({ resumen: mapeoLib.resumen(filas), filas: filas.slice(0, MAX_VISTA), truncado: filas.length > MAX_VISTA });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  // 3) confirmar: guarda una copia de lo anterior (para deshacer) y aplica
  router.post('/confirmar', async (req, res) => {
    try {
      const { tipo, existentes, filas } = await filasValidadas(req);
      const { modo = 'agregar', excluir = [] } = req.body;
      const r = mapeoLib.aplicarImportacion(tipo, existentes, filas, { modo: modo === 'reemplazar' ? 'reemplazar' : 'agregar', excluir: Array.isArray(excluir) ? excluir : [] });
      if (!r.agregados && !r.actualizados) return res.status(422).json({ error: 'No hay filas válidas para importar.' });

      fs.mkdirSync(dirSnap, { recursive: true });
      const deshacerId = `${Date.now()}-${tipo}`;
      fs.writeFileSync(path.join(dirSnap, `${deshacerId}.json`), JSON.stringify({ userId: String(req.user._id), tipo, antes: existentes, ts: Date.now() }));
      for (const viejo of fs.readdirSync(dirSnap).sort().slice(0, -10)) { try { fs.unlinkSync(path.join(dirSnap, viejo)); } catch { /* nada */ } }

      await guardarLista(req.user._id, tipo, r.lista);
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Importación de ${tipo}: ${r.agregados} nuevos, ${r.actualizados} actualizados` });
      importaciones.delete(req.body.importacionId);
      res.json({ ok: true, agregados: r.agregados, actualizados: r.actualizados, omitidos: r.omitidos, total: r.lista.length, deshacerId });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  // 4) deshacer la última importación de ese tipo
  router.post('/deshacer', async (req, res) => {
    try {
      const id = String(req.body?.deshacerId || '');
      if (!/^\d+-(productos|servicios|movimientos|proveedores)$/.test(id)) return res.status(400).json({ error: 'Importación inválida' });
      const archivo = path.join(dirSnap, `${id}.json`);
      if (!fs.existsSync(archivo)) return res.status(404).json({ error: 'Ya no se puede deshacer esa importación.' });
      const snap = JSON.parse(fs.readFileSync(archivo, 'utf8'));
      if (snap.userId !== String(req.user._id)) return res.status(404).json({ error: 'Ya no se puede deshacer esa importación.' });
      const masNueva = fs.readdirSync(dirSnap).filter((f) => f.endsWith(`-${snap.tipo}.json`) && f > `${id}.json`).length;
      if (masNueva) return res.status(409).json({ error: 'Hay una importación más reciente: deshacé esa primero.' });
      await guardarLista(req.user._id, snap.tipo, snap.antes);
      fs.unlinkSync(archivo);
      res.json({ ok: true, restaurados: snap.antes.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Exportar / plantilla ──
  async function entregar(req, res, plantilla) {
    const tipo = tipoValido(req.query.tipo);
    const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
    if (!tipo) return res.status(400).json({ error: 'tipo inválido' });
    try {
      const lista = plantilla ? [] : await leerLista(req.user._id, tipo);
      const buf = formato === 'csv' ? exportarCsv(tipo, lista, { plantilla }) : await exportarXlsx(tipo, lista, { plantilla });
      const hoy = new Date().toISOString().slice(0, 10);
      const nombre = plantilla ? `plantilla-${tipo}.${formato}` : `${tipo}-${hoy}.${formato}`;
      res.set('Content-Type', formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${nombre}"`);
      res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
  router.get('/exportar', (req, res) => entregar(req, res, false));
  router.get('/plantilla', (req, res) => entregar(req, res, true));

  return router;
};
