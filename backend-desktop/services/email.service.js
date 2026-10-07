'use strict';

const nodemailer = require('nodemailer');
const logger = require('../config/logger');

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
async function enviarEmail({ to, subject, html, meta = {} }) {
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
  return enviarEmail({
    to: email,
    subject: 'Recuperá tu contraseña — Akira Cloud',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
        <div style="background:#00e87b;padding:24px;text-align:center">
          <h1 style="margin:0;color:#000;font-size:22px">🤖 Akira Cloud</h1>
        </div>
        <div style="padding:32px">
          <h2 style="margin:0 0 8px;color:#fff;font-size:18px">Hola, ${nombre}</h2>
          <p style="color:#aaa;margin:0 0 24px">Recibimos una solicitud para recuperar tu contraseña. Hacé clic en el botón para crear una nueva:</p>
          <a href="${resetUrl}" style="display:inline-block;background:#00e87b;color:#000;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px">
            Recuperar contraseña
          </a>
          <p style="color:#666;font-size:12px;margin:24px 0 0">Este link expira en <strong style="color:#aaa">1 hora</strong>. Si no solicitaste esto, ignorá este email.</p>
          <p style="color:#444;font-size:11px;margin:8px 0 0">O copiá este link: <span style="color:#00e87b">${resetUrl}</span></p>
        </div>
      </div>
    `,
  });
}

async function enviarAlertaError(mensaje) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  return enviarEmail({
    to: adminEmail,
    subject: '🚨 Akira Cloud — Error crítico',
    html: `<div style="font-family:sans-serif;padding:20px;background:#0a0a0a;color:#e5e5e5;border:1px solid #f43f5e;border-radius:8px"><h2 style="color:#f43f5e">Error crítico detectado</h2><pre style="background:#111;padding:12px;border-radius:4px;color:#fca5a5;font-size:12px;overflow:auto">${mensaje}</pre><p style="color:#666;font-size:11px">${new Date().toISOString()}</p></div>`,
  });
}

module.exports = { ultimoErrorEmail: () => ultimoError, enviarEmail, enviarRecuperoPassword, enviarAlertaError };
