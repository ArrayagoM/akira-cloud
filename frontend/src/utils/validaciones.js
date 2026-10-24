// utils/validaciones.js
// Espejo en pantalla de las reglas del servidor (backend-desktop/lib/seguridad-cuentas.js): avisan ANTES de enviar. La regla que cuenta es
// siempre la del servidor, que vuelve a validar todo. Cada función devuelve '' si está bien o el mensaje de error.

export const limpiar = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const NOMBRE_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,59}$/u;
const PARECE_LINK = /(https?:|www\.|@|\.(com|net|org|ar|lat|io|ru|cn|xyz|top|click|link)\b)/i;

export function errorNombre(v, { obligatorio = true } = {}) {
  const s = limpiar(v, 80);
  if (!s) return obligatorio ? 'Escribí tu nombre.' : '';
  if (s.length < 2) return 'El nombre es demasiado corto.';
  if (!NOMBRE_RE.test(s) || PARECE_LINK.test(s) || /(.)\1{4,}/.test(s)) return 'Usá solo letras (sin números, símbolos ni links).';
  return '';
}

export function errorEmail(v) {
  const s = limpiar(v, 300).toLowerCase();
  if (!s || s.length > 254 || !/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(s)) return 'Escribí un email válido.';
  return '';
}

export function errorCelular(v) {
  const s = limpiar(v, 30);
  if (!s) return '';
  if (!/^[0-9 ()+.-]+$/.test(s)) return 'Solo números, espacios, + y guiones.';
  const dig = s.replace(/\D/g, '');
  return dig.length < 8 || dig.length > 15 ? 'El teléfono no parece válido.' : '';
}

// Requisitos de la contraseña (se muestran tildados mientras se escribe).
export const requisitosPassword = (pw) => [
  { ok: pw.length >= 8, txt: 'Al menos 8 caracteres' },
  { ok: /[A-Z]/.test(pw), txt: 'Una mayúscula' },
  { ok: /[a-z]/.test(pw), txt: 'Una minúscula' },
  { ok: /\d/.test(pw), txt: 'Un número' },
];

const COMUNES = new Set('password pass passw0rd contrasena clave admin qwerty hola holamundo argentina boca river messi maradona akira akiracloud whatsapp negocio familia amor iloveyou welcome bienvenido'.split(' '));
export function errorPassword(pw, { email = '', nombre = '' } = {}) {
  const s = String(pw ?? '');
  if (!requisitosPassword(s).every((r) => r.ok)) return 'La contraseña no cumple los requisitos.';
  if (new TextEncoder().encode(s).length > 72) return 'La contraseña es demasiado larga (máximo 72 caracteres).';
  const bajo = s.toLowerCase(); const base = bajo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\d\W_]+$/g, '').replace(/^[\d\W_]+/g, '');
  if (COMUNES.has(base) || /^(.)\1+$/.test(s) || new Set(bajo).size < 4) return 'Esa contraseña es demasiado común. Elegí una menos obvia.';
  const local = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (local.length >= 4 && bajo.includes(local)) return 'La contraseña no puede contener tu email.';
  const nom = String(nombre).toLowerCase().replace(/[^a-záéíóúñ]/g, '');
  if (nom.length >= 4 && bajo.includes(nom)) return 'La contraseña no puede contener tu nombre.';
  return '';
}
