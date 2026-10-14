// services/bot/documentos.service.js
// Bandeja de documentos: PDF e imágenes que los clientes mandan por WhatsApp
// (comprobantes de transferencia, facturas, fotos). Se guardan en la PC del
// dueño, se leen (PDF: texto → monto/fecha sugeridos) y quedan para que el
// dueño los revise. NUNCA se confirma un turno por una imagen: son fáciles de
// falsificar; la confirmación la hace el dueño o MercadoPago (verificado).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Documento = require('../../models/Documento');
const Turno = require('../../models/Turno');
const Config = require('../../models/Config');
const Pedido = require('../../models/Pedido');
const ocr = require('./ocr.service');
const comp = require('../../../gestion/comprobante-pago');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const TIPOS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// ── Lectura de datos del texto (funciones puras, probadas aparte) ─────

// "1.234,56" / "1,234.56" / "1234" / "1.234" → número
function parsearMonto(crudo) {
  let s = String(crudo || '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  const ult = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (ult >= 0 && s.length - ult - 1 <= 2 && s.length - ult - 1 > 0) {
    const ent = s.slice(0, ult).replace(/[.,]/g, '');
    const dec = s.slice(ult + 1);
    s = `${ent}.${dec}`;
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function detectarMonto(texto) {
  const t = String(texto || '');
  const etiquetados = [];
  const reEtiq = /(?:total|importe|monto|pagaste|transferiste|enviaste|abonado|a pagar)[^\d$\n]{0,25}\$?\s*([\d][\d.,]*)/gi;
  let m;
  while ((m = reEtiq.exec(t))) { const v = parsearMonto(m[1]); if (v) etiquetados.push(v); }
  if (etiquetados.length) return Math.max(...etiquetados);
  const reSimbolo = /\$\s*([\d][\d.,]*)/g;
  const todos = [];
  while ((m = reSimbolo.exec(t))) { const v = parsearMonto(m[1]); if (v) todos.push(v); }
  return todos.length ? todos[0] : null;
}

function detectarFecha(texto) {
  const m = String(texto || '').match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (!m) return null;
  const d = +m[1], mes = +m[2]; let a = +m[3];
  if (a < 100) a += 2000;
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function sugerirTipo(texto) {
  const t = String(texto || '').toLowerCase();
  if (/comprobante|transferencia|mercado\s*pago|\bcvu\b|\bcbu\b|operaci[oó]n|alias/.test(t)) return 'comprobante';
  if (/factura|\bcuit\b|\biva\b|\bcae\b|remito|presupuesto/.test(t)) return 'factura';
  return 'sin_clasificar';
}

const nombreSeguro = (n) => String(n || 'archivo').replace(/[^\w.\- ]+/g, '_').replace(/\.{2,}/g, '.').slice(0, 80);

async function textoDePdf(buffer) {
  try { return (await require('../../../gestion/pdf-texto').textoDePdf(buffer, { maxPaginas: 3 })).slice(0, 20000); } catch { return ''; }
}

function crearDocumentosService({ userId, dirBase, log, mp = null }) {
  const digitos = (s) => String(s || '').replace(/\D/g, '');

  // Qué se espera de este pago: la cuenta del dueño y el monto que el cliente tiene pendiente (turno o pedido).
  async function contextoDelPago(doc, turnoAsociado) {
    const cfg = (await Config.findOne({ userId: String(userId) }).lean().catch(() => null)) || {};
    const cuenta = digitos(cfg.cbuTransferencia);
    const esperado = { cbu: cuenta.length === 22 ? cuenta : '', alias: String(cfg.aliasTransferencia || '').trim(), titular: cfg.titularTransferencia || '', cuit: cfg.cuilTransferencia || '' };
    const tel = digitos(doc.clienteNumero).slice(-9);
    let turno = turnoAsociado || null; let pedido = null;
    if (!turno && doc.turnoId) turno = await Turno.findOne({ _id: doc.turnoId, userId: String(userId) }).lean().catch(() => null);
    if (turno && Number(turno.pago?.monto) > 0) { esperado.monto = Number(turno.pago.monto); esperado.desde = turno.createdAt || null; }
    else {
      const pend = await Pedido.find({ userId: String(userId), estado: 'pendiente-pago' }).lean().catch(() => []);
      pedido = pend.find((p) => tel && (digitos(p.telefono).endsWith(tel) || digitos(p.jid).includes(tel))) || null;
      if (pedido) { esperado.monto = Number(pedido.total) || 0; esperado.desde = pedido.confirmadoEn || pedido.createdAt || null; }
    }
    return { esperado, turno, pedido };
  }

  // Lee el comprobante (de una foto o de un PDF), lo compara con lo esperado y guarda el resultado en el documento.
  // → { datos, ver, pedido } o null si el archivo no parece un comprobante de pago.
  async function evaluarComprobante(doc, texto, turnoAsociado) {
    const t = String(texto || ''); if (!t.trim()) return null;
    const datos = comp.extraer(t);
    const pareceComprobante = datos.esComprobante || sugerirTipo(t) === 'comprobante';
    if (!pareceComprobante && !doc.turnoId) return null;
    if (!datos.monto && !datos.operacion && !datos.destino) return null;
    const { esperado, pedido } = await contextoDelPago(doc, turnoAsociado);
    const otros = await Documento.find({ userId: String(userId) }).lean().catch(() => []);
    const usadas = otros.filter((o) => String(o._id) !== String(doc._id) && o.comprobante?.operacion).map((o) => ({ operacion: o.comprobante.operacion, de: o.clienteNombre || o.clienteNumero || '' }));
    let ver = comp.verificar({ datos, esperado, operacionesUsadas: usadas });
    if (mp && datos.operacion && ver.nivel !== 'sospechoso') {
      const u = await Promise.resolve(mp.miUsuario ? mp.miUsuario() : null).catch(() => null);
      const r = await comp.verificarEnMercadoPago({ operacion: datos.operacion, monto: datos.monto, usuarioMp: u && u.id, obtenerPago: (id) => mp.verificarPago(id) });
      ver = comp.combinar(ver, r);
    }
    const cambios = { comprobante: datos, verificacion: { nivel: ver.nivel, chequeos: ver.chequeos, mp: ver.mp || null, esperado: { monto: esperado.monto || null }, verificadoEn: new Date().toISOString() }, tipo: 'comprobante' };
    if (pedido) cambios.pedidoId = String(pedido._id);
    if (datos.monto && !doc.montoSugerido) cambios.montoSugerido = datos.monto;
    if (datos.fecha && !doc.fechaSugerida) cambios.fechaSugerida = datos.fecha;
    await Documento.findOneAndUpdate({ _id: doc._id }, { $set: cambios });
    log?.(`🧾 [Comprobante] ${doc.clienteNombre || doc.clienteNumero}: ${ver.nivel}${datos.operacion ? ' · op. ' + datos.operacion : ''}`);
    return { datos, ver, pedido };
  }

  // Guarda el archivo y devuelve el registro. Rechaza tipos no permitidos o
  // demasiado grandes (el archivo nunca se abre ni se ejecuta).
  async function guardarRecibido({ jid, nombreCliente, numero, buffer, mimetype, nombreOriginal, caption }) {
    const mime = String(mimetype || '').split(';')[0].trim().toLowerCase();
    const ext = TIPOS[mime];
    if (!ext) return { ok: false, motivo: 'tipo' };
    if (!buffer || !buffer.length) return { ok: false, motivo: 'vacio' };
    if (buffer.length > MAX_BYTES) return { ok: false, motivo: 'tamano' };

    const carpeta = path.join(dirBase, String(numero || 'desconocido').replace(/\D/g, '') || 'desconocido');
    fs.mkdirSync(carpeta, { recursive: true });
    const base = nombreSeguro(nombreOriginal ? path.parse(nombreOriginal).name : (mime === 'application/pdf' ? 'documento' : 'imagen'));
    const archivo = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}-${base}${ext}`;
    const ruta = path.join(carpeta, archivo);
    fs.writeFileSync(ruta, buffer);

    const texto = mime === 'application/pdf' ? await textoDePdf(buffer) : '';
    const pistas = `${texto}\n${caption || ''}\n${nombreOriginal || ''}`;

    // ¿El cliente tiene un turno pendiente? Entonces probablemente es su comprobante.
    let turno = null;
    try {
      const tel = String(numero || '').replace(/\D/g, '');
      const pend = await Turno.find({ userId, estado: 'pendiente' }).sort({ createdAt: -1 }).lean();
      turno = pend.find((t) => tel && String(t.clienteTelefono || '').replace(/\D/g, '').endsWith(tel.slice(-9))) || null;
    } catch { /* sin turno asociado */ }

    let tipo = sugerirTipo(pistas);
    if (tipo === 'sin_clasificar' && turno) tipo = 'comprobante';

    const doc = await Documento.create({
      userId: String(userId),
      jid,
      clienteNombre: nombreCliente || '',
      clienteNumero: numero || '',
      nombreOriginal: nombreOriginal || archivo,
      archivo,
      ruta,
      mimetype: mime,
      bytes: buffer.length,
      caption: caption || '',
      tipo,                                   // comprobante | factura | otro | sin_clasificar
      estado: 'nuevo',                        // nuevo | revisado
      montoSugerido: detectarMonto(texto) || null, // solo PDF con texto; en fotos no hay lectura automática
      fechaSugerida: detectarFecha(texto),
      turnoId: turno ? String(turno._id) : null,
      turnoFecha: turno ? turno.fechaInicio : null,
    });
    log?.(`📎 [Documentos] ${nombreCliente || numero}: ${doc.nombreOriginal} (${tipo})`);
    // PDF: el texto ya está, así que el comprobante se verifica en el momento (en las fotos, después de leerlas con OCR)
    let analisis = null;
    if (texto) { try { analisis = await evaluarComprobante(doc, texto, turno); } catch (e) { log?.(`⚠️ [Comprobante] no se pudo verificar: ${e.message}`); } }
    return { ok: true, doc, turno, analisis };
  }

  // Lee el texto de una foto (en segundo plano, después de avisarle al cliente) y
  // completa los datos sugeridos. Nunca pisa lo que el dueño ya cargó a mano.
  async function analizarImagen(doc, buffer) {
    const texto = await ocr.leerTexto(buffer);
    const cambios = { ocrHecho: true, textoLeido: texto.slice(0, 6000) };
    if (texto) {
      const monto = detectarMonto(texto); if (monto && !doc.montoSugerido) cambios.montoSugerido = monto;
      const fecha = detectarFecha(texto); if (fecha && !doc.fechaSugerida) cambios.fechaSugerida = fecha;
      if (doc.tipo === 'sin_clasificar') { const t = sugerirTipo(texto); if (t !== 'sin_clasificar') cambios.tipo = t; }
    }
    await Documento.findOneAndUpdate({ _id: doc._id }, { $set: cambios });
    let analisis = null;
    try { analisis = await evaluarComprobante({ ...doc, ...cambios }, texto); } catch (e) { log?.(`⚠️ [Comprobante] no se pudo verificar: ${e.message}`); }
    return { ...doc, ...cambios, analisis };
  }

  return { guardarRecibido, analizarImagen };
}

module.exports = { crearDocumentosService, ocr, detectarMonto, detectarFecha, sugerirTipo, parsearMonto, MAX_BYTES, TIPOS };
