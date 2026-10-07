// tests/uso.test.js — estadísticas de uso por pantalla: solo contadores de una lista fija, idempotentes y sin datos de clientes.
'use strict';

const uso = require('../lib/uso');
const svc = require('../services/uso.service');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[uso] Tests:');
  const ahora = new Date('2026-10-07T15:00:00Z');
  assert(uso.sanearUso('x', ahora).length === 0 && uso.sanearUso(null, ahora).length === 0 && uso.sanearUso([], ahora).length === 0, 'datos que no son una lista se ignoran');
  const s = uso.sanearUso([{ dia: '2026-10-07', pantallas: { caja: 3, reportes: '2', 'cliente-juan-perez': 9, config: -1, agenda: 999999, chats: 0, vender: 1.9 } }], ahora);
  const p = s[0].pantallas;
  assert(s.length === 1 && p.caja === 3 && p.reportes === 2 && p.agenda === 5000 && p.vender === 1 && !('cliente-juan-perez' in p) && !('config' in p) && !('chats' in p), 'solo pantallas conocidas, números enteros positivos y con tope (nada de claves inventadas)');
  assert(uso.sanearUso([{ dia: '2026-09-01', pantallas: { caja: 1 } }, { dia: 'ayer', pantallas: { caja: 1 } }, { dia: '2030-01-01', pantallas: { caja: 1 } }, { dia: '2026-10-06', pantallas: { caja: 1 } }], ahora).map((x) => x.dia).join() === '2026-10-06', 'solo días recientes (no el futuro ni fechas viejas o raras)');
  assert(uso.sanearUso(Array.from({ length: 10 }, () => ({ dia: '2026-10-07', pantallas: { caja: 1 } })), ahora).length === 3, 'como mucho 3 días por aviso');
  assert(uso.PANTALLAS.every((x) => /^[a-z]+$/.test(x)) && !uso.PANTALLAS.some((x) => /monto|nombre|mensaje|telefono|email/.test(x)), 'la lista son nombres de pantallas fijos (nada que pueda contener datos de clientes)');

  // guardar: idempotente
  const tabla = new Map();
  const UsoDia = { findOneAndUpdate: async (q, u) => { const k = `${q.deviceId}|${q.dia}`; tabla.set(k, { ...(tabla.get(k) || {}), ...u.$set }); } };
  let n = await svc.guardarUso({ UsoDia, userId: 'u1', deviceId: 'd1', version: '1.0.23', datos: [{ dia: '2026-10-07', pantallas: { caja: 3 } }], ahora });
  n += await svc.guardarUso({ UsoDia, userId: 'u1', deviceId: 'd1', version: '1.0.23', datos: [{ dia: '2026-10-07', pantallas: { caja: 5, agenda: 2 } }, { dia: '2026-10-06', pantallas: { agenda: 1 } }], ahora });
  assert(n === 3 && tabla.size === 2 && tabla.get('d1|2026-10-07').pantallas.caja === 5, 'reenviar el mismo día pisa el valor (no suma dos veces)');
  assert(await svc.guardarUso({ UsoDia, userId: 'u1', deviceId: 'd1', datos: [{ dia: '2026-10-07', pantallas: { inventada: 4 } }], ahora }) === 0 && tabla.size === 2, 'un aviso sin pantallas válidas no guarda nada');

  // resumen
  const docs = [
    { userId: 'a', dia: '2026-10-05', pantallas: { caja: 4, agenda: 10 } }, { userId: 'a', dia: '2026-10-06', pantallas: { caja: 2 } },
    { userId: 'b', dia: '2026-10-06', pantallas: { agenda: 5, chats: 1 } }, { userId: 'b', dia: '2026-10-07', pantallas: { agenda: 1 } },
  ];
  const r = uso.resumir(docs, { dias: 30 });
  assert(r.usuarios === 2 && r.activosPorDia.map((d) => `${d.dia}:${d.usuarios}`).join() === '2026-10-05:1,2026-10-06:2,2026-10-07:1', 'usuarios activos por día');
  assert(r.pantallas[0].pantalla === 'agenda' && r.pantallas[0].usuarios === 2 && r.pantallas[0].aperturas === 16 && r.pantallas.find((x) => x.pantalla === 'caja').usuarios === 1, 'pantallas más usadas (por cuántos usuarios y cuántas aperturas)');
  assert(r.sinUso.includes('reportes') && !r.sinUso.includes('caja'), 'las funciones que nadie usa (para saber qué mejorar o explicar mejor)');
  const Dev = { find: () => ({ lean: async () => [{ version: '1.0.23' }, { version: '1.0.23' }, { version: '1.0.20' }, {}] }) };
  const UsoLista = { find: () => ({ lean: async () => docs.filter((d) => d.dia >= '2026-10-06') }) };
  const adm = await svc.resumenAdmin({ UsoDia: UsoLista, Device: Dev, dias: 2, ahora });
  assert(adm.equiposActivos === 4 && adm.versiones['1.0.23'] === 2 && adm.versiones['sin dato'] === 1 && adm.usuarios === 2, 'resumen del administrador: equipos y versiones instaladas');

  console.log('\n✅ Todos los tests de uso pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
