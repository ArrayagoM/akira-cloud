// main/mcp/tokens.js
// Llaves de acceso para conectar asistentes de IA (MCP) a Akira. Reglas de seguridad:
//  · La llave se muestra UNA sola vez al crearla. En disco queda solo su huella SHA-256: si alguien copia el archivo, no puede usarlo.
//  · Son largas y al azar (256 bits), así que no se pueden adivinar; la comparación es en tiempo constante.
//  · Vencen (por defecto a los 90 días, máximo 1 año), se pueden revocar una por una o todas juntas, y hay un máximo de 5.
//  · Solo dan LECTURA (ver main/mcp/herramientas.js). No existe ninguna llave con más permisos.
// Probado en tests/mcp.test.js.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PREFIJO = 'akmcp_';
const MAX_LLAVES = 5;
const DIAS_POR_DEFECTO = 90;
const DIAS_MAXIMO = 365;
const DIA_MS = 24 * 60 * 60 * 1000;

const archivo = (dir) => path.join(dir, 'mcp.json');
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const huella = (llave) => crypto.createHash('sha256').update(String(llave)).digest('hex');

function leer(dir) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(archivo(dir), 'utf8')); } catch { /* sin configurar */ }
  return { activo: j.activo === true, llaves: Array.isArray(j.llaves) ? j.llaves.filter((l) => l && typeof l.hash === 'string' && typeof l.id === 'string') : [] };
}
// Se escribe en un archivo temporal y se renombra: un corte de luz no deja el archivo a medias.
function guardar(dir, datos) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${archivo(dir)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(datos), { mode: 0o600 });
  fs.renameSync(tmp, archivo(dir));
}

function crearAlmacen({ userDataDir, ahora = () => new Date() }) {
  const publico = (l) => ({ id: l.id, nombre: l.nombre, fin: l.fin, creadaEn: l.creadaEn, venceEn: l.venceEn, ultimoUso: l.ultimoUso || null, vencida: new Date(l.venceEn).getTime() <= ahora().getTime() });

  const activo = () => leer(userDataDir).activo;
  function fijarActivo(v) { const d = leer(userDataDir); d.activo = v === true; guardar(userDataDir, d); return d.activo; }
  const lista = () => leer(userDataDir).llaves.map(publico);

  function crear({ nombre, dias } = {}) {
    const n = texto(nombre, 40);
    if (!n) return { ok: false, error: 'Poné un nombre para reconocer esta conexión (por ejemplo, "Claude en mi PC").' };
    const d = leer(userDataDir);
    if (d.llaves.length >= MAX_LLAVES) return { ok: false, error: `Llegaste al máximo de ${MAX_LLAVES} conexiones. Revocá alguna que ya no uses.` };
    if (d.llaves.some((l) => l.nombre.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'Ya hay una conexión con ese nombre.' };
    const vigencia = Math.min(DIAS_MAXIMO, Math.max(1, Math.floor(Number(dias)) || DIAS_POR_DEFECTO));
    const llave = PREFIJO + crypto.randomBytes(32).toString('base64url');
    const creada = ahora();
    const reg = { id: crypto.randomBytes(6).toString('hex'), nombre: n, hash: huella(llave), fin: llave.slice(-4), creadaEn: creada.toISOString(), venceEn: new Date(creada.getTime() + vigencia * DIA_MS).toISOString(), ultimoUso: null };
    d.llaves.push(reg); guardar(userDataDir, d);
    return { ok: true, llave, conexion: publico(reg) }; // la llave completa solo existe en esta respuesta
  }

  // → { id, nombre } si la llave existe, no venció y no se revocó (revocar = borrarla); si no, null.
  function verificar(llave) {
    const s = String(llave || '');
    if (!s.startsWith(PREFIJO) || s.length < 40 || s.length > 80) return null;
    const h = Buffer.from(huella(s), 'hex');
    let hallada = null;
    for (const l of leer(userDataDir).llaves) { // se recorren todas siempre, para que el tiempo no delate si hubo coincidencia
      const ok = crypto.timingSafeEqual(h, Buffer.from(l.hash, 'hex'));
      if (ok) hallada = l;
    }
    if (!hallada || new Date(hallada.venceEn).getTime() <= ahora().getTime()) return null;
    return { id: hallada.id, nombre: hallada.nombre };
  }

  function marcarUso(id) {
    const d = leer(userDataDir); const l = d.llaves.find((x) => x.id === id); if (!l) return;
    const previo = l.ultimoUso ? new Date(l.ultimoUso).getTime() : 0;
    if (ahora().getTime() - previo < 60_000) return; // no se reescribe el archivo en cada pedido
    l.ultimoUso = ahora().toISOString(); guardar(userDataDir, d);
  }

  function revocar(id) {
    const d = leer(userDataDir); const n = d.llaves.length;
    d.llaves = d.llaves.filter((l) => l.id !== id);
    if (d.llaves.length === n) return { ok: false, error: 'Conexión no encontrada', status: 404 };
    guardar(userDataDir, d); return { ok: true };
  }
  function revocarTodas() { const d = leer(userDataDir); const n = d.llaves.length; d.llaves = []; guardar(userDataDir, d); return { ok: true, revocadas: n }; }

  return { activo, fijarActivo, lista, crear, verificar, marcarUso, revocar, revocarTodas };
}

module.exports = { crearAlmacen, huella, PREFIJO, MAX_LLAVES, DIAS_POR_DEFECTO, DIAS_MAXIMO };
