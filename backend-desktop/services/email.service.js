'use strict';

const nodemailer = require('nodemailer');
const logger = require('../config/logger');
const P = require('./email.plantilla');

function crearTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT) || 587,
    secure: parseInt(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

let ultimoError = null;

// Deja constancia del envío en el panel de admin. Nunca rompe el envío si falla.
async function registrar(meta, { to, subject, ok, error }) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return;
    await require('../models/EmailLog').create({
      para: String(to), asunto: subject, tipo: meta.tipo || 'sistema', campana: meta.campana || '',
      userId: meta.userId || null, estado: ok ? 'enviado' : 'fallido', error: ok ? '' : String(error || '').slice(0, 300),
    });
  } catch (e) { logger.warn('[Email] no se pudo registrar el envío: ' + e.message); }
}

// meta (opcional): { tipo: 'campana'|'prueba'|'sistema', campana, userId } para el registro del panel.
// text (opcional): versión en texto plano; si no se pasa, se arma a partir del HTML. headers (opcional): por ejemplo List-Unsubscribe.
async function enviarEmail({ to, subject, html, text, headers, meta = {} }) {
  const transporter = crearTransporter();
  if (!transporter) {
    logger.warn(`[Email] SMTP no configurado. Email a ${to} no enviado. Asunto: ${subject}`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text: text || P.aTexto(html),
      ...(headers ? { headers } : {}),
    });
    logger.info(`[Email] ✅ Email enviado a ${to}`);
    await registrar(meta, { to, subject, ok: true });
    return true;
  } catch (err) {
    ultimoError = err.message;
    logger.error(`[Email] ❌ Error enviando a ${to}: ${err.message}`);
    await registrar(meta, { to, subject, ok: false, error: err.message });
    return false;
  }
}

async function enviarRecuperoPassword(email, nombre, resetUrl) {
  const html = P.marco({
    titulo: 'Recuperá tu contraseña',
    pie: 'Recibís este email porque alguien pidió recuperar la contraseña de esta cuenta de Akira Cloud.',
    cuerpo: `
      ${P.saludo((nombre || '').split(' ')[0])}
      ${P.parrafo('Recibimos una solicitud para recuperar tu contraseña. Tocá el botón para crear una nueva.')}
      ${P.boton(resetUrl, 'Crear una contraseña nueva')}
      ${P.parrafo(`El enlace vence en ${P.fuerte('1 hora')}. Si no lo pediste vos, ignorá este email: tu contraseña actual no cambia.`, { color: '#8a8a8a', tam: 13 })}
      ${P.parrafo(`Si el botón no funciona, copiá este enlace en tu navegador:<br><span style="color:#00e87b;word-break:break-all">${P.escapar(resetUrl)}</span>`, { color: '#6b6b6b', tam: 12, margen: '0 0 18px' })}`,
  });
  return enviarEmail({ to: email, subject: 'Recuperá tu contraseña de Akira Cloud', html, meta: { tipo: 'sistema' } });
}

async function enviarCodigoVerificacion(email, nombre, codigo) {
  const html = P.marco({
    titulo: 'Confirmá tu email',
    pie: 'Recibís este email porque alguien usó esta dirección para crear una cuenta en Akira Cloud. Si no fuiste vos, ignoralo: no se activa nada.',
    cuerpo: `
      ${P.saludo((nombre || '').split(' ')[0])}
      ${P.parrafo('Para activar tu cuenta, escribí este código en la pantalla de Akira Cloud:')}
      <div style="margin:18px 0;text-align:center"><span style="display:inline-block;background:#111;border:1px solid #00e87b66;border-radius:12px;padding:16px 28px;font-size:34px;letter-spacing:10px;font-weight:700;color:#00e87b;font-family:Consolas,Menlo,monospace">${P.escapar(codigo)}</span></div>
      ${P.parrafo(`El código vence en ${P.fuerte('15 minutos')}. No se lo compartas a nadie: Akira nunca te lo va a pedir por WhatsApp ni por teléfono.`, { color: '#8a8a8a', tam: 13 })}`,
  });
  return enviarEmail({ to: email, subject: 'Confirmá tu email en Akira Cloud', html, meta: { tipo: 'sistema' } });
}

async function enviarAlertaError(mensaje) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  const html = P.marco({
    titulo: 'Error crítico', ancho: 620, pie: 'Aviso automático para el administrador de Akira Cloud.',
    cuerpo: `${P.etiqueta('ERROR CRÍTICO', '#f43f5e')}
      ${P.parrafo('Se detectó un error crítico en el servidor:', { color: '#ddd' })}
      <pre style="margin:0 0 14px;padding:12px;background:#111;border:1px solid #232323;border-radius:6px;color:#fca5a5;font-size:12px;white-space:pre-wrap;word-break:break-word">${P.escapar(mensaje)}</pre>
      ${P.parrafo(P.escapar(new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })), { color: '#6b6b6b', tam: 12 })}`,
  });
  return enviarEmail({ to: adminEmail, subject: 'Akira Cloud: error crítico', html, meta: { tipo: 'sistema' } });
}

module.exports = { ultimoErrorEmail: () => ultimoError, enviarEmail, enviarRecuperoPassword, enviarCodigoVerificacion, enviarAlertaError };
