// lib/seguridad-cuentas.js
// Reglas de seguridad de las cuentas (funciones puras, sin base de datos): validar lo que escribe la persona, códigos de verificación de email,
// token de formulario contra bots y decisiones al entrar con Google o Facebook. Las usan el servidor y los tests; el frontend tiene su espejo
// en frontend/src/utils/validaciones.js (la regla se aplica SIEMPRE en el servidor: la pantalla solo avisa antes).
'use strict';

const crypto = require('crypto');

// ── Lo que escribe la persona ────────────────────────────────────────────────
const limpiar = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Nombre o apellido: solo letras (con tildes), espacios, punto, apóstrofo y guion. Sin números, links ni símbolos.
const NOMBRE_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,59}$/u;
const PARECE_LINK = /(https?:|www\.|@|\.(com|net|org|ar|lat|io|ru|cn|xyz|top|click|link)\b)/i;
function validarNombre(v, { obligatorio = true } = {}) {
  const s = limpiar(v, 80);
  if (!s) return obligatorio ? { ok: false, error: 'Escribí tu nombre.' } : { ok: true, valor: '' };
  if (s.length < 2) return { ok: false, error: 'El nombre es demasiado corto.' };
  if (!NOMBRE_RE.test(s) || PARECE_LINK.test(s) || /(.)\1{4,}/.test(s)) return { ok: false, error: 'Usá solo letras en el nombre (sin números, símbolos ni links).' };
  return { ok: true, valor: s };
}

// Celular (opcional): dígitos con separadores comunes; 8 a 15 dígitos.
function validarCelular(v) {
  const s = limpiar(v, 30);
  if (!s) return { ok: true, valor: '' };
  if (!/^[0-9 ()+.-]+$/.test(s)) return { ok: false, error: 'El teléfono solo puede tener números, espacios, + y guiones.' };
  const dig = s.replace(/\D/g, '');
  if (dig.length < 8 || dig.length > 15) return { ok: false, error: 'El teléfono no parece válido.' };
  return { ok: true, valor: s };
}

const PAISES = ['Argentina', 'Chile', 'Uruguay', 'Colombia', 'México', 'Perú', 'España', 'Otro'];
const validarPais = (v) => ({ ok: true, valor: PAISES.includes(String(v)) ? String(v) : 'Argentina' });

// Email: formato razonable, largo máximo del estándar (254) y sin direcciones descartables.
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const DESCARTABLES = new Set(('mailinator.com guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz guerrillamail.de guerrillamailblock.com sharklasers.com grr.la 10minutemail.com 10minutemail.net 10minemail.com temp-mail.org temp-mail.io tempmail.com tempmail.net tempmailo.com tempail.com yopmail.com yopmail.fr yopmail.net trashmail.com trashmail.net trashmail.de getnada.com nada.email dispostable.com maildrop.cc throwawaymail.com fakeinbox.com mintemail.com mohmal.com emailondeck.com moakt.com spamgourmet.com mailnesia.com mytemp.email tempinbox.com burnermail.io discard.email mailcatch.com inboxbear.com 1secmail.com 1secmail.org 1secmail.net tmail.ws tmpmail.org tmpmail.net emltmp.com tempr.email harakirimail.com spambox.us mail.tm linshiyouxiang.net anonbox.net jetable.org nospam.ze.tc fakemail.net fakemailgenerator.com mailforspam.com spam4.me tempsky.com tmails.net owlymail.com crazymailing.com wegwerfmail.de einrot.com trbvm.com cuvox.de dayrep.com armyspy.com rhyta.com teleworm.us superrito.com gustr.com fleckens.hu jourrapide.com').split(/\s+/));
function validarEmail(v) {
  const s = limpiar(v, 300).toLowerCase();
  if (!s || s.length > 254 || !EMAIL_RE.test(s)) return { ok: false, error: 'Escribí un email válido.' };
  const dominio = s.split('@')[1];
  if (DESCARTABLES.has(dominio) || [...DESCARTABLES].some((d) => dominio.endsWith('.' + d))) return { ok: false, error: 'Ese tipo de email temporal no está permitido. Usá tu email personal o el de tu negocio.' };
  return { ok: true, valor: s };
}

// Contraseña: 8 a 72 caracteres (bcrypt ignora lo que pasa de 72 bytes), con mayúscula, minúscula y número; sin las más usadas ni parte del email.
const BASES_COMUNES = new Set(('password pass passw0rd contrasena clave admin administrador qwerty qwertyuiop asdfgh asdfghjkl zxcvbnm abc abcd abcde abcdef hola holamundo argentina buenosaires boca river bocajuniors riverplate messi maradona diego lionel racing independiente sanlorenzo velez newells rosariocentral talleres akira akiracloud whatsapp emprendedor negocio peluqueria barberia familia amor teamo teamo123 princesa dragon master login welcome bienvenido bienvenida iloveyou monkey football futbol mercadopago cambiame cambiar test prueba usuario secreto micontrasena micontrasenia').split(/\s+/));
const SECUENCIAS = ['12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '123123123', 'aa123456', 'aa12345678', 'a1234567', 'abc12345', 'qwerty123', 'q1w2e3r4'];
function validarPassword(pw, { email = '', nombre = '' } = {}) {
  const s = String(pw ?? '');
  if (s.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  if (Buffer.byteLength(s) > 72) return { ok: false, error: 'La contraseña es demasiado larga (máximo 72 caracteres).' };
  if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/\d/.test(s)) return { ok: false, error: 'La contraseña debe contener mayúsculas, minúsculas y números.' };
  const bajo = s.toLowerCase();
  const base = bajo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\d\W_]+$/g, '').replace(/^[\d\W_]+/g, '');   // sin tildes: "Contraseña1" cuenta como "contrasena"
  if (SECUENCIAS.includes(bajo) || BASES_COMUNES.has(base) || /^(.)\1+$/.test(s) || new Set(bajo).size < 4) return { ok: false, error: 'Esa contraseña es demasiado común. Elegí una menos obvia.' };
  const local = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (local.length >= 4 && bajo.includes(local)) return { ok: false, error: 'La contraseña no puede contener tu email.' };
  const nom = String(nombre).toLowerCase().replace(/[^a-záéíóúñ]/g, '');
  if (nom.length >= 4 && bajo.includes(nom)) return { ok: false, error: 'La contraseña no puede contener tu nombre.' };
  return { ok: true, valor: s };
}

// ── Códigos de verificación de email ─────────────────────────────────────────
const CODIGO_VIDA_MS = 15 * 60 * 1000, CODIGO_MAX_INTENTOS = 5, REENVIO_ESPERA_MS = 60 * 1000;
const clave = (secreto, uso) => crypto.createHash('sha256').update(`${secreto || ''}:${uso}`).digest();
const generarCodigo = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashCodigo = (codigo, email, secreto) => crypto.createHmac('sha256', clave(secreto, 'verificacion')).update(`${String(email).toLowerCase()}:${String(codigo).trim()}`).digest('hex');
function igual(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
const codigoCoincide = (codigo, email, hashGuardado, secreto) => !!hashGuardado && /^\d{6}$/.test(String(codigo).trim()) && igual(hashCodigo(codigo, email, secreto), hashGuardado);

// ── Token del formulario de registro (contra bots que mandan el pedido directo) ──
// Lo entrega el servidor al abrir el formulario: firmado, con la hora. Un robot que no abrió la página no lo tiene; uno que lo manda
// al instante (menos de 3 s) tampoco pasa. Se puede usar pocas veces (lo cuenta el limitador).
const TOKEN_MIN_MS = 3000, TOKEN_MAX_MS = 2 * 3600 * 1000;
function crearTokenFormulario(secreto, ahora = Date.now()) {
  const ts = Math.floor(ahora).toString(36), nonce = crypto.randomBytes(9).toString('base64url');
  const mac = crypto.createHmac('sha256', clave(secreto, 'formulario')).update(`${ts}.${nonce}`).digest('base64url');
  return `${ts}.${nonce}.${mac}`;
}
function revisarTokenFormulario(token, secreto, ahora = Date.now()) {
  const p = String(token || '').split('.');
  if (p.length !== 3 || p.some((x) => !x || x.length > 80)) return { ok: false, motivo: 'falta' };
  const mac = crypto.createHmac('sha256', clave(secreto, 'formulario')).update(`${p[0]}.${p[1]}`).digest('base64url');
  if (!igual(mac, p[2])) return { ok: false, motivo: 'firma' };
  const edad = ahora - parseInt(p[0], 36);
  if (!(edad >= 0)) return { ok: false, motivo: 'futuro' };
  if (edad < TOKEN_MIN_MS) return { ok: false, motivo: 'rapido' };
  if (edad > TOKEN_MAX_MS) return { ok: false, motivo: 'vencido' };
  return { ok: true, nonce: p[1] };
}

// ── Entrar con Google o Facebook a una cuenta que ya existía ─────────────────
// Antes: si alguien había registrado TU email con SU contraseña (sin verificar), al entrar vos con Google el sistema vinculaba tu Google a esa
// cuenta y la contraseña del atacante seguía valiendo. Ahora, entrar con un proveedor que ya verificó el email prueba que sos el dueño:
// si la cuenta no estaba verificada por código, se borra la contraseña vieja y se cierran todas las sesiones anteriores.
function decidirVinculoOAuth(usuario, { proveedor, emailVerificadoPorProveedor = true }) {
  // Sin confirmación del email por parte del proveedor no se crea ni se vincula nada (ni siquiera una cuenta nueva).
  if (!emailVerificadoPorProveedor) return { rechazar: true, motivo: 'El proveedor no confirmó el email de esta cuenta.' };
  if (!usuario) return { crear: true, verificado: true };
  const yaProbada = usuario.emailVerificado === true;
  const tieneClave = !!usuario.tieneClave;
  return { vincular: true, marcarVerificado: true, borrarClave: tieneClave && !yaProbada, cerrarSesiones: tieneClave && !yaProbada, proveedor };
}

module.exports = {
  limpiar, validarNombre, validarCelular, validarPais, validarEmail, validarPassword, PAISES,
  generarCodigo, hashCodigo, codigoCoincide, CODIGO_VIDA_MS, CODIGO_MAX_INTENTOS, REENVIO_ESPERA_MS,
  crearTokenFormulario, revisarTokenFormulario, TOKEN_MIN_MS, TOKEN_MAX_MS, decidirVinculoOAuth,
};
