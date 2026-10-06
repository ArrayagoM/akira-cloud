// scripts/limpiar-wa-auth.js — borra de Atlas las sesiones de WhatsApp que el
// servidor viejo guardaba (colección wa_auth). Ya no se usan: la sesión de
// cada cliente vive en su PC. Es IRREVERSIBLE: los usuarios del servidor
// viejo tendrán que escanear un QR nuevo en la app de escritorio.
//
//   node scripts/limpiar-wa-auth.js              solo cuenta, no borra
//   node scripts/limpiar-wa-auth.js --confirmar  borra
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const col = mongoose.connection.db.collection('wa_auth');
  const n = await col.countDocuments();
  console.log(`wa_auth: ${n} documento(s).`);
  if (process.argv.includes('--confirmar')) {
    const r = await col.deleteMany({});
    console.log(`Borrados: ${r.deletedCount}`);
  } else {
    console.log('No se borró nada. Agregá --confirmar para borrar.');
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); }).finally(() => mongoose.disconnect());
