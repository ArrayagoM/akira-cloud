// scripts/limpiarSesiones.js
// Limpia carpetas de sesión corruptas (chromium_data y wwebjs que causan conflicto)
'use strict';

const fs   = require('fs');
const path = require('path');

const SESSIONS_PATH = process.env.WA_SESSIONS_PATH || './sessions';

if (!fs.existsSync(SESSIONS_PATH)) {
  console.log('No hay carpeta de sesiones. OK');
  process.exit(0);
}

const usuarios = fs.readdirSync(SESSIONS_PATH).filter(f =>
  fs.statSync(path.join(SESSIONS_PATH, f)).isDirectory() && !f.startsWith('.')
);

console.log(`Usuarios encontrados: ${usuarios.length}`);

for (const uid of usuarios) {
  const base = path.join(SESSIONS_PATH, uid);

  // Eliminar carpeta chromium_data (causa el error de userDataDir)
  const chromiumData = path.join(base, 'chromium_data');
  if (fs.existsSync(chromiumData)) {
    fs.rmSync(chromiumData, { recursive: true, force: true });
    console.log(`✅ Eliminado chromium_data de ${uid}`);
  }

  // Eliminar wwebjs_auth antiguo (versión incompatible)
  const waAuth = path.join(base, 'wa_auth');
  if (fs.existsSync(waAuth)) {
    // Solo eliminar si hay sesión corrupta (carpeta vacía o con estructura vieja)
    const contenido = fs.readdirSync(waAuth);
    if (contenido.length === 0) {
      fs.rmSync(waAuth, { recursive: true, force: true });
      console.log(`✅ Eliminado wa_auth vacío de ${uid}`);
    } else {
      console.log(`⏭️  wa_auth de ${uid} tiene contenido — conservado`);
    }
  }
}

console.log('\n✅ Limpieza completada. Reiniciá el backend.');
