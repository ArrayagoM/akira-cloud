// tests/resumen-vivo.test.js — el resumen llega al celular/web apenas cambia algo (no cada 15 minutos), sin saturar al servidor.
'use strict';
const { crearServicio, firmaEstado } = require('../main/resumen-vivo');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[resumen en vivo] Tests:');
  let t = 1_000_000; let encendido = true; let uid = 'u1'; let resumen = { mensajesHoy: 1, ingresosMes: 100 }; let estado = { pausado: false, vacaciones: false, slots: [{ slot: 0, conectado: true, deseado: true, desdeMs: 0 }] };
  let respuesta = { mirando: false }; let falla = null; const enviados = [];
  const s = crearServicio({
    activo: () => encendido, obtenerUserId: () => uid, calcular: async () => ({ ...resumen }), estadoBot: async () => estado,
    enviar: async (d) => { if (falla) throw falla; enviados.push(d); return respuesta; }, ahora: () => t, setI: () => ({ unref() {} }), clearI() {},
  });
  const pasar = (ms) => { t += ms; };

  let r = await s.tick();
  assert(r.enviado && enviados.length === 1 && enviados[0].resumen.mensajesHoy === 1 && enviados[0].estadoBot.slots.length === 1, 'la primera vez manda el resumen y el estado del bot');
  pasar(10_000); r = await s.tick();
  assert(!r.enviado && r.motivo === 'sin_cambios' && enviados.length === 1, 'si no cambió nada no manda nada (el latido de 15 min ya cubre la señal de vida)');

  resumen = { mensajesHoy: 2, ingresosMes: 100 }; pasar(10_000); r = await s.tick();
  assert(!r.enviado && r.motivo === 'muy_pronto', 'si cambió pero nadie mira, espera 1 minuto entre envíos (no satura al servidor)');
  pasar(60_000); r = await s.tick();
  assert(r.enviado && enviados.length === 2 && enviados[1].resumen.mensajesHoy === 2, 'pasado el minuto, manda el cambio');

  respuesta = { mirando: true };
  resumen = { mensajesHoy: 3, ingresosMes: 100 }; pasar(60_000); r = await s.tick();
  assert(r.enviado && r.mirando && s.estado().mirando, 'el servidor avisa que hay alguien mirando');
  resumen = { mensajesHoy: 4, ingresosMes: 100 }; pasar(5_000); r = await s.tick();
  assert(!r.enviado && r.motivo === 'muy_pronto', 'aun mirando, nunca más de uno cada 10 segundos');
  pasar(6_000); r = await s.tick();
  assert(r.enviado && enviados.length === 4 && enviados[3].resumen.mensajesHoy === 4, 'mirando: el cambio llega a los 10 segundos (tiempo real)');

  respuesta = { mirando: false }; estado = { ...estado, slots: [{ slot: 0, conectado: false, deseado: true, desdeMs: 5000 }] }; pasar(11_000); r = await s.tick();
  assert(r.enviado && enviados[4].estadoBot.slots[0].conectado === false, 'si el bot se desconecta, se informa enseguida (también dispara el aviso de caída más rápido)');

  const antes = enviados.length; pasar(61_000); r = await s.tick();
  assert(!r.enviado && r.motivo === 'sin_cambios', 'los contadores de tiempo del estado (desdeMs) no cuentan como cambio');
  estado = { ...estado, slots: [{ slot: 0, conectado: false, deseado: true, desdeMs: 999999 }] }; pasar(61_000); r = await s.tick();
  assert(!r.enviado && enviados.length === antes, 'el tiempo que lleva caído tampoco');
  pasar(10 * 60_000); r = await s.tick();
  assert(r.enviado, 'aunque no cambie nada, cada 10 minutos se reenvía por si el servidor perdió el dato');

  falla = new Error('sin internet'); resumen = { mensajesHoy: 9, ingresosMes: 100 }; pasar(61_000); const n = enviados.length; r = await s.tick();
  assert(!r.enviado && r.motivo === 'error' && enviados.length === n, 'sin internet no se rompe nada');
  falla = null; pasar(1_000); r = await s.tick();
  assert(r.enviado && enviados[enviados.length - 1].resumen.mensajesHoy === 9, 'cuando vuelve internet, se reintenta enseguida con lo último (no se pierde el cambio)');

  encendido = false; resumen = { mensajesHoy: 50 }; pasar(10 * 60_000); const m = enviados.length; r = await s.tick();
  assert(!r.enviado && r.motivo === 'apagado' && enviados.length === m, 'si el usuario apagó "Ver tu negocio desde el celular", no se manda nada');
  encendido = true; uid = null; pasar(10 * 60_000); r = await s.tick();
  assert(!r.enviado && r.motivo === 'sin_sesion', 'sin sesión iniciada tampoco');
  uid = 'u1';

  // un cálculo que tarda no se pisa con el siguiente
  let suelta; const s2 = crearServicio({ activo: () => true, obtenerUserId: () => 'u1', calcular: () => new Promise((ok) => { suelta = () => ok({ mensajesHoy: 1 }); }), estadoBot: async () => null, enviar: async () => ({}), ahora: () => t, setI: () => ({ unref() {} }), clearI() {} });
  const p1 = s2.tick(); const p2 = await s2.tick();
  assert(p2.motivo === 'ocupado', 'si el cálculo anterior sigue en curso, no se arma otro encima');
  suelta(); await p1;

  assert(firmaEstado({ pausado: true, slots: [{ slot: 1, conectado: true, deseado: true, desdeMs: 1 }] }) === firmaEstado({ pausado: true, slots: [{ slot: 1, conectado: true, deseado: true, desdeMs: 99 }] }) && firmaEstado(null) === '', 'la firma del estado ignora los tiempos');

  console.log('\n✅ Todos los tests del resumen en vivo pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
