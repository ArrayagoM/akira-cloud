// tests/prueba-uso.test.js — la prueba gratis por USO: regla de vigencia, conteo del día de uso (atómico), ruta de cupo por mensaje,
// migración de las pruebas actuales y devolución de la prueba a quien no llegó a usar el programa. Sin tocar ninguna base real.
'use strict';

process.env.JWT_SECRET = 'x'.repeat(40);
process.env.LICENSE_JWT_SECRET = 'y'.repeat(40);

const Module = require('module');
const path = require('path');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

// ── Usuario simulado con la semántica de los filtros que usa el código ({ $ne }, $inc, $set) ──
const usuarios = new Map();
const coincide = (u, filtro) => Object.entries(filtro).every(([k, v]) => (v && typeof v === 'object' && '$ne' in v ? u[k] !== v.$ne : u[k] === v));
const FakeUser = {
  async updateOne(filtro, cambio) {
    const u = [...usuarios.values()].find((x) => coincide(x, filtro));
    if (!u) return { matchedCount: 0, modifiedCount: 0 };
    for (const [k, v] of Object.entries(cambio.$inc || {})) u[k] = (u[k] || 0) + v;
    Object.assign(u, cambio.$set || {});
    return { matchedCount: 1, modifiedCount: 1 };
  },
  findById(id) { const u = usuarios.get(id); const p = Promise.resolve(u ? { ...u } : null); p.select = () => p; p.lean = () => p; return p; },
  async findByIdAndUpdate(id, c) { const u = usuarios.get(id); if (u) Object.assign(u, c); return u; },
  find() { return { select: () => ({ lean: async () => [...usuarios.values()].filter((u) => u.plan === 'trial').map((u) => ({ ...u })) }) }; },
  async bulkWrite(ops) { for (const o of ops) { const { filter, update } = o.updateOne; const u = usuarios.get(String(filter._id)); if (u && coincide(u, { ...filter, _id: u._id })) Object.assign(u, update.$set); } return { ok: 1 }; },
};
const dispositivos = [];
const FakeDevice = { find() { return { select: () => ({ lean: async () => dispositivos.slice() }) }; } };
const cache = Module._cache;
const inyectar = (rel, exportado) => { const f = path.join(__dirname, '..', rel); cache[f] = { id: f, filename: f, loaded: true, exports: exportado, children: [], paths: [] }; };
inyectar('models/User.js', FakeUser);
inyectar('middleware/auth.js', { requireAuth: (req, _res, next) => next() });
inyectar('config/logger.js', { info() {}, warn() {}, error() {} });
inyectar('models/MpEvento.js', {});

const P = require('../lib/prueba');
const { calcularVigencia } = require('../services/license.service');
const quota = require('../services/quota.service');
const gate = require('../routes/bot-gate.routes');
const admin = require('../services/prueba-admin.service');

const AHORA = new Date('2026-10-13T15:00:00.000Z'); // martes 12:00 en Argentina
// Reloj fijo: el servidor usa la hora real (new Date()), y el test supone que "ahora" es AHORA. Sin esto, el test pasaba solo hasta que
// pasaban los días del plan de ejemplo (venció el 23/10 y empezó a fallar sin que nadie tocara nada).
{ const RealDate = Date; global.Date = class extends RealDate { constructor(...args) { if (args.length === 0) super(AHORA.getTime()); else super(...args); } static now() { return AHORA.getTime(); } }; }
const MAS = (dias) => new Date(AHORA.getTime() + dias * 86400000);
const nuevoUso = (extra = {}) => ({ plan: 'trial', trialModeloUso: true, trialDiasUso: 0, trialUltimoDiaUso: '', trialExpira: MAS(55), ...extra });

async function llamarGate(user) {
  const capa = gate.stack.find((l) => l.route && l.route.path === '/quota/check' && l.route.methods.post);
  let status = 200; let json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  for (const h of capa.route.stack.map((s) => s.handle)) await h({ user, body: {} }, res, () => {});
  return { status, json };
}

(async () => {
  console.log('\n[prueba por uso] Tests:');

  // ── el día cambia a la medianoche de Argentina, no a la de UTC ──
  assert(P.hoyAR(new Date('2026-10-13T02:30:00Z')) === '2026-10-12' && P.hoyAR(new Date('2026-10-13T03:30:00Z')) === '2026-10-13', 'el día de uso cambia a la medianoche de Argentina (UTC-3)');

  // ── cuentas viejas: siguen con el calendario hasta que se las migra ──
  const vieja = { plan: 'trial', trialExpira: MAS(3) };
  assert(P.vigenciaTrial(vieja, AHORA).vigente && P.vigenciaTrial(vieja, AHORA).modelo === 'calendario' && P.vigenciaTrial(vieja, AHORA).diasRestantes === 3, 'una cuenta vieja sigue con la regla de calendario');
  assert(!P.vigenciaTrial({ plan: 'trial', trialExpira: MAS(-1) }, AHORA).vigente && !P.vigenciaTrial({ plan: 'trial' }, AHORA).vigente, 'y vencida es vencida (o sin fecha, también)');
  assert(P.vigenciaTrial({ ...vieja, trialDiasUso: 7, trialUltimoDiaUso: '2020-01-01' }, AHORA).vigente, 'los días de uso no afectan a una cuenta sin migrar');

  // ── modelo por uso ──
  const v0 = P.vigenciaTrial(nuevoUso(), AHORA);
  assert(v0.vigente && v0.modelo === 'uso' && v0.diasUso === 0 && v0.diasMax === 7 && v0.diasRestantes === 7, 'cuenta nueva: 7 días de uso por delante');
  assert(P.vigenciaTrial(nuevoUso({ trialExpira: MAS(55) }), MAS(40)).vigente, 'pasaron 40 días de calendario sin usarla: sigue vigente (no se gastó nada)');
  assert(P.vigenciaTrial(nuevoUso({ trialDiasUso: 6, trialUltimoDiaUso: '2026-10-01' }), AHORA).vigente && P.vigenciaTrial(nuevoUso({ trialDiasUso: 6, trialUltimoDiaUso: '2026-10-01' }), AHORA).diasRestantes === 1, 'con 6 días usados queda 1');
  const ultimo = P.vigenciaTrial(nuevoUso({ trialDiasUso: 7, trialUltimoDiaUso: '2026-10-13' }), AHORA);
  assert(ultimo.vigente && ultimo.hoyContado && ultimo.diasRestantes === 0, 'el séptimo día de uso se puede usar completo');
  const agotada = P.vigenciaTrial(nuevoUso({ trialDiasUso: 7, trialUltimoDiaUso: '2026-10-12' }), AHORA);
  assert(!agotada.vigente && agotada.motivo === 'dias', 'al día siguiente del séptimo día de uso, la prueba terminó');
  const tope = P.vigenciaTrial(nuevoUso({ trialExpira: MAS(-1) }), AHORA);
  assert(!tope.vigente && tope.motivo === 'tope', 'el tope de calendario corta la prueba aunque no se hayan gastado los 7 días');
  assert(P.vigenciaTrial(nuevoUso({ trialDiasUso: 99, trialUltimoDiaUso: '2026-10-13' }), AHORA).diasUso === 7, 'nunca muestra más de 7 días usados');
  assert(calcularVigencia({ plan: 'trial', ...nuevoUso({ trialDiasUso: 7, trialUltimoDiaUso: '2026-10-12' }) }, AHORA).vigente === false && calcularVigencia({ plan: 'trial', ...nuevoUso() }, AHORA).vigente === true && calcularVigencia({ plan: 'trial', ...vieja }, AHORA).vigente === true, 'la licencia (heartbeat) usa la misma regla');
  assert(calcularVigencia({ plan: 'pro', planExpira: MAS(10) }, AHORA).vigente && calcularVigencia({ plan: 'pro', planExpira: MAS(-1) }, AHORA).vigente === false && calcularVigencia({ plan: 'trial', esTester: true, trialExpira: MAS(-5) }, AHORA).vigente && calcularVigencia({ rol: 'admin', plan: 'trial' }, AHORA).vigente, 'los planes pagos, testers y admins no cambiaron');

  // ── anotar el día de uso: atómico, una vez por día, solo en trial por uso ──
  usuarios.set('u1', { _id: 'u1', ...nuevoUso() });
  assert(await quota.registrarDiaDeUsoTrial('u1', AHORA) === true && usuarios.get('u1').trialDiasUso === 1 && usuarios.get('u1').trialUltimoDiaUso === '2026-10-13', 'el primer mensaje del día gasta un día de prueba');
  assert(await quota.registrarDiaDeUsoTrial('u1', AHORA) === false && await quota.registrarDiaDeUsoTrial('u1', MAS(0)) === false && usuarios.get('u1').trialDiasUso === 1, 'los demás mensajes del mismo día no gastan nada');
  assert(await quota.registrarDiaDeUsoTrial('u1', MAS(1)) === true && usuarios.get('u1').trialDiasUso === 2, 'al día siguiente, el primer mensaje gasta el segundo día');
  usuarios.set('u2', { _id: 'u2', plan: 'trial', trialExpira: MAS(3) });
  usuarios.set('u3', { _id: 'u3', plan: 'pro', trialModeloUso: true, trialDiasUso: 0, trialUltimoDiaUso: '' });
  assert(await quota.registrarDiaDeUsoTrial('u2', AHORA) === false && await quota.registrarDiaDeUsoTrial('u3', AHORA) === false && !usuarios.get('u2').trialDiasUso && usuarios.get('u3').trialDiasUso === 0, 'una cuenta vieja o un plan pago no gastan días de prueba');
  const simultaneos = await Promise.all([quota.registrarDiaDeUsoTrial('u1', MAS(2)), quota.registrarDiaDeUsoTrial('u1', MAS(2)), quota.registrarDiaDeUsoTrial('u1', MAS(2))]);
  assert(simultaneos.filter(Boolean).length === 1 && usuarios.get('u1').trialDiasUso === 3, 'tres mensajes simultáneos cuentan un solo día');
  const roto = require('../models/User'); const antes = roto.updateOne; roto.updateOne = async () => { throw new Error('Mongo caído'); };
  assert(await quota.registrarDiaDeUsoTrial('u1', MAS(5)) === false, 'si falla la escritura, no se rompe el flujo del bot'); roto.updateOne = antes;

  // ── ruta de cupo por mensaje: la que llama la app por cada mensaje real ──
  usuarios.set('g1', { _id: 'g1', mensajesMes: 0, mesContadorMensajes: '', ...nuevoUso() });
  let r = await llamarGate({ ...usuarios.get('g1') });
  assert(r.status === 200 && r.json.permitido === true && usuarios.get('g1').trialDiasUso === 1, 'quota/check: el mensaje se atiende y gasta el día de hoy');
  r = await llamarGate({ ...usuarios.get('g1') });
  assert(r.status === 200 && usuarios.get('g1').trialDiasUso === 1, 'quota/check: un segundo mensaje el mismo día no gasta otro');
  usuarios.set('g2', { _id: 'g2', ...nuevoUso({ trialDiasUso: 7, trialUltimoDiaUso: '2020-01-01' }) });
  r = await llamarGate({ ...usuarios.get('g2') });
  assert(r.status === 403 && r.json.permitido === false && usuarios.get('g2').trialDiasUso === 7, 'quota/check: con la prueba terminada responde 403 y no gasta ni cuenta nada');
  usuarios.set('g3', { _id: 'g3', plan: 'pro', planExpira: MAS(10), mensajesMes: 0, mesContadorMensajes: '' });
  r = await llamarGate({ ...usuarios.get('g3') });
  assert(r.status === 200 && r.json.permitido === true, 'quota/check: un plan pago sigue igual');

  // ── migración de las pruebas actuales y devolución a quien no la usó ──
  usuarios.clear(); dispositivos.length = 0;
  const base = (id, extra) => usuarios.set(id, { _id: id, plan: 'trial', status: 'activo', createdAt: MAS(-3), ...extra });
  base('vigente', { trialExpira: MAS(4) });
  base('venc-sin-uso-no-instalo', { trialExpira: MAS(-10) });
  base('venc-sin-uso-instalo', { trialExpira: MAS(-10) }); dispositivos.push({ userId: 'venc-sin-uso-instalo', estadoBotEn: null });
  base('venc-conecto', { trialExpira: MAS(-10), botConectado: true });
  base('venc-mensajes', { trialExpira: MAS(-10), mensajesMes: 12 });
  base('venc-informo', { trialExpira: MAS(-10) }); dispositivos.push({ userId: 'venc-informo', estadoBotEn: new Date() });
  base('bloqueado', { trialExpira: MAS(-10), status: 'bloqueado' });
  base('tester', { trialExpira: MAS(-10), esTester: true });
  base('admin', { trialExpira: MAS(-10), rol: 'admin' });
  base('ya-migrado', { trialExpira: MAS(30), trialModeloUso: true, trialDiasUso: 3 });
  usuarios.set('pago', { _id: 'pago', plan: 'pro', status: 'activo', planExpira: MAS(20) });

  const cl = (id) => admin.clasificar(usuarios.get(id), dispositivos.filter((d) => d.userId === id), AHORA);
  assert(cl('vigente') === 'vigente' && cl('venc-sin-uso-no-instalo') === 'reactivar' && cl('venc-sin-uso-instalo') === 'reactivar', 'clasifica: vigente, y vencidas sin uso (hayan instalado o no) para reactivar');
  assert(cl('venc-conecto') === 'vencido-con-uso' && cl('venc-mensajes') === 'vencido-con-uso' && cl('venc-informo') === 'vencido-con-uso', 'quien conectó WhatsApp, tuvo mensajes o informó el estado del bot SÍ usó el programa: no se reactiva');
  assert(['bloqueado', 'tester', 'admin', 'ya-migrado', 'pago'].every((id) => cl(id) === 'ignorar'), 'bloqueados, testers, admins, ya migrados y planes pagos se ignoran');

  const resumen = await admin.resumen({ User: FakeUser, Device: FakeDevice, ahora: AHORA });
  assert(resumen.vigentes === 1 && resumen.reactivar === 2 && resumen.vencidosConUso === 3 && resumen.sinInstalarNunca === 1 && resumen.instalaronSinBot === 1 && resumen.yaMigrados === 1, 'el resumen cuenta cada grupo (y no trae datos personales)');
  assert(!JSON.stringify(resumen).includes('@') && Object.values(resumen).every((v) => typeof v === 'number'), 'el resumen son solo números');
  const simulacion = await admin.migrar({ User: FakeUser, Device: FakeDevice, ahora: AHORA });
  assert(simulacion.aplicado === false && simulacion.vigentesMigrados === 1 && simulacion.reactivados === 2 && !usuarios.get('vigente').trialModeloUso && !usuarios.get('venc-sin-uso-no-instalo').trialModeloUso, 'sin confirmar solo cuenta: no se modifica nada');
  const hecho = await admin.migrar({ User: FakeUser, Device: FakeDevice, ahora: AHORA, confirmar: true });
  const vg = usuarios.get('vigente'); const rx = usuarios.get('venc-sin-uso-no-instalo');
  assert(hecho.aplicado && vg.trialModeloUso === true && vg.trialDiasUso === 0 && new Date(vg.trialExpira) > MAS(50) && !vg.trialReactivado, 'una prueba vigente pasa al modelo por uso con 0 días gastados y tope de 60 días desde el alta');
  assert(rx.trialModeloUso === true && rx.trialDiasUso === 0 && rx.trialReactivado && new Date(rx.trialExpira).getTime() === MAS(60).getTime() && P.vigenciaTrial(rx, AHORA).vigente, 'a quien no usó el programa se le devuelve la prueba: 7 días de uso nuevos y 60 días de tope');
  assert(!usuarios.get('venc-conecto').trialModeloUso && !usuarios.get('bloqueado').trialModeloUso && !usuarios.get('tester').trialModeloUso && usuarios.get('pago').plan === 'pro', 'a quien sí la usó, a los bloqueados, testers y planes pagos no se les toca nada');
  const otra = await admin.migrar({ User: FakeUser, Device: FakeDevice, ahora: AHORA, confirmar: true });
  assert(otra.vigentesMigrados === 0 && otra.reactivados === 0, 'es idempotente: correrlo de nuevo no cambia nada');

  console.log('\n✅ Todos los tests de la prueba por uso pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
