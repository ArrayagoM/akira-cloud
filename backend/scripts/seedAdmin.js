// scripts/seedAdmin.js — Crear o promover admin inicial
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

async function seed() {
  if (!process.env.MONGO_URI) {
    console.error('\x1b[31m❌ MONGO_URI no configurado en .env\x1b[0m');
    process.exit(1);
  }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.error('\x1b[31m❌ ADMIN_EMAIL o ADMIN_PASSWORD no configurados en .env\x1b[0m');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('\x1b[32m✅ MongoDB conectado\x1b[0m');

  // Importar el modelo DESPUÉS de conectar
  const User = require('../models/User');

  const email    = process.env.ADMIN_EMAIL.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const nombre   = process.env.ADMIN_NOMBRE || 'Admin';

  const existe = await User.findOne({ email });

  if (existe) {
    // Promover a admin si ya existe
    existe.rol    = 'admin';
    existe.plan   = 'admin';
    existe.status = 'activo';
    if (password && !process.env.SKIP_PASSWORD_UPDATE) {
      existe.password = password; // se hashea en el pre-save hook
    }
    await existe.save();
    console.log(`\x1b[33m⚡ Usuario existente promovido a admin: ${email}\x1b[0m`);
  } else {
    // Crear nuevo admin
    await User.create({
      nombre,
      apellido:      '',
      email,
      password,
      auth_provider: 'local',
      rol:           'admin',
      plan:          'admin',
      status:        'activo',
    });
    console.log(`\x1b[32m✅ Admin creado: ${email}\x1b[0m`);
  }

  console.log(`\x1b[36m📧 Email: ${email}\x1b[0m`);
  console.log(`\x1b[36m🔑 Password: ${password}\x1b[0m`);
  console.log(`\x1b[36m👑 Rol: admin (acceso ilimitado)\x1b[0m`);

  await mongoose.disconnect();
  console.log('\x1b[32m✅ Listo. Reiniciá el servidor.\x1b[0m');
}

seed().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
