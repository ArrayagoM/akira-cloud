// scripts/enviar-novedades.js — envía el email de novedades (instalador +
// próximas actualizaciones). Se corre a mano, NO es una ruta pública.
//
//   node scripts/enviar-novedades.js --preview        genera vista-previa-novedades.html
//   node scripts/enviar-novedades.js --prueba         envía SOLO a ADMIN_EMAIL
//   node scripts/enviar-novedades.js --todos          envía a todos los usuarios activos
//   (agregar --lista para solo mostrar a cuántos y quiénes iría, sin enviar)
//
// Necesita en el entorno (o en backend-desktop/.env): MONGO_URI, JWT_SECRET,
// FRONTEND_URL, ADMIN_EMAIL y SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS (/ SMTP_FROM).
// Respeta la baja de cada usuario (novedadesActivas) y no repite envíos:
// guarda la fecha en user.novedadesEnviadas['instalador'].
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const { enviarEmail } = require('../services/email.service');
const { htmlNovedades, asuntoNovedades } = require('../services/email.novedades');

const arg = (n) => process.argv.includes(n);
const CAMPAÑA = 'instalador-1.0.0';
const PAUSA_MS = 1200; // ritmo suave: evita que el proveedor SMTP marque spam

(async () => {
  const version = process.env.DESKTOP_VERSION || '1.0.0';

  if (arg('--preview')) {
    const out = path.join(__dirname, '..', 'vista-previa-novedades.html');
    fs.writeFileSync(out, htmlNovedades({ nombre: 'Juan', userId: '000000000000000000000000', version }));
    console.log('Vista previa en', out);
    return;
  }
  if (!arg('--prueba') && !arg('--todos')) {
    console.log('Usá --preview, --prueba o --todos (ver encabezado del archivo).');
    process.exit(1);
  }
  if (!process.env.SMTP_HOST && !arg('--lista')) {
    console.error('Falta SMTP_HOST/SMTP_USER/SMTP_PASS: sin servidor de correo no se puede enviar.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  let destinatarios;
  if (arg('--prueba')) {
    const admin = await User.findOne({ email: String(process.env.ADMIN_EMAIL || '').toLowerCase() }).lean();
    if (!admin) throw new Error('No encontré ADMIN_EMAIL entre los usuarios');
    destinatarios = [admin];
  } else {
    destinatarios = await User.find({
      status: 'activo',
      novedadesActivas: { $ne: false },
      [`novedadesEnviadas.${CAMPAÑA}`]: { $exists: false },
    }).lean();
  }

  console.log(`${destinatarios.length} destinatario(s).`);
  if (arg('--lista')) { destinatarios.forEach((u) => console.log(' -', u.email)); return; }

  let ok = 0, fallos = 0;
  for (const u of destinatarios) {
    const enviado = await enviarEmail({
      to: u.email,
      subject: asuntoNovedades(),
      html: htmlNovedades({ nombre: (u.nombre || '').split(' ')[0], userId: u._id, version }),
    });
    if (enviado) {
      ok++;
      if (arg('--todos')) await User.updateOne({ _id: u._id }, { $set: { [`novedadesEnviadas.${CAMPAÑA}`]: new Date() } });
    } else fallos++;
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }
  console.log(`Enviados: ${ok} · Fallidos: ${fallos}`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); }).finally(() => mongoose.disconnect());
