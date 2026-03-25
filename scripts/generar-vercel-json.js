#!/usr/bin/env node
// scripts/generar-vercel-json.js
// Genera frontend/vercel.json con la URL del backend correcta.
// Uso: BACKEND_URL=https://mi-backend.onrender.com node scripts/generar-vercel-json.js
'use strict';

const fs   = require('fs');
const path = require('path');

const backendUrl = process.env.BACKEND_URL;
if (!backendUrl) {
  console.error('❌ Falta la variable de entorno BACKEND_URL');
  console.error('   Ejemplo: BACKEND_URL=https://mi-app.onrender.com node scripts/generar-vercel-json.js');
  process.exit(1);
}

// Eliminar barra final si existe
const url = backendUrl.replace(/\/$/, '');

const config = {
  buildCommand:    'npm run build',
  outputDirectory: 'dist',
  framework:       'vite',
  rewrites: [
    { source: '/api/:path*',      destination: `${url}/api/:path*` },
    { source: '/socket.io/:path*', destination: `${url}/socket.io/:path*` },
    { source: '/((?!api|socket.io).*)', destination: '/index.html' },
  ],
  headers: [
    {
      source: '/assets/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options',        value: 'DENY' },
      ],
    },
  ],
};

const destino = path.resolve(__dirname, '..', 'frontend', 'vercel.json');
fs.writeFileSync(destino, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log(`✅ frontend/vercel.json generado con BACKEND_URL=${url}`);
