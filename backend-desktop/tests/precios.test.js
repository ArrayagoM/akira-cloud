// tests/precios.test.js — los precios que se ven (landing, planes, documentación, blog, buscadores, IA) son los mismos que se cobran.
// Fuente única: lib/cobro.js. Si alguien cambia un precio en un solo lugar, esta prueba avisa antes de que un cliente vea un número
// y pague otro.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../lib/cobro');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const FRONT = path.join(__dirname, '..', '..', 'frontend');
const leer = (r) => fs.readFileSync(path.join(FRONT, r), 'utf8');
const ar = (n) => n.toLocaleString('es-AR');               // 21.000
const P = C.armarPlanes();

console.log('\n[precios coherentes] Tests:');

// Planes (pantalla de planes de la web y de la app instalada)
const planes = leer('src/pages/PlanesPage.jsx');
const mens = [...planes.matchAll(/key:\s*'(\w+)',\s*nombre:[^\n]*\n\s*mensual:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);
assert(mens.length === 3 && mens.every(([k, v]) => P[`${k}_mensual`].precio === v), `PlanesPage: los 3 precios mensuales coinciden con lo que cobra el servidor (${mens.map(([k, v]) => `${k} $${ar(v)}`).join(', ')})`);
assert(/const DESCUENTO = 0\.20;/.test(planes), 'PlanesPage: el descuento anual es 20 %, igual que en el servidor');
assert(/api\.get\('\/subscriptions\/planes'\)/.test(planes), 'PlanesPage: toma los precios del servidor (la app instalada muestra lo que realmente se cobra)');

// Landing
const landing = leer('src/pages/Landing.jsx');
const lp = [...landing.matchAll(/nombre:\s*'(Básico|Pro|Agencia)',\s*mensual:\s*(\d+),\s*anual:\s*(\d+)/g)].map((m) => [m[1].toLowerCase().replace('á', 'a'), Number(m[2]), Number(m[3])]);
assert(lp.length === 3 && lp.every(([k, m, a]) => P[`${k}_mensual`].precio === m && P[`${k}_anual`].precio === a), `Landing: mensual y anual de los 3 planes coinciden con el servidor (${lp.map(([k, m, a]) => `${k} ${ar(m)} / ${ar(a)}`).join(' · ')})`);

// Textos fijos (buscadores, asistentes de IA, documentación, blog, preguntas frecuentes)
const archivos = ['index.html', 'public/llms.txt', 'public/llms-full.txt', 'src/pages/Documentacion.jsx', 'src/pages/Blog.jsx', 'src/pages/Peluquerias.jsx'];
const viejos = Object.values(C.PRECIOS_ANTERIORES).map(ar);
for (const f of archivos) {
  const t = leer(f);
  const quedan = viejos.filter((v) => new RegExp(`(?<![\\d.])\\$?${v.replace('.', '\\.')}(?![\\d])`).test(t));
  assert(quedan.length === 0, `${f}: no quedan precios viejos (${viejos.join(', ')})`);
}
const idx = leer('index.html');
for (const k of ['basico', 'pro', 'agencia']) {
  const n = P[`${k}_mensual`].precio;
  assert(idx.includes(`"price": "${n}"`) && idx.includes(`$${ar(n)}`), `index.html (datos para buscadores y preguntas frecuentes): precio mensual ${k} $${ar(n)}`);
}
const full = leer('public/llms-full.txt');
for (const k of ['basico', 'pro', 'agencia']) assert(full.includes(`$${ar(P[`${k}_mensual`].precio)} / mes ($${ar(P[`${k}_anual`].precio)} / año)`), `llms-full.txt: ${k} mensual y anual`);
const llms = leer('public/llms.txt');
assert(['basico', 'pro', 'agencia'].every((k) => llms.includes(`$${ar(P[`${k}_mensual`].precio)}`)), 'llms.txt: precios mensuales nuevos');
const doc = leer('src/pages/Documentacion.jsx');
assert(['basico', 'pro', 'agencia'].every((k) => doc.includes(`$${ar(P[`${k}_mensual`].precio)}/mes`)), 'Documentación: tabla de planes con los precios nuevos');
assert(/20\s*%/.test(doc) && /20\s*%/.test(leer('public/llms.txt')), 'Documentación y llms.txt hablan del 20 % de descuento anual, que es el real');

// el "20 % de descuento" es verdad sobre los precios nuevos
for (const k of ['basico', 'pro', 'agencia']) {
  const m = P[`${k}_mensual`].precio; const a = P[`${k}_anual`].precio; const real = 1 - a / (m * 12);
  assert(Math.abs(real - 0.20) < 0.0001, `${k}: pagar el año cuesta ${(real * 100).toFixed(1)} % menos que 12 meses sueltos ($${ar(m * 12)} → $${ar(a)})`);
}
console.log('\n✅ Todos los tests de precios coherentes pasaron.\n');
