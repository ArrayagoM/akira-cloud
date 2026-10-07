// main/perfiles.js
// Perfiles del equipo: el dueño le pone un PIN a su perfil y crea perfiles para empleados (cada uno con su PIN y su rol).
// Con los perfiles activos la app arranca bloqueada y cada persona entra con su PIN; la API local aplica los permisos del rol
// (el empleado no ve la Caja ni los reportes, el encargado no toca la configuración). Probado en tests/perfiles.test.js.
//
// Alcance (dicho con honestidad): protege de accesos accidentales y de curiosos en la misma computadora; no está pensado para frenar a
// alguien con conocimientos técnicos que use la PC con la sesión del dueño abierta. Para eso, cada persona debería tener su usuario de Windows.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROLES = { empleado: 'Empleado', encargado: 'Encargado' };
const MAX_PERFILES = 20;
const DURACION_TOKEN_MS = 12 * 60 * 60 * 1000;
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 60 * 1000;

const archivo = (dir) => path.join(dir, 'perfiles.json');
const leerJson = (dir) => { try { return JSON.parse(fs.readFileSync(archivo(dir), 'utf8')); } catch { return {}; } };
const escribir = (dir, d) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(archivo(dir), JSON.stringify(d)); };
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function leer(dir) {
  const j = leerJson(dir);
  return { secreto: j.secreto || '', propietario: j.propietario || null, perfiles: Array.isArray(j.perfiles) ? j.perfiles : [] };
}
function guardar(dir, d) {
  if (!d.secreto) d.secreto = crypto.randomBytes(32).toString('hex'); // firma de los pases; vive solo en esta PC
  escribir(dir, d);
}

const hashPin = (pin, sal) => crypto.scryptSync(String(pin), sal, 32).toString('hex');
const pinValido = (pin) => /^\d{4,8}$/.test(String(pin ?? ''));
const nuevoPin = (pin) => { const sal = crypto.randomBytes(16).toString('hex'); return { sal, hash: hashPin(pin, sal) }; };
const coincide = (pin, reg) => { try { return !!reg?.hash && crypto.timingSafeEqual(Buffer.from(hashPin(pin, reg.sal), 'hex'), Buffer.from(reg.hash, 'hex')); } catch { return false; } };

// ¿Están activos los perfiles? Cuando el dueño puso su PIN.
const activo = (dir) => !!leer(dir).propietario;

// Lo que ve la pantalla de bloqueo (sin PINs ni firmas)
function publico(dir) {
  const d = leer(dir);
  return {
    activo: !!d.propietario,
    perfiles: [{ id: 'propietario', nombre: 'Dueño', rol: 'propietario' }, ...d.perfiles.filter((p) => p.activo !== false).map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol }))],
  };
}
const listaAdmin = (dir) => leer(dir).perfiles.map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol, activo: p.activo !== false, creadoEn: p.creadoEn }));

// ── pases (tokens) firmados ──
function firmar(dir, datos, ahora = Date.now()) {
  const d = leer(dir); if (!d.secreto) { guardar(dir, d); }
  const secreto = leer(dir).secreto;
  const cuerpo = Buffer.from(JSON.stringify({ ...datos, exp: ahora + DURACION_TOKEN_MS })).toString('base64url');
  return `${cuerpo}.${crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}
function verificar(dir, token, ahora = Date.now()) {
  const [cuerpo, firma] = String(token || '').split('.');
  if (!cuerpo || !firma) return null;
  const secreto = leer(dir).secreto; if (!secreto) return null;
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  try { if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null; } catch { return null; }
  let datos; try { datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')); } catch { return null; }
  if (!datos?.exp || datos.exp < ahora) return null;
  if (datos.rol !== 'propietario') { // un perfil borrado o desactivado pierde el acceso enseguida
    const p = leer(dir).perfiles.find((x) => x.id === datos.id);
    if (!p || p.activo === false) return null;
    return { id: p.id, nombre: p.nombre, rol: p.rol };
  }
  return { id: 'propietario', nombre: 'Dueño', rol: 'propietario' };
}

// ── intentos de PIN (en memoria: se reinicia con la app) ──
const intentos = new Map();
const estaBloqueado = (id, ahora) => { const x = intentos.get(id); return !!x && x.hasta > ahora; };

// → { ok, token, perfil } | { ok:false, error, bloqueadoHasta? }
function entrar(dir, { id, pin }, ahora = Date.now()) {
  const d = leer(dir);
  if (!d.propietario) return { ok: false, error: 'Los perfiles no están activados.' };
  if (estaBloqueado(id, ahora)) return { ok: false, error: 'Demasiados intentos. Esperá un minuto y probá de nuevo.', bloqueadoHasta: intentos.get(id).hasta };
  const reg = id === 'propietario' ? d.propietario : d.perfiles.find((p) => p.id === id && p.activo !== false);
  if (!reg) return { ok: false, error: 'Ese perfil no existe.' };
  if (!coincide(pin, reg)) {
    const x = intentos.get(id) || { n: 0, hasta: 0 }; x.n += 1;
    if (x.n >= MAX_INTENTOS) { x.hasta = ahora + BLOQUEO_MS; x.n = 0; }
    intentos.set(id, x);
    return { ok: false, error: 'PIN incorrecto.' };
  }
  intentos.delete(id);
  const perfil = id === 'propietario' ? { id: 'propietario', nombre: 'Dueño', rol: 'propietario' } : { id: reg.id, nombre: reg.nombre, rol: reg.rol };
  return { ok: true, perfil, token: firmar(dir, { id: perfil.id, rol: perfil.rol }, ahora) };
}

// ── administración (solo el dueño) ──
function definirPinPropietario(dir, pin) {
  if (!pinValido(pin)) return { ok: false, error: 'El PIN tiene que tener entre 4 y 8 números.' };
  const d = leer(dir); d.propietario = nuevoPin(pin); guardar(dir, d);
  intentos.clear();
  return { ok: true };
}
function desactivar(dir) { const d = leer(dir); d.propietario = null; guardar(dir, d); intentos.clear(); return { ok: true }; }

function crear(dir, { nombre, rol, pin }) {
  const n = texto(nombre, 40);
  if (!n) return { ok: false, error: 'Poné el nombre de la persona.' };
  if (!ROLES[rol]) return { ok: false, error: 'Elegí el rol: empleado o encargado.' };
  if (!pinValido(pin)) return { ok: false, error: 'El PIN tiene que tener entre 4 y 8 números.' };
  const d = leer(dir);
  if (d.perfiles.length >= MAX_PERFILES) return { ok: false, error: `Llegaste al máximo de ${MAX_PERFILES} perfiles.` };
  if (d.perfiles.some((p) => p.nombre.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'Ya hay un perfil con ese nombre.' };
  if (n.toLowerCase() === 'dueño' || n.toLowerCase() === 'dueno') return { ok: false, error: 'Ese nombre está reservado.' };
  const perfil = { id: crypto.randomBytes(6).toString('hex'), nombre: n, rol, activo: true, creadoEn: new Date().toISOString(), ...(() => { const p = nuevoPin(pin); return { sal: p.sal, hash: p.hash }; })() };
  d.perfiles.push(perfil); guardar(dir, d);
  return { ok: true, id: perfil.id };
}
function actualizar(dir, id, cambios = {}) {
  const d = leer(dir); const p = d.perfiles.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'Perfil no encontrado.' };
  if (cambios.nombre !== undefined) { const n = texto(cambios.nombre, 40); if (!n) return { ok: false, error: 'Poné el nombre.' }; if (d.perfiles.some((x) => x.id !== id && x.nombre.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'Ya hay un perfil con ese nombre.' }; p.nombre = n; }
  if (cambios.rol !== undefined) { if (!ROLES[cambios.rol]) return { ok: false, error: 'Rol no válido.' }; p.rol = cambios.rol; }
  if (cambios.activo !== undefined) p.activo = cambios.activo === true;
  if (cambios.pin !== undefined && cambios.pin !== '') { if (!pinValido(cambios.pin)) return { ok: false, error: 'El PIN tiene que tener entre 4 y 8 números.' }; Object.assign(p, nuevoPin(cambios.pin)); }
  guardar(dir, d);
  return { ok: true };
}
function eliminar(dir, id) { const d = leer(dir); const antes = d.perfiles.length; d.perfiles = d.perfiles.filter((p) => p.id !== id); if (d.perfiles.length === antes) return { ok: false, error: 'Perfil no encontrado.' }; guardar(dir, d); return { ok: true }; }

// ── permisos por rol ──
// Reglas de lo que se PERMITE al empleado: [métodos, expresión de la ruta]
const EMPLEADO = [
  [['GET'], /^\/api\/auth\/me$/],
  [['GET'], /^\/api\/config$/],
  [['GET'], /^\/api\/app\/actualizacion$/],
  [['GET', 'POST', 'PATCH'], /^\/api\/bot\/clientes(\/|$)/],
  [['GET'], /^\/api\/bot\/(status|stats|agenda|proximos|waitlist|accounts|logs)$/],
  [['GET', 'PATCH', 'POST'], /^\/api\/turnos(\/|$)/],
  [['GET', 'POST'], /^\/api\/app\/ventas$/],
  [['GET'], /^\/api\/app\/(profesionales|sucursales)$/],
  [['POST'], /^\/api\/app\/profesionales\/asignar$/],
  [['GET', 'POST'], /^\/api\/app\/pedidos(\/|$)/],
  [['GET'], /^\/api\/gestion\/lista$/],
  [['GET'], /^\/api\/app\/catalogo-fotos\//],
  [['GET'], /^\/api\/app\/perfiles\/yo$/],
  [['POST'], /^\/api\/app\/uso\/pantalla$/],
];
// Lo que se NIEGA al encargado (todo lo demás lo puede)
const ENCARGADO_NO = [
  /^\/api\/app\/webhooks(\/|$)/, /^\/api\/app\/uso$/, /^\/api\/app\/exportacion(\/|$)/, /^\/api\/app\/respaldo(\/|$)/, /^\/api\/app\/perfiles(\/|$)(?!yo$)/, /^\/api\/subscriptions(\/|$)/, /^\/api\/admin(\/|$)/, /^\/api\/sync(\/|$)/, /^\/api\/app\/resumen-web$/,
  /^\/api\/bot\/(keys|google|accounts|reset-session)(\/|$)/,
];
const ENCARGADO_SOLO_LEER = [/^\/api\/config$/, /^\/api\/app\/avisos(\/|$)/, /^\/api\/auth\//, /^\/api\/app\/programas(\/|$)/];

function puede(rol, metodo, ruta) {
  const m = String(metodo || 'GET').toUpperCase(); const r = String(ruta || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (rol === 'propietario') return true;
  if (rol === 'empleado') return EMPLEADO.some(([ms, re]) => ms.includes(m) && re.test(r));
  if (rol === 'encargado') {
    if (ENCARGADO_NO.some((re) => re.test(r)) && !(m === 'GET' && /^\/api\/bot\/accounts$/.test(r))) return false;
    if (ENCARGADO_SOLO_LEER.some((re) => re.test(r))) return m === 'GET' || (/^\/api\/auth\/me$/.test(r) && m === 'GET');
    return true;
  }
  return false;
}

// Rutas que se pueden usar sin pase aunque los perfiles estén activos: la pantalla de bloqueo, la licencia y el inicio de sesión en la nube.
// De /api/auth solo lo que no lleva la sesión puesta (login, registro, Google…) y la consulta "quién soy"; lo demás (cambiar contraseña, etc.) pide pase.
const PUBLICAS = [/^\/api\/license\//, /^\/api\/health$/, /^\/api\/app\/perfiles\/(estado|entrar|recuperar)$/];
const esPublica = (ruta, req) => PUBLICAS.some((re) => re.test(ruta)) || (/^\/api\/auth\//.test(ruta) && (!req.headers?.authorization || (ruta === '/api/auth/me' && req.method === 'GET')));

// Middleware de Express: aplica los perfiles a todo /api.
function crearMiddleware(dir) {
  return (req, res, next) => {
    if (!activo(dir)) return next();
    const ruta = req.originalUrl.split('?')[0];
    const pase = req.headers['x-akira-perfil'];
    const perfil = pase ? verificar(dir, pase) : null;
    if (perfil) {
      req.perfil = perfil;
      if (!puede(perfil.rol, req.method, ruta) && !esPublica(ruta, req)) return res.status(403).json({ error: 'Tu perfil no tiene permiso para esto.', codigo: 'SIN_PERMISO' });
      return next();
    }
    if (esPublica(ruta, req)) return next();
    return res.status(403).json({ error: pase ? 'Tu pase venció: volvé a entrar con tu PIN.' : 'Entrá con tu PIN para usar Akira.', codigo: 'PERFIL_REQUERIDO' });
  };
}

module.exports = { esPublica, ROLES, leer, activo, publico, listaAdmin, entrar, firmar, verificar, definirPinPropietario, desactivar, crear, actualizar, eliminar, puede, crearMiddleware, pinValido, MAX_INTENTOS, BLOQUEO_MS };
