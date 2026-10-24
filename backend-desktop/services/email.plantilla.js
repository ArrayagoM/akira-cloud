// services/email.plantilla.js
// Una sola plantilla para TODOS los emails de Akira (recuperar contraseña, alertas del bot y novedades): mismo marco, logo,
// tipografía y botones. Sin emojis, con tablas (así se ve igual en Gmail, Outlook y el celular) y con texto alternativo.
// Los datos que vienen de afuera (nombre, equipo, etc.) siempre se pasan por escapar().
'use strict';

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const front = () => (process.env.FRONTEND_URL || 'https://akiracloud.lat').replace(/\/+$/, '');
const FUENTE = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Enlace al instalador con la marca del origen (para el contador de descargas del panel).
const enlaceDescarga = (origen = 'email') => `${front()}/api/desktop/download?r=${encodeURIComponent(origen)}`;

// Tamaño del instalador: sale de la misma variable que usa la web (DESKTOP_SIZE_MB); si no está cargada, no se muestra un número inventado.
const tamanoInstalador = () => { const n = parseInt(process.env.DESKTOP_SIZE_MB, 10); return n > 0 ? `${n} MB` : ''; };

// pie: texto debajo de la línea (por ejemplo "Recibís este email porque…") + enlace de baja opcional.
function marco({ titulo, cuerpo, pie = '', enlaceBaja = '', ancho = 560 }) {
  const logo = `${front()}/logo-email.png`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:0;background:#050505">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050505"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${ancho}px;background:#0a0a0a;border:1px solid #1c1c1c;border-radius:12px;overflow:hidden;font-family:${FUENTE};color:#e5e5e5">
    <tr><td style="background:#00e87b;padding:18px 28px">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="vertical-align:middle;padding-right:12px"><img src="${logo}" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px"></td>
        <td style="vertical-align:middle;font-family:${FUENTE};font-size:19px;font-weight:700;color:#000;letter-spacing:-0.2px">Akira Cloud</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:30px 30px 10px;font-family:${FUENTE}">${cuerpo}</td></tr>
    <tr><td style="border-top:1px solid #1c1c1c;padding:16px 30px;text-align:center;font-family:${FUENTE}">
      <p style="margin:0;color:#6b6b6b;font-size:11.5px;line-height:1.65">${pie}${enlaceBaja ? `${pie ? '<br>' : ''}<a href="${enlaceBaja}" style="color:#8a8a8a">Dejar de recibir novedades</a>` : ''}</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const saludo = (nombre) => `<h2 style="margin:0 0 12px;color:#fff;font-size:20px;font-weight:600;line-height:1.3">Hola${nombre ? `, ${escapar(nombre)}` : ''}</h2>`;
const parrafo = (html, { color = '#b5b5b5', tam = 14.5, margen = '0 0 14px' } = {}) => `<p style="margin:${margen};color:${color};font-size:${tam}px;line-height:1.65">${html}</p>`;
const titulo2 = (texto) => `<h3 style="margin:30px 0 8px;color:#fff;font-size:15.5px;font-weight:600">${escapar(texto)}</h3>`;
const fuerte = (t) => `<strong style="color:#fff">${escapar(t)}</strong>`;

function boton(url, texto, nota = '') {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 6px"><tr><td align="center">
    <a href="${url}" style="display:inline-block;background:#00e87b;color:#000;font-weight:700;padding:14px 32px;border-radius:9px;text-decoration:none;font-size:15.5px;font-family:${FUENTE}">${escapar(texto)}</a>
    ${nota ? `<div style="color:#7a7a7a;font-size:12px;margin-top:10px;line-height:1.5">${nota}</div>` : ''}
  </td></tr></table>`;
}

// Recuadro con borde lateral (avisos, aclaraciones).
const aviso = (html, color = '#00e87b') => `<div style="margin:18px 0;padding:13px 16px;background:#111;border:1px solid #232323;border-left:3px solid ${color};border-radius:8px;color:#b5b5b5;font-size:13.5px;line-height:1.6">${html}</div>`;

// Etiqueta de estado arriba del saludo (alertas).
const etiqueta = (texto, color) => `<div style="display:inline-block;margin:0 0 16px;background:${color}22;border:1px solid ${color}66;color:${color};font-size:11.5px;font-weight:700;letter-spacing:.5px;padding:4px 10px;border-radius:999px">${escapar(texto)}</div>`;

// Lista de novedades: título + descripción, con una línea verde al costado.
function listaNovedades(items) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0">${items.map(([t, d]) => `
    <tr><td style="padding:10px 0 10px 14px;border-left:2px solid #00e87b">
      <div style="color:#fff;font-size:14.5px;font-weight:600">${escapar(t)}</div>
      <div style="color:#9a9a9a;font-size:13.5px;margin-top:3px;line-height:1.55">${escapar(d)}</div>
    </td></tr><tr><td style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>`).join('')}</table>`;
}

// Pasos numerados.
function pasos(items) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0">${items.map(([t, d], i) => `
    <tr><td style="padding:7px 0;width:34px;vertical-align:top"><div style="width:24px;height:24px;border-radius:50%;background:#0f2a1c;color:#00e87b;font-weight:700;font-size:13px;text-align:center;line-height:24px">${i + 1}</div></td>
    <td style="padding:7px 0;vertical-align:top"><div style="color:#fff;font-size:14.5px;font-weight:600">${t}</div><div style="color:#9a9a9a;font-size:13.5px;margin-top:2px;line-height:1.55">${d}</div></td></tr>`).join('')}</table>`;
}

// Versión en texto plano del HTML (los clientes de correo y los filtros de spam la valoran; sirve cuando no se muestran imágenes ni estilos).
function aTexto(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => { const txt = t.replace(/<[^>]+>/g, '').trim(); return h.startsWith('#') || txt === h ? txt : `${txt} (${h})`; })
    .replace(/<\/(p|div|h[1-6]|tr|table)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { escapar, front, marco, saludo, parrafo, titulo2, fuerte, boton, aviso, etiqueta, listaNovedades, pasos, aTexto, enlaceDescarga, tamanoInstalador };
