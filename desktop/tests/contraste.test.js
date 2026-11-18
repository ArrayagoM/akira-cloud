// tests/contraste.test.js — el color de texto atenuado (--muted) cumple WCAG AA (4.5:1) sobre los fondos oscuros (frontend/src/index.css)
'use strict';
const fs = require('fs');
const path = require('path');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'index.css'), 'utf8');
const variable = (n) => { const m = new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(css); if (!m) throw new Error('FAIL: no encontré --' + n); return m[1]; };
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

console.log('\n[contraste] Tests:');
const muted = variable('muted');
for (const f of ['bg', 'surface', 'surface2', 'surface3']) {
  const r = ratio(muted, variable(f));
  assert(r >= 4.5, `--muted (${muted}) sobre --${f} (${variable(f)}): ${r.toFixed(2)}:1 (mínimo AA 4.5:1)`);
}
assert(ratio(variable('text2'), variable('surface3')) > ratio(muted, variable('surface3')), '--text2 sigue siendo más claro que --muted (se mantiene la jerarquía)');
assert(muted.toLowerCase() !== '#4a6278', 'ya no es el color anterior (#4a6278, 2.4:1 a 3.1:1)');
console.log('✅ contraste: OK');
