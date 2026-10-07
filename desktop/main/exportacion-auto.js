// main/exportacion-auto.js
// Exportación automática a una carpeta: cada tanto Akira deja actualizadas en una carpeta que elige el dueño las planillas de Caja (mes en curso),
// Clientes, Productos y Servicios, siempre con el MISMO nombre de archivo. Si esa carpeta está sincronizada con Google Drive, OneDrive o Dropbox,
// las planillas aparecen solas en la nube (y se pueden abrir con Google Sheets o Excel) y se mantienen al día. Es OPCIONAL (apagado por defecto).
// Probado en tests/exportacion-auto.test.js.
'use strict';

const fs = require('fs');
const path = require('path');
const caja = require('./gestion/caja');
const expCaja = require('./gestion/exportador-caja');
const exp = require('./gestion/exportador');

const archivo = (dir) => path.join(dir, 'exportacion.json');
const HORAS = [1, 6, 12, 24];

function leerConfig(dir) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(archivo(dir), 'utf8')); } catch { /* sin configurar */ }
  return { activa: j.activa === true, carpeta: typeof j.carpeta === 'string' ? j.carpeta : '', cadaHoras: HORAS.includes(j.cadaHoras) ? j.cadaHoras : 24, ultima: j.ultima || null, error: j.error || '', archivos: Array.isArray(j.archivos) ? j.archivos : [] };
}
const escribirConfig = (dir, c) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(archivo(dir), JSON.stringify(c)); };

// → { ok, config } | { ok:false, error }
function guardarConfig(dir, b = {}) {
  const c = leerConfig(dir);
  if (b.carpeta !== undefined) {
    const carpeta = String(b.carpeta || '').trim();
    if (carpeta) {
      if (!path.isAbsolute(carpeta)) return { ok: false, error: 'Elegí la carpeta con el botón (la ruta tiene que ser completa).' };
      try { if (!fs.statSync(carpeta).isDirectory()) throw new Error('x'); } catch { return { ok: false, error: 'Esa carpeta no existe.' }; }
    }
    c.carpeta = carpeta;
  }
  if (b.cadaHoras !== undefined) { if (!HORAS.includes(Number(b.cadaHoras))) return { ok: false, error: 'Elegí cada cuánto se actualiza.' }; c.cadaHoras = Number(b.cadaHoras); }
  if (b.activa !== undefined) { if (b.activa === true && !c.carpeta) return { ok: false, error: 'Primero elegí la carpeta donde se guardan las planillas.' }; c.activa = b.activa === true; }
  escribirConfig(dir, c);
  return { ok: true, config: c };
}

const aFilaCliente = (c) => ({ nombre: c.nombre || '', telefono: String(c.numeroReal || c.telefono || '').replace(/\D/g, ''), email: c.email || '', etiquetas: c.etiquetas || [], notas: c.notas || '' });

// Arma las planillas (sin escribir nada). → [{ nombre, buffer }]
async function armarArchivos({ userId, modelos, ahora = new Date() }) {
  const { Movimiento, Turno, BotCliente, Config } = modelos;
  const uid = String(userId);
  const [movs, turnos, clientes, cfg] = await Promise.all([Movimiento.find({ userId: uid }).lean(), Turno.find({ userId: uid }).lean(), BotCliente.find({ userId: uid }).lean(), Config.findOne({ userId: uid }).lean()]);
  const negocio = cfg?.negocio || '';
  const salida = [];
  const mesHoy = caja.fechaLocal(ahora).slice(0, 7);
  const meses = [mesHoy];
  if (ahora.getDate() <= 5) { const p = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1); meses.push(caja.fechaLocal(p).slice(0, 7)); } // primeros días: también el mes que acaba de cerrar
  for (const mes of meses) {
    const manuales = movs.filter((m) => String(m.fecha || '').startsWith(mes)).map((m) => ({ ...m, origen: m.origen || 'manual' }));
    const movimientos = caja.ordenar([...manuales, ...caja.ingresosDeTurnos(turnos, mes)]);
    salida.push({ nombre: `Caja-${mes}.xlsx`, buffer: await expCaja.exportarXlsx({ mes, movimientos, resumen: caja.resumen(movimientos, mes), negocio }) });
  }
  salida.push({ nombre: 'Clientes.xlsx', buffer: await exp.exportarXlsx('clientes', clientes.map(aFilaCliente)) });
  salida.push({ nombre: 'Productos.xlsx', buffer: await exp.exportarXlsx('productos', cfg?.catalogo || []) });
  salida.push({ nombre: 'Servicios.xlsx', buffer: await exp.exportarXlsx('servicios', cfg?.serviciosList || []) });
  return salida;
}

// Escribe de a un archivo, de forma atómica (primero un temporal): un lector (Drive, Excel) nunca ve un archivo a medias.
function escribir(carpeta, archivos) {
  fs.mkdirSync(carpeta, { recursive: true });
  for (const a of archivos) {
    if (!/^[A-Za-z0-9._-]+\.xlsx$/.test(a.nombre)) throw new Error('Nombre de archivo no válido');
    const destino = path.join(carpeta, a.nombre); const tmp = `${destino}.tmp`;
    fs.writeFileSync(tmp, a.buffer); fs.renameSync(tmp, destino);
  }
}

function crearServicio({ userDataDir, obtenerUserId, modelos, ahora = () => new Date(), setI = setInterval, log = () => {} }) {
  let timer = null; let enCurso = false;

  async function ejecutar() {
    if (enCurso) return { ok: false, motivo: 'en-curso' };
    const cfg = leerConfig(userDataDir);
    if (!cfg.carpeta) return { ok: false, motivo: 'sin-carpeta', error: 'Elegí una carpeta.' };
    const uid = obtenerUserId(); if (!uid) return { ok: false, motivo: 'sin-sesion' };
    enCurso = true;
    try {
      const archivos = await armarArchivos({ userId: uid, modelos, ahora: ahora() });
      escribir(cfg.carpeta, archivos);
      escribirConfig(userDataDir, { ...leerConfig(userDataDir), ultima: ahora().toISOString(), error: '', archivos: archivos.map((a) => a.nombre) });
      return { ok: true, archivos: archivos.map((a) => a.nombre) };
    } catch (e) {
      const msg = /ENOENT|EPERM|EACCES|ENOTDIR/.test(String(e.code || e.message)) ? 'No se pudo escribir en la carpeta (¿existe y tenés permiso?).' : e.message;
      escribirConfig(userDataDir, { ...leerConfig(userDataDir), error: msg });
      log('[exportacion] FALLÓ', e.message);
      return { ok: false, motivo: 'error', error: msg };
    } finally { enCurso = false; }
  }

  // Cada 30 min mira si ya toca (según "cada cuántas horas" elegidas)
  async function revisar() {
    const c = leerConfig(userDataDir);
    if (!c.activa || !c.carpeta) return { ok: false, motivo: 'apagada' };
    if (c.ultima && ahora().getTime() - new Date(c.ultima).getTime() < c.cadaHoras * 3600e3) return { ok: false, motivo: 'todavia-no' };
    return ejecutar();
  }
  const programar = () => { setTimeout(() => revisar().catch(() => {}), 45_000); timer = setI(() => { revisar().catch(() => {}); }, 30 * 60 * 1000); };
  const detener = () => { if (timer) clearInterval(timer); };
  return { ejecutar, revisar, programar, detener, estado: () => leerConfig(userDataDir) };
}

module.exports = { crearServicio, leerConfig, guardarConfig, armarArchivos, escribir, HORAS };
