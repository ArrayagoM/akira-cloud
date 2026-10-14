// gestion/comprobante-pago.js
// Lee un comprobante de transferencia (captura o PDF: traen la misma información) y comprueba que sirva para dar un pago por bueno.
//
// Qué se extrae: monto, fecha y hora, número de operación, código de identificación, motivo y, de cada parte (origen y destino),
// nombre, CUIT/CUIL, CBU/CVU y alias. Funciona con el formato de Mercado Pago (probado con una captura real) y, de forma más
// general, con comprobantes de otras billeteras y bancos.
//
// Qué se comprueba (ver verificar()): que el DESTINO sea la cuenta del dueño, que el MONTO alcance, que la FECHA sea reciente,
// que los CUIT/CBU/CVU sean números válidos (dígitos verificadores), que la operación NO se haya usado antes y, si se puede,
// que Mercado Pago confirme esa operación con la cuenta del dueño (verificarEnMercadoPago).
//
// Límite que hay que decir claramente: una captura o un PDF se pueden falsificar. Que los datos coincidan reduce muchísimo el
// riesgo (el que falsifica tiene que acertar cuenta, monto, fecha y una operación inédita) pero NO prueba que la plata haya
// entrado. Solo la confirmación de Mercado Pago ('confirmado_mp') la prueba; los demás niveles piden una mirada del dueño.
'use strict';

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// ── números válidos ───────────────────────────────────────────────────────────

// CUIT/CUIL de 11 dígitos con dígito verificador (módulo 11).
function cuitValido(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  if (d.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]; let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(d[i]) * pesos[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return d[10] === '9' || d[10] === '4'; // caso especial (prefijo 23: 9 varón / 4 mujer)
  return Number(d[10]) === dv;
}

// CBU/CVU de 22 dígitos: dos bloques con dígito verificador (algoritmo del BCRA).
function cbuValido(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  if (d.length !== 22) return false;
  const dv = (digitos, pesos) => { let s = 0; for (let i = 0; i < pesos.length; i++) s += Number(digitos[i]) * pesos[i]; return (10 - (s % 10)) % 10; };
  return dv(d.slice(0, 7), [7, 1, 3, 9, 7, 1, 3]) === Number(d[7]) && dv(d.slice(8, 21), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === Number(d[21]);
}
const esCvu = (cbu) => /^0000003/.test(String(cbu || '')); // los CVU de las billeteras empiezan con 0000003

// ── nombres ───────────────────────────────────────────────────────────────────
const tokensNombre = (s) => sinTildes(s).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 2);
function distancia(a, b) {
  if (a === b) return 0; if (Math.abs(a.length - b.length) > 1) return 9;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}
// ¿Son la misma persona/empresa? Sin importar el orden ni las tildes, y tolerando 1 letra mal leída por el OCR en palabras largas.
function mismoNombre(a, b) {
  const A = tokensNombre(a), B = tokensNombre(b); if (!A.length || !B.length) return false;
  const [corto, largo] = A.length <= B.length ? [A, B] : [B, A];
  if (corto.length < 2 && largo.length >= 2) return false; // un solo nombre de pila no alcanza para dar por buena a una persona
  const usados = new Set(); let coinciden = 0;
  for (const t of corto) {
    const k = largo.findIndex((u, i) => !usados.has(i) && (u === t || (t.length >= 5 && u.length >= 5 && distancia(t, u) <= 1)));
    if (k >= 0) { usados.add(k); coinciden++; }
  }
  return coinciden >= Math.min(2, corto.length) && coinciden / corto.length >= 0.66;
}

// ── lectura del texto ─────────────────────────────────────────────────────────
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const ENTIDADES = [['mercadopago', /mercado\s*pago/i], ['personalpay', /personal\s*pay/i], ['naranjax', /naranja\s*x/i], ['uala', /\bual[aá]\b/i], ['brubank', /brubank/i], ['lemon', /\blemon\b/i],
  ['cuentadni', /cuenta\s*dni/i], ['galicia', /galicia/i], ['santander', /santander/i], ['bbva', /\bbbva\b|franc[eé]s/i], ['macro', /banco\s*macro|\bmacro\b/i], ['nacion', /banco\s*naci[oó]n|\bnaci[oó]n\b/i],
  ['provincia', /banco\s*(de\s*la\s*)?provincia|bapro/i], ['icbc', /\bicbc\b/i], ['hsbc', /\bhsbc\b/i], ['credicoop', /credicoop/i], ['ciudad', /banco\s*ciudad/i], ['supervielle', /supervielle/i], ['itau', /ita[uú]/i], ['modo', /\bmodo\b/i]];
const NOMBRES_ENTIDAD = /^(mercado\s*pago|personal\s*pay|naranja\s*x|ual[aá]|brubank|lemon|cuenta\s*dni|banco\b.*|galicia|santander|bbva|macro|icbc|hsbc|credicoop|supervielle|ita[uú]|modo|billetera.*|cuenta\s*(corriente|de ahorro|vista).*)$/i;
const NO_ES_NOMBRE = /(comprobante|transferencia|origen|destino|motivo|operaci[oó]n|identificaci[oó]n|c[oó]digo|importe|monto|fecha|hora|descarg|asistente|app|enviado|aprobad|acreditad|cuit|cuil|cbu|cvu|alias|n[uú]mero|mercado|pago|pagos|var|varios|tu |hac[eé]|transferencias|mensaje|audio|conoc|descarg[aá]|recibo|constancia)/i;

function parsearMonto(crudo) {
  let s = String(crudo || '').replace(/[^\d.,]/g, ''); if (!s) return null;
  const ult = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (ult >= 0 && s.length - ult - 1 <= 2 && s.length - ult - 1 > 0) s = `${s.slice(0, ult).replace(/[.,]/g, '')}.${s.slice(ult + 1)}`; else s = s.replace(/[.,]/g, '');
  const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? n : null;
}
function leerMonto(texto) {
  const lineas = String(texto || '').split(/\n/).map((l) => l.trim());
  // 1) un importe solo en su línea, con $ ("$ 10.000"): es el monto principal de los comprobantes de billeteras
  for (const l of lineas) { const m = /^[^\w$]{0,3}(?:\$|ARS)\s*([\d][\d.,]*)\s*$/i.exec(l); if (m) { const v = parsearMonto(m[1]); if (v) return v; } }
  // 2) un importe con etiqueta
  const re = /(?:importe|monto|total|transferiste|enviaste|pagaste|valor)[^\d$\n]{0,25}(?:\$|ARS)?\s*([\d][\d.,]*)/gi; let m, mejor = null;
  while ((m = re.exec(texto))) { const v = parsearMonto(m[1]); if (v && (mejor === null || v > mejor)) mejor = v; }
  if (mejor) return mejor;
  // 3) el primer importe con $
  m = /(?:\$|ARS)\s*([\d][\d.,]*)/i.exec(texto); return m ? parsearMonto(m[1]) : null;
}

function leerFecha(texto) {
  const t = sinTildes(String(texto || '')).toLowerCase();
  let m = /(\d{1,2})\s*(?:\/|-|\sde\s|\s)\s*([a-z]{3,10})\.?\s*(?:\/|-|\sde\s|\s)\s*(\d{4})/.exec(t); let dia, mes, anio, resto;
  if (m && MESES[m[2]]) { dia = +m[1]; mes = MESES[m[2]]; anio = +m[3]; resto = t.slice(m.index + m[0].length); }
  else {
    m = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/.exec(t);
    if (!m) { m = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(t); if (!m) return { fecha: null, hora: null }; dia = +m[3]; mes = +m[2]; anio = +m[1]; resto = t.slice(m.index + m[0].length); }
    else { dia = +m[1]; mes = +m[2]; anio = +m[3]; if (anio < 100) anio += 2000; resto = t.slice(m.index + m[0].length); }
  }
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || anio < 2000 || anio > 2100) return { fecha: null, hora: null };
  const h = /(?:a\s*las\s*|-\s*|,\s*|\s)(\d{1,2})[:.](\d{2})(?::\d{2})?/.exec(resto.slice(0, 40));
  const hora = h && +h[1] < 24 && +h[2] < 60 ? `${String(+h[1]).padStart(2, '0')}:${h[2]}` : null;
  return { fecha: `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, hora };
}

const LIMPIA_DIGITOS = (s) => String(s || '').toUpperCase().replace(/[O]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/\D/g, '');
function leerOperacion(lineas) {
  const etiqueta = /(n[.º°o]*\s*(de\s*)?operaci[oó]n|n[uú]mero\s+de\s+(operaci[oó]n|comprobante|referencia|transacci[oó]n)|nro\.?\s*(de\s*)?(operaci[oó]n|comprobante|referencia|transacci[oó]n)|id\s+de\s+(operaci[oó]n|transacci[oó]n)|c[oó]digo\s+de\s+operaci[oó]n|n[.º°o]*\s*de\s*(comprobante|referencia|transacci[oó]n))/i;
  for (let i = 0; i < lineas.length; i++) {
    if (!etiqueta.test(lineas[i]) || /identificaci[oó]n/i.test(lineas[i])) continue;
    const mismaLinea = lineas[i].replace(etiqueta, ' ').match(/[:\s]\s*([A-Z0-9][A-Z0-9\-]{5,31})\s*$/i);
    // el número puede estar en la misma línea o en una de las dos siguientes (en Mercado Pago está abajo de la etiqueta)
    for (const cand of [mismaLinea && mismaLinea[1], ...lineas.slice(i + 1, i + 3)]) {
      const m = /^[^\w]{0,2}([A-Z0-9][A-Z0-9\-]{5,31})[^\w]{0,2}$/i.exec(String(cand || '').trim());
      if (m && m[1].replace(/\D/g, '').length >= 8) return m[1].replace(/[^0-9A-Z\-]/gi, '').toUpperCase();
    }
  }
  return null;
}
function leerCodigo(lineas) {
  for (let i = 0; i < lineas.length; i++) {
    if (!/c[oó]digo\s+de\s+identificaci[oó]n/i.test(lineas[i])) continue;
    for (const c of [lineas[i].replace(/.*identificaci[oó]n[:\s]*/i, ''), lineas[i + 1], lineas[i + 2]]) { const m = /^\s*([A-Z0-9]{14,34})\s*$/i.exec(String(c || '')); if (m) return m[1].toUpperCase(); }
  }
  return null;
}

// Partes (origen/destino): bloques "Nombre / Entidad / CVU: ... / CUIT/CUIL: ..." en el orden en que aparecen.
function leerPartes(lineas) {
  const partes = []; let actual = null; const nueva = () => { actual = { nombre: '', entidad: '', cuit: '', cbu: '', cvu: '', alias: '' }; partes.push(actual); return actual; };
  let desde = lineas.findIndex((l) => /origen\s*(y|\/)\s*destino|^\s*de\s*:?\s*$|datos\s+de\s+la\s+transferencia/i.test(l)); if (desde < 0) desde = 0;
  for (let i = desde; i < lineas.length; i++) {
    const l = lineas[i].trim(); if (!l) continue;
    if (/n[.º°o]*\s*(de\s*)?operaci[oó]n|c[oó]digo\s+de\s+identificaci[oó]n|hac[eé]\s+pagos|descarg[aá]\s+la\s+app/i.test(l) && partes.length) break;
    const cb = /\b(CBU|CVU)\b\s*:?\s*([0-9OIlSB\s]{20,32})/i.exec(l);
    if (cb) { const d = LIMPIA_DIGITOS(cb[2]).slice(0, 22); const p = actual || nueva(); if (d.length >= 20) { if (cb[1].toUpperCase() === 'CVU' || esCvu(d)) p.cvu = d; else p.cbu = d; } continue; }
    const ct = /(?:CUIT|CUIL|CUIT\/CUIL)\s*[:\-]?\s*([\d\-\s.]{11,16})/i.exec(l);
    if (ct) { const d = ct[1].replace(/\D/g, ''); if (d.length === 11) (actual || nueva()).cuit = d; continue; }
    const al = /\balias\s*[:\-]?\s*([a-z0-9._-]{6,24})/i.exec(l);
    if (al) { (actual || nueva()).alias = al[1].toLowerCase(); continue; }
    const limpio = l.replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/, '').replace(/^[A-Za-z]\s+(?=\S+\s+\S)/, '').replace(/[.,;:]+$/, '').trim(); // el OCR lee el ícono de la persona como una letra suelta
    if (!limpio) continue;
    if (NOMBRES_ENTIDAD.test(limpio) && actual) { if (!actual.entidad) actual.entidad = limpio; continue; }
    if (/^[A-Za-zÁÉÍÓÚÑáéíóúñ'’.\- ]{5,60}$/.test(limpio) && limpio.split(/\s+/).length >= 2 && !NO_ES_NOMBRE.test(limpio)) {
      if (!actual || actual.nombre || actual.cuit || actual.cbu || actual.cvu) nueva();
      actual.nombre = limpio.replace(/\s+/g, ' '); continue;
    }
  }
  return partes.filter((p) => p.nombre || p.cuit || p.cbu || p.cvu || p.alias);
}

function plataformaDe(texto) { for (const [id, re] of ENTIDADES) if (re.test(texto)) return id; return 'otro'; }

// → datos del comprobante (campos vacíos = no se pudo leer)
function extraer(texto) {
  const t = String(texto || '').replace(/\r/g, ''); const lineas = t.split('\n');
  const { fecha, hora } = leerFecha(t); const partes = leerPartes(lineas);
  const alias = [...t.matchAll(/\balias\s*[:\-]?\s*([a-z0-9._-]{6,24})/gi)].map((m) => m[1].toLowerCase());
  const origen = partes.length >= 2 ? partes[0] : null; const destino = partes.length >= 2 ? partes[partes.length - 1] : (partes[0] || null);
  const motivo = (/motivo\s*:\s*(.{1,60})/i.exec(t) || [])[1] || '';
  const d = {
    esComprobante: /comprobante|transferencia|operaci[oó]n|constancia/i.test(t), plataforma: plataformaDe(t),
    monto: leerMonto(t), fecha, hora, operacion: leerOperacion(lineas), codigo: leerCodigo(lineas), motivo: motivo.trim(),
    origen: origen && partes.length >= 2 ? origen : null, destino: destino || null, soloUnaParte: partes.length === 1, alias,
  };
  const clave = [d.monto, d.fecha, d.operacion, d.destino && (d.destino.cbu || d.destino.cvu || d.destino.cuit || d.destino.nombre || d.destino.alias)].filter(Boolean).length;
  d.camposClave = clave; d.leido = clave >= 3;
  return d;
}

// ── verificación ──────────────────────────────────────────────────────────────
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const peso = { confirmado_mp: 3, coincide: 2, revisar: 1, sospechoso: 0 };

// esperado: { monto?, tolerancia?, cbu?, cvu?, alias?, titular?, cuit?, desde? (Date: cuándo se pidió el pago) }
// operacionesUsadas: [{ operacion, de }]  → números de operación ya registrados en otros comprobantes
function verificar({ datos, esperado = {}, operacionesUsadas = [], ahora = new Date(), maxHoras = 72 }) {
  const c = []; const add = (id, ok, titulo, detalle) => c.push({ id, ok, titulo, detalle });
  const d = datos || {};

  add('lectura', d.leido ? true : (d.camposClave >= 2 ? null : false), 'Se pudo leer el comprobante',
    d.leido ? 'Se leyeron el monto, la fecha, la operación y el destino.' : `Solo se pudieron leer ${d.camposClave || 0} de 4 datos clave (monto, fecha, operación, destino). Mirá la imagen original.`);

  // integridad: números que tienen que cumplir su dígito verificador
  const malos = [];
  for (const [rol, p] of [['origen', d.origen], ['destino', d.destino]]) {
    if (!p) continue;
    if (p.cuit && !cuitValido(p.cuit)) malos.push(`el CUIT/CUIL del ${rol}`);
    if (p.cbu && !cbuValido(p.cbu)) malos.push(`el CBU del ${rol}`);
    if (p.cvu && !cbuValido(p.cvu)) malos.push(`el CVU del ${rol}`);
  }
  const hayNumeros = !!(d.destino && (d.destino.cuit || d.destino.cbu || d.destino.cvu)) || !!(d.origen && (d.origen.cuit || d.origen.cbu || d.origen.cvu));
  add('integridad', hayNumeros ? malos.length === 0 : null, 'Los CUIT y CBU/CVU son números válidos',
    !hayNumeros ? 'No se leyeron CUIT/CBU/CVU para comprobar.' : malos.length ? `No pasa la verificación de dígitos: ${malos.join(', ')}. Puede ser un error de lectura de la foto o un dato alterado.` : 'Los dígitos verificadores coinciden.');

  // destino: ¿es la cuenta del dueño?
  const p = d.destino; const tengo = !!(esperado.cbu || esperado.cvu || esperado.alias || esperado.titular || esperado.cuit);
  let destinoOk = null; let porque = '';
  if (!tengo) porque = 'Todavía no cargaste los datos de tu cuenta (alias, CBU/CVU, titular o CUIT/CUIL) en Configuración, así que no se puede comparar el destino.';
  else if (!p && !(d.alias || []).length) porque = 'En el comprobante no se pudo leer a quién se transfirió.';
  else {
    const mias = [esperado.cbu, esperado.cvu].map(soloDigitos).filter((x) => x.length === 22);
    const coincideCuenta = p && mias.length && [p.cbu, p.cvu].map(soloDigitos).some((x) => x && mias.includes(x));
    const coincideCuit = p && esperado.cuit && soloDigitos(p.cuit) === soloDigitos(esperado.cuit) && soloDigitos(p.cuit).length === 11;
    const coincideAlias = esperado.alias && ((d.alias || []).includes(String(esperado.alias).toLowerCase()) || (p && p.alias === String(esperado.alias).toLowerCase()));
    const coincideNombre = p && esperado.titular && mismoNombre(p.nombre, esperado.titular);
    const hayOtraCuenta = p && (p.cbu || p.cvu) && mias.length && ![p.cbu, p.cvu].map(soloDigitos).some((x) => x && mias.includes(x)); // destino con CBU distinto al mío
    if (hayOtraCuenta) { destinoOk = false; porque = `El CBU/CVU de destino (${soloDigitos(p.cbu || p.cvu)}) no es el de tu cuenta.`; }
    else if (coincideCuenta || coincideCuit || coincideAlias || coincideNombre) {
      destinoOk = true; porque = `Coincide ${[coincideCuenta && 'el CBU/CVU', coincideCuit && 'el CUIT/CUIL', coincideAlias && 'el alias', coincideNombre && 'el titular'].filter(Boolean).join(', ')} con tu cuenta.`;
    } else { destinoOk = false; porque = `El destino (${(p && p.nombre) || 'no legible'}) no coincide con tu cuenta${esperado.titular ? ` (${esperado.titular})` : ''}.`; }
  }
  add('destino', destinoOk, 'El destino es tu cuenta', porque);

  // monto
  if (esperado.monto > 0) {
    const tol = esperado.tolerancia || 0;
    add('monto', d.monto == null ? null : d.monto + tol >= esperado.monto, 'El monto alcanza',
      d.monto == null ? 'No se pudo leer el monto.' : d.monto + tol >= esperado.monto ? `Transfirió $${d.monto.toLocaleString('es-AR')} (se esperaba $${esperado.monto.toLocaleString('es-AR')}).` : `Transfirió $${d.monto.toLocaleString('es-AR')} y se esperaban $${esperado.monto.toLocaleString('es-AR')}: faltan $${redondear(esperado.monto - d.monto).toLocaleString('es-AR')}.`);
  } else add('monto', null, 'El monto alcanza', 'No hay un pago pendiente de este cliente para comparar el monto.');

  // fecha
  if (d.fecha) {
    const [Y, M, D] = d.fecha.split('-').map(Number); const [hh, mm] = (d.hora || '12:00').split(':').map(Number);
    const cuando = new Date(Y, M - 1, D, hh, mm); const desde = esperado.desde ? new Date(esperado.desde) : new Date(ahora.getTime() - maxHoras * 3600e3);
    const futuro = cuando.getTime() > ahora.getTime() + 15 * 60e3; const viejo = cuando.getTime() < desde.getTime() - 5 * 60e3;
    add('fecha', !futuro && !viejo, 'La fecha es reciente', futuro ? 'La fecha del comprobante es futura.' : viejo ? `El comprobante es de ${d.fecha}${d.hora ? ' ' + d.hora : ''}, anterior a que se pidiera este pago.` : `Hecha el ${d.fecha}${d.hora ? ' a las ' + d.hora : ''}.`);
  } else add('fecha', null, 'La fecha es reciente', 'No se pudo leer la fecha.');

  // operación repetida
  if (d.operacion) {
    const rep = operacionesUsadas.find((o) => String(o.operacion) === String(d.operacion));
    add('duplicado', !rep, 'La operación es nueva', rep ? `El número de operación ${d.operacion} ya se registró${rep.de ? ' en un comprobante de ' + rep.de : ''}. Un mismo comprobante no puede cobrarse dos veces.` : `Operación ${d.operacion}, no usada antes.`);
  } else add('duplicado', null, 'La operación es nueva', 'No se pudo leer el número de operación (sin él no se puede detectar un comprobante repetido).');

  const ok = (id) => c.find((x) => x.id === id).ok;
  let nivel;
  if (ok('duplicado') === false || ok('destino') === false || ok('monto') === false || ok('fecha') === false) nivel = 'sospechoso';
  else if (ok('integridad') === false || ok('lectura') === false) nivel = 'revisar';
  else if (ok('destino') === true && ok('fecha') === true && ok('lectura') === true && ok('monto') !== null && ok('duplicado') === true) nivel = 'coincide';
  else nivel = 'revisar';
  return { nivel, chequeos: c };
}

// Confirmación en Mercado Pago (opcional, con el token del dueño): la operación existe, está aprobada, el monto es el mismo y entró a SU cuenta.
// obtenerPago(id) → objeto de la API de MP (o lanza si no existe). No confirmar NO significa que sea falso: no todas las operaciones figuran en esa API.
async function verificarEnMercadoPago({ operacion, monto, usuarioMp, obtenerPago }) {
  const id = String(operacion || '').replace(/\D/g, '');
  if (id.length < 8 || typeof obtenerPago !== 'function') return { ok: null, detalle: 'No se consultó a Mercado Pago.' };
  try {
    const p = await obtenerPago(id);
    if (!p || p.status === 404 || p.error || p.id == null) return { ok: null, detalle: 'Mercado Pago no devolvió esa operación (no se puede confirmar de forma automática).' };
    if (p.status !== 'approved') return { ok: false, detalle: `Mercado Pago informa la operación como "${p.status}", no como aprobada.` };
    const m = Number(p.transaction_amount ?? p.transaction_details?.net_received_amount);
    if (monto && Number.isFinite(m) && Math.abs(m - monto) > 0.5) return { ok: false, detalle: `Mercado Pago registra $${m} y el comprobante dice $${monto}.` };
    const cobra = String(p.collector_id ?? p.collector?.id ?? '');
    if (usuarioMp && cobra && cobra !== String(usuarioMp)) return { ok: false, detalle: 'La operación existe pero entró a otra cuenta de Mercado Pago, no a la tuya.' };
    return { ok: true, detalle: `Confirmado por Mercado Pago: operación ${id} aprobada por $${m || monto}.`, pago: { id: p.id, estado: p.status, monto: m || monto, fecha: p.date_approved || p.date_created || null } };
  } catch { return { ok: null, detalle: 'No se pudo consultar a Mercado Pago (sin conexión o sin permisos).' }; }
}

// Junta la verificación local y la de Mercado Pago en un solo resultado. mp.ok === true sube a 'confirmado_mp'; mp.ok === false baja a 'sospechoso'.
function combinar(ver, mp) {
  if (!mp || mp.ok === null) return { ...ver, mp: mp || null };
  const chequeos = [...ver.chequeos, { id: 'mercadopago', ok: mp.ok, titulo: 'Confirmado por Mercado Pago', detalle: mp.detalle }];
  let nivel = ver.nivel;
  if (mp.ok === false) nivel = 'sospechoso';
  else if (mp.ok === true && ver.nivel !== 'sospechoso') nivel = 'confirmado_mp';
  return { nivel, chequeos, mp };
}

const ETIQUETA_NIVEL = { confirmado_mp: '✅ Confirmado por Mercado Pago', coincide: '🟢 Los datos coinciden con tu cuenta', revisar: '🟡 Revisalo vos', sospechoso: '🔴 Algo no coincide' };

// Texto para el aviso al dueño (WhatsApp) y para la pantalla Documentos.
function resumenParaDueno(datos, ver) {
  const d = datos || {}; const l = [];
  const monto = d.monto ? `$${d.monto.toLocaleString('es-AR')}` : 'monto no legible';
  l.push(`${ETIQUETA_NIVEL[ver.nivel] || ''}`);
  l.push(`💰 ${monto}${d.fecha ? ` · ${d.fecha.split('-').reverse().join('/')}${d.hora ? ' ' + d.hora : ''}` : ''}${d.operacion ? ` · Op. ${d.operacion}` : ''}`);
  if (d.origen && d.origen.nombre) l.push(`De: ${d.origen.nombre}${d.destino && d.destino.nombre ? ` → A: ${d.destino.nombre}` : ''}`);
  else if (d.destino && d.destino.nombre) l.push(`A: ${d.destino.nombre}`);
  const fallas = ver.chequeos.filter((x) => x.ok === false);
  for (const f of fallas.slice(0, 3)) l.push(`⚠️ ${f.detalle}`);
  if (ver.nivel === 'coincide') l.push('Los datos coinciden, pero una captura se puede falsificar: confirmá en tu app que la plata entró antes de dar el turno por pagado.');
  return l.join('\n');
}

module.exports = { extraer, verificar, verificarEnMercadoPago, combinar, resumenParaDueno, cuitValido, cbuValido, esCvu, mismoNombre, parsearMonto, leerFecha, ETIQUETA_NIVEL, peso };
