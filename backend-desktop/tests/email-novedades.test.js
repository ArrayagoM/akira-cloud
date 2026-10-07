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
console.log('email-novedades: OK');
