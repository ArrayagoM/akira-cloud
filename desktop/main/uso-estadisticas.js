// main/uso-estadisticas.js
// Estadísticas de uso anónimas (OPCIONAL, apagadas por defecto): cuenta cuántas veces se abre cada PANTALLA de la app, por día, y lo informa
// a Akira junto con la señal de vida. Sirve para saber qué se usa y qué hay que mejorar o explicar mejor. Solo viajan contadores de una lista
// fija de pantallas: NUNCA nada de los clientes del negocio, de lo que se carga ni de los mensajes. El usuario lo activa o apaga cuando quiera.
// Probado en tests/uso-estadisticas.test.js.
'use strict';

const fs = require('fs');
const path = require('path');

// Misma lista que valida el servidor (backend-desktop/lib/uso.js)
const PANTALLAS = [
  'dashboard', 'agenda', 'clientes', 'chats', 'vender', 'catalogo', 'pedidos', 'caja', 'reportes', 'comprobantes', 'sucursales', 'profesionales',
  'deudores', 'proveedores', 'documentos', 'conocimiento', 'analisis', 'equipo', 'integraciones', 'respaldo', 'config', 'planes',
];
const DIAS_GUARDADOS = 7;
const archivo = (dir) => path.join(dir, 'uso.json');
const fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function leer(dir) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(archivo(dir), 'utf8')); } catch { /* sin datos */ }
  return { activo: j.activo === true, dias: j.dias && typeof j.dias === 'object' ? j.dias : {} };
}
const guardar = (dir, d) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(archivo(dir), JSON.stringify(d)); };

const activo = (dir) => leer(dir).activo;
function activar(dir, valor) {
  const d = leer(dir); d.activo = valor === true;
  if (!d.activo) d.dias = {}; // al apagarlo se borra lo que había juntado
  guardar(dir, d); return d.activo;
}

// "/caja" → "caja"; lo que no es una pantalla conocida se ignora
const pantallaDe = (ruta) => { const k = String(ruta || '').replace(/^\/+/, '').split(/[/?#]/)[0].toLowerCase(); return PANTALLAS.includes(k) ? k : null; };

function contar(dir, ruta, ahora = new Date()) {
  const k = pantallaDe(ruta); if (!k) return false;
  const d = leer(dir); if (!d.activo) return false;
  const dia = fechaLocal(ahora);
  d.dias[dia] = d.dias[dia] || {}; d.dias[dia][k] = Math.min(5000, (d.dias[dia][k] || 0) + 1);
  for (const x of Object.keys(d.dias).sort().slice(0, -DIAS_GUARDADOS)) delete d.dias[x]; // solo los últimos días
  guardar(dir, d);
  return true;
}

// Para el latido: hoy y ayer (si hay). undefined = no mandar nada (apagado).
function paraEnviar(dir, ahora = new Date()) {
  const d = leer(dir); if (!d.activo) return undefined;
  const ayer = new Date(ahora.getTime() - 24 * 3600e3);
  return [fechaLocal(ahora), fechaLocal(ayer)].filter((x) => d.dias[x]).map((dia) => ({ dia, pantallas: d.dias[dia] }));
}

module.exports = { PANTALLAS, activo, activar, contar, paraEnviar, pantallaDe };
