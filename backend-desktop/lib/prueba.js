// lib/prueba.js
// La prueba gratis cuenta DÍAS DE USO, no días de calendario: un día se gasta solo si ese día el bot atendió al menos un mensaje de un
// cliente (se anota en POST /api/bot/quota/check, que se llama por cada mensaje real). Así quien se registra y recién prueba Akira a las
// dos semanas no la pierde sin haberla usado.
//
//  · La prueba dura 7 días de uso (o 100 mensajes: ese tope ya existe, ver config/planes.js).
//  · Hay un tope por calendario (60 días desde el alta) para que nadie la estire para siempre con un mensaje por semana.
//  · El séptimo día de uso se puede usar completo; la prueba termina recién el primer día de uso siguiente (o por el tope de calendario).
//  · Las cuentas que todavía no pasaron al modelo nuevo (sin trialModeloUso) siguen con la regla vieja de calendario, así que desplegar
//    este código no cambia nada hasta que se las migra (ver POST /api/admin/prueba/migrar).
// Funciones puras (sin Mongo): probadas en tests/prueba-uso.test.js.
'use strict';

const DIAS_USO = 7;
const TOPE_DIAS = 60;
const DIA_MS = 24 * 60 * 60 * 1000;
const ZONA = 'America/Argentina/Buenos_Aires';

// "YYYY-MM-DD" en hora de Argentina: el día de uso cambia a la medianoche local, no a la de UTC.
function hoyAR(ahora = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  return p; // en-CA ya da AAAA-MM-DD
}

const topeDesde = (desde) => new Date(new Date(desde).getTime() + TOPE_DIAS * DIA_MS);

// → { vigente, modelo, expira (tope o fecha vieja), diasUso, diasMax, diasRestantes, hoyContado, motivo }
function vigenciaTrial(user, ahora = new Date()) {
  const exp = user.trialExpira ? new Date(user.trialExpira) : null;
  if (!user.trialModeloUso) { // regla vieja: calendario
    const vigente = !!exp && exp > ahora;
    return { vigente, modelo: 'calendario', expira: exp, diasUso: null, diasMax: null, diasRestantes: exp ? Math.max(0, Math.ceil((exp - ahora) / DIA_MS)) : 0, hoyContado: false, motivo: vigente ? null : 'calendario' };
  }
  const usados = Math.max(0, Number(user.trialDiasUso) || 0);
  const hoy = hoyAR(ahora);
  const hoyContado = user.trialUltimoDiaUso === hoy;
  const topeOk = !!exp && exp > ahora;
  const agotado = usados >= DIAS_USO && !hoyContado;
  const vigente = topeOk && !agotado;
  const restantes = Math.max(0, DIAS_USO - usados);
  return { vigente, modelo: 'uso', expira: exp, diasUso: Math.min(usados, DIAS_USO), diasMax: DIAS_USO, diasRestantes: restantes, hoyContado, motivo: vigente ? null : (!topeOk ? 'tope' : 'dias') };
}

// Condición para anotar el día de uso de hoy (la usa un updateOne atómico: así dos mensajes simultáneos no cuentan dos días).
function filtroDiaDeUso(userId, ahora = new Date()) {
  return { _id: userId, plan: 'trial', trialModeloUso: true, trialUltimoDiaUso: { $ne: hoyAR(ahora) } };
}
const cambioDiaDeUso = (ahora = new Date()) => ({ $inc: { trialDiasUso: 1 }, $set: { trialUltimoDiaUso: hoyAR(ahora) } });

module.exports = { DIAS_USO, TOPE_DIAS, DIA_MS, hoyAR, topeDesde, vigenciaTrial, filtroDiaDeUso, cambioDiaDeUso };
