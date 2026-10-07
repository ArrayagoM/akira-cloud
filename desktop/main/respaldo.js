// main/respaldo.js
// Respaldo cifrado y restauración de los datos del negocio (que viven en esta PC).
//
//  · Qué incluye: la base de datos (clientes, turnos, caja, deudas, proveedores, documentos, configuración)
//    y los archivos de cada cuenta (documentos recibidos, memoria de clientes). NO incluye la sesión de
//    WhatsApp (se vuelve a vincular con un QR) ni las claves de API (están cifradas con el Windows de ESTA
//    PC y no sirven en otra: hay que volver a cargarlas).
//  · Cómo se cifra: AES-256-GCM con una clave derivada (scrypt) de una CONTRASEÑA QUE ELIGE EL USUARIO.
//    A propósito no se usa la clave de Windows: el respaldo tiene que poder abrirse en una PC nueva.
//    Sin la contraseña no hay forma de recuperarlo.
//  · Restaurar: se descifra a una carpeta de espera y se aplica al reiniciar la app, ANTES de abrir la base,
//    guardando una copia de lo que había (nunca se pisa nada sin dejar marcha atrás).
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const MAGIA = Buffer.from('AKBK1');
const EXT = '.akbk';
const PENDIENTE = 'restauracion-pendiente';
const CADA_MS = 20 * 3600 * 1000; // se respalda si el último tiene más de ~1 día
const MAX_ARCHIVOS = 10;
const MAX_BYTES = 1.5 * 1024 * 1024 * 1024;

const dos = (n) => String(n).padStart(2, '0');
const sello = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`;

// ── Contenedor simple: [u16 largo nombre][nombre][u32 tamaño][datos] … ──
function empaquetar(entradas) {
  const partes = [];
  for (const { nombre, datos } of entradas) {
    const n = Buffer.from(nombre, 'utf8');
    const cab = Buffer.alloc(2); cab.writeUInt16BE(n.length);
    const tam = Buffer.alloc(4); tam.writeUInt32BE(datos.length);
    partes.push(cab, n, tam, datos);
  }
  return Buffer.concat(partes);
}

// El nombre de cada entrada es una ruta relativa segura (nada de "..", rutas absolutas ni unidades).
function nombreSeguro(n) {
  return typeof n === 'string' && n.length > 0 && n.length < 400 && !n.includes('\\') && !n.startsWith('/') && !/^[A-Za-z]:/.test(n) && !n.split('/').some((p) => p === '..' || p === '' || p === '.');
}

function desempaquetar(buf) {
  const entradas = []; let i = 0;
  while (i < buf.length) {
    if (i + 2 > buf.length) throw new Error('Respaldo dañado');
    const ln = buf.readUInt16BE(i); i += 2;
    if (i + ln + 4 > buf.length) throw new Error('Respaldo dañado');
    const nombre = buf.toString('utf8', i, i + ln); i += ln;
    const tam = buf.readUInt32BE(i); i += 4;
    if (i + tam > buf.length) throw new Error('Respaldo dañado');
    if (!nombreSeguro(nombre)) throw new Error('El respaldo contiene una ruta no permitida');
    entradas.push({ nombre, datos: buf.subarray(i, i + tam) }); i += tam;
  }
  return entradas;
}

// ── Cifrado ──
const derivar = (clave, sal) => crypto.scryptSync(String(clave), sal, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });

function cifrar(buf, clave) {
  const sal = crypto.randomBytes(16); const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', derivar(clave, sal), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIA, sal, iv, c.getAuthTag(), enc]);
}

function descifrar(buf, clave) {
  if (buf.length < MAGIA.length + 44 || !buf.subarray(0, MAGIA.length).equals(MAGIA)) throw Object.assign(new Error('No es un respaldo de Akira'), { codigo: 'FORMATO' });
  const sal = buf.subarray(5, 21); const iv = buf.subarray(21, 33); const tag = buf.subarray(33, 49); const enc = buf.subarray(49);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', derivar(clave, sal), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]);
  } catch { throw Object.assign(new Error('Contraseña incorrecta o respaldo dañado'), { codigo: 'CLAVE' }); }
}

// ── Qué archivos entran ──
function archivosDeCuentas(userDataDir) {
  const salida = []; const base = path.join(userDataDir, 'sessions');
  let slots = []; try { slots = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { /* sin sesiones todavía */ }
  for (const s of slots) {
    const raiz = path.join(base, s.name, 'data');
    const recorrer = (dir, rel) => {
      let items = []; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const it of items) {
        const r = rel ? `${rel}/${it.name}` : it.name;
        if (it.isDirectory()) recorrer(path.join(dir, it.name), r);
        else if (it.isFile() && !(rel === '' && it.name === 'credentials.json')) salida.push({ ruta: path.join(dir, it.name), nombre: `cuentas/${s.name}/${r}` });
      }
    };
    recorrer(raiz, '');
  }
  return salida;
}

// snapshotDb(rutaDestino) → Promise: copia consistente de la base (API de backup de SQLite, sin frenar el bot)
async function crearRespaldo({ userDataDir, destinoDir, clave, snapshotDb, version = '', ahora = new Date() }) {
  if (!clave || String(clave).length < 8) throw new Error('La contraseña del respaldo debe tener al menos 8 caracteres');
  fs.mkdirSync(destinoDir, { recursive: true });
  const tmp = path.join(destinoDir, `.tmp-${process.pid}-${Date.now()}.db`);
  try {
    await snapshotDb(tmp);
    const entradas = [{ nombre: 'base/akira.db', datos: fs.readFileSync(tmp) }];
    let total = entradas[0].datos.length;
    for (const a of archivosDeCuentas(userDataDir)) {
      const datos = fs.readFileSync(a.ruta);
      total += datos.length;
      if (total > MAX_BYTES) throw new Error('Los datos superan el tamaño máximo de un respaldo (1,5 GB)');
      entradas.push({ nombre: a.nombre, datos });
    }
    entradas.unshift({ nombre: 'manifiesto.json', datos: Buffer.from(JSON.stringify({ formato: 1, creado: ahora.toISOString(), version, archivos: entradas.length })) });
    const cifrado = cifrar(zlib.gzipSync(empaquetar(entradas), { level: 6 }), clave);
    const archivo = path.join(destinoDir, `akira-respaldo-${sello(ahora)}${EXT}`);
    const parcial = archivo + '.parcial';
    fs.writeFileSync(parcial, cifrado); fs.renameSync(parcial, archivo); // nunca queda un respaldo a medio escribir
    return { archivo, bytes: cifrado.length, entradas: entradas.length };
  } finally { try { fs.unlinkSync(tmp); } catch { /* ya no está */ } }
}

function leerRespaldo(archivo, clave) {
  const entradas = desempaquetar(zlib.gunzipSync(descifrar(fs.readFileSync(archivo), clave)));
  const man = entradas.find((e) => e.nombre === 'manifiesto.json');
  if (!man || !entradas.some((e) => e.nombre === 'base/akira.db')) throw new Error('El respaldo está incompleto');
  return { entradas, manifiesto: JSON.parse(man.datos.toString('utf8')) };
}

function verificar(archivo, clave) {
  const { entradas, manifiesto } = leerRespaldo(archivo, clave);
  return { ...manifiesto, archivos: entradas.length, documentos: entradas.filter((e) => e.nombre.includes('/documentos/')).length };
}

// Descifra a la carpeta de espera. La restauración real ocurre al reiniciar (aplicarRestauracionPendiente).
function prepararRestauracion({ userDataDir, archivo, clave }) {
  const { entradas, manifiesto } = leerRespaldo(archivo, clave);
  const espera = path.join(userDataDir, PENDIENTE);
  fs.rmSync(espera, { recursive: true, force: true });
  for (const e of entradas) {
    if (e.nombre === 'manifiesto.json') continue;
    const destino = path.join(espera, ...e.nombre.split('/'));
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, e.datos);
  }
  fs.writeFileSync(path.join(espera, 'manifiesto.json'), JSON.stringify(manifiesto));
  return manifiesto;
}

// Se llama al arrancar, ANTES de abrir la base. Deja una copia de lo anterior en "antes-de-restaurar-…".
function aplicarRestauracionPendiente(userDataDir, ahora = new Date()) {
  const espera = path.join(userDataDir, PENDIENTE);
  if (!fs.existsSync(path.join(espera, 'base', 'akira.db'))) { fs.rmSync(espera, { recursive: true, force: true }); return null; }
  const resguardo = path.join(userDataDir, `antes-de-restaurar-${sello(ahora)}`);
  fs.mkdirSync(resguardo, { recursive: true });
  const db = path.join(userDataDir, 'akira.db');
  for (const suf of ['', '-wal', '-shm']) if (fs.existsSync(db + suf)) fs.renameSync(db + suf, path.join(resguardo, 'akira.db' + suf));
  fs.renameSync(path.join(espera, 'base', 'akira.db'), db);
  const cuentas = path.join(espera, 'cuentas');
  if (fs.existsSync(cuentas)) {
    for (const slot of fs.readdirSync(cuentas)) {
      const actual = path.join(userDataDir, 'sessions', slot, 'data');
      // credentials.json no entra en el respaldo: la app lo regenera sola al iniciar el bot.
      if (fs.existsSync(actual)) { fs.mkdirSync(path.join(resguardo, 'cuentas', slot), { recursive: true }); fs.cpSync(actual, path.join(resguardo, 'cuentas', slot, 'data'), { recursive: true }); fs.rmSync(actual, { recursive: true, force: true }); }
      fs.mkdirSync(path.dirname(actual), { recursive: true });
      fs.renameSync(path.join(cuentas, slot), actual);
    }
  }
  const man = (() => { try { return JSON.parse(fs.readFileSync(path.join(espera, 'manifiesto.json'), 'utf8')); } catch { return {}; } })();
  fs.rmSync(espera, { recursive: true, force: true });
  return { resguardo, manifiesto: man };
}

function listar(destinoDir) {
  try {
    return fs.readdirSync(destinoDir).filter((f) => f.endsWith(EXT)).map((f) => { const s = fs.statSync(path.join(destinoDir, f)); return { nombre: f, archivo: path.join(destinoDir, f), bytes: s.size, fecha: s.mtime.toISOString() }; })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  } catch { return []; }
}

function rotar(destinoDir, max = MAX_ARCHIVOS) {
  const todos = listar(destinoDir); const borrados = [];
  for (const f of todos.slice(max)) { try { fs.unlinkSync(f.archivo); borrados.push(f.nombre); } catch { /* en uso */ } }
  return borrados;
}

// ── Configuración (userData/respaldo.json). La contraseña se guarda cifrada con el Windows de esta PC
//    solo para poder respaldar solo cada día; para RESTAURAR en otra PC hay que escribirla. ──
const archivoCfg = (dir) => path.join(dir, 'respaldo.json');
function leerConfig(userDataDir) { try { return JSON.parse(fs.readFileSync(archivoCfg(userDataDir), 'utf8')); } catch { return {}; } }
function guardarConfig(userDataDir, cambios) { const nuevo = { ...leerConfig(userDataDir), ...cambios }; fs.writeFileSync(archivoCfg(userDataDir), JSON.stringify(nuevo)); return nuevo; }

function debeCorrer(cfg, ahoraMs = Date.now()) {
  if (!cfg?.activo || !cfg.carpeta || !cfg.clave) return false;
  if (!cfg.ultimo?.ok) return !cfg.ultimo?.enMs || ahoraMs - cfg.ultimo.enMs > 3600 * 1000; // si falló, reintenta cada hora
  return ahoraMs - cfg.ultimo.enMs > CADA_MS;
}

module.exports = {
  EXT, MAX_ARCHIVOS, empaquetar, desempaquetar, nombreSeguro, cifrar, descifrar, archivosDeCuentas, crearRespaldo, verificar,
  prepararRestauracion, aplicarRestauracionPendiente, listar, rotar, leerConfig, guardarConfig, debeCorrer,
};
