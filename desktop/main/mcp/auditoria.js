// main/mcp/auditoria.js
// Registro de todo lo que hace un asistente conectado por MCP: cuándo, con qué conexión, qué herramienta y si funcionó.
// Se guardan los pedidos (con valores recortados), NUNCA las llaves ni los datos que se devolvieron.
// El archivo se rota al pasar 1 MB, así que no crece sin límite.
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 1024 * 1024;
const archivo = (dir) => path.join(dir, 'mcp-auditoria.jsonl');
const corto = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120);

// Deja solo claves simples con valores cortos: no se guarda nada anidado ni largo.
function resumirArgs(args) {
  const o = {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) return o;
  for (const [k, v] of Object.entries(args).slice(0, 8)) o[corto(k).slice(0, 30)] = typeof v === 'object' && v !== null ? '[objeto]' : corto(v);
  return o;
}

function crearAuditoria({ userDataDir, ahora = () => new Date() }) {
  function registrar({ conexion, herramienta, args, ok, error, ms }) {
    try {
      const p = archivo(userDataDir);
      fs.mkdirSync(userDataDir, { recursive: true });
      try { if (fs.statSync(p).size > MAX_BYTES) fs.renameSync(p, `${p}.1`); } catch { /* todavía no existe */ }
      fs.appendFileSync(p, JSON.stringify({ t: ahora().toISOString(), conexion: corto(conexion), herramienta: corto(herramienta), args: resumirArgs(args), ok: ok === true, error: ok ? undefined : corto(error), ms: Math.round(ms || 0) }) + '\n');
    } catch { /* la auditoría nunca debe romper un pedido */ }
  }
  function ultimos(n = 30) {
    try {
      return fs.readFileSync(archivo(userDataDir), 'utf8').trim().split('\n').filter(Boolean).slice(-n).reverse().map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  }
  return { registrar, ultimos };
}

module.exports = { crearAuditoria, resumirArgs };
