'use strict';
process.env.JWT_SECRET = 'test-secret';
const assert = require('assert');
const { CAMPANAS } = require('../services/email.novedades');

const claves = Object.keys(CAMPANAS);
assert(claves.includes('actualizacion-2026-10') && claves.includes('actualizacion-2026-10b'), 'campañas registradas');

for (const k of claves) {
  const c = CAMPANAS[k];
  assert(typeof c.asunto() === 'string' && c.asunto().length > 5, `${k}: asunto`);
  const h = c.html({ nombre: 'Ana', userId: 'u1', version: '1.0.24' });
  assert(h.includes('Hola, Ana'), `${k}: saludo`);
  assert(h.includes('baja-novedades'), `${k}: link de baja`);
  assert(!/undefined|\[object/.test(h), `${k}: sin valores sin resolver`);
}

// La campaña nueva refleja lo publicado y no promete lo que ya existe como "en camino".
const nueva = CAMPANAS['actualizacion-2026-10b'].html({ nombre: 'Ana', userId: 'u1', version: '1.0.24' });
const enCamino = nueva.split('En camino')[1] || '';
assert(!/Reportes|Importar clientes/.test(enCamino), 'no listar como futuro lo que ya existe');
for (const t of ['Presupuestos y recibos en PDF', 'Equipo y sucursales', 'hasta la versión 1.0.24']) assert(nueva.includes(t), `contenido: ${t}`);
assert(/no facturas fiscales/.test(nueva), 'aclara que no son facturas fiscales');

// El HTML de datos del usuario se escapa.
assert(!CAMPANAS['actualizacion-2026-10b'].html({ nombre: '<script>x</script>', userId: 'u1', version: '1' }).includes('<script>x'), 'escapa el nombre');
// Campaña 3: prueba por uso, marketing con IA y asistentes; a quien se le devolvió la prueba se le suma el aviso destacado.
const c3 = CAMPANAS['actualizacion-2026-10c'];
const base3 = c3.html({ nombre: 'Ana', userId: 'a'.repeat(24), version: '1.0.26' });
const reac3 = c3.html({ nombre: 'Ana', userId: 'a'.repeat(24), version: '1.0.26', reactivado: true });
for (const t of ['Prueba gratis por uso', 'Marketing con IA', 'Si vendés por mayor', 'Asistentes de IA', 'hasta la versión 1.0.26', 'Dejar de recibir novedades']) assert(base3.includes(t), `campaña 3 incluye: ${t}`);
assert(!base3.includes('Te devolvimos tu prueba') && reac3.includes('Te devolvimos tu prueba gratis'), 'el aviso de "te devolvimos tu prueba" aparece solo para quien fue reactivado');
assert(/solo lectura/.test(base3) && /Groq/.test(base3) && !/factura electr/i.test(base3), 'aclara que los asistentes son solo lectura y que usa su clave de Groq, y no promete facturación');
assert(/tope de 60 días/.test(base3) && /100 mensajes/.test(base3), 'dice los topes de la prueba (60 días, 100 mensajes)');
assert(!c3.html({ nombre: '<script>x</script>', userId: 'a'.repeat(24), version: '1', reactivado: true }).includes('<script>x'), 'escapa el nombre también en la campaña 3');
console.log('email-novedades: OK');
