// tests/descargas.test.js — el contador de descargas: qué se cuenta, qué no y cómo se resume.
'use strict';
const D = require('../lib/descargas');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const ahora = new Date('2026-10-14T15:00:00Z');

console.log('\n[descargas] Tests:');

const NAV = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
assert(!D.esRobot(NAV, 'GET'), 'un navegador normal cuenta');
assert(D.esRobot(NAV, 'HEAD'), 'un pedido HEAD (no baja el archivo) no cuenta');
assert(D.esRobot('', 'GET') && D.esRobot(undefined, 'GET'), 'sin navegador informado no cuenta');
for (const ua of ['Googlebot/2.1', 'WhatsApp/2.23', 'facebookexternalhit/1.1', 'curl/8.0', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'Slackbot-LinkExpanding', 'python-requests/2.31', 'UptimeRobot/2.0', 'TelegramBot'])
  assert(D.esRobot(ua, 'GET'), `no cuenta: ${ua}`);

assert(D.limpiarOrigen('TikTok') === 'tiktok' && D.limpiarOrigen('email-d') === 'email-d', 'el origen se normaliza');
assert(D.limpiarOrigen('<script>alert(1)</script>') === 'scriptalert1script', 'el origen no deja pasar símbolos');
assert(D.limpiarOrigen('a'.repeat(100)).length === 30 && D.limpiarOrigen('') === 'directo' && D.limpiarOrigen(undefined) === 'directo' && D.limpiarOrigen('!!!') === 'directo', 'origen largo, vacío o inválido');

const h1 = D.huella('1.2.3.4', NAV, 'k'); const h2 = D.huella('1.2.3.4', NAV, 'k'); const h3 = D.huella('1.2.3.5', NAV, 'k');
assert(h1 === h2 && h1 !== h3 && h1.length === 16 && !h1.includes('1.2.3.4'), 'misma persona = misma huella; otra IP = otra huella; la IP no se puede leer');
assert(D.huella('1.2.3.4', NAV, 'k') !== D.huella('1.2.3.4', NAV, 'otra'), 'la huella depende de la clave del servidor');

const d = (plataforma, visitante, fecha, origen = 'web') => ({ plataforma, visitante, fecha, origen });
const lista = [
  d('windows', 'a', '2026-10-14T12:00:00Z'), d('windows', 'a', '2026-10-14T13:00:00Z', 'email'), d('windows', 'b', '2026-10-13T12:00:00Z', 'tiktok'),
  d('android', 'c', '2026-10-10T12:00:00Z'), d('mac-arm64', 'd', '2026-09-30T12:00:00Z'), d('windows', 'z', '2026-06-01T12:00:00Z'),
];
const v = D.resumir({ descargas: lista, ahora, dias: 30, embudo: { usuarios: 15, usuariosConEquipo: 2, equipos: 2 } });
assert(v.total === 5 && v.historico === 6, 'en 30 días hay 5 descargas; la de junio queda fuera del período pero cuenta en el histórico');
assert(v.unicas === 4, 'personas distintas por plataforma: a(win), b(win), c(android), d(mac) = 4');
assert(v.hoy === 2, 'hoy: 2 descargas');
assert(v.porPlataforma.find((p) => p.plataforma === 'windows').total === 3 && v.porPlataforma.find((p) => p.plataforma === 'windows').unicos === 2, 'Windows: 3 descargas de 2 personas');
assert(v.porOrigen[0].origen === 'web' && v.porOrigen[0].total === 3 && v.porOrigen.some((o) => o.origen === 'tiktok' && o.total === 1), 'por origen, de mayor a menor');
assert(v.porDia.length === 30 && v.porDia[29].dia === '2026-10-14' && v.porDia[29].descargas === 2 && v.porDia[28].descargas === 1, 'serie diaria de 30 días terminando hoy');
assert(v.embudo.usuarios === 15 && v.embudo.descargasWindows === 2 && v.embudo.usuariosConEquipo === 2, 'embudo: 15 cuentas → 2 descargaron → 2 instalaron');
assert(v.primera === '2026-06-01T12:00:00.000Z', 'fecha de la primera descarga contada');

const vacio = D.resumir({ ahora });
assert(vacio.total === 0 && vacio.unicas === 0 && vacio.primera === null && vacio.porDia.length === 30 && vacio.embudo.usuarios === 0, 'sin descargas todo da cero y no se rompe');
// medianoche argentina: 01:00 UTC del 15 todavía es el 14 en Argentina
const noche = D.resumir({ descargas: [d('windows', 'x', '2026-10-15T01:00:00Z')], ahora: new Date('2026-10-15T02:00:00Z'), dias: 3 });
assert(noche.hoy === 1 && noche.porDia[2].dia === '2026-10-14', 'los días se cuentan en hora de Argentina');

console.log('\n✅ Todos los tests de descargas pasaron.\n');
