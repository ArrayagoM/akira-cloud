// tests/cobro.test.js — el cobro de suscripciones: precios, pago suficiente, un pago activa el plan UNA vez y renovar suma tiempo.
// Antes de esta revisión: (1) repetir el mismo payment_id renovaba el plan gratis cada vez, (2) no se comprobaba cuánto se pagó,
// (3) renovar antes de que venza hacía perder los días que quedaban, (4) el vencimiento del link iba en UTC ("Z") y Mercado Pago puede
// leerlo 3 horas antes (botón "Pagar" en gris).
'use strict';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_key_de_al_menos_32_caracteres_1234';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/akira-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
const path = require('path');
const Module = require('module');
const C = require('../lib/cobro');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[cobro de suscripciones] Tests:');

  // ── precios ──
  const P = C.armarPlanes();
  assert(P.basico_mensual.precio === 21000 && P.pro_mensual.precio === 49000 && P.agencia_mensual.precio === 112000, 'precios mensuales: Básico $21.000, Pro $49.000, Agencia $112.000 (40 % más que $15.000, $35.000 y $80.000)');
  assert(P.basico_anual.precio === 201600 && P.pro_anual.precio === 470400 && P.agencia_anual.precio === 1075200, 'precios anuales: 12 meses con 20 % de descuento ($201.600, $470.400, $1.075.200)');
  for (const k of ['basico', 'pro', 'agencia']) assert(Math.round(P[`${k}_mensual`].precio * 12 * 0.8) === P[`${k}_anual`].precio && P[`${k}_anual`].meses === 12 && P[`${k}_mensual`].meses === 1, `${k}: el anual es exactamente 12 meses menos 20 % (el "20 % OFF" es verdad)`);
  assert(C.PRECIOS_ANTERIORES.pro_mensual * 1.4 === P.pro_mensual.precio && C.PRECIOS_ANTERIORES.basico_mensual * 1.4 === P.basico_mensual.precio && C.PRECIOS_ANTERIORES.agencia_mensual * 1.4 === P.agencia_mensual.precio, 'el aumento fue exactamente del 40 %');

  // ── ¿el pago alcanza? ──
  const pro = P.pro_mensual; const ok = (x) => C.verificarMonto({ pago: x, planInfo: pro, descuentoAplicado: 0 });
  assert(ok({ transaction_amount: 49000, currency_id: 'ARS', metadata: { precio_esperado: 49000 } }).ok, 'pago exacto: alcanza');
  assert(!ok({ transaction_amount: 4900, currency_id: 'ARS', metadata: { precio_esperado: 49000 } }).ok && !ok({ transaction_amount: 1, currency_id: 'ARS' }).ok, 'pagar de menos NO activa el plan');
  assert(!ok({ transaction_amount: 49000, currency_id: 'USD' }).ok && !ok({ transaction_amount: 'abc' }).ok && !ok({ transaction_amount: 0 }).ok && !ok(null).ok, 'otra moneda, monto ilegible o cero: no activa');
  assert(C.verificarMonto({ pago: { transaction_amount: 44000, metadata: { precio_esperado: 44000 } }, planInfo: pro, descuentoAplicado: 5000 }).ok, 'con el descuento por referido de $5.000 alcanza pagar $44.000');
  assert(!C.verificarMonto({ pago: { transaction_amount: 44000 }, planInfo: pro, descuentoAplicado: 9000 }).ok, 'un descuento mayor a $5.000 (dato adulterado) se rechaza');
  assert(C.verificarMonto({ pago: { transaction_amount: 35000, date_created: '2026-10-14T20:00:00-03:00' }, planInfo: pro }).ok, 'un link armado ANTES del aumento y pagado en el margen de la hora siguiente se acepta al precio viejo');
  assert(!C.verificarMonto({ pago: { transaction_amount: 35000, date_created: '2026-11-01T12:00:00-03:00' }, planInfo: pro }).ok, 'pasado ese margen, el precio viejo ya no sirve');
  assert(!C.verificarMonto({ pago: { transaction_amount: 35000, date_created: '2026-10-14T20:00:00-03:00', metadata: { precio_esperado: 49000 } }, planInfo: pro }).ok, 'si la preferencia nueva dice $49.000, pagar $35.000 no alcanza aunque el pago sea reciente');

  // ── hasta cuándo queda activo ──
  const hoy = new Date('2026-10-14T12:00:00Z'); const en = (d) => new Date(d).toISOString().slice(0, 10);
  assert(en(C.nuevaExpiracion({ ahora: hoy, planKey: 'pro', meses: 1 })) === '2026-11-14', 'sin plan previo: un mes desde hoy');
  assert(en(C.nuevaExpiracion({ ahora: hoy, planExpiraActual: '2026-10-20T00:00:00Z', planActual: 'pro', planKey: 'pro', meses: 1 })) === '2026-11-20', 'renovar el mismo plan antes de que venza SUMA al tiempo que quedaba (no se pierden los 6 días)');
  assert(en(C.nuevaExpiracion({ ahora: hoy, planExpiraActual: '2026-10-01T00:00:00Z', planActual: 'pro', planKey: 'pro', meses: 1 })) === '2026-11-14', 'plan ya vencido: cuenta desde hoy');
  assert(en(C.nuevaExpiracion({ ahora: hoy, planExpiraActual: '2026-10-20T00:00:00Z', planActual: 'basico', planKey: 'pro', meses: 12 })) === '2027-10-14', 'cambio de plan: el nuevo plan cuenta desde hoy');
  assert(en(C.nuevaExpiracion({ ahora: hoy, planKey: 'agencia', meses: 12 })) === '2027-10-14', 'anual: doce meses');

  // ── fecha de vencimiento del link para Mercado Pago ──
  const f = C.aFechaMercadoPago(new Date('2026-10-14T15:00:00.000Z'));
  assert(f === '2026-10-14T12:00:00.000-03:00', `el vencimiento va en hora argentina con -03:00 (${f}), no en UTC con "Z"`);

  // ── activación con base de datos simulada ──
  const usuarios = new Map(); const logs = []; let referidoPendiente = null;
  const cadena = (valor) => ({ select() { return { lean: async () => valor, then: (r, j) => Promise.resolve(valor).then(r, j) }; }, lean: async () => valor, then: (r, j) => Promise.resolve(valor).then(r, j) });
  const UserFalso = {
    findOneAndUpdate(filtro, upd) {
      const u = usuarios.get(String(filtro._id)); const id = filtro.pagosMpProcesados && filtro.pagosMpProcesados.$ne;
      if (!u || (id && u.pagosMpProcesados.includes(id))) return cadena(null);
      const antes = { plan: u.plan, planExpira: u.planExpira }; if (upd.$push) u.pagosMpProcesados.push(...upd.$push.pagosMpProcesados.$each); return cadena(antes);
    },
    async findByIdAndUpdate(id, set) { const u = usuarios.get(String(id)); if (u && set) Object.assign(u, set); return u; },
    findById(id) { return cadena(usuarios.get(String(id)) || null); },
  };
  const inyectar = (rel, ex) => { const f2 = path.join(__dirname, '..', rel); Module._cache[f2] = { id: f2, filename: f2, loaded: true, exports: ex, children: [], paths: [] }; };
  inyectar('models/User.js', UserFalso);
  inyectar('models/Referido.js', { findOne: async () => referidoPendiente });
  inyectar('models/Log.js', { registrar: async (x) => { logs.push(x); } });
  const pagosAsentados = [];
  inyectar('models/Pago.js', { create: async (x) => { pagosAsentados.push(x); return x; } });
  const rutas = require('../routes/subscription.routes');
  const activar = rutas.activarPlanYProcesarReferido; const PL = rutas.PLANES;
  const pago = (id, monto, extra = {}) => ({ id, transaction_amount: monto, currency_id: 'ARS', metadata: { precio_esperado: monto }, ...extra });

  usuarios.set('u1', { plan: 'trial', planExpira: null, pagosMpProcesados: [] });
  let r = await activar({ userId: 'u1', planKey: 'pro', periodo: 'mensual', planInfo: PL.pro_mensual, descuentoAplicado: 0, pago: pago(111, 49000) });
  assert(r.activado && usuarios.get('u1').plan === 'pro' && usuarios.get('u1').planExpira > new Date(), 'un pago correcto activa el plan');

  const exp1 = usuarios.get('u1').planExpira.getTime();
  r = await activar({ userId: 'u1', planKey: 'pro', periodo: 'mensual', planInfo: PL.pro_mensual, descuentoAplicado: 0, pago: pago(111, 49000) });
  assert(!r.activado && r.motivo === 'ya_procesado' && usuarios.get('u1').planExpira.getTime() === exp1, 'repetir el MISMO pago (el /return, el /verificar-pago y el webhook llegan los tres) no extiende el plan: se activa una sola vez');
  for (let i = 0; i < 5; i++) await activar({ userId: 'u1', planKey: 'pro', periodo: 'mensual', planInfo: PL.pro_mensual, descuentoAplicado: 0, pago: pago(111, 49000) });
  assert(usuarios.get('u1').planExpira.getTime() === exp1, 'ni siquiera repitiéndolo muchas veces (antes: renovación gratis infinita)');

  r = await activar({ userId: 'u1', planKey: 'pro', periodo: 'mensual', planInfo: PL.pro_mensual, descuentoAplicado: 0, pago: pago(222, 49000) });
  const dias = (usuarios.get('u1').planExpira.getTime() - exp1) / 86400000;
  assert(r.activado && dias >= 28 && dias <= 31, `un segundo pago distinto (renovación) SUMA un mes al vencimiento (+${Math.round(dias)} días)`);

  usuarios.set('u2', { plan: 'trial', planExpira: null, pagosMpProcesados: [] });
  r = await activar({ userId: 'u2', planKey: 'pro', periodo: 'mensual', planInfo: PL.pro_mensual, descuentoAplicado: 0, pago: { id: 333, transaction_amount: 100, currency_id: 'ARS' } });
  assert(!r.activado && r.motivo === 'monto' && usuarios.get('u2').plan === 'trial' && !usuarios.get('u2').pagosMpProcesados.length, 'un pago aprobado por $100 no activa el plan Pro, y queda sin "reclamar" (si después completa, se puede aplicar)');
  assert(logs.some((l) => /no activó el plan/.test(l.mensaje)), 'queda registrado en el log para revisarlo');

  r = await activar({ userId: 'no-existe', planKey: 'pro', periodo: 'mensual', planInfo: PL.pro_mensual, descuentoAplicado: 0, pago: pago(444, 49000) });
  assert(!r.activado, 'un pago a nombre de un usuario que no existe no activa nada ni rompe');

  usuarios.set('u3', { plan: 'pro', planExpira: new Date(Date.now() + 10 * 86400000), pagosMpProcesados: [] });
  const antes3 = usuarios.get('u3').planExpira.getTime();
  r = await activar({ userId: 'u3', planKey: 'agencia', periodo: 'anual', planInfo: PL.agencia_anual, descuentoAplicado: 0, pago: pago(555, 1075200) });
  assert(r.activado && usuarios.get('u3').plan === 'agencia' && usuarios.get('u3').planExpira.getTime() > antes3 + 300 * 86400000, 'pasar a otro plan anual: activa Agencia por 12 meses');

  // cada cobro que activa un plan queda asentado UNA vez para el panel de ingresos (lo que MP cobró de verdad)
  assert(pagosAsentados.map((x) => x.mpPagoId).join() === '111,222,555', `se asientan los 3 cobros que activaron un plan (${pagosAsentados.map((x) => x.mpPagoId)}) y no los repetidos, rechazados ni de usuario inexistente`);
  assert(pagosAsentados[0].monto === 49000 && pagosAsentados[0].plan === 'pro' && pagosAsentados[0].periodo === 'mensual' && pagosAsentados[2].monto === 1075200 && pagosAsentados[2].periodo === 'anual', 'el cobro asentado guarda monto, plan y período');

  // el endpoint público de planes devuelve los precios nuevos
  assert(rutas.PLANES.pro_anual.precio === 470400, 'la ruta usa los mismos precios que lib/cobro.js');

  console.log('\n✅ Todos los tests del cobro de suscripciones pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
