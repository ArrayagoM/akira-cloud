// scripts/seedAdmin.js
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../models/User');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB conectado');

  const email = process.env.ADMIN_EMAIL || 'admin@akiracloud.com';
  const existe = await User.findOne({ email });

  if (existe) {
    console.log(`⚠️  Admin ya existe: ${email}`);
    await mongoose.disconnect();
    return;
  }

  await User.create({
    nombre:        process.env.ADMIN_NOMBRE || 'Admin',
    apellido:      '',
    email,
    password:      process.env.ADMIN_PASSWORD || 'Admin1234!',
    auth_provider: 'local',
    rol:           'admin',
    status:        'activo',
    plan:          'agencia',
  });

  console.log(`\x1b[32m✅ Admin creado: ${email}\x1b[0m`);
  await mongoose.disconnect();
}

seed().catch(e => { console.error('❌', e.message); process.exit(1); });
