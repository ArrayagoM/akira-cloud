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
// Campaña vigente (1.0.24 → 1.0.31): lo que existe hoy, dicho como es.
process.env.FRONTEND_URL = 'https://akiracloud.lat'; process.env.DESKTOP_SIZE_MB = '94';
assert(!CAMPANAS['actualizacion-2026-10c'], 'la campaña 3 (nunca enviada y desactualizada) se reemplazó por la nueva');
const c4 = CAMPANAS['actualizacion-2026-10d'];
const base4 = c4.html({ nombre: 'Ana', userId: 'a'.repeat(24), version: '1.0.31' });
const reac4 = c4.html({ nombre: 'Ana', userId: 'a'.repeat(24), version: '1.0.31', reactivado: true });
for (const t of ['Verificación de comprobantes de transferencia', 'Tu negocio en el celular', 'Prueba gratis por uso', 'Marketing con IA', 'hasta la versión 1.0.31', 'Dejar de recibir novedades', 'Instalador con firma digital']) assert(base4.includes(t), `campaña vigente incluye: ${t}`);
assert(/una captura se puede falsificar/i.test(base4) && /decisión tuya/.test(base4), 'avisa que una captura se puede falsificar y que confirmar el pago sigue siendo del dueño');
assert(/tope de 60 días/.test(base4) && /100 mensajes/.test(base4), 'dice los topes de la prueba (60 días, 100 mensajes)');
assert(/Groq/.test(base4) && /nada se publica ni se envía solo/.test(base4), 'Marketing con IA: usa su clave de Groq y no publica solo');
assert(/únicamente contadores/.test(base4) && /solo si lo activás/.test(base4), 'el resumen del celular dice que son solo contadores y opcional');
assert(!/factura electr|\$\s?\d{2}\.\d{3}/i.test(base4), 'no promete facturación ni menciona precios');
assert(!base4.includes('Te devolvimos tu prueba') && reac4.includes('Te devolvimos tu prueba gratis'), 'el aviso de "te devolvimos tu prueba" aparece solo para quien fue reactivado');
assert(!c4.html({ nombre: '<script>x</script>', userId: 'a'.repeat(24), version: '1', reactivado: true }).includes('<script>x'), 'escapa el nombre en la campaña vigente');

// Plantilla única: mismo marco y mismas reglas en TODOS los emails.
const P = require('../services/email.plantilla');
const A = require('../services/email.alertas');
const todos = {
  ...Object.fromEntries(claves.map((k) => [`campaña ${k}`, CAMPANAS[k].html({ nombre: 'Ana', userId: 'a'.repeat(24), version: '1.0.31' })])),
  'alerta de caída': A.htmlCaida({ nombre: 'Ana', equipo: 'PC', motivo: 'sesion', slots: [0], desdeEn: new Date() }),
  'alerta de recuperado': A.htmlRecuperado({ nombre: 'Ana', equipo: 'PC', desdeEn: new Date(Date.now() - 600000), hastaEn: new Date() }),
};
const asuntos = [...claves.map((k) => CAMPANAS[k].asunto()), A.asuntoCaida(), A.asuntoRecuperado()];
for (const [n, h] of Object.entries(todos)) {
  assert(h.includes('https://akiracloud.lat/logo-email.png') && h.includes('Akira Cloud'), `${n}: usa el marco y el logo de la plataforma`);
  assert(!/\p{Extended_Pictographic}/u.test(h), `${n}: sin emojis`);
  assert(!/undefined|\[object|NaN/.test(h), `${n}: sin valores sin resolver`);
  assert(P.aTexto(h).length > 80 && !/<[a-z][^>]*>/i.test(P.aTexto(h)), `${n}: tiene versión en texto plano sin etiquetas`);
}
for (const a of asuntos) assert(!/\p{Extended_Pictographic}/u.test(a), `asunto sin emojis: ${a}`);
assert(todos['alerta de caída'].includes('Dashboard') && !todos['alerta de caída'].includes('>Inicio<'), 'la alerta nombra la pantalla como se llama en el menú (Dashboard)');

// El enlace de descarga lleva la marca de origen (contador del panel) y el tamaño sale de la configuración, no de un número fijo.
assert(base4.includes('https://akiracloud.lat/api/desktop/download?r=email-actualizacion4'), 'el botón de descarga lleva ?r= para medir de qué mail vienen');
assert(base4.includes('94 MB') && !/89 MB|85 MB/.test(base4), 'el tamaño del instalador sale de DESKTOP_SIZE_MB');
delete process.env.DESKTOP_SIZE_MB;
assert(!/\d+ MB/.test(c4.html({ nombre: 'Ana', userId: 'a'.repeat(24), version: '1.0.31' })), 'si no hay tamaño configurado, no se escribe uno inventado');
const textoPlano = P.aTexto(base4);
assert(textoPlano.includes('Hola, Ana') && textoPlano.includes('akiracloud.lat/api/desktop/download?r=email-actualizacion4'), 'el texto plano conserva el saludo y los enlaces');
const { cabecerasBaja } = require('../services/email.novedades');
assert(/^<https:\/\/akiracloud\.lat\/api\/auth\/baja-novedades\?t=/.test(cabecerasBaja('u1')['List-Unsubscribe']) && cabecerasBaja(null) === undefined, 'List-Unsubscribe apunta a la baja del usuario');
console.log('email-novedades: OK');
