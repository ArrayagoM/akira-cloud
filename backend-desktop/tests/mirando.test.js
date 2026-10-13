// tests/mirando.test.js — la marca de "alguien está mirando" y el límite de resúmenes por PC (servidor).
'use strict';
const { MIRANDO_MS, ENTRE_RESUMENES_MS, estaMirando, puedeActualizarResumen, marcarMirando } = require('../lib/mirando');
const { sanearResumen } = require('../lib/resumen-negocio');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[mirando · resumen en vivo] Tests:');
  const ahora = new Date('2026-10-13T15:00:00Z');
  assert(estaMirando({ vistoEn: new Date(ahora.getTime() - 30_000) }, ahora) && estaMirando({ vistoEn: new Date(ahora.getTime() - MIRANDO_MS) }, ahora), 'consultado hace menos de 2 minutos: están mirando');
  assert(!estaMirando({ vistoEn: new Date(ahora.getTime() - MIRANDO_MS - 1000) }, ahora) && !estaMirando({ vistoEn: null }, ahora) && !estaMirando({}, ahora) && !estaMirando(null, ahora), 'pasados 2 minutos, nunca o sin dato: nadie mira');

  assert(puedeActualizarResumen({ resumenEn: null }, ahora) && puedeActualizarResumen({}, ahora) && puedeActualizarResumen({ resumenEn: new Date(ahora.getTime() - ENTRE_RESUMENES_MS) }, ahora), 'se acepta el primer resumen y uno pasados 4 segundos');
  assert(!puedeActualizarResumen({ resumenEn: new Date(ahora.getTime() - 1000) }, ahora), 'dos resúmenes con menos de 4 segundos no se aceptan (protege la base ante una PC que se descontrole)');

  // marcarMirando: una sola escritura por consulta, con filtro para no reescribir seguido, y nunca rompe
  const llamadas = [];
  await marcarMirando({ updateMany: async (filtro, cambio) => { llamadas.push([filtro, cambio]); } }, 'u1', ahora);
  assert(llamadas.length === 1 && llamadas[0][0].userId === 'u1' && llamadas[0][0].activo === true && llamadas[0][0].revocado === false && llamadas[0][1].$set.vistoEn === ahora, 'marca solo las PCs activas de ese usuario');
  const cond = llamadas[0][0].$or; const limite = cond.find((c) => c.vistoEn && c.vistoEn.$lt).vistoEn.$lt;
  assert(ahora.getTime() - limite.getTime() === 30_000 && cond.length === 3, 'solo reescribe la marca si tiene más de 30 segundos (no escribe en cada consulta)');
  await marcarMirando({ updateMany: async () => { throw new Error('base caída'); } }, 'u1', ahora);
  assert(true, 'si la base falla, la consulta no se rompe');

  // el resumen que llega sigue pasando por el mismo filtro de privacidad
  const r = sanearResumen({ mensajesHoy: 5, turnosHoy: 2, mes: '2026-10', nombre: 'Ana', telefono: '549224', chat: 'hola' });
  assert(r && r.mensajesHoy === 5 && r.mes === '2026-10' && !('nombre' in r) && !('telefono' in r) && !('chat' in r), 'el resumen en vivo solo deja pasar contadores (nada de nombres, teléfonos ni chats)');
  assert(sanearResumen({ nombre: 'solo texto' }) === null && sanearResumen(null) === null, 'sin ningún contador válido se rechaza');

  // la ruta está conectada
  const fs = require('fs'); const path = require('path');
  const rutas = fs.readFileSync(path.join(__dirname, '../routes/licenses.routes.js'), 'utf8');
  const movil = fs.readFileSync(path.join(__dirname, '../routes/mobile.routes.js'), 'utf8');
  assert(rutas.includes("router.post('/resumen', requireAuth") && rutas.includes('puedeActualizarResumen') && rutas.includes('sanearResumen(resumen)') && rutas.includes('calcularVigencia(req.user).vigente'), 'POST /api/licenses/resumen: exige sesión, equipo activo, plan vigente, límite de frecuencia y filtro de privacidad');
  assert(movil.includes('marcarMirando(Device') && rutas.includes('marcarMirando(Device'), 'consultar el estado desde el celular o la web marca que hay alguien mirando');

  console.log('\n✅ Todos los tests de resumen en vivo (servidor) pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
