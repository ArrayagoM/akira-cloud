// tests/primeros-pasos.test.js — guía única de primeros pasos (frontend/src/lib/primerosPasos.js)
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const lib = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', f)).href);

(async () => {
  console.log('\n[primeros-pasos] Tests:');
  const { CLAVE_OCULTO, CLAVE_OCULTO_ANTERIOR, estaOculta, datosDeConfig, armarPasos, resumenPasos } = await lib('primerosPasos.js');

  // Estado "oculto" ya guardado por usuarios reales: se respeta el de las dos guías anteriores
  assert(CLAVE_OCULTO === 'akira_primeros_pasos_oculto' && CLAVE_OCULTO_ANTERIOR === 'akira_onboarding_dismissed', 'las claves guardadas son las mismas que ya existían (nadie pierde su "ocultar")');
  const con = (...claves) => (k) => claves.includes(k);
  assert(estaOculta(con()) === false, 'sin nada guardado: se muestra');
  assert(estaOculta(con('akira_primeros_pasos_oculto')) === true, 'ocultó "Primeros pasos": sigue oculta');
  assert(estaOculta(con('akira_onboarding_dismissed')) === true, 'ocultó el checklist anterior: la guía unificada tampoco aparece');

  // Datos desde GET /config
  assert(JSON.stringify(datosDeConfig(null)) === JSON.stringify({ groq: false, negocio: false, celular: false }), 'sin respuesta de /config: todo pendiente, sin romper');
  const d = datosDeConfig({ keys: { groq: 'x' }, config: { negocio: 'Peluquería', servicios: 'Corte', celularNotificaciones: '+54 9 11 5555-1234' } });
  assert(d.groq && d.negocio && d.celular, 'clave, negocio (con servicios) y celular de 10+ dígitos se detectan');
  assert(datosDeConfig({ config: { negocio: 'X' } }).negocio === false, 'negocio sin servicios: todavía no está completo');

  // Escritorio: orden real de la app
  const pasos = armarPasos({ escritorio: true, datos: {}, botConectado: false, probado: false });
  assert(pasos.map((p) => p.id).join(',') === 'cuenta,groq,negocio,wa,prueba,celular', 'orden: cuenta, clave de IA, negocio, WhatsApp (QR), probar, y el celular opcional');
  assert(pasos.find((p) => p.id === 'groq') && !pasos.some((p) => p.id === 'bot'), 'sigue la clave de Groq y ya no hay un paso aparte de "iniciar el bot" duplicado con el QR');
  assert(pasos.filter((p) => !p.opcional).length === 5 && pasos.find((p) => p.id === 'celular').opcional === true, 'el celular de avisos es opcional y no cuenta');
  let r = resumenPasos(pasos);
  assert(r.hechos === 1 && r.total === 5 && !r.completo && r.proximo.id === 'groq', 'recién creada la cuenta: 1 de 5 y el próximo es la clave de IA');
  r = resumenPasos(armarPasos({ escritorio: true, datos: { groq: true, negocio: true }, botConectado: true, probado: true }));
  assert(r.completo && r.hechos === 5 && r.proximo === null, 'con todo hecho (sin celular) la guía queda completa');
  assert(armarPasos({ escritorio: true, datos: {}, botConectado: true }).find((p) => p.id === 'wa').hecho === true, 'el paso de WhatsApp se tilda cuando el bot está conectado');

  // Web: no se pide iniciar el bot, se pide instalar en la PC
  const web = armarPasos({ escritorio: false, datos: { groq: true }, botConectado: true, probado: true });
  assert(web.map((p) => p.id).join(',') === 'cuenta,instalar', 'en el navegador solo: cuenta e "Instalá Akira en tu PC"');
  const inst = web.find((p) => p.id === 'instalar');
  assert(inst.titulo === 'Instalá Akira en tu PC' && inst.ir === '/descargar' && inst.hecho === false, 'el paso lleva a la página de descarga que ya existe (/descargar)');
  assert(!JSON.stringify(web).includes('Iniciar bot') && !JSON.stringify(web).includes('Iniciá el bot'), 'en la web nunca aparece "Iniciar bot"');
  console.log('✅ primeros-pasos: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
