// tests/datos-celular-ui.test.js — tarjeta "Ver los datos de mi negocio en el celular" del Dashboard (comprobación de código)
// y el texto de privacidad: el usuario tiene que saber, antes de activarla, que se suben nombres y montos de sus clientes.
'use strict';
const fs = require('fs');
const path = require('path');
function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

console.log('\n[datos-celular-ui] Tests:');
const tarjeta = leer('frontend', 'src', 'components', 'DatosCelularCard.jsx');
assert(/api\.get\('\/app\/datos-celular'\)/.test(tarjeta) && /api\.put\('\/app\/datos-celular', cambios\)/.test(tarjeta), 'la tarjeta lee y guarda en /app/datos-celular');
assert(/window\.confirm\(AVISO\)/.test(tarjeta) && /!datos\.activo && !window\.confirm/.test(tarjeta), 'al activarla pide confirmación; al apagarla no hace falta');
const aviso = /const AVISO = ([\s\S]*?);\n/.exec(tarjeta)[1];
assert(/nombres, teléfonos y montos de tus clientes/.test(aviso) && /cifrados/.test(aviso) && /Solo los ves vos/.test(aviso) && /se borran del servidor/.test(aviso), 'el aviso dice qué se sube (nombres, teléfonos y montos), que va cifrado, que solo lo ve el usuario y que se borra al apagar');
assert(/setDatos\(antes\)/.test(tarjeta) && /alternarGrupo\(datos\.tipos, id, datos\.disponibles\)/.test(tarjeta), 'si no se puede guardar vuelve a lo anterior; siempre queda al menos un dato elegido');
assert(/import DatosCelularCard/.test(leer('frontend', 'src', 'pages', 'Dashboard.jsx')) && /<DatosCelularCard \/>/.test(leer('frontend', 'src', 'pages', 'Dashboard.jsx')), 'la tarjeta está en el Dashboard de la app');
const priv = leer('frontend', 'src', 'pages', 'Privacidad.jsx');
assert(/Datos de tu negocio para verlos desde el celular \(opcional, apagado por defecto\)/.test(priv) && /nombres, teléfonos y montos de tus clientes/.test(priv) && /30 días/.test(priv) && /solo de lectura/i.test(priv), 'la política de privacidad explica la opción: opcional, qué incluye, borrado y solo lectura');
assert(!/no en nuestros servidores\.<\/li>/.test(priv), 'la política ya no afirma sin excepción que los datos del negocio nunca están en los servidores');
console.log('✅ datos-celular-ui: OK');
