// gestion/comprobantes.js
// Presupuestos y recibos en PDF: el dueño arma el comprobante (con productos del catálogo, servicios o ítems sueltos), se genera un PDF
// con su nombre y logo y se lo manda al cliente por WhatsApp. NO son facturas fiscales (la facturación electrónica es otra función):
// el PDF lo aclara al pie. Probado en tests/comprobantes.test.js.
'use strict';

const ventas = require('./ventas');
const caja = require('./caja');

const TIPOS = ['presupuesto', 'recibo'];
const ESTADOS = ['emitido', 'aceptado', 'cobrado', 'anulado'];
const PREFIJO = { presupuesto: 'P', recibo: 'R' };
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const texto = (v, max) => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\r/g, '').trim().slice(0, max);
const pesos = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaAR = (f) => String(f || '').split('-').reverse().join('/');
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n); return caja.fechaLocal(d); };

const formatoNumero = (tipo, n) => `${PREFIJO[tipo]}-${String(n).padStart(4, '0')}`;
async function proximoNumero(Comprobante, userId, tipo) {
  const todos = await Comprobante.find({ userId: String(userId), tipo }).lean();
  return todos.reduce((m, c) => Math.max(m, c.numero || 0), 0) + 1;
}

// Valida lo que llega de la pantalla. → { ok, dato } | { ok:false, error }
function sanear(b = {}, catalogoYServicios = [], hoy = caja.fechaLocal(new Date())) {
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : null;
  if (!tipo) return { ok: false, error: 'Elegí si es un presupuesto o un recibo.' };
  const cliente = texto(b.cliente?.nombre ?? b.clienteNombre, 80);
  if (!cliente) return { ok: false, error: 'Poné el nombre del cliente.' };
  const a = ventas.armar(catalogoYServicios, b.items, { descuentoPct: b.descuentoPct });
  if (!a.ok) return { ok: false, error: a.error };
  const fecha = b.fecha || hoy;
  if (!caja.esFechaValida(fecha)) return { ok: false, error: 'La fecha no es válida.' };
  const validezDias = tipo === 'presupuesto' ? Math.min(365, Math.max(1, Math.floor(Number(b.validezDias)) || 15)) : 0;
  const metodo = caja.METODOS.includes(b.metodo) ? b.metodo : 'efectivo';
  return {
    ok: true,
    dato: {
      tipo, fecha, clienteNombre: cliente, clienteTelefono: String(b.cliente?.telefono ?? b.clienteTelefono ?? '').replace(/\D/g, '').slice(0, 15), clienteJid: texto(b.cliente?.jid ?? b.clienteJid, 80),
      items: a.lineas.map((l) => ({ nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })), bruto: a.bruto, descuento: a.descuento, descuentoPct: a.descuentoPct, total: a.total,
      validezDias, venceEl: tipo === 'presupuesto' ? sumarDias(fecha, validezDias) : '', metodo: tipo === 'recibo' ? metodo : '',
      nota: texto(b.nota, 500), concepto: texto(b.concepto, 120),
    },
  };
}

// WhatsApp: texto que acompaña al PDF
function textoWhatsApp(c, negocio = '') {
  const n = formatoNumero(c.tipo, c.numero);
  if (c.tipo === 'presupuesto') return `Hola ${c.clienteNombre.split(' ')[0]}! 👋 Te paso el presupuesto ${n}${negocio ? ` de ${negocio}` : ''} por ${pesos(c.total)}. Es válido hasta el ${fechaAR(c.venceEl)}. Cualquier duda, escribime. ¡Gracias!`;
  return `Hola ${c.clienteNombre.split(' ')[0]}! 🧾 Te paso el recibo ${n}${negocio ? ` de ${negocio}` : ''} por ${pesos(c.total)}. ¡Gracias por tu compra!`;
}

// Genera el PDF. datos: { comprobante, negocio, logo (Buffer|null), pago: { alias, cbu, banco } }
function generarPdf({ comprobante: c, negocio = '', logo = null, pago = {} }) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const titulo = c.tipo === 'presupuesto' ? 'PRESUPUESTO' : 'RECIBO';
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `${titulo} ${formatoNumero(c.tipo, c.numero)}`, Author: negocio || 'Akira' } });
    const partes = []; doc.on('data', (p) => partes.push(p)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
    const ancho = doc.page.width - 80; const X = 40;
    const verde = '#0a7d4b'; const gris = '#555555';
    const linea = (y = doc.y) => { doc.moveTo(X, y).lineTo(X + ancho, y).strokeColor('#cccccc').lineWidth(0.6).stroke(); };

    // Encabezado: logo (si hay) + negocio a la izquierda; título y número a la derecha
    let xTexto = X;
    if (logo) { try { doc.image(logo, X, 40, { fit: [70, 70] }); xTexto = X + 82; } catch { /* logo ilegible: se omite */ } }
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111').text(negocio || 'Mi negocio', xTexto, 44, { width: ancho - 190 });
    doc.font('Helvetica-Bold').fontSize(18).fillColor(verde).text(titulo, X + ancho - 180, 40, { width: 180, align: 'right' });
    doc.font('Helvetica').fontSize(11).fillColor(gris).text(`N° ${formatoNumero(c.tipo, c.numero)}`, X + ancho - 180, 62, { width: 180, align: 'right' });
    doc.text(`Fecha: ${fechaAR(c.fecha)}`, X + ancho - 180, 77, { width: 180, align: 'right' });
    if (c.estado === 'anulado') doc.font('Helvetica-Bold').fontSize(11).fillColor('#b91c1c').text('ANULADO', X + ancho - 180, 92, { width: 180, align: 'right' });
    doc.y = Math.max(doc.y, 120); linea(doc.y + 4); doc.moveDown(1.2);

    // Cliente
    doc.font('Helvetica-Bold').fontSize(10).fillColor(gris).text(c.tipo === 'recibo' ? 'RECIBÍ DE' : 'PARA', X);
    doc.font('Helvetica').fontSize(12).fillColor('#111').text(c.clienteNombre);
    if (c.clienteTelefono) doc.fontSize(10).fillColor(gris).text(`Tel: ${c.clienteTelefono}`);
    if (c.concepto) { doc.moveDown(0.4); doc.fontSize(10).fillColor(gris).text(`Concepto: ${c.concepto}`); }
    doc.moveDown(0.8);

    // Tabla de ítems
    const col = { desc: X, cant: X + ancho - 230, precio: X + ancho - 160, sub: X + ancho - 80 };
    const fila = (y, d, q, p, s, negrita) => {
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(negrita ? '#111' : '#222');
      doc.text(d, col.desc, y, { width: ancho - 250 }); doc.text(q, col.cant, y, { width: 60, align: 'right' }); doc.text(p, col.precio, y, { width: 70, align: 'right' }); doc.text(s, col.sub, y, { width: 80, align: 'right' });
    };
    let y = doc.y; fila(y, 'Descripción', 'Cant.', 'Precio', 'Subtotal', true); y += 16; linea(y - 2);
    for (const it of c.items) {
      if (y > doc.page.height - 190) { doc.addPage(); y = 50; }
      const altura = doc.heightOfString(it.nombre, { width: ancho - 250 });
      fila(y + 2, it.nombre, String(it.cantidad), pesos(it.precio), pesos(it.precio * it.cantidad), false);
      y += Math.max(16, altura + 6);
    }
    linea(y + 2); y += 10;
    const total = (rotulo, valor, grande) => { doc.font(grande ? 'Helvetica-Bold' : 'Helvetica').fontSize(grande ? 13 : 10).fillColor(grande ? '#111' : gris).text(rotulo, col.precio - 60, y, { width: 130, align: 'right' }).text(valor, col.sub - 10, y, { width: 90, align: 'right' }); y += grande ? 20 : 15; };
    if (c.descuento > 0) { total('Subtotal', pesos(c.bruto)); total(`Descuento ${c.descuentoPct}%`, `- ${pesos(c.descuento)}`); }
    total('TOTAL', pesos(c.total), true);
    doc.y = y + 8;

    if (c.tipo === 'recibo') {
      const NOMBRES = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', tarjeta: 'Tarjeta', otro: 'Otro medio' };
      doc.font('Helvetica').fontSize(10).fillColor('#222').text(`Forma de pago: ${NOMBRES[c.metodo] || c.metodo}`, X);
    } else {
      doc.font('Helvetica').fontSize(10).fillColor('#222').text(`Presupuesto válido hasta el ${fechaAR(c.venceEl)} (${c.validezDias} días).`, X);
      if (pago.alias || pago.cbu) { doc.moveDown(0.5); doc.font('Helvetica-Bold').text('Datos para pagar', X); doc.font('Helvetica').fillColor(gris); if (pago.alias) doc.text(`Alias: ${pago.alias}`); if (pago.cbu) doc.text(`CBU/CVU: ${pago.cbu}`); if (pago.banco) doc.text(`Banco: ${pago.banco}`); }
    }
    if (c.nota) { doc.moveDown(0.8); doc.font('Helvetica-Bold').fontSize(10).fillColor('#222').text('Notas', X); doc.font('Helvetica').fillColor(gris).text(c.nota, X, doc.y, { width: ancho }); }
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#888').text('Documento no válido como factura. Comprobante interno emitido con Akira.', X, doc.page.height - 60, { width: ancho, align: 'center' });
    doc.end();
  });
}

module.exports = { TIPOS, ESTADOS, sanear, proximoNumero, formatoNumero, textoWhatsApp, generarPdf, fechaAR, sumarDias };
