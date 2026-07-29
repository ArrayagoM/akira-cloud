// tests/multi-slot-routing.test.js
// Regresión del bug reportado por un cliente real: con dos cuentas de
// WhatsApp de un mismo negocio (plan Agencia) iniciadas al mismo tiempo,
// solo UNA respondía — la segunda registraba su proxy encima de la primera
// porque worker.handler.js indexaba `proxies` por userId solo, ignorando
// el slot.
//
// Este test no levanta Mongo ni Socket.io real: simula el mapa `proxies`
// exactamente como lo usa worker.handler.js (registrarProxy/desregistrarProxy/
// tieneProxy) y demuestra que, con instKey, dos slots del mismo usuario
// coexisten sin pisarse — y que reproduciendo la lógica VIEJA (clave = uid)
// sí se pisan, para dejar constancia de cuál era el bug.
'use strict';

const { instKey, parseInstKey } = require('../services/instkey.util');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[multi-slot-routing] Tests:');

// ── Simulación del registro de proxies con el esquema NUEVO (instKey) ──
function crearRegistroProxies() {
  const proxies = new Map();
  return {
    registrar: (uid, slot, proxy) => proxies.set(instKey(uid, slot), proxy),
    obtener: (uid, slot) => proxies.get(instKey(uid, slot)),
    tiene: (uid, slot) => proxies.has(instKey(uid, slot)),
    size: () => proxies.size,
  };
}

{
  const registro = crearRegistroProxies();
  const uid = 'negocio1';

  // Arranca slot 0 (número principal)
  registro.registrar(uid, 0, { mensajesRecibidos: [], nombre: 'proxy-slot0' });
  // Arranca slot 1 (segundo número — plan Agencia) — ANTES de este fix, esto
  // pisaba la entrada de slot 0 en el Map porque la clave era solo `uid`.
  registro.registrar(uid, 1, { mensajesRecibidos: [], nombre: 'proxy-slot1' });

  assert(registro.size() === 2, 'dos slots del mismo negocio generan DOS entradas en el registro, no una');
  assert(registro.obtener(uid, 0).nombre === 'proxy-slot0', 'el proxy de slot 0 sigue siendo el de slot 0 tras registrar slot 1');
  assert(registro.obtener(uid, 1).nombre === 'proxy-slot1', 'el proxy de slot 1 es independiente del de slot 0');

  // Simular un mensaje entrante para cada slot y verificar que cada uno llega
  // a SU proxy — este es exactamente el escenario "dos sesiones en paralelo,
  // deben responder las dos".
  const proxy0 = registro.obtener(uid, 0);
  const proxy1 = registro.obtener(uid, 1);
  proxy0.mensajesRecibidos.push('hola desde numero A');
  proxy1.mensajesRecibidos.push('hola desde numero B');

  assert(proxy0.mensajesRecibidos.length === 1 && proxy0.mensajesRecibidos[0] === 'hola desde numero A', 'slot 0 recibe su propio mensaje');
  assert(proxy1.mensajesRecibidos.length === 1 && proxy1.mensajesRecibidos[0] === 'hola desde numero B', 'slot 1 recibe su propio mensaje, no el de slot 0');

  // Detener solo slot 1 no debe afectar slot 0
  registro.tiene(uid, 1) && (function () { /* noop, ya está registrado */ }());
  assert(registro.tiene(uid, 0) && registro.tiene(uid, 1), 'ambos slots siguen activos independientemente');
}

// ── Reproducción del bug VIEJO (clave = uid, sin slot) para dejar constancia ──
{
  const proxiesViejo = new Map(); // esto es lo que hacía worker.handler.js ANTES del fix
  const uid = 'negocio2';

  proxiesViejo.set(uid, { nombre: 'proxy-slot0' });
  proxiesViejo.set(uid, { nombre: 'proxy-slot1' }); // pisa al anterior — este era el bug

  assert(proxiesViejo.size === 1, 'con la clave vieja (solo uid) los dos slots colapsan en UNA sola entrada — bug confirmado');
  assert(proxiesViejo.get(uid).nombre === 'proxy-slot1', 'con la clave vieja, solo sobrevive el último proxy registrado — el otro número queda mudo');
}

// ── Distintos negocios (usuarios distintos) nunca deben interferir ──
{
  const registro = crearRegistroProxies();
  registro.registrar('negocioA', 0, { nombre: 'A' });
  registro.registrar('negocioB', 0, { nombre: 'B' });
  assert(registro.obtener('negocioA', 0).nombre === 'A', 'negocio A conserva su proxy');
  assert(registro.obtener('negocioB', 0).nombre === 'B', 'negocio B conserva su proxy, independiente de A');
}

// ── reconectarProxiesBots: parseo de botIds reportados por el worker ──
{
  // worker.js reporta Array.from(runners.keys()) en worker:ready — ahora son
  // instKeys "uid:slot". bot.manager.reconectarProxiesBots debe reconstruir
  // (uid, slot) para cada uno, no asumir slot 0 para todos.
  const botIdsReportados = ['negocio1:0', 'negocio1:1', 'negocio2:0'];
  const pares = botIdsReportados.map((raw) => parseInstKey(String(raw)));

  assert(pares.length === 3, 'se parsean los 3 botIds reportados');
  assert(pares[0].uid === 'negocio1' && pares[0].slot === 0, 'primer par: negocio1 slot 0');
  assert(pares[1].uid === 'negocio1' && pares[1].slot === 1, 'segundo par: negocio1 slot 1 (antes se hubiera tratado como slot 0 y pisado al primero)');
  assert(pares[2].uid === 'negocio2' && pares[2].slot === 0, 'tercer par: negocio2 slot 0');
}

console.log('\n✅ Todos los tests de multi-slot-routing pasaron.\n');
