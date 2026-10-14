// tests/comprobante-pago.test.js — leer comprobantes de transferencia (captura o PDF) y comprobar que sirvan para dar un pago por bueno.
// Los datos son inventados (personas, CUIT y cuentas ficticias con dígitos verificadores válidos); el formato imita el de un comprobante real
// de Mercado Pago tal como lo lee el OCR del programa (verificado a mano con una captura real).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const Module = require('module');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const C = require('../main/gestion/comprobante-pago');

// ── generadores de números válidos ──
function armarCuit(prefijo, dni) {
  const base = `${prefijo}${String(dni).padStart(8, '0')}`; const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]; let s = 0;
  for (let i = 0; i < 10; i++) s += Number(base[i]) * pesos[i];
  let dv = 11 - (s % 11); if (dv === 11) dv = 0; if (dv === 10) return null; return base + dv;
}
function armarCbu(banco, sucursal, cuenta13) {
  const dv = (d, p) => { let s = 0; for (let i = 0; i < p.length; i++) s += Number(d[i]) * p[i]; return (10 - (s % 10)) % 10; };
  const b1 = `${banco}${sucursal}`; const dv1 = dv(b1, [7, 1, 3, 9, 7, 1, 3]); const c = String(cuenta13).padStart(13, '0');
  return `${b1}${dv1}${c}${dv(c, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])}`;
}
const formatoCuit = (c) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;

const CUIT_DUENO = armarCuit('20', 30123456) || armarCuit('20', 30123457);
const CUIT_CLIENTE = armarCuit('27', 28765432) || armarCuit('27', 28765433);
const CVU_DUENO = armarCbu('000', '0003', 1234567890123).replace(/^0000003/, '0000003'); // empieza con 0000003 (CVU)
const CBU_CLIENTE = armarCbu('007', '0650', 9876543210987);
const OP = '184000111222';

const comprobanteMP = (extra = {}) => {
  const e = { monto: '$ 12.500', fecha: '14/octubre/2026 a las 10:35.', op: OP, destinoNombre: 'Lucía Romero', destinoCuit: formatoCuit(CUIT_DUENO), destinoCvu: CVU_DUENO, ...extra };
  return `mercado
pago
Comprobante de transferencia
${e.fecha}

${e.monto}

Motivo: Varios

Origen y destino

& Marcela Beatriz Quiroga
Personal Pay
CBU: ${CBU_CLIENTE}
CUIT/CUIL: ${formatoCuit(CUIT_CLIENTE)}

o ${e.destinoNombre}
Mercado Pago
CVU: ${e.destinoCvu}
CUIT/CUIL: ${e.destinoCuit}

N.° de operación de Mercado Pago

${e.op}

Código de identificación
ABCD1234EFGH5678JKLM90

Mago, tu asistente
Hacé pagos y
transferencias por
mensaje o audio
¡Descargá la app y conocela!`;
};

const ahora = new Date(2026, 9, 14, 11, 0); // 14/10/2026 11:00
const esperadoDueno = { monto: 12500, cvu: CVU_DUENO, titular: 'Lucía Romero', cuit: CUIT_DUENO };

(async () => {
  console.log('\n[comprobantes de pago] Tests:');

  // ── números válidos ──
  assert(C.cuitValido(CUIT_DUENO) && C.cuitValido(formatoCuit(CUIT_CLIENTE)) && !C.cuitValido(CUIT_DUENO.slice(0, 10) + String((Number(CUIT_DUENO[10]) + 1) % 10)) && !C.cuitValido('123'), 'CUIT/CUIL: valida el dígito verificador');
  assert(C.cbuValido(CVU_DUENO) && C.cbuValido(CBU_CLIENTE) && !C.cbuValido(CBU_CLIENTE.slice(0, 21) + String((Number(CBU_CLIENTE[21]) + 1) % 10)) && !C.cbuValido(CBU_CLIENTE.slice(0, 5) + '9' + CBU_CLIENTE.slice(6)) && !C.cbuValido('1234'), 'CBU/CVU: valida los dos dígitos verificadores');
  assert(C.esCvu(CVU_DUENO) && !C.esCvu(CBU_CLIENTE), 'los CVU de billeteras (0000003…) se distinguen de los CBU de bancos');
  assert(C.mismoNombre('Lucía Romero', 'ROMERO LUCIA') && C.mismoNombre('Juan Martin Arrayago', 'Juan Martín Arrayago') && C.mismoNombre('Leila Agostina Cuello', 'Leita Agostina Cuello') && !C.mismoNombre('Lucía Romero', 'Marcela Quiroga') && !C.mismoNombre('Lucía', 'Lucía Pérez González'), 'nombres: sin importar orden ni tildes, y tolera una letra mal leída; no confunde personas distintas');

  // ── lectura de un comprobante de Mercado Pago ──
  const d = C.extraer(comprobanteMP());
  assert(d.esComprobante && d.plataforma === 'mercadopago' && d.monto === 12500 && d.fecha === '2026-10-14' && d.hora === '10:35', 'Mercado Pago: monto, fecha y hora');
  assert(d.operacion === OP && d.codigo === 'ABCD1234EFGH5678JKLM90' && d.motivo === 'Varios', 'Mercado Pago: número de operación, código de identificación y motivo');
  assert(d.origen.nombre === 'Marcela Beatriz Quiroga' && d.origen.cbu === CBU_CLIENTE && d.origen.cuit === CUIT_CLIENTE && d.origen.entidad === 'Personal Pay', 'origen: nombre (sin la letra suelta del ícono), CBU, CUIT y entidad');
  assert(d.destino.nombre === 'Lucía Romero' && d.destino.cvu === CVU_DUENO && d.destino.cuit === CUIT_DUENO && d.destino.entidad === 'Mercado Pago', 'destino: nombre, CVU, CUIT y entidad');
  assert(d.leido && d.camposClave === 4, 'se leyeron los 4 datos clave (monto, fecha, operación, destino)');

  // ── otros formatos ──
  const otro = C.extraer(`Banco Galicia\nTransferencia realizada\nFecha: 14/10/2026 10:35\nImporte: $ 12.500,00\nNro. de comprobante 987654321012\nDestinatario\nLucía Romero\nCBU: ${CVU_DUENO}\nAlias: lucia.romero.mp`);
  assert(otro.monto === 12500 && otro.fecha === '2026-10-14' && otro.hora === '10:35' && otro.operacion === '987654321012' && otro.alias.includes('lucia.romero.mp') && otro.plataforma === 'galicia', 'otro banco: importe con coma, fecha numérica, "Nro. de comprobante" y alias');
  assert(C.leerFecha('Fecha 3 de setiembre de 2026 - 18:07 hs').fecha === '2026-09-03' && C.leerFecha('03/09/26 18:07').hora === '18:07' && C.leerFecha('2026-09-03T18:07:00').fecha === '2026-09-03' && C.leerFecha('sin fecha').fecha === null && C.leerFecha('31/13/2026').fecha === null, 'fechas en varios formatos (y sin inventar las inválidas)');
  assert(C.parsearMonto('$ 1.234,56') === 1234.56 && C.parsearMonto('10.000') === 10000 && C.parsearMonto('10,000') === 10000 && C.parsearMonto('abc') === null, 'montos argentinos');
  const ruido = C.extraer(comprobanteMP().replace(CVU_DUENO, CVU_DUENO.replace(/0/g, (m, i) => (i === 3 ? 'O' : m))));
  assert(ruido.destino.cvu === CVU_DUENO, 'el OCR confunde 0 con O en el CVU y se corrige');
  assert(C.extraer('hola, ¿tienen turno para mañana?').camposClave === 0 && !C.extraer('hola').leido && C.extraer('').monto === null && C.extraer(null).operacion === null, 'un texto cualquiera no se confunde con un comprobante');

  // ── verificación ──
  let v = C.verificar({ datos: d, esperado: esperadoDueno, ahora });
  assert(v.nivel === 'coincide' && v.chequeos.every((c) => c.ok === true), 'todo coincide: destino, monto, fecha, dígitos y operación nueva → "coincide"');
  assert(/Coincide el CBU\/CVU/.test(v.chequeos.find((c) => c.id === 'destino').detalle), 'dice por qué coincide el destino');

  v = C.verificar({ datos: d, esperado: { ...esperadoDueno, monto: 15000 }, ahora });
  assert(v.nivel === 'sospechoso' && v.chequeos.find((c) => c.id === 'monto').ok === false && /faltan \$2\.500/.test(v.chequeos.find((c) => c.id === 'monto').detalle), 'transfirió menos de lo que debía → "sospechoso" y dice cuánto falta');
  v = C.verificar({ datos: d, esperado: { ...esperadoDueno, monto: 10000 }, ahora });
  assert(v.nivel === 'coincide', 'transfirió de más: se acepta');

  const ajena = armarCbu('000', '0003', 5555555555555);
  v = C.verificar({ datos: C.extraer(comprobanteMP({ destinoCvu: ajena })), esperado: esperadoDueno, ahora });
  assert(v.nivel === 'sospechoso' && v.chequeos.find((c) => c.id === 'destino').ok === false && /no es el de tu cuenta/.test(v.chequeos.find((c) => c.id === 'destino').detalle), 'la plata fue a OTRA cuenta → "sospechoso"');

  v = C.verificar({ datos: d, esperado: esperadoDueno, operacionesUsadas: [{ operacion: OP, de: 'Pedro' }], ahora });
  assert(v.nivel === 'sospechoso' && /ya se registró en un comprobante de Pedro/.test(v.chequeos.find((c) => c.id === 'duplicado').detalle), 'la misma operación ya se usó con otro cliente → "sospechoso"');

  v = C.verificar({ datos: d, esperado: { ...esperadoDueno, desde: new Date(2026, 9, 14, 12, 0) }, ahora: new Date(2026, 9, 14, 13, 0) });
  assert(v.nivel === 'sospechoso' && v.chequeos.find((c) => c.id === 'fecha').ok === false, 'el comprobante es anterior a que se pidiera el pago → "sospechoso"');
  v = C.verificar({ datos: d, esperado: esperadoDueno, ahora: new Date(2026, 9, 20, 11, 0) });
  assert(v.chequeos.find((c) => c.id === 'fecha').ok === false, 'un comprobante de hace 6 días no sirve para un pago de hoy');
  v = C.verificar({ datos: d, esperado: esperadoDueno, ahora: new Date(2026, 9, 14, 9, 0) });
  assert(v.chequeos.find((c) => c.id === 'fecha').ok === false && /futura/.test(v.chequeos.find((c) => c.id === 'fecha').detalle), 'un comprobante con fecha futura se rechaza');

  const alterado = C.extraer(comprobanteMP({ destinoCuit: CUIT_DUENO.slice(0, 10) + String((Number(CUIT_DUENO[10]) + 3) % 10) }));
  v = C.verificar({ datos: alterado, esperado: esperadoDueno, ahora });
  assert(v.chequeos.find((c) => c.id === 'integridad').ok === false && v.nivel === 'revisar', 'un CUIT con dígito verificador inválido (alterado o mal leído) → pide revisar');

  v = C.verificar({ datos: d, esperado: { monto: 12500 }, ahora });
  assert(v.nivel === 'revisar' && v.chequeos.find((c) => c.id === 'destino').ok === null && /Configuración/.test(v.chequeos.find((c) => c.id === 'destino').detalle), 'sin datos de tu cuenta cargados: no puede comparar el destino y lo dice (pide cargarlos en Configuración)');
  v = C.verificar({ datos: d, esperado: { titular: 'Lucía Romero' }, ahora });
  assert(v.chequeos.find((c) => c.id === 'destino').ok === true && v.nivel === 'revisar' && v.chequeos.find((c) => c.id === 'monto').ok === null, 'con solo el titular cargado compara por nombre; sin pago pendiente no compara el monto y queda "revisar"');

  const poco = C.extraer('Comprobante de transferencia\n$ 500');
  v = C.verificar({ datos: poco, esperado: esperadoDueno, ahora });
  assert(['revisar', 'sospechoso'].includes(v.nivel) && v.chequeos.find((c) => c.id === 'lectura').ok !== true, 'una foto mal leída nunca queda como "coincide"');

  // ── Mercado Pago confirma la operación ──
  let r = await C.verificarEnMercadoPago({ operacion: OP, monto: 12500, usuarioMp: 777, obtenerPago: async () => ({ id: 184000111222, status: 'approved', transaction_amount: 12500, collector_id: 777, date_approved: '2026-10-14T10:36:00' }) });
  assert(r.ok === true && /Confirmado por Mercado Pago/.test(r.detalle), 'Mercado Pago confirma: operación aprobada, mismo monto y entró a tu cuenta');
  assert((await C.verificarEnMercadoPago({ operacion: OP, monto: 12500, usuarioMp: 777, obtenerPago: async () => ({ id: 1, status: 'approved', transaction_amount: 12500, collector_id: 999 }) })).ok === false, 'la operación existe pero entró a OTRA cuenta de Mercado Pago → falla');
  assert((await C.verificarEnMercadoPago({ operacion: OP, monto: 12500, obtenerPago: async () => ({ id: 1, status: 'approved', transaction_amount: 800 }) })).ok === false, 'Mercado Pago registra otro monto → falla');
  assert((await C.verificarEnMercadoPago({ operacion: OP, monto: 12500, obtenerPago: async () => ({ id: 1, status: 'rejected', transaction_amount: 12500 }) })).ok === false, 'operación rechazada en Mercado Pago → falla');
  assert((await C.verificarEnMercadoPago({ operacion: OP, monto: 12500, obtenerPago: async () => ({ message: 'not found', status: 404, error: 'not_found' }) })).ok === null, 'Mercado Pago no tiene esa operación: no se puede confirmar (no se la da por falsa)');
  assert((await C.verificarEnMercadoPago({ operacion: OP, monto: 12500, obtenerPago: async () => { throw new Error('sin internet'); } })).ok === null && (await C.verificarEnMercadoPago({ operacion: '12', monto: 1, obtenerPago: async () => ({}) })).ok === null && (await C.verificarEnMercadoPago({ operacion: OP, monto: 1 })).ok === null, 'sin internet, sin permisos o sin número de operación: no confirma y no rompe');
  const base = C.verificar({ datos: d, esperado: esperadoDueno, ahora });
  assert(C.combinar(base, { ok: true, detalle: 'ok' }).nivel === 'confirmado_mp' && C.combinar(base, { ok: false, detalle: 'no' }).nivel === 'sospechoso' && C.combinar(base, { ok: null, detalle: '' }).nivel === 'coincide', 'combinar: confirmado sube a "confirmado_mp", contradicho baja a "sospechoso", sin respuesta no cambia');
  const malo = C.verificar({ datos: d, esperado: { ...esperadoDueno, monto: 99999 }, ahora });
  assert(C.combinar(malo, { ok: true, detalle: 'ok' }).nivel === 'sospechoso', 'si Mercado Pago confirma pero el monto no alcanza para lo que se debía, sigue "sospechoso"');

  // ── texto para el dueño ──
  const txt = C.resumenParaDueno(d, base);
  assert(/Los datos coinciden/.test(txt) && /\$12\.500/.test(txt) && new RegExp(OP).test(txt) && /una captura se puede falsificar/.test(txt) && /Marcela Beatriz Quiroga/.test(txt), 'el aviso al dueño muestra monto, operación y quién pagó, y aclara que una captura se puede falsificar');
  assert(/Algo no coincide/.test(C.resumenParaDueno(d, malo)) && /faltan/.test(C.resumenParaDueno(d, malo)) && !/se puede falsificar/.test(C.resumenParaDueno(d, malo)), 'si algo no coincide, lo dice con el motivo');

  // ── integrado con la bandeja de documentos (base local real, OCR simulado) ──
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-comp-'));
  require('../main/db/store').abrir(path.join(dir, 'akira.db'));
  let textoOcr = comprobanteMP(); const ocrRuta = path.join(__dirname, '..', 'main/bot-engine/services/bot/ocr.service.js');
  Module._cache[ocrRuta] = { id: ocrRuta, filename: ocrRuta, loaded: true, exports: { leerTexto: async () => textoOcr, cerrar: async () => {} }, children: [], paths: [] };
  const Config = require('../main/bot-engine/models/Config'); const Turno = require('../main/bot-engine/models/Turno'); const Documento = require('../main/bot-engine/models/Documento'); const Pedido = require('../main/bot-engine/models/Pedido');
  await Config.findOneAndUpdate({ userId: 'u1' }, { aliasTransferencia: 'lucia.romero', cbuTransferencia: CVU_DUENO, titularTransferencia: 'Lucía Romero', cuilTransferencia: CUIT_DUENO }, { upsert: true });
  const hoy = new Date(); const ini = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 2, 10, 0);
  await Turno.create({ userId: 'u1', calendarId: 'principal', fechaInicio: ini, fechaFin: new Date(ini.getTime() + 3600e3), clienteNombre: 'Marcela', clienteTelefono: '5492241111111', estado: 'pendiente', pago: { monto: 12500, metodo: 'transferencia' } });
  const { crearDocumentosService } = require('../main/bot-engine/services/bot/documentos.service');
  const llamadasMP = []; const mp = { miUsuario: async () => ({ id: 777 }), verificarPago: async (id) => { llamadasMP.push(id); return { id: Number(id), status: 'approved', transaction_amount: 12500, collector_id: 777 }; } };
  const svc = crearDocumentosService({ userId: 'u1', dirBase: path.join(dir, 'docs'), log() {}, mp });
  // la captura trae la fecha de HOY para que el chequeo de fecha pase en cualquier día en que se corra la prueba
  const f = hoy; const fechaHoy = `${f.getDate()}/${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][f.getMonth()]}/${f.getFullYear()} a las ${f.getHours()}:${String(f.getMinutes()).padStart(2, '0')}.`;
  textoOcr = comprobanteMP({ fecha: fechaHoy });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const g = await svc.guardarRecibido({ jid: '5492241111111@s.whatsapp.net', nombreCliente: 'Marcela', numero: '5492241111111', buffer: png, mimetype: 'image/png', nombreOriginal: 'comprobante.png' });
  assert(g.ok && g.turno && !g.analisis, 'la foto se guarda y se asocia al turno pendiente (el análisis llega después de leerla)');
  const res = await svc.analizarImagen(g.doc, png);
  assert(res.analisis && res.analisis.ver.nivel === 'confirmado_mp' && llamadasMP[0] === OP, 'se lee la foto, se compara con el turno pendiente ($12.500) y Mercado Pago confirma la operación');
  const guardado = await Documento.findOne({ _id: g.doc._id }).lean();
  assert(guardado.comprobante.operacion === OP && guardado.verificacion.nivel === 'confirmado_mp' && guardado.verificacion.chequeos.length >= 6 && guardado.tipo === 'comprobante' && guardado.montoSugerido === 12500, 'el resultado queda guardado en el documento (datos leídos y cada chequeo)');

  // el mismo comprobante reenviado por OTRO cliente → sospechoso (operación repetida), y no se consulta a Mercado Pago de nuevo
  const g2 = await svc.guardarRecibido({ jid: '5492242222222@s.whatsapp.net', nombreCliente: 'Otro cliente', numero: '5492242222222', buffer: png, mimetype: 'image/png', nombreOriginal: 'copia.png' });
  llamadasMP.length = 0; const res2 = await svc.analizarImagen(g2.doc, png);
  assert(res2.analisis.ver.nivel === 'sospechoso' && /ya se registró/.test(res2.analisis.ver.chequeos.find((c) => c.id === 'duplicado').detalle) && !llamadasMP.length, 'el mismo comprobante mandado por otro cliente: "sospechoso" (operación repetida)');

  // sin Mercado Pago (sin token) y con el pago por pedido
  await Pedido.create({ userId: 'u1', numero: 1, estado: 'pendiente-pago', total: 8000, nombre: 'Luis', telefono: '5492243333333', jid: '5492243333333@s.whatsapp.net', confirmadoEn: new Date(hoy.getTime() - 3600e3).toISOString(), items: [] });
  textoOcr = comprobanteMP({ fecha: fechaHoy, monto: '$ 8.000', op: '184000999888' });
  const svcSinMp = crearDocumentosService({ userId: 'u1', dirBase: path.join(dir, 'docs2'), log() {} });
  const g3 = await svcSinMp.guardarRecibido({ jid: '5492243333333@s.whatsapp.net', nombreCliente: 'Luis', numero: '5492243333333', buffer: png, mimetype: 'image/png', nombreOriginal: 'pago.png' });
  const res3 = await svcSinMp.analizarImagen(g3.doc, png);
  assert(res3.analisis.ver.nivel === 'coincide' && res3.analisis.pedido && res3.analisis.ver.chequeos.find((c) => c.id === 'monto').ok === true, 'un pago por pedido ($8.000): se compara con el pedido pendiente y, sin Mercado Pago, queda en "coincide" (el dueño confirma)');
  assert((await Documento.findOne({ _id: g3.doc._id }).lean()).pedidoId === String(res3.analisis.pedido._id), 'el documento queda vinculado al pedido');

  // una foto cualquiera (no es un comprobante) no se analiza
  textoOcr = 'Foto de un gatito con el texto feliz cumple';
  const g4 = await svcSinMp.guardarRecibido({ jid: '5492244444444@s.whatsapp.net', nombreCliente: 'Ana', numero: '5492244444444', buffer: png, mimetype: 'image/png', nombreOriginal: 'gato.png' });
  assert((await svcSinMp.analizarImagen(g4.doc, png)).analisis === null, 'una foto que no es un comprobante no genera un análisis');

  console.log('\n✅ Todos los tests de comprobantes de pago pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
