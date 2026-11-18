// tests/aviso-respaldo.test.js — aviso de respaldo del Dashboard (frontend/src/lib/avisoRespaldo.js)
// Usa los campos reales de estado() de desktop/main/respaldo-servicio.js.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const lib = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', f)).href);

(async () => {
  console.log('\n[aviso-respaldo] Tests:');
  const { avisoDeRespaldo, DIAS_MAXIMOS_SIN_RESPALDO } = await lib('avisoRespaldo.js');
  const DIA = 24 * 60 * 60 * 1000; const AHORA = Date.UTC(2026, 10, 17, 12, 0, 0);
  const ok = (extra = {}) => ({ activo: true, carpeta: 'D:\\Respaldos', tieneClave: true, ultimo: { ok: true, enMs: AHORA - DIA }, archivos: [], corriendo: false, ...extra });

  assert(DIAS_MAXIMOS_SIN_RESPALDO === 3, 'el límite es de 3 días');
  assert(avisoDeRespaldo(null, AHORA) === null && avisoDeRespaldo(undefined, AHORA) === null && avisoDeRespaldo('x', AHORA) === null, 'si la consulta falló (sin dato) no se muestra nada');
  assert(avisoDeRespaldo(ok(), AHORA) === null, 'respaldo activo y de ayer: sin aviso');
  assert(avisoDeRespaldo(ok({ ultimo: { ok: true, enMs: AHORA - 3 * DIA } }), AHORA) === null, 'justo 3 días: todavía no avisa');
  const viejo = avisoDeRespaldo(ok({ ultimo: { ok: true, enMs: AHORA - 5 * DIA - 3600000 } }), AHORA);
  assert(viejo && viejo.tipo === 'desactualizado' && /5 días/.test(viejo.titulo), 'último respaldo de hace más de 3 días: avisa y dice cuántos');
  assert(avisoDeRespaldo(ok({ ultimo: { ok: true, enMs: AHORA - 3 * DIA - 1000 } }), AHORA)?.tipo === 'desactualizado', 'apenas pasados los 3 días: avisa');
  assert(avisoDeRespaldo(ok({ ultimo: null }), AHORA) === null, 'recién activado, todavía no corrió: no molesta (la app lo hace sola a los minutos)');

  for (const [nombre, est] of [['desactivado', ok({ activo: false })], ['sin carpeta', ok({ carpeta: null })], ['sin contraseña', ok({ tieneClave: false })], ['nunca configurado', { activo: false, carpeta: null, tieneClave: false, ultimo: null }]]) {
    assert(avisoDeRespaldo(est, AHORA)?.tipo === 'sin_configurar', `${nombre}: avisa que no hay respaldo automático`);
  }
  const fallo = avisoDeRespaldo(ok({ ultimo: { ok: false, enMs: AHORA - 1000, error: 'disco lleno' } }), AHORA);
  assert(fallo && fallo.tipo === 'fallo', 'el último intento falló: avisa');
  assert(avisoDeRespaldo({ activo: false, carpeta: 'D:\\R', tieneClave: true, ultimo: { ok: false } }, AHORA).tipo === 'sin_configurar', 'si además está apagado, manda el aviso más importante (sin configurar)');
  for (const k of ['titulo', 'detalle']) assert(typeof viejo[k] === 'string' && viejo[k].length > 10 && !/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(viejo[k]), `el aviso tiene ${k} sin emojis`);
  console.log('✅ aviso-respaldo: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
