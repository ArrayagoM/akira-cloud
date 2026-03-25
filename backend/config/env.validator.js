// config/env.validator.js
// Valida las variables de entorno al arrancar el servidor.
'use strict';

const REQUERIDAS = [
  { nombre: 'MONGO_URI',       desc: 'Cadena de conexión a MongoDB' },
  { nombre: 'JWT_SECRET',      desc: 'Clave secreta para firmar JWT' },
  { nombre: 'ENCRYPTION_KEY',  desc: 'Clave de cifrado AES-256 (mín. 16 chars)' },
];

const RECOMENDADAS = [
  { nombre: 'FRONTEND_URL',              desc: 'URL del frontend (necesaria para CORS y OAuth)' },
  { nombre: 'BACKEND_URL',               desc: 'URL pública del backend (necesaria para webhooks de MercadoPago)' },
  { nombre: 'MP_PLATFORM_ACCESS_TOKEN',  desc: 'Access Token de MercadoPago (necesario para suscripciones)' },
  { nombre: 'NODE_ENV',                  desc: 'Entorno de ejecución (development / production)' },
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

  // ── Variables con valores de ejemplo ────────────────────────
  if (process.env.JWT_SECRET?.startsWith('cambia_esto')) {
    errores.push('  ❌ JWT_SECRET tiene el valor de ejemplo — cambialo por una clave aleatoria');
  }
  if (process.env.ENCRYPTION_KEY?.startsWith('cambia_esto')) {
    errores.push('  ❌ ENCRYPTION_KEY tiene el valor de ejemplo — cambiala por una clave aleatoria');
  }

  // ── Variables recomendadas ──────────────────────────────────
  const faltantesOpc = RECOMENDADAS.filter(({ nombre }) => !process.env[nombre]);
  if (faltantesOpc.length) {
    faltantesOpc.forEach(({ nombre, desc }) => warnings.push(`  ⚠️  ${nombre} no configurado — ${desc}`));
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
