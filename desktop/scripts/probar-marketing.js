// scripts/probar-marketing.js
// Prueba REAL del equipo de marketing con la IA de Groq (usa tu clave; gasta unas 12 consultas de la cuota gratuita).
// Corre cada especialista con datos de ejemplo (una peluquería y una distribuidora mayorista), guarda los textos en un archivo para que
// los leas y revisa solo una cosa automáticamente: que no aparezcan montos ($) ni porcentajes (%) que NO estén en los datos de entrada
// (es decir, que la IA no haya inventado precios ni descuentos).
//
// Uso (en la carpeta desktop):   set GROQ_API_KEY=gsk_...   y después   node scripts/probar-marketing.js [archivo-de-salida.md]
// (en PowerShell:  $env:GROQ_API_KEY="gsk_..."; node scripts/probar-marketing.js)
'use strict';

const fs = require('fs');
const path = require('path');
const A = require('../main/marketing/agentes');
const { crearLlamadorGroq } = require('../main/marketing/servicio');

const clave = process.env.GROQ_API_KEY;
if (!clave) { console.error('Falta la variable GROQ_API_KEY con tu clave de Groq.'); process.exit(2); }
const salida = process.argv[2] || path.join(process.cwd(), 'marketing-prueba.md');

const PELUQUERIA = { negocio: 'Peluquería Lola', miNombre: 'Lola', tipoNegocio: 'turnos', horarios: 'Lun 09:00–18:00 | Mar 09:00–18:00 | Sáb 09:00–13:00', servicios: [{ nombre: 'Corte', precio: 8000, duracion: 45 }, { nombre: 'Color', precio: 25000, duracion: 120 }], catalogo: [{ nombre: 'Shampoo reparador', precio: 6500, stock: 12, disponible: true, descripcion: 'Para cabello dañado' }], hoy: new Date().toISOString().slice(0, 10), perfil: { tipoVenta: 'minorista', condiciones: '' },
  metricas: { turnos: 64, atendidos: 55, ausentes: 6, cancelados: 3, ausenciasPorcentaje: 9.8, servicios: [{ nombre: 'Corte', cantidad: 40, ingresos: 320000 }, { nombre: 'Color', cantidad: 15, ingresos: 375000 }], dias: [{ dia: 'Lun', cantidad: 3 }, { dia: 'Mar', cantidad: 18 }, { dia: 'Mié', cantidad: 10 }, { dia: 'Jue', cantidad: 12 }, { dia: 'Vie', cantidad: 14 }, { dia: 'Sáb', cantidad: 7 }], horasPico: [{ hora: 10, cantidad: 12 }, { hora: 11, cantidad: 9 }], evolucion: [{ mes: '2026-08', ingresos: 610000, turnos: 20 }, { mes: '2026-09', ingresos: 680000, turnos: 22 }, { mes: '2026-10', ingresos: 400000, turnos: 14 }], clientesDistintos: 38, inactivos: 11, nuevos30: 6, pocosDatos: false } };
const DISTRIBUIDORA = { negocio: 'Distribuidora Sur', miNombre: 'Pedro', tipoNegocio: 'servicios', horarios: 'Lun a Vie 08:00–17:00', servicios: [], catalogo: [{ nombre: 'Aceite girasol 900ml (caja x12)', precio: 24000, stock: 120, disponible: true }, { nombre: 'Fideos 500g (caja x20)', precio: 18000, stock: 80, disponible: true }, { nombre: 'Yerba 1kg (caja x10)', precio: 41000, stock: 60, disponible: true }], hoy: new Date().toISOString().slice(0, 10),
  perfil: { tipoVenta: 'mayorista', condiciones: 'Pedido mínimo $60.000. Entrega en 48 hs en Ranchos y alrededores. Se paga por transferencia o a 7 días con cuenta corriente.' },
  metricasVentas: { cantidad: 42, total: 2150000, ticketPromedio: 51190, productos: [{ nombre: 'Yerba 1kg (caja x10)', unidades: 70, ingresos: 820000 }, { nombre: 'Aceite girasol 900ml (caja x12)', unidades: 55, ingresos: 660000 }], meses: [{ mes: '2026-08', total: 640000, cantidad: 12 }, { mes: '2026-09', total: 780000, cantidad: 15 }, { mes: '2026-10', total: 730000, cantidad: 15 }], clientes: 14, recurrentes: 9, inactivos: 4, concentracionTop1: 28, concentracionTop3: 61, porCobrar: 380000, clientesConDeuda: 5, deudaMasVieja: 34, pocosDatos: false } };

const CASOS = [
  ['Peluquería · Redactor de publicaciones', PELUQUERIA, 'posts', { tema: 'Hay turnos libres el sábado a la mañana', red: 'instagram', producto: 'Corte', tono: 'cercano', llamado: 'Reservá por WhatsApp', variantes: 2 }],
  ['Peluquería · Promociones (sin descuento cargado)', PELUQUERIA, 'promociones', { objetivo: 'Llenar los turnos de los lunes' }],
  ['Peluquería · Promociones (con descuento del dueño)', PELUQUERIA, 'promociones', { objetivo: 'Vender el shampoo', producto: 'Shampoo reparador', descuento: '15% llevando 2', vigencia: 'hasta el domingo' }],
  ['Peluquería · Reseña negativa', PELUQUERIA, 'resenas', { texto: 'Esperé 40 minutos aunque tenía turno y el corte no era lo que pedí. No vuelvo.', estrellas: 2, donde: 'google' }],
  ['Peluquería · Planificador semanal', PELUQUERIA, 'planificador', { objetivo: 'Que más gente reserve color', redes: ['instagram', 'whatsapp_estado'], publicaciones: 4 }],
  ['Peluquería · Mensajes (reactivar)', PELUQUERIA, 'mensajes', { situacion: 'reactivar', detalle: 'Hace tiempo que no nos vemos' }],
  ['Peluquería · Consultor', PELUQUERIA, 'estratega', { foco: 'Los lunes casi no tengo turnos' }],
  ['Distribuidora · Presentación para mayoristas', DISTRIBUIDORA, 'catalogo_mayorista', { destinatario: 'Kioscos y almacenes de Ranchos', destacar: 'La yerba y el aceite', canal: 'whatsapp' }],
  ['Distribuidora · Prospección', DISTRIBUIDORA, 'prospeccion', { tipoCliente: 'Despensas y autoservicios de la zona', propuesta: 'Entrega en 48 hs y cuenta corriente a 7 días', mensajes: 3, canal: 'whatsapp' }],
  ['Distribuidora · Cobranza firme', DISTRIBUIDORA, 'seguimiento', { situacion: 'cobranza_firme', detalle: 'Factura 0001-123 por $120.000, vencida hace 15 días' }],
  ['Distribuidora · Cambio de precios', DISTRIBUIDORA, 'seguimiento', { situacion: 'precios', detalle: 'Sube la línea de aceites' }],
  ['Distribuidora · Consultor', DISTRIBUIDORA, 'estratega', { foco: 'Dependo de pocos clientes' }],
];

const numerosDe = (t) => new Set((String(t).match(/\d[\d.,]*/g) || []).map((n) => n.replace(/[.,]/g, '')).filter(Boolean));
const EMOJI = /\p{Extended_Pictographic}/gu;

(async () => {
  const llamar = crearLlamadorGroq({ log: (...a) => console.log(...a) });
  const md = [`# Prueba real del equipo de marketing (${new Date().toLocaleString('es-AR')})`, '', 'Para cada caso: lo que devolvió la IA y una alarma si aparecen montos o porcentajes que no estaban en los datos.', ''];
  let alarmas = 0; let fallos = 0;
  for (const [titulo, ctx, agente, datos] of CASOS) {
    process.stdout.write(`• ${titulo} … `);
    try {
      const pedido = A.armarPedido(agente, datos, ctx);
      const bruto = await llamar({ apiKey: clave, mensajes: [{ role: 'system', content: pedido.sistema }, { role: 'user', content: pedido.usuario }], maxTokens: agente === 'planificador' || agente === 'estratega' ? 2500 : 1500 });
      const texto = A.limpiarSalida(bruto);
      const permitidos = numerosDe(pedido.sistema + ' ' + pedido.usuario);
      const montos = (texto.match(/\$\s?\d[\d.,]*|\d[\d.,]*\s?%/g) || []).filter((m) => !permitidos.has(m.replace(/[^\d]/g, '')));
      const emojis = (texto.match(EMOJI) || []).length;
      if (montos.length) alarmas++;
      console.log(montos.length ? `ALARMA (${montos.join(', ')})` : 'ok');
      md.push(`## ${titulo}`, '', montos.length ? `**ALARMA: montos o porcentajes que no estaban en los datos: ${montos.join(', ')}**` : 'Sin montos ni porcentajes inventados.', `Emojis: ${emojis} · Largo: ${texto.length} letras`, '', texto, '', '---', '');
    } catch (e) { fallos++; console.log('FALLÓ: ' + (e.message || e)); md.push(`## ${titulo}`, '', `FALLÓ: ${e.message || e}`, '', '---', ''); }
  }
  fs.writeFileSync(salida, md.join('\n'));
  console.log(`\nListo: ${CASOS.length - fallos}/${CASOS.length} respondieron, ${alarmas} con alarma de montos. Textos en: ${salida}`);
  process.exit(fallos ? 1 : 0);
})();
