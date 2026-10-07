// lib/uso.js
// Estadísticas de uso de la app de escritorio (9.1): cuántas veces se abrió cada PANTALLA por día. Solo contadores de pantallas de una
// lista fija; NUNCA datos de los clientes de los negocios ni de lo que cargan (montos, nombres, mensajes). Solo llegan de quienes lo
// activaron en la app (es opcional y arranca apagado). Probado en tests/uso.test.js.
'use strict';

const PANTALLAS = [
  'dashboard', 'agenda', 'clientes', 'chats', 'vender', 'catalogo', 'pedidos', 'caja', 'reportes', 'comprobantes', 'sucursales', 'profesionales',
  'deudores', 'proveedores', 'documentos', 'conocimiento', 'analisis', 'equipo', 'integraciones', 'respaldo', 'config', 'planes',
];
const MAX_POR_PANTALLA = 5000;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

const fechaUTC = (d) => d.toISOString().slice(0, 10);

// u: [{ dia, pantallas: { clave: n } }] → solo días recientes y claves conocidas, con cantidades acotadas.
function sanearUso(u, ahora = new Date()) {
  if (!Array.isArray(u)) return [];
  const hoy = fechaUTC(new Date(ahora.getTime() + 24 * 3600e3)); // un día de margen por zonas horarias
  const minimo = fechaUTC(new Date(ahora.getTime() - 3 * 24 * 3600e3));
  const salida = [];
  for (const x of u.slice(0, 20)) {
    if (salida.length >= 3) break; // como mucho 3 días por aviso
    if (!x || !DIA_RE.test(String(x.dia)) || x.dia > hoy || x.dia < minimo) continue;
    const pantallas = {};
    for (const k of PANTALLAS) { const n = Math.floor(Number(x.pantallas?.[k])); if (n > 0) pantallas[k] = Math.min(n, MAX_POR_PANTALLA); }
    if (Object.keys(pantallas).length) salida.push({ dia: x.dia, pantallas });
  }
  return salida;
}

// docs: UsoDia lean → resumen para el panel de administración
function resumir(docs, { dias = 30 } = {}) {
  const porDia = new Map(); const porPantalla = new Map(); const usuarios = new Set();
  for (const d of docs) {
    const uid = String(d.userId); usuarios.add(uid);
    (porDia.get(d.dia) || porDia.set(d.dia, new Set()).get(d.dia)).add(uid);
    for (const [k, n] of Object.entries(d.pantallas || {})) {
      const p = porPantalla.get(k) || { pantalla: k, aperturas: 0, usuarios: new Set() };
      p.aperturas += n; p.usuarios.add(uid); porPantalla.set(k, p);
    }
  }
  return {
    dias, usuarios: usuarios.size,
    activosPorDia: [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, s]) => ({ dia, usuarios: s.size })),
    pantallas: [...porPantalla.values()].map((p) => ({ pantalla: p.pantalla, aperturas: p.aperturas, usuarios: p.usuarios.size })).sort((a, b) => b.usuarios - a.usuarios || b.aperturas - a.aperturas),
    sinUso: PANTALLAS.filter((k) => !porPantalla.has(k)),
  };
}

module.exports = { PANTALLAS, sanearUso, resumir, MAX_POR_PANTALLA };
