// gestion/mapeo.js
// Lógica pura (sin disco ni red) para importar productos y servicios desde una
// planilla: detectar qué columna es cuál, limpiar precios/duraciones en formato
// argentino, marcar cada fila como nueva / actualiza / con error, y combinar el
// resultado con lo que ya existe. Probada aparte en tests/gestion-mapeo.test.js.
'use strict';

const caja = require('./caja');

const CAMPOS = {
  productos: ['nombre', 'precio', 'categoria', 'stock', 'descripcion'],
  servicios: ['nombre', 'precio', 'duracion'],
  movimientos: ['fecha', 'monto', 'tipo', 'categoria', 'descripcion', 'metodo'],
  proveedores: ['nombre', 'telefono', 'cuit', 'rubro', 'notas'],
};

// Sinónimos para planillas de proveedores.
const SINONIMOS_PROV = {
  nombre: ['nombre', 'proveedor', 'proveedores', 'razon social', 'empresa', 'denominacion'],
  telefono: ['telefono', 'tel', 'celular', 'whatsapp', 'contacto', 'movil'],
  cuit: ['cuit', 'cuil', 'documento', 'nro cuit'],
  rubro: ['rubro', 'categoria', 'actividad', 'tipo', 'producto', 'productos'],
  notas: ['notas', 'observaciones', 'comentarios', 'detalle', 'direccion', 'domicilio'],
};

// Sinónimos de encabezados para planillas de gastos/ingresos (Caja).
const SINONIMOS_MOV = {
  fecha: ['fecha', 'dia', 'date', 'fecha de pago', 'fecha del gasto', 'fecha de operacion'],
  monto: ['monto', 'importe', 'total', 'valor', 'pagado', 'cantidad', 'gasto', 'ingreso', 'egreso'],
  tipo: ['tipo', 'movimiento', 'ingreso gasto', 'ingreso egreso', 'clase', 'tipo de movimiento'],
  categoria: ['categoria', 'rubro', 'concepto', 'grupo', 'imputacion'],
  descripcion: ['descripcion', 'detalle', 'observaciones', 'notas', 'proveedor', 'comentario', 'comentarios'],
  metodo: ['metodo', 'metodo de pago', 'forma de pago', 'medio de pago', 'medio', 'pago'],
};

const SINONIMOS = {
  nombre: ['nombre', 'producto', 'productos', 'articulo', 'articulos', 'item', 'servicio', 'servicios', 'detalle', 'descripcion', 'concepto', 'denominacion', 'titulo'],
  precio: ['precio', 'precios', 'valor', 'importe', 'monto', 'costo', 'tarifa', 'pvp', 'precio venta', 'precio final', 'price'],
  categoria: ['categoria', 'rubro', 'familia', 'tipo', 'linea', 'grupo', 'seccion'],
  stock: ['stock', 'cantidad', 'existencia', 'existencias', 'unidades', 'disponible', 'inventario'],
  descripcion: ['descripcion', 'detalle', 'observaciones', 'notas', 'comentarios'],
  duracion: ['duracion', 'minutos', 'tiempo', 'min', 'duracion min', 'duracion minutos'],
};

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizar = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const claveNombre = (s) => normalizar(s);

// "$ 1.234,50" / "1234,5" / "1,234.50" / "USD 5" / 1500 → número (o null)
function parsearPrecio(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s || /^[-.,]+$/.test(s)) return null;
  if (s.startsWith('-')) return null;
  const ultPunto = s.lastIndexOf('.');
  const ultComa = s.lastIndexOf(',');
  const ult = Math.max(ultPunto, ultComa);
  if (ult >= 0) {
    const decimales = s.length - ult - 1;
    if (decimales >= 1 && decimales <= 2) {
      // el último separador es decimal si le siguen 1–2 dígitos; el resto son miles
      const ent = s.slice(0, ult).replace(/[.,]/g, '');
      s = `${ent}.${s.slice(ult + 1)}`;
    } else {
      s = s.replace(/[.,]/g, ''); // 1.234 / 1,234 → miles
    }
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function parsearEntero(v) {
  if (v === '' || v == null) return null;
  const n = parsearPrecio(v);
  return n == null ? null : Math.round(n);
}

// "45" / "45 min" / "1h" / "1 h 30" / "1,5 h" / "01:30" → minutos
function parsearDuracion(v) {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/(\d+(?:[.,]\d+)?)\s*h(?:s|r|rs|ora|oras)?\s*(?:y\s*)?(\d+)?\s*(?:m|min|mins|minutos)?$/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60 + (m[2] ? +m[2] : 0));
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minutos)?$/);
  if (m) { const n = parseFloat(m[1].replace(',', '.')); return n > 0 ? Math.round(n) : null; }
  return null;
}

const pareceNumero = (v) => v !== '' && v != null && parsearPrecio(v) != null && /\d/.test(String(v));

// Devuelve { nombre: índiceDeColumna | null, precio: …, … } para el tipo pedido.
function sugerirMapeo(tipo, columnas, filas) {
  const campos = CAMPOS[tipo] || CAMPOS.productos;
  const sinonimos = tipo === 'movimientos' ? SINONIMOS_MOV : tipo === 'proveedores' ? SINONIMOS_PROV : SINONIMOS;
  const norm = columnas.map(normalizar);
  const mapeo = Object.fromEntries(campos.map((c) => [c, null]));
  const usadas = new Set();

  // 1) por encabezado exacto, y luego por encabezado que contiene el sinónimo
  for (const pasada of ['exacto', 'contiene']) {
    for (const campo of campos) {
      if (mapeo[campo] != null) continue;
      const idx = norm.findIndex((h, i) => !usadas.has(i) && h && sinonimos[campo].some((sin) => (pasada === 'exacto' ? h === sin : (h.includes(sin) || (h.length > 3 && sin.includes(h))))));
      if (idx >= 0) { mapeo[campo] = idx; usadas.add(idx); }
    }
  }

  // 2) por contenido, si faltan las dos columnas clave
  const muestra = filas.slice(0, 50);
  const frac = (i, pred) => { const celdas = muestra.map((f) => f[i]).filter((x) => x !== '' && x != null); return celdas.length ? celdas.filter(pred).length / celdas.length : 0; };
  if (tipo === 'movimientos') {
    if (mapeo.fecha == null) {
      let mejor = -1; let mejorFrac = 0.7;
      columnas.forEach((_, i) => { if (usadas.has(i)) return; const f = frac(i, (x) => caja.parsearFecha(x) != null); if (f > mejorFrac) { mejor = i; mejorFrac = f; } });
      if (mejor >= 0) { mapeo.fecha = mejor; usadas.add(mejor); }
    }
    if (mapeo.monto == null) {
      let mejor = -1; let mejorFrac = 0.7;
      columnas.forEach((_, i) => { if (usadas.has(i)) return; const f = frac(i, pareceNumero); if (f > mejorFrac) { mejor = i; mejorFrac = f; } });
      if (mejor >= 0) { mapeo.monto = mejor; usadas.add(mejor); }
    }
    return mapeo;
  }
  if (mapeo.precio == null && campos.includes('precio')) {
    let mejor = -1; let mejorFrac = 0.7;
    columnas.forEach((_, i) => { if (usadas.has(i)) return; const f = frac(i, pareceNumero); if (f > mejorFrac) { mejor = i; mejorFrac = f; } });
    if (mejor >= 0) { mapeo.precio = mejor; usadas.add(mejor); }
  }
  if (mapeo.nombre == null) {
    let mejor = -1; let mejorFrac = 0.6;
    columnas.forEach((_, i) => { if (usadas.has(i)) return; const f = frac(i, (x) => /[a-zA-ZÀ-ÿ]/.test(String(x))); if (f > mejorFrac) { mejor = i; mejorFrac = f; } });
    if (mejor >= 0) { mapeo.nombre = mejor; usadas.add(mejor); }
  }
  return mapeo;
}

// ¿Parece planilla de servicios (tiene duración) o de productos?
function sugerirTipo(columnas) {
  const norm = columnas.map(normalizar);
  if (norm.some((h) => SINONIMOS.duracion.includes(h) || h.includes('duracion'))) return 'servicios';
  if (norm.some((h) => SINONIMOS.stock.includes(h) || SINONIMOS.categoria.includes(h))) return 'productos';
  return 'productos';
}

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

const INGRESOS = /^(ingreso|ingresos|entrada|cobro|cobros|venta|ventas|\+|i)$/;
const GASTOS = /^(gasto|gastos|egreso|egresos|salida|pago|pagos|compra|compras|costo|-|g|e)$/;
function parsearTipoMov(v) { const s = normalizar(v); return INGRESOS.test(s) ? 'ingreso' : GASTOS.test(s) ? 'gasto' : null; }
function parsearMetodo(v) {
  const s = normalizar(v);
  if (!s) return 'efectivo';
  if (/efectiv|cash/.test(s)) return 'efectivo';
  if (/transf|cbu|cvu|alias/.test(s)) return 'transferencia';
  if (/mercado|\bmp\b/.test(s)) return 'mercadopago';
  if (/tarj|debito|credito|visa|master/.test(s)) return 'tarjeta';
  return 'otro';
}

// Planilla de movimientos (Caja): una fila = un ingreso o un gasto. `existentes` = movimientos ya cargados.
function construirFilasMov(filas, mapeo, existentes = []) {
  const yaCargados = new Set(existentes.map(caja.claveDuplicado));
  const salida = [];
  filas.forEach((f, i) => {
    const celda = (campo) => (mapeo[campo] == null ? '' : f[mapeo[campo]]);
    if (f.every((c) => c === '' || c == null)) return;
    const errores = []; const avisos = [];

    const fechaCruda = celda('fecha');
    const fecha = caja.parsearFecha(fechaCruda);
    if (fechaCruda === '' || fechaCruda == null) errores.push('Falta la fecha');
    else if (!fecha) errores.push(`Fecha no válida: "${texto(fechaCruda)}"`);

    const montoCrudo = celda('monto');
    const negativo = typeof montoCrudo === 'number' ? montoCrudo < 0 : /^\s*[-(]/.test(String(montoCrudo));
    const monto = parsearPrecio(typeof montoCrudo === 'number' ? Math.abs(montoCrudo) : String(montoCrudo).replace(/[-()]/g, ''));
    if (montoCrudo === '' || montoCrudo == null) errores.push('Falta el monto');
    else if (monto == null || monto <= 0) errores.push(`Monto no válido: "${texto(montoCrudo)}"`);

    // Tipo: de la columna "Tipo" si hay; si no, el que eligió el usuario para todo el archivo
    // (por defecto gasto, lo más común al importar); un monto negativo siempre es gasto.
    const porDefecto = mapeo.tipoPorDefecto === 'ingreso' ? 'ingreso' : 'gasto';
    let tipo = mapeo.tipo == null ? null : parsearTipoMov(celda('tipo'));
    if (mapeo.tipo != null && celda('tipo') !== '' && !tipo) avisos.push(`Tipo "${texto(celda('tipo'))}" no reconocido: se toma como ${porDefecto}`);
    if (!tipo) tipo = negativo ? 'gasto' : porDefecto;

    const dato = {
      fecha, tipo, monto: monto || 0,
      categoria: texto(celda('categoria')).slice(0, 40) || (tipo === 'gasto' ? 'Otros gastos' : 'Otros ingresos'),
      descripcion: texto(celda('descripcion')).slice(0, 200),
      metodo: parsearMetodo(celda('metodo')),
    };
    let estado = 'nuevo';
    if (errores.length) estado = 'error';
    else if (yaCargados.has(caja.claveDuplicado(dato))) { estado = 'duplicado'; avisos.push('Ya está cargado en la Caja: se omite'); }
    salida.push({ fila: i + 1, estado, errores, avisos, dato });
  });
  return salida;
}

// Convierte filas crudas en filas validadas. `existentes` = lista actual del catálogo/servicios.
// Planilla de proveedores: el nombre es lo único obligatorio; si ya existe uno con ese nombre se actualiza.
function construirFilasProv(filas, mapeo, existentes = []) {
  const claves = new Set(existentes.map((e) => claveNombre(e.nombre)));
  const vistos = new Map(); const salida = [];
  filas.forEach((f, i) => {
    const celda = (campo) => (mapeo[campo] == null ? '' : f[mapeo[campo]]);
    if (f.every((c) => c === '' || c == null)) return;
    const errores = []; const avisos = [];
    const nombre = texto(celda('nombre')).slice(0, 80);
    if (!nombre) errores.push('Falta el nombre');
    let cuit = String(celda('cuit') ?? '').replace(/\D/g, '');
    if (cuit && cuit.length !== 11) { avisos.push(`CUIT "${texto(celda('cuit'))}" no tiene 11 números: se deja vacío`); cuit = ''; }
    const dato = { nombre, telefono: texto(celda('telefono')).slice(0, 30), cuit, rubro: texto(celda('rubro')).slice(0, 40), notas: texto(celda('notas')).slice(0, 500) };
    const clave = claveNombre(nombre);
    const estado = errores.length ? 'error' : claves.has(clave) ? 'actualiza' : 'nuevo';
    if (clave && !errores.length) vistos.set(clave, i + 1);
    salida.push({ fila: i + 1, estado, errores, avisos, dato, clave });
  });
  for (const f of salida) { if (f.estado !== 'error' && vistos.get(f.clave) !== f.fila) { f.estado = 'duplicado'; f.avisos.push(`Repetido: se usa la fila ${vistos.get(f.clave)}`); } delete f.clave; }
  return salida;
}

function construirFilas(tipo, filas, mapeo, existentes = []) {
  if (tipo === 'movimientos') return construirFilasMov(filas, mapeo, existentes);
  if (tipo === 'proveedores') return construirFilasProv(filas, mapeo, existentes);
  const claves = new Map();
  existentes.forEach((e, i) => claves.set(claveNombre(e.nombre), i));
  const vistos = new Map();
  const salida = [];

  filas.forEach((f, i) => {
    const numero = i + 1;
    const celda = (campo) => (mapeo[campo] == null ? '' : f[mapeo[campo]]);
    const nombre = texto(celda('nombre'));
    if (!nombre && f.every((c) => c === '' || c == null)) return; // fila vacía: se ignora sin molestar
    const errores = []; const avisos = [];
    const dato = { nombre };

    if (!nombre) errores.push('Falta el nombre');
    const precio = parsearPrecio(celda('precio'));
    if (celda('precio') === '' || celda('precio') == null) errores.push('Falta el precio');
    else if (precio == null) errores.push(`Precio no válido: "${texto(celda('precio'))}"`);
    dato.precio = precio ?? 0;

    if (tipo === 'productos') {
      dato.categoria = texto(celda('categoria'));
      dato.descripcion = texto(celda('descripcion'));
      const crudoStock = celda('stock');
      const st = parsearEntero(crudoStock);
      if (crudoStock !== '' && crudoStock != null && st == null) avisos.push('Stock no válido: se deja sin control');
      dato.stock = st != null && st >= 0 ? st : -1; // -1 = sin control de stock
    } else {
      const crudo = celda('duracion');
      const d = parsearDuracion(crudo);
      if (crudo !== '' && crudo != null && d == null) avisos.push('Duración no válida: se usa 60 min');
      dato.duracion = d || 60;
    }

    const clave = claveNombre(nombre);
    let estado = 'nuevo';
    if (errores.length) estado = 'error';
    else if (claves.has(clave)) estado = 'actualiza';
    if (clave && !errores.length) vistos.set(clave, numero); // queda la fila más baja de abajo = la última
    salida.push({ fila: numero, estado, errores, avisos, dato, clave });
  });
  // Si un nombre aparece varias veces, solo vale la última fila; las anteriores se omiten.
  for (const f of salida) {
    if (f.estado !== 'error' && vistos.get(f.clave) !== f.fila) { f.estado = 'duplicado'; f.avisos.push(`Repetido: se usa la fila ${vistos.get(f.clave)}`); }
    delete f.clave;
  }
  return salida;
}

function resumen(filas) {
  const r = { total: filas.length, nuevos: 0, actualizan: 0, errores: 0, duplicados: 0 };
  for (const f of filas) { if (f.estado === 'nuevo') r.nuevos++; else if (f.estado === 'actualiza') r.actualizan++; else if (f.estado === 'error') r.errores++; else if (f.estado === 'duplicado') r.duplicados++; }
  return r;
}

// Combina lo existente con las filas válidas. modo: 'agregar' (suma y actualiza por nombre) | 'reemplazar'.
function aplicarImportacion(tipo, existentes, filas, { modo = 'agregar', excluir = [] } = {}) {
  const fuera = new Set(excluir);
  const validas = filas.filter((f) => (f.estado === 'nuevo' || f.estado === 'actualiza') && !fuera.has(f.fila));
  if (tipo === 'proveedores') {
    const lista = (modo === 'reemplazar' ? [] : existentes).map((e) => ({ ...e }));
    const indice = new Map(); lista.forEach((e, i) => indice.set(claveNombre(e.nombre), i));
    let agregados = 0; let actualizados = 0;
    for (const f of validas) {
      const clave = claveNombre(f.dato.nombre);
      if (indice.has(clave)) {
        const i = indice.get(clave); const e = lista[i];
        lista[i] = { ...e, nombre: f.dato.nombre, telefono: f.dato.telefono || e.telefono || '', cuit: f.dato.cuit || e.cuit || '', rubro: f.dato.rubro || e.rubro || '', notas: f.dato.notas || e.notas || '', activo: true };
        actualizados++;
      } else { lista.push({ ...f.dato, activo: true }); indice.set(clave, lista.length - 1); agregados++; }
    }
    return { lista, agregados, actualizados, omitidos: filas.length - validas.length };
  }
  if (tipo === 'movimientos') {
    // En la Caja nunca se reemplaza ni se actualiza: solo se suman movimientos nuevos.
    const lista = existentes.map((e) => ({ ...e }));
    for (const f of validas) lista.push({ ...f.dato, origen: 'importado' });
    return { lista, agregados: validas.length, actualizados: 0, omitidos: filas.length - validas.length };
  }
  const base = modo === 'reemplazar' ? [] : existentes.map((e) => ({ ...e }));
  const indice = new Map(); base.forEach((e, i) => indice.set(claveNombre(e.nombre), i));
  let agregados = 0; let actualizados = 0;

  for (const f of validas) {
    const clave = claveNombre(f.dato.nombre);
    if (indice.has(clave)) {
      const i = indice.get(clave);
      base[i] = tipo === 'productos'
        ? { ...base[i], nombre: f.dato.nombre, precio: f.dato.precio, categoria: f.dato.categoria || base[i].categoria || '', descripcion: f.dato.descripcion || base[i].descripcion || '', stock: f.dato.stock }
        : { ...base[i], nombre: f.dato.nombre, precio: f.dato.precio, duracion: f.dato.duracion };
      actualizados++;
    } else {
      base.push(tipo === 'productos'
        ? { waProductId: '', nombre: f.dato.nombre, descripcion: f.dato.descripcion || '', precio: f.dato.precio, moneda: 'ARS', categoria: f.dato.categoria || '', stock: f.dato.stock, imagen: '', disponible: true, fuente: 'manual' }
        : { nombre: f.dato.nombre, precio: f.dato.precio, duracion: f.dato.duracion, intervaloRecordatorioDias: 0, mensajeRecordatorio: '' });
      indice.set(clave, base.length - 1);
      agregados++;
    }
  }
  return { lista: base, agregados, actualizados, omitidos: filas.length - validas.length };
}

module.exports = { CAMPOS, normalizar, parsearPrecio, parsearEntero, parsearDuracion, sugerirMapeo, sugerirTipo, construirFilas, resumen, aplicarImportacion, claveNombre };
