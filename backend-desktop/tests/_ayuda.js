// tests/_ayuda.js — piezas comunes de las pruebas de rutas (no es una prueba: no está en la cadena de `npm test`).
// Se arma la app de Express de verdad con modelos de mentira inyectados en la caché de módulos: nada toca una base ni un servicio real.
'use strict';
const path = require('path');
const Module = require('module');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

// Reemplaza un módulo del proyecto (ruta relativa a backend-desktop/) por uno de mentira. Hay que llamarlo ANTES de requerir lo que lo usa.
function inyectar(rel, exportado) {
  const f = path.join(__dirname, '..', rel);
  Module._cache[f] = { id: f, filename: f, loaded: true, exports: exportado, children: [], paths: [] };
}

// Registro de lo que se loguea (para comprobar que no salen secretos al log y que el detalle sí queda).
function logCapturado() {
  const lineas = [];
  const f = (nivel) => (...a) => lineas.push(`[${nivel}] ` + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  return { info: f('info'), warn: f('warn'), error: f('error'), http: f('http'), debug: f('debug'), lineas };
}

// Modelo Limite de mentira (misma interfaz que usa lib/limite.js). { falla: true } simula la base caída.
function limiteFalso({ falla = false } = {}) {
  const mapa = new Map();
  const m = {
    mapa, falla,
    async findOneAndUpdate(filtro, upd, op = {}) {
      if (m.falla) throw new Error('base caída (simulada)');
      const f = mapa.get(filtro._id);
      if (filtro.expira && !(f && f.expira > filtro.expira.$gt)) return null;
      if (!f && !op.upsert) return null;
      const n = f ? { ...f } : { _id: filtro._id, n: 0 };
      if (upd.$inc) n.n += upd.$inc.n;
      if (upd.$set) Object.assign(n, upd.$set);
      mapa.set(filtro._id, n);
      return n;
    },
  };
  return m;
}

// Sirve un router en un puerto libre. `antes` son middlewares previos (por ejemplo para fijar req.ip). → { llamar, cerrar }
async function servir(montaje, router, { antes = [], json = true } = {}) {
  const app = express();
  for (const a of antes) app.use(a);
  if (json) app.use(express.json());
  app.use(montaje, router);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}${montaje}`;
  const llamar = async (ruta, { metodo = 'GET', cuerpo, headers = {} } = {}) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...headers }, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
    const texto = await r.text();
    let j = null; try { j = JSON.parse(texto); } catch { /* sin JSON */ }
    return { status: r.status, body: j, texto };
  };
  return { llamar, cerrar: () => new Promise((r) => server.close(r)) };
}

// Fija req.ip desde la cabecera x-test-ip (en producción lo hace app.js con la cabecera de Vercel).
const fijarIp = (req, _res, next) => { Object.defineProperty(req, 'ip', { value: req.headers['x-test-ip'] || '9.9.9.9', configurable: true }); next(); };

// Query de Mongoose de mentira: encadena select/sort/skip/limit/populate/lean y se resuelve con `valor` (o rechaza con `error`).
function consulta(valor, { error = null, registro = null } = {}) {
  const q = {};
  for (const k of ['select', 'sort', 'skip', 'limit', 'populate', 'lean']) q[k] = (...a) => { if (registro) registro[k] = a; return q; };
  q.then = (ok, ko) => (error ? Promise.reject(error) : Promise.resolve(valor)).then(ok, ko);
  q.catch = (ko) => q.then(undefined, ko);
  return q;
}

module.exports = { assert, inyectar, logCapturado, limiteFalso, servir, fijarIp, consulta };
