// tests/webhooks.test.js — webhooks de salida: destinos, firma HMAC, reintentos y la API que los administra.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-wh-'));
const W = require('../main/webhooks');
const quieto = async (svc) => { for (let i = 0; i < 200; i++) { if (svc.entregas().every((e) => e.estado !== 'enviando' && e.estado !== 'reintentando')) return; await new Promise((r) => setTimeout(r, 5)); } };

(async () => {
  console.log('\n[webhooks] Tests:');
  assert(W.urlValida('https://hooks.zapier.com/hooks/catch/1/2/') && W.urlValida('http://localhost:3000/x') && W.urlValida('http://127.0.0.1/x') && !W.urlValida('http://ejemplo.com/x') && !W.urlValida('ftp://x.com') && !W.urlValida('javascript:alert(1)') && !W.urlValida('https://user:pass@x.com/') && !W.urlValida('') && !W.urlValida('no es una url'), 'solo https (o http hacia esta misma PC)');
  assert(!W.sanear({ url: 'https://a.com', eventos: [] }).ok && !W.sanear({ url: 'https://a.com', eventos: ['inventado'] }).ok && !W.sanear({ url: 'http://a.com', eventos: ['venta.registrada'] }).ok, 'exige una dirección segura y al menos un evento conocido');
  const s0 = W.sanear({ url: 'https://hooks.example.com/abc', eventos: ['venta.registrada', 'venta.registrada', 'raro'] });
  assert(s0.ok && s0.dato.eventos.length === 1 && s0.dato.nombre === 'hooks.example.com', 'limpia eventos repetidos o desconocidos; el nombre por defecto es el sitio');

  const llamadas = []; let respuestas = [200];
  const fetchFalso = async (url, op) => { llamadas.push({ url, op }); const r = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)]; if (r === 'caida') throw new Error('ECONNREFUSED'); if (r === 'lento') { await new Promise((_, rej) => op.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))); } return { status: r }; };
  const esperas = [];
  const svc = W.crearServicio({ userDataDir: dir, fetchFn: fetchFalso, esperar: async (ms) => { esperas.push(ms); }, ahora: () => new Date('2026-10-07T12:00:00Z') });

  assert(svc.emitir('venta.registrada', {}) === 0 && svc.lista().length === 0, 'sin destinos no hace nada');
  const c = svc.crear({ nombre: 'Zapier', url: 'https://hooks.zapier.com/hooks/catch/1/2/', eventos: ['venta.registrada', 'pedido.pagado'] });
  assert(c.ok && /^whsec_[a-f0-9]{48}$/.test(c.destino.secreto), 'crea un destino y entrega el secreto (una sola vez)');
  assert(!('secreto' in svc.lista()[0]) && svc.lista()[0].secretoFin === c.destino.secreto.slice(-4), 'después solo se ve el final del secreto');
  const otro = svc.crear({ nombre: 'Make', url: 'https://hook.make.com/x', eventos: ['turno.confirmado'] });

  assert(svc.emitir('venta.registrada', { total: 1000 }) === 1 && svc.emitir('turno.confirmado', {}) === 1 && svc.emitir('movimiento.creado', {}) === 0 && svc.emitir('inventado', {}) === 0, 'cada evento va solo a los destinos que lo pidieron');
  await quieto(svc);
  const l = llamadas[0];
  const cuerpo = JSON.parse(l.op.body);
  assert(l.url === 'https://hooks.zapier.com/hooks/catch/1/2/' && l.op.method === 'POST' && l.op.headers['X-Akira-Evento'] === 'venta.registrada' && cuerpo.tipo === 'venta.registrada' && cuerpo.datos.total === 1000 && cuerpo.creadoEn === '2026-10-07T12:00:00.000Z' && cuerpo.id === l.op.headers['X-Akira-Entrega'], 'el aviso lleva el tipo, el id, la fecha y los datos');
  const esperada = `sha256=${crypto.createHmac('sha256', c.destino.secreto).update(l.op.body).digest('hex')}`;
  assert(l.op.headers['X-Akira-Firma'] === esperada, 'va firmado con HMAC-SHA256 del cuerpo (el receptor puede comprobarlo)');
  assert(llamadas[1].op.headers['X-Akira-Firma'] !== `sha256=${crypto.createHmac('sha256', c.destino.secreto).update(llamadas[1].op.body).digest('hex')}`, 'otro destino se firma con SU propio secreto');
  assert(svc.entregas().every((e) => e.estado === 'entregado') && svc.entregas()[0].intentos === 1, 'queda registrado como entregado');

  // reintentos
  llamadas.length = 0; esperas.length = 0; respuestas = [500, 503, 200];
  svc.emitir('pedido.pagado', { numero: 1 }); await quieto(svc);
  const e1 = svc.entregas().find((e) => e.tipo === 'pedido.pagado');
  assert(llamadas.length === 3 && e1.estado === 'entregado' && e1.intentos === 3 && esperas.join() === '5000,30000', 'si el destino falla reintenta (5 s, 30 s) y termina entregando');
  llamadas.length = 0; esperas.length = 0; respuestas = [404];
  svc.emitir('pedido.pagado', { numero: 2 }); await quieto(svc);
  assert(llamadas.length === 1 && svc.entregas()[0].estado === 'fallido' && svc.entregas()[0].codigo === 404, 'un error 4xx no se reintenta (no se arregla solo)');
  llamadas.length = 0; esperas.length = 0; respuestas = ['caida'];
  svc.emitir('pedido.pagado', { numero: 3 }); await quieto(svc);
  assert(llamadas.length === 4 && esperas.join() === '5000,30000,300000' && svc.entregas()[0].estado === 'fallido' && /No se pudo conectar/.test(svc.entregas()[0].error), 'si el destino está caído reintenta 3 veces más y lo da por fallido con el motivo');
  llamadas.length = 0; respuestas = ['lento'];
  const lentoSvc = W.crearServicio({ userDataDir: dir, fetchFn: fetchFalso, esperar: async () => {} });
  const t0 = Date.now(); const rp = await lentoSvc.probar(c.destino.id);
  assert(!rp.ok && /a tiempo/.test(rp.error) && Date.now() - t0 < 12000, 'un destino que no responde corta por tiempo (no se cuelga)');
  llamadas.length = 0; respuestas = [429, 200];
  svc.emitir('venta.registrada', {}); await quieto(svc);
  assert(llamadas.length === 2, 'un 429 (demasiadas peticiones) sí se reintenta');

  // probar, actualizar, secreto, borrar
  llamadas.length = 0; respuestas = [200];
  let p = await svc.probar(c.destino.id);
  assert(p.ok && JSON.parse(llamadas[0].op.body).tipo === 'prueba' && (await svc.probar('nadie')).ok === false, 'enviar una prueba');
  assert(svc.actualizar(c.destino.id, { activo: false }).ok && svc.emitir('venta.registrada', {}) === 0, 'un destino pausado no recibe avisos');
  assert(svc.actualizar(c.destino.id, { activo: true, url: 'http://ejemplo.com' }).ok === false && svc.actualizar('nadie', {}).status === 404, 'no deja cambiar a una dirección insegura');
  const nuevo = svc.regenerarSecreto(c.destino.id);
  assert(nuevo.ok && nuevo.destino.secreto !== c.destino.secreto, 'regenerar el secreto');
  assert(svc.eliminar(otro.destino.id).ok && svc.lista().length === 1 && svc.eliminar('nadie').status === 404, 'borrar un destino');
  for (let i = 0; i < W.MAX_DESTINOS; i++) svc.crear({ url: `https://a${i}.com/x`, eventos: ['venta.registrada'] });
  assert(!svc.crear({ url: 'https://z.com/x', eventos: ['venta.registrada'] }).ok, 'hay un máximo de destinos');

  // ── API ──
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-wh2-'));
  const svc2 = W.crearServicio({ userDataDir: dir2, fetchFn: async () => ({ status: 200 }), esperar: async () => {} });
  const app = express(); app.use(express.json());
  app.use('/api/app/webhooks', require('../main/local-api/routes/webhooks.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, servicioWebhooks: svc2 }));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/webhooks`;
  const j = async (m, pth, body) => { const x = await fetch(base + pth, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };
  let x = await j('POST', '', { url: 'https://hooks.example.com/1', eventos: ['venta.registrada'] });
  assert(x.status === 200 && x.body.destino.secreto, 'POST crea y devuelve el secreto');
  const id = x.body.destino.id;
  assert((await j('POST', '', { url: 'http://x.com', eventos: ['venta.registrada'] })).status === 400, 'POST con dirección insegura → 400');
  x = await j('GET', '');
  assert(x.body.destinos.length === 1 && !x.body.destinos[0].secreto && Object.keys(x.body.eventos).length === 5, 'GET lista destinos (sin secreto) y los eventos disponibles');
  assert((await j('PUT', `/${id}`, { eventos: ['pedido.pagado'] })).status === 200 && (await j('GET', '')).body.destinos[0].eventos.join() === 'pedido.pagado' && (await j('PUT', '/nadie', {})).status === 404, 'PUT');
  assert((await j('POST', `/${id}/probar`)).body.ok === true && (await j('POST', '/nadie/probar')).status === 404, 'probar desde la pantalla');
  assert((await j('POST', `/${id}/secreto`)).body.destino.secreto && (await j('DELETE', `/${id}`)).status === 200 && (await j('DELETE', `/${id}`)).status === 404, 'secreto nuevo y borrar');
  const sinSvc = express(); sinSvc.use('/w', require('../main/local-api/routes/webhooks.routes')({ requerirSesion: (q, _r, n) => n(), servicioWebhooks: null }));
  const s2 = await new Promise((rs) => { const s = sinSvc.listen(0, '127.0.0.1', () => rs(s)); });
  assert((await fetch(`http://127.0.0.1:${s2.address().port}/w`)).status === 503, 'si el servicio no está, responde 503 (no rompe)');
  s2.close(); srv.close();

  // el empleado y el encargado no administran webhooks
  const P = require('../main/perfiles');
  assert(!P.puede('encargado', 'GET', '/api/app/webhooks') && !P.puede('empleado', 'GET', '/api/app/webhooks') && P.puede('propietario', 'GET', '/api/app/webhooks'), 'solo el dueño ve los webhooks (llevan secretos)');

  console.log('\n✅ Todos los tests de webhooks pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
