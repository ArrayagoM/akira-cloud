// tests/sesion.test.js — sesión que no se pierde sin culpa del usuario, textos según cómo entró, carga diferida con red de seguridad
// (frontend/src/lib/sesion.js, textosSesion.js, cargaPerezosa.js)
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const lib = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', f)).href);
const err = (status) => ({ response: status ? { status } : undefined, message: status ? `status ${status}` : 'Network Error' });

(async () => {
  console.log('\n[sesion] Tests:');
  const { clasificarErrorSesion, esperaReintento, MAX_REINTENTOS } = await lib('sesion.js');

  // Solo un 401 real borra el token
  assert(clasificarErrorSesion(err(401)) === 'invalida', '401 de /auth/me: la sesión no sirve (se borra el token)');
  assert(clasificarErrorSesion(err(0)) === 'sin_conexion', 'corte de red / sin respuesta: se conserva la sesión');
  assert(clasificarErrorSesion({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' }) === 'sin_conexion', 'timeout: se conserva la sesión');
  assert(clasificarErrorSesion(undefined) === 'sin_conexion' && clasificarErrorSesion(null) === 'sin_conexion', 'error vacío: se conserva la sesión');
  for (const s of [500, 502, 503, 504]) assert(clasificarErrorSesion(err(s)) === 'sin_conexion', `${s} del servidor: se conserva la sesión`);
  for (const s of [408, 425, 429]) assert(clasificarErrorSesion(err(s)) === 'sin_conexion', `${s} (esperar y reintentar): se conserva la sesión`);
  assert(clasificarErrorSesion(err(403)) === 'rechazada' && clasificarErrorSesion(err(404)) === 'rechazada', '403/404: el servidor respondió que no, pero el token no se borra');
  assert(clasificarErrorSesion(err(401)) !== clasificarErrorSesion(err(503)), 'un 401 y un 503 nunca se tratan igual');

  // Espera creciente con tope
  const esperas = []; for (let i = 0; i < 12; i++) esperas.push(esperaReintento(i));
  assert(esperas.every((e) => Number.isInteger(e) && e > 0), 'todas las esperas automáticas son positivas');
  assert(esperas.every((e, i) => i === 0 || e >= esperas[i - 1]), 'las esperas crecen (o se mantienen), nunca bajan');
  assert(esperas[0] === 2000 && Math.max(...esperas) === 60000, 'arranca en 2 s y se estabiliza en 60 s');
  assert(esperaReintento(99) === 60000 && esperaReintento(10000) === 60000 && MAX_REINTENTOS === undefined, 'no hay tope de reintentos: pasada la tabla se sigue intentando cada 60 s (si se cortaba, "Sin conexión" quedaba trabada con internet de vuelta)');
  assert(esperaReintento(-1) === null && esperaReintento('x') === null && esperaReintento(1.5) === null, 'intento inválido: sin reintento');

  // Textos según cómo entró
  const { detalleSesionExpirada, MENSAJE_OAUTH_FALLIDO } = await lib('textosSesion.js');
  assert(/Google/.test(detalleSesionExpirada('google')) && !/contraseña/i.test(detalleSesionExpirada('google')), 'quien entra con Google: el texto habla de Google y NO de contraseña');
  assert(/Facebook/.test(detalleSesionExpirada('facebook')) && !/contraseña/i.test(detalleSesionExpirada('facebook')), 'quien entra con Facebook: habla de Facebook, no de contraseña');
  assert(/contraseña/i.test(detalleSesionExpirada('local')), 'cuenta con contraseña: habla de la contraseña');
  for (const p of [undefined, null, '', 'otro']) assert(/Volvé a iniciar sesión/.test(detalleSesionExpirada(p)) && !/contraseña|Google|Facebook/.test(detalleSesionExpirada(p)), `proveedor desconocido (${JSON.stringify(p)}): texto neutro`);
  assert(!/OAuth/i.test(MENSAJE_OAUTH_FALLIDO) && /reintentar/i.test(MENSAJE_OAUTH_FALLIDO) && /internet/.test(MENSAJE_OAUTH_FALLIDO), 'error de ingreso social: sin tecnicismos, con causas probables y cómo reintentar');

  // Carga diferida: recarga una sola vez ante un archivo que ya no existe
  const { esErrorDeCarga, puedeRecargar, conReintentoDeCarga } = await lib('cargaPerezosa.js');
  assert(esErrorDeCarga(new Error('Failed to fetch dynamically imported module: https://x/assets/Dashboard-abc.js')), 'detecta "Failed to fetch dynamically imported module" (Chrome/Edge)');
  assert(esErrorDeCarga(new Error('error loading dynamically imported module')) && esErrorDeCarga(new Error('Importing a module script failed.')), 'detecta los mensajes de Firefox y Safari');
  assert(!esErrorDeCarga(new Error('x is not a function')) && !esErrorDeCarga(null), 'un error común de código NO se confunde con un archivo faltante');
  assert(puedeRecargar(null, 1e12) && puedeRecargar('0', 1e12) && puedeRecargar(1e12 - 61000, 1e12), 'puede recargar si nunca lo hizo o pasó más de un minuto');
  assert(!puedeRecargar(1e12 - 5000, 1e12), 'no recarga dos veces seguidas (evita el bucle)');

  const guardado = {}; let recargas = 0;
  globalThis.sessionStorage = { getItem: (k) => guardado[k] ?? null, setItem: (k, v) => { guardado[k] = v; } };
  globalThis.window = { location: { reload: () => { recargas++; } } };
  assert(await conReintentoDeCarga(() => Promise.resolve('ok')) === 'ok', 'si el archivo carga, devuelve el módulo');
  let e1 = null; try { await conReintentoDeCarga(() => Promise.reject(new Error('boom'))); } catch (e) { e1 = e; }
  assert(e1 && e1.message === 'boom' && recargas === 0, 'un error que no es de carga se propaga y no recarga');
  const chunkErr = () => Promise.reject(new Error('Failed to fetch dynamically imported module: /assets/X.js'));
  const colgada = await Promise.race([conReintentoDeCarga(chunkErr).then(() => 'resolvio', () => 'rechazo'), new Promise((r) => setTimeout(() => r('pendiente'), 50))]);
  assert(colgada === 'pendiente' && recargas === 1, 'primer archivo faltante: recarga la página una vez y queda en la pantalla de carga');
  let e2 = null; try { await conReintentoDeCarga(chunkErr); } catch (e) { e2 = e; }
  assert(e2 && recargas === 1, 'segundo fallo dentro del minuto: NO vuelve a recargar y muestra el error');

  console.log('✅ sesion: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
