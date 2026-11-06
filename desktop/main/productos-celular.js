// main/productos-celular.js
// Productos que el dueño carga con la cámara del celular (app móvil de Akira): llegan por el mismo canal opcional del control remoto
// (ver comandos-remotos.js), se guardan en el Catálogo de esta PC con su foto, y desde ahí el bot los usa como cualquier otro producto.
// Si el producto ya existe (mismo código de barras o mismo nombre) se ACTUALIZA en vez de duplicarlo.
'use strict';

const codigoBarras = require('./gestion/codigo-barras');

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// → { catalogo, accion: 'creado' | 'actualizado' }. ref: referencia de la foto ya guardada ('' si no hay).
function fusionar(catalogo, nuevo, ref = '') {
  const lista = (catalogo || []).map((p) => ({ ...p }));
  const porCodigo = codigoBarras.buscarPorCodigo(lista, nuevo.codigo);
  let idx = porCodigo ? lista.indexOf(porCodigo) : -1;
  if (idx < 0) idx = lista.findIndex((p) => norm(p.nombre) === norm(nuevo.nombre));
  const codigo = codigoBarras.sanear(nuevo.codigo);
  const stock = Number.isFinite(Number(nuevo.stock)) && Number(nuevo.stock) >= 0 ? Math.floor(Number(nuevo.stock)) : -1;
  if (idx >= 0) {
    const v = lista[idx];
    lista[idx] = {
      ...v,
      nombre: nuevo.provisorio ? v.nombre : String(nuevo.nombre).trim(), // un nombre provisorio nunca pisa el que el producto ya tenía
      precio: Math.max(0, Number(nuevo.precio) || 0),
      categoria: nuevo.categoria || v.categoria || '',
      descripcion: nuevo.descripcion || v.descripcion || '',
      stock: stock >= 0 ? stock : (v.stock >= 0 ? v.stock : -1),
      imagen: ref || v.imagen || '',
      codigo: codigo || codigoBarras.sanear(v.codigo),
    };
    return { catalogo: lista, accion: 'actualizado' };
  }
  lista.push({
    waProductId: '', nombre: String(nuevo.nombre).trim(), descripcion: nuevo.descripcion || '', precio: Math.max(0, Number(nuevo.precio) || 0), moneda: 'ARS',
    categoria: nuevo.categoria || '', stock, imagen: ref || '', codigo, disponible: true, fuente: 'manual',
  });
  return { catalogo: lista, accion: 'creado' };
}

const dosDig = (n) => String(n).padStart(2, '0');

// Guarda un producto que llegó del celular. → { accion, detalle } (si algo falla, lanza el error y la nube lo marca como fallido)
// reconocer (opcional, ver ia-producto.js): respaldo para cuando llega una foto SIN nombre; la IA la lee y completa SOLO lo que vino vacío
// (lo que escribió el dueño nunca se pisa). El precio y el stock no los toca nunca. Si la IA falla, se guarda igual.
async function importar({ userDataDir, uid, Config, fotos, producto, foto, reconocer, ahora = () => new Date() }) {
  if (!uid) throw new Error('No hay una sesión iniciada en esta PC');
  const p = { ...(producto || {}) };
  const tieneFoto = !!(foto && foto.data);
  if (!String(p.nombre || '').trim() && !tieneFoto) throw new Error('El producto no tiene nombre');
  const ref = tieneFoto ? fotos.guardar(userDataDir, Buffer.from(foto.data, 'base64')) : '';

  const vacio = (k) => !String(p[k] || '').trim();
  const completados = []; let motivo = '';
  // Respaldo: la app del celular ya lee la foto ANTES de enviar (el dueño revisa y edita). Acá solo se lee si igual llegó sin nombre,
  // y entonces se completan los vacíos; si llegó con nombre no se toca nada (el dueño pudo dejar a propósito la categoría o la descripción vacías).
  if (tieneFoto && typeof reconocer === 'function' && vacio('nombre')) {
    let r = null;
    try { r = await reconocer({ foto, codigo: p.codigo }); } catch { r = { ok: false, motivo: 'la IA no respondió' }; }
    if (r && r.ok && r.datos) {
      for (const k of ['nombre', 'categoria', 'descripcion']) {
        if (vacio(k) && String(r.datos[k] || '').trim()) { p[k] = String(r.datos[k]).trim(); completados.push(k); }
      }
    } else motivo = (r && r.motivo) || 'la IA no respondió';
  }

  let provisorio = false;
  if (!String(p.nombre || '').trim()) {
    const d = ahora();
    p.nombre = `Producto sin nombre ${dosDig(d.getDate())}/${dosDig(d.getMonth() + 1)} ${dosDig(d.getHours())}:${dosDig(d.getMinutes())}`;
    provisorio = true; p.provisorio = true;
  }

  const cfg = await Config.findOne({ userId: uid }).lean();
  const r = fusionar(cfg && cfg.catalogo, p, ref);
  await Config.findOneAndUpdate({ userId: uid }, { catalogo: r.catalogo }, { upsert: true, new: true });
  fotos.limpiar(userDataDir, r.catalogo.map((x) => x.imagen)); // si reemplazó una foto, borra la vieja (la nueva tiene 10 min de gracia)

  const verbo = r.accion === 'creado' ? 'agregado' : 'actualizado';
  let detalle = `${verbo}: ${String(p.nombre).trim().slice(0, 60)}`;
  if (provisorio && r.accion === 'actualizado') detalle = 'actualizado (misma foto/código, el nombre se conserva)';
  else if (provisorio) detalle = `${verbo} sin nombre (${motivo || 'sin lectura de IA'}): ponelo en el Catálogo`;
  else if (completados.length) detalle += ' · la IA completó ' + completados.map((k) => (k === 'categoria' ? 'categoría' : k === 'descripcion' ? 'descripción' : k)).join(', ') + ': revisalo';
  return { accion: r.accion, detalle: detalle.slice(0, 120), completados, motivo };
}

module.exports = { fusionar, importar };
