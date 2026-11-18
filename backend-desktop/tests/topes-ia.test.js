// tests/topes-ia.test.js — AUD-001 #11: topes diarios en la base para lo que gasta la clave de IA de la plataforma
// (soporte por usuario, sugerencias por usuario, demo público por IP). Con la base caída el limitador deja pasar y avisa en el log.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
process.env.GROQ_PLATFORM_API_KEY = 'gsk_clave_de_la_plataforma';
const passport = require('passport');
const { assert, inyectar, logCapturado, limiteFalso, servir, fijarIp, consulta } = require('./_ayuda');

const log = logCapturado();
inyectar('config/logger.js', log);
const Limite = limiteFalso();
inyectar('models/Limite.js', Limite);

// usuario que "autentica" passport: lo elige la cabecera x-test-user (soporte usa passport.authenticate directo)
const USUARIOS = { u1: { _id: 'u1', nombre: 'Ana', email: 'ana@x.com' }, u2: { _id: 'u2', nombre: 'Beto', email: 'beto@x.com' } };
passport.authenticate = () => (req, res, next) => { const u = USUARIOS[req.headers['x-test-user'] || 'u1']; if (!u) return res.status(401).json({ error: 'no' }); req.user = u; next(); };
inyectar('middleware/auth.js', { requireAuth: (req, res, next) => passport.authenticate()(req, res, next), requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });

// ── soporte ──
let configsConClaveAjena = new Set(); const llamadasIA = [];
inyectar('models/SupportChat.js', class { constructor() { this.messages = []; } static findOne() { return Promise.resolve(null); } async agregarMensaje() {} });
inyectar('models/Config.js', { findOne: (q) => Promise.resolve(configsConClaveAjena.has(String(q.userId)) ? { keyGroq: { encrypted: 'x' }, getKey: () => 'gsk_clave_propia_del_usuario' } : null) });
inyectar('services/support.service.js', { procesarMensaje: async ({ groqApiKey }) => { llamadasIA.push(groqApiKey); return 'Respuesta de Akira'; } });
// ── sugerencias ──
const sugerencias = [];
inyectar('models/Suggestion.js', { countDocuments: async () => 0 /* simula pedidos a la vez: el conteo todavía no los ve */, create: async (d) => { const s = { _id: 's' + (sugerencias.length + 1), ...d }; sugerencias.push(s); return s; }, findByIdAndUpdate: async () => ({}), find: () => consulta([]) });
inyectar('services/suggestion.service.js', { analizarSugerencia: async () => ({ puntuacion: 5, analisisIA: { categoria: 'otra' } }) });
// ── demo ──
let llamadasDemo = 0;
inyectar('services/bot/groq.service.js', () => ({ llamarGroq: async () => { llamadasDemo++; return { choices: [{ message: { content: 'Hola, soy Sofía' } }] }; }, herramientas: () => [] }));

const T = require('../lib/topes-ia');

(async () => {
  console.log('\n[topes-ia] Tests:');

  // ── piezas ──
  const t0 = Date.UTC(2026, 10, 17, 2, 30); // 23:30 del 16/11 en Argentina
  assert(T.diaAR(t0) === '2026-11-16' && T.diaAR(Date.UTC(2026, 10, 17, 3, 0)) === '2026-11-17', 'el día corta a la medianoche de Argentina (UTC-3), no a la del servidor');
  const ml = limiteFalso();
  const a = await T.consumirTopeDia('ia:x', 'u9', 2, { Modelo: ml, ahora: t0 });
  const b = await T.consumirTopeDia('ia:x', 'u9', 2, { Modelo: ml, ahora: t0 });
  const c = await T.consumirTopeDia('ia:x', 'u9', 2, { Modelo: ml, ahora: t0 });
  assert(a.ok && b.ok && !c.ok && c.n === 3, 'consumirTopeDia: permite hasta el máximo y corta el siguiente');
  const dia2 = await T.consumirTopeDia('ia:x', 'u9', 2, { Modelo: ml, ahora: t0 + 3 * 3600e3 + 1000 });
  assert(dia2.ok && dia2.n === 1, 'al día siguiente (hora de Argentina) el contador arranca de cero');
  assert(/hora/.test(T.mensajeTope('consultas', t0)) && T.TOPES_IA.soporteUsuarioDia >= 50 && T.TOPES_IA.demoIpDia >= 100, 'el mensaje avisa cuándo se renueva y los topes son generosos');

  const ctx = { antes: [fijarIp] };
  const soporte = await servir('/api/support', require('../routes/support.routes'), ctx);
  const sugs = await servir('/api/suggestions', require('../routes/suggestions.routes'), ctx);
  const demo = await servir('/api/demo', require('../routes/demo.routes'), ctx);
  const chat = (usuario) => soporte.llamar('/chat', { metodo: 'POST', cuerpo: { mensaje: 'Hola, ¿cómo conecto WhatsApp?' }, headers: { 'x-test-user': usuario } });

  // ── soporte: por usuario y por día ──
  T.TOPES_IA.soporteUsuarioDia = 3;
  let r;
  for (let i = 1; i <= 3; i++) { r = await chat('u1'); assert(r.status === 200 && r.body.respuesta === 'Respuesta de Akira', `soporte: el mensaje ${i} de 3 pasa`); }
  r = await chat('u1');
  assert(r.status === 429 && /máximo de consultas al soporte de hoy/.test(r.body.error), 'soporte: el mensaje 4 recibe 429 con un mensaje claro');
  assert(llamadasIA.length === 3, 'soporte: el mensaje rechazado no llegó a gastar la clave de IA');
  r = await chat('u2');
  assert(r.status === 200, 'soporte: el tope es por usuario (otro usuario sigue pudiendo)');
  configsConClaveAjena.add('u1'); llamadasIA.length = 0;
  r = await chat('u1');
  assert(r.status === 200 && llamadasIA[0] === 'gsk_clave_propia_del_usuario', 'soporte: quien usa su propia clave de Groq no gasta la de la plataforma, así que no se le aplica el tope');
  configsConClaveAjena = new Set();

  // ── soporte con la base caída: falla abierta ──
  Limite.falla = true; log.lineas.length = 0;
  r = await chat('u1');
  assert(r.status === 200, 'soporte con el limitador caído: deja pasar (falla abierta)');
  assert(log.lineas.some((l) => l.includes('[Limite] no se pudo contar ia:soporte:u:u1')), 'soporte con el limitador caído: lo avisa en el log');
  Limite.falla = false;

  // ── sugerencias: atómico aunque el conteo de documentos no vea los pedidos simultáneos ──
  T.TOPES_IA.sugerenciasUsuarioDia = 2;
  const enviar = (usuario) => sugs.llamar('/', { metodo: 'POST', cuerpo: { texto: 'Me gustaría que el bot pudiera mandar recordatorios de turnos por WhatsApp' }, headers: { 'x-test-user': usuario } });
  const lote = await Promise.all([enviar('u1'), enviar('u1'), enviar('u1'), enviar('u1')]);
  const ok = lote.filter((x) => x.status === 201).length; const bloq = lote.filter((x) => x.status === 429);
  assert(ok === 2 && bloq.length === 2 && sugerencias.length === 2, 'sugerencias: 4 pedidos a la vez → solo 2 se guardan (tope atómico), el resto recibe 429');
  assert(/Máximo 5 sugerencias por día/.test(bloq[0].body.error), 'sugerencias: el mensaje de tope es el mismo de siempre');
  r = await enviar('u2');
  assert(r.status === 201, 'sugerencias: el tope es por usuario');
  Limite.falla = true;
  r = await enviar('u2');
  assert(r.status === 201, 'sugerencias con el limitador caído: deja pasar');
  Limite.falla = false;
  r = await sugs.llamar('/', { metodo: 'POST', cuerpo: { texto: 'corto' } });
  assert(r.status === 400, 'sugerencias: la validación del texto sigue igual (400) y no gasta tope');
  await new Promise((res) => setTimeout(res, 50)); // deja terminar el análisis asíncrono de las sugerencias

  // ── demo: por IP y por día ──
  T.TOPES_IA.demoIpDia = 3;
  const hablar = (ip) => demo.llamar('/chat', { metodo: 'POST', cuerpo: { mensaje: 'Hola' }, headers: { 'x-test-ip': ip } });
  for (let i = 1; i <= 3; i++) { r = await hablar('5.5.5.5'); assert(r.status === 200 && r.body.respuesta, `demo: el mensaje ${i} de 3 desde una IP pasa`); }
  const antes = llamadasDemo;
  r = await hablar('5.5.5.5');
  assert(r.status === 429 && /demo por hoy/.test(r.body.error) && llamadasDemo === antes, 'demo: el mensaje 4 desde la misma IP recibe 429 y no gasta IA');
  r = await hablar('6.6.6.6');
  assert(r.status === 200, 'demo: otra IP sigue pudiendo');
  r = await demo.llamar('/chat', { metodo: 'POST', cuerpo: { mensaje: '   ' }, headers: { 'x-test-ip': '7.7.7.7' } });
  assert(r.status === 400 && r.body.error === 'Falta el mensaje.', 'demo: un mensaje vacío sigue dando 400 y no gasta tope');
  Limite.falla = true;
  r = await hablar('5.5.5.5');
  assert(r.status === 200, 'demo con el limitador caído: deja pasar');
  Limite.falla = false;
  assert(Limite.mapa.has('ia:demo:ip:5.5.5.5:' + T.diaAR()), 'demo: el contador vive en la base (modelo Limite) con la IP y el día en la clave');

  for (const s of [soporte, sugs, demo]) await s.cerrar();
  console.log('\n✅ Todos los tests de topes de IA pasaron.\n');
})().catch((e) => { console.error(e); process.exit(1); });
