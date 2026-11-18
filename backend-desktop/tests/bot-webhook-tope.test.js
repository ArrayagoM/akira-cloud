// tests/bot-webhook-tope.test.js — el webhook público de Mercado Pago del bot (/api/bot/webhook-mp/:userId, sin firma) tiene topes por IP y por
// userId: 200 eventos falsos no llenan la cola de un cliente. Pasado el tope se descarta, pero la respuesta es siempre la misma 200.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
const { assert, inyectar, logCapturado, limiteFalso, servir, fijarIp } = require('./_ayuda');

const log = logCapturado();
inyectar('config/logger.js', log);
const Limite = limiteFalso();
inyectar('models/Limite.js', Limite);
const cola = [];
inyectar('models/MpEvento.js', {
  countDocuments: async (q) => cola.filter((e) => String(e.userId) === String(q.userId)).length,
  create: async (d) => { cola.push(d); return d; },
});
inyectar('middleware/auth.js', { requireAuth: (_q, _r, n) => n(), requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });
inyectar('services/quota.service.js', { registrarMensajeYVerificarCupo: async () => ({}), registrarDiaDeUsoTrial: async () => {}, mesActual: () => '2026-11' });

(async () => {
  console.log('\n[bot-webhook-tope] Tests:');
  const gate = await servir('/api/bot', require('../routes/bot-gate.routes'), { antes: [fijarIp] });
  const U1 = '66f1a2b3c4d5e6f7a8b9c0d1'; const U2 = '66f1a2b3c4d5e6f7a8b9c0d2';
  const evento = (id = '123456789') => ({ type: 'payment', action: 'payment.created', data: { id } });
  const mandar = (userId, ip, cuerpo = evento()) => gate.llamar(`/webhook-mp/${userId}`, { metodo: 'POST', cuerpo, headers: { 'x-test-ip': ip } });

  // ── comportamiento de siempre ──
  let r = await mandar(U1, '1.1.1.1');
  assert(r.status === 200 && cola.length === 1 && cola[0].payload.data.id === '123456789', 'un aviso de pago normal se encola y responde 200');
  const respuestaNormal = r.texto;

  r = await mandar('no-es-un-id', '1.1.1.1');
  assert(r.status === 200 && r.texto === respuestaNormal && cola.length === 1, 'un userId que no es de 24 hexadecimales: 200 igual, no se encola nada');
  r = await mandar('66f1a2b3c4d5e6f7a8b9c0dZ', '1.1.1.1');
  assert(r.status === 200 && cola.length === 1, 'un userId con un carácter que no es hexadecimal: no se encola');
  r = await mandar(U1, '1.1.1.1', { type: 'merchant_order', data: { id: '1' } });
  assert(r.status === 200 && cola.length === 1, 'un evento que no es de pago: 200 igual, no se encola');
  r = await mandar(U1, '1.1.1.1', { type: 'payment' });
  assert(r.status === 200 && cola.length === 1, 'un evento de pago sin data.id: 200 igual, no se encola');
  r = await gate.llamar(`/webhook-mp/${U1}`, { metodo: 'POST', headers: { 'x-test-ip': '1.1.1.1' } });
  assert(r.status === 200 && cola.length === 1, 'sin cuerpo: 200 igual y no rompe');

  // ── tope por userId: 250 eventos falsos desde IP distintas ──
  let encolados = cola.filter((e) => String(e.userId) === U2).length;
  const respuestas = new Set();
  for (let i = 0; i < 250; i++) { const x = await mandar(U2, `10.0.${Math.floor(i / 200)}.${i % 200}`, evento(String(1000 + i))); respuestas.add(x.status + '|' + x.texto); }
  encolados = cola.filter((e) => String(e.userId) === U2).length;
  assert(encolados === 100, `tope por userId: de 250 eventos falsos solo se encolan 100 (se encolaron ${encolados})`);
  assert(respuestas.size === 1 && [...respuestas][0] === '200|' + respuestaNormal, 'los 250 pedidos recibieron la misma respuesta 200: no hay pistas de que se descartaron');
  assert(log.lineas.filter((l) => l.includes('tope por usuario superado')).length === 1, 'el aviso en el log sale UNA vez por ventana, no una por evento');
  r = await mandar(U1, '1.1.1.1', evento('777'));
  assert(cola.some((e) => e.payload.data.id === '777'), 'otro cliente no se ve afectado por el tope del primero');

  // ── tope por IP: una IP que inunda muchos userId distintos ──
  const antesIp = cola.length;
  for (let i = 0; i < 3100; i++) { const uid = (BigInt('0x66f1a2b3c4d5e6f7a8b90000') + BigInt(i)).toString(16).padStart(24, '0'); await mandar(uid, '8.8.8.8', evento(String(5000 + i))); }
  const dePool = cola.length - antesIp;
  assert(dePool === 3000, `tope por IP: una sola IP no logra encolar más de 3000 eventos aunque cambie de userId (se encolaron ${dePool})`);
  r = await mandar(U1, '2.2.2.2', evento('888'));
  assert(cola.some((e) => e.payload.data.id === '888'), 'otra IP sigue pudiendo (el tope por IP es de esa IP)');

  // ── la cola de un cliente nunca pasa de lo que ya tenía como tope ──
  assert(cola.filter((e) => String(e.userId) === U2).length <= 200, 'la cola de un cliente nunca supera el tope anti-abuso anterior (200)');

  // ── base del limitador caída: falla abierta, el cobro real no se pierde ──
  Limite.falla = true;
  r = await mandar(U1, '3.3.3.3', evento('999'));
  assert(r.status === 200 && cola.some((e) => e.payload.data.id === '999'), 'con el limitador caído se sigue encolando (falla abierta) y responde 200');
  Limite.falla = false;

  await gate.cerrar();
  console.log('\n✅ Todos los tests del webhook del bot pasaron.\n');
})().catch((e) => { console.error(e); process.exit(1); });
