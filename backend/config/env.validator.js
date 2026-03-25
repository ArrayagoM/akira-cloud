// config/env.validator.js
// Valida las variables de entorno al arrancar el servidor.
'use strict';

const REQUERIDAS = [
  { nombre: 'MONGO_URI',       desc: 'Cadena de conexión a MongoDB' },
  { nombre: 'JWT_SECRET',      desc: 'Clave secreta para firmar JWT' },
  { nombre: 'ENCRYPTION_KEY',  desc: 'Clave de cifrado AES-256 (mín. 16 chars)' },
];

const RECOMENDADAS = [
  'FRONTEND_URL',
  'NODE_ENV',
  'PORT',
];

function validarEnv() {
  const errores  = [];
  const warnings = [];

  // ── Variables requeridas ────────────────────────────────────
  for (const { nombre, desc } of REQUERIDAS) {
    if (!process.env[nombre]) {
      errores.push(`  ❌ ${nombre} — ${desc}`);
    }
  }

  // ── Longitudes mínimas ──────────────────────────────────────
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 16) {
    errores.push('  ❌ ENCRYPTION_KEY debe tener al menos 16 caracteres');
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push('  ⚠️  JWT_SECRET debería tener al menos 32 caracteres');
  }

  // ── Variables recomendadas ──────────────────────────────────
  const faltantesOpc = RECOMENDADAS.filter(v => !process.env[v]);
  if (faltantesOpc.length) {
    warnings.push(`  ⚠️  Variables opcionales no configuradas: ${faltantesOpc.join(', ')}`);
  }

  // ── Resultado ───────────────────────────────────────────────
  if (warnings.length) {
    console.warn('[ENV] Advertencias de configuración:');
    warnings.forEach(w => console.warn(w));
  }

  if (errores.length) {
    console.error('[ENV] ❌ Variables de entorno faltantes o inválidas:');
    errores.forEach(e => console.error(e));
    console.error('[ENV] Copiá .env.example a .env y completá los valores requeridos.');
    process.exit(1);
  }

  console.log('[ENV] ✅ Variables de entorno validadas correctamente');
}

module.exports = validarEnv;
