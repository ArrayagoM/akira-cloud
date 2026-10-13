// main/marketing/servicio.js
// Equipo de marketing de Akira: junta los datos reales del negocio, arma el pedido para el especialista elegido (ver agentes.js)
// y se lo manda a la IA con la clave de Groq del propio cliente. Devuelve un BORRADOR: no publica ni envía nada.
// Probado en tests/marketing.test.js (con una IA de mentira: ninguna prueba gasta cuota).
'use strict';

const caja = require('../gestion/caja');
const reportes = require('../gestion/reportes');
const ctacte = require('../gestion/ctacte');
const A = require('./agentes');
const perfilLib = require('./perfil');

const MAX_POR_HORA = 30;
const VENTANA_MS = 60 * 60 * 1000;
const PREFERIDOS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct'];

class ErrorServicio extends Error { constructor(m, status, codigo) { super(m); this.name = 'ErrorServicio'; this.status = status; this.codigo = codigo; } }

// Llamada real a Groq. Si el modelo preferido ya no existe, se elige otro de la lista que tenga la cuenta.
function crearLlamadorGroq({ log = () => {} } = {}) {
  let modelo = null;
  const noExiste = (e) => e && (e.status === 404 || /model_not_found|decommissioned|does not exist/i.test(String(e.message)));
  return async function llamar({ apiKey, mensajes, maxTokens = 1800 }) {
    const Groq = require('groq-sdk'); const groq = new Groq({ apiKey });
    const intentar = async (m) => {
      const opts = { model: m, messages: mensajes, max_tokens: /gpt-oss/.test(m) ? maxTokens + 1500 : maxTokens, temperature: 0.7 };
      if (/gpt-oss/.test(m)) opts.reasoning_effort = 'low';
      return groq.chat.completions.create(opts, { timeout: 45_000, maxRetries: 0 });
    };
    try {
      const r = await intentar(modelo || PREFERIDOS[0]); modelo = modelo || PREFERIDOS[0];
      return r?.choices?.[0]?.message?.content || '';
    } catch (e) {
      if (!noExiste(e)) throw e;
      const resp = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + apiKey } });
      const ids = resp.ok ? ((await resp.json()).data || []).filter((x) => x.active !== false).map((x) => x.id) : [];
      const elegido = PREFERIDOS.find((p) => ids.includes(p)) || ids.find((id) => !/whisper|guard|safeguard|orpheus|tts|allam|embed/i.test(id));
      if (!elegido) throw e;
      log('[marketing] modelo cambiado a', elegido); modelo = elegido;
      return (await intentar(elegido))?.choices?.[0]?.message?.content || '';
    }
  };
}

const iso = (d) => caja.fechaLocal(d);

// Números del negocio para el consultor: agregados, sin nombres ni teléfonos.
function calcularMetricas({ turnos, movimientos, ahora }) {
  const desde = iso(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 90));
  const r = reportes.armar({ turnos, movimientos, desde, hasta: iso(ahora), meses: 3, ahora });
  const porCliente = new Map();
  for (const t of turnos) {
    if (t.estado !== 'confirmado' || t.ausente === true || new Date(t.fechaInicio) > ahora) continue;
    const k = ctacte.telClave(t.clienteTelefono) || `n:${String(t.clienteNombre || '').toLowerCase()}`; if (k === 'n:') continue;
    const x = porCliente.get(k) || { primera: null, ultima: null };
    const f = new Date(t.fechaInicio); if (!x.primera || f < x.primera) x.primera = f; if (!x.ultima || f > x.ultima) x.ultima = f; porCliente.set(k, x);
  }
  const dias = (n) => new Date(ahora.getTime() - n * 86400000);
  const clientes = [...porCliente.values()];
  return {
    turnos: r.resumen.turnos, atendidos: r.resumen.atendidos, ausentes: r.resumen.ausentes, cancelados: r.resumen.cancelados, ausenciasPorcentaje: r.ausencias.porcentaje,
    servicios: r.servicios.slice(0, 5), dias: r.horasPico.dias, horasPico: r.horasPico.horas, evolucion: r.evolucion, clientesDistintos: r.resumen.clientesDistintos,
    inactivos: clientes.filter((c) => c.ultima < dias(60)).length, nuevos30: clientes.filter((c) => c.primera >= dias(30)).length,
    pocosDatos: r.resumen.turnos < 10,
  };
}

// Números de ventas por mayor para el consultor: agregados, sin nombres ni teléfonos.
function calcularMetricasVentas({ movimientos = [], pedidos = [], cuentas = [], ahora }) {
  const desde = iso(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 90));
  const norm = (n) => ctacte.normalizarNombre(n);
  const registros = [];
  for (const m of movimientos) if (m.origen === 'venta' && m.tipo === 'ingreso') registros.push({ fecha: String(m.fecha || ''), total: Number(m.monto) || 0, items: Array.isArray(m.items) ? m.items : [], cliente: norm(m.cliente) });
  for (const p of pedidos) if (p.estado === 'pagado' || p.estado === 'entregado') registros.push({ fecha: iso(new Date(p.pagadoEn || p.creadoEn || p.createdAt || ahora)), total: Number(p.total) || 0, items: Array.isArray(p.items) ? p.items : [], cliente: norm(p.nombre) });
  const rec = registros.filter((r) => r.fecha >= desde && r.fecha <= iso(ahora) && r.total > 0);
  const total = caja.redondear(rec.reduce((s, r) => s + r.total, 0));
  const prod = new Map();
  for (const r of rec) for (const it of r.items) { const k = String(it.nombre || '').trim(); if (!k) continue; const x = prod.get(k) || { nombre: k, unidades: 0, ingresos: 0 }; x.unidades += Number(it.cantidad) || 0; x.ingresos += (Number(it.precio) || 0) * (Number(it.cantidad) || 0); prod.set(k, x); }
  const productos = [...prod.values()].map((x) => ({ ...x, ingresos: caja.redondear(x.ingresos) })).sort((a, b) => b.ingresos - a.ingresos).slice(0, 5);
  const meses = []; for (let i = 2; i >= 0; i--) { const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1); const mes = iso(d).slice(0, 7); const delMes = registros.filter((r) => r.fecha.startsWith(mes) && r.total > 0); meses.push({ mes, total: caja.redondear(delMes.reduce((s, r) => s + r.total, 0)), cantidad: delMes.length }); }
  const cli = new Map();
  for (const r of rec) { if (!r.cliente) continue; const x = cli.get(r.cliente) || { compras: 0, total: 0, ultima: '' }; x.compras++; x.total += r.total; if (r.fecha > x.ultima) x.ultima = r.fecha; cli.set(r.cliente, x); }
  const nominales = [...cli.values()].sort((a, b) => b.total - a.total); const totalNominal = nominales.reduce((s, c) => s + c.total, 0);
  const corte = iso(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 45));
  const pct = (n) => (totalNominal ? Math.round((n / totalNominal) * 100) : 0);
  const sal = ctacte.saldos(cuentas.filter((m) => (m.tipo === 'cargo' || m.tipo === 'pago') && m.entidad === 'cliente'), ahora).filter((x) => x.saldo > 0.005);
  return {
    cantidad: rec.length, total, ticketPromedio: rec.length ? caja.redondear(total / rec.length) : 0, productos, meses,
    clientes: nominales.length, recurrentes: nominales.filter((c) => c.compras >= 2).length, inactivos: nominales.filter((c) => c.ultima < corte).length,
    concentracionTop1: pct(nominales.slice(0, 1).reduce((s, c) => s + c.total, 0)), concentracionTop3: pct(nominales.slice(0, 3).reduce((s, c) => s + c.total, 0)),
    porCobrar: caja.redondear(sal.reduce((s, x) => s + x.saldo, 0)), clientesConDeuda: sal.length, deudaMasVieja: sal.reduce((m, x) => Math.max(m, Number(x.antiguedadDias) || 0), 0),
    pocosDatos: rec.length < 10,
  };
}

function crearServicio({ modelos, llamarIA, obtenerClave, userDataDir, ahora = () => new Date(), log = () => {} } = {}) {
  const M = (n) => (modelos && modelos[n]) || require(`../bot-engine/models/${n}`);
  const llamar = llamarIA || crearLlamadorGroq({ log });
  const usos = new Map(); // userId → marcas de tiempo (tope por hora, para no gastar la cuota gratuita de la IA)

  async function configDe(userId) { return M('Config').findOne({ userId: String(userId) }); }
  const claveDe = async (userId) => (obtenerClave ? obtenerClave(userId) : (await configDe(userId))?.getKey?.('keyGroq'));

  async function estado(userId) {
    return { claveCargada: !!(await claveDe(userId)), agentes: A.lista(), maxPorHora: MAX_POR_HORA, perfil: perfilActual(), tiposVenta: perfilLib.TIPOS, maxCondiciones: perfilLib.MAX_CONDICIONES };
  }
  const perfilActual = () => (userDataDir ? perfilLib.leer(userDataDir) : { tipoVenta: 'minorista', condiciones: '' });
  function guardarPerfil(b) { if (!userDataDir) return { ok: false, error: 'No disponible.' }; return perfilLib.guardar(userDataDir, b); }

  async function contexto(userId, usaMetricas) {
    const cfg = await configDe(userId); if (!cfg) throw new ErrorServicio('Completá primero los datos de tu negocio en Config.', 409, 'SIN_CONFIG');
    const ya = ahora();
    const perfil = perfilActual();
    const ctx = { negocio: cfg.negocio, miNombre: cfg.miNombre, tipoNegocio: cfg.tipoNegocio, horarios: A.textoHorarios(cfg.horariosAtencion), servicios: cfg.serviciosList || [], catalogo: cfg.catalogo || [], hoy: iso(ya), perfil };
    if (usaMetricas) {
      const uid = String(userId); const movimientos = await M('Movimiento').find({ userId: uid }).lean();
      if (perfil.tipoVenta !== 'mayorista') ctx.metricas = calcularMetricas({ turnos: await M('Turno').find({ userId: uid }).lean(), movimientos, ahora: ya });
      if (perfilLib.vendePorMayor(perfil)) ctx.metricasVentas = calcularMetricasVentas({ movimientos, pedidos: await M('Pedido').find({ userId: uid }).lean(), cuentas: await M('CtaCte').find({ userId: uid }).lean(), ahora: ya });
    }
    return ctx;
  }

  async function generar(userId, { agente, datos } = {}) {
    const ag = A.AGENTES[agente]; if (!ag) throw new A.ErrorDatos('Especialista desconocido.');
    const apiKey = await claveDe(userId);
    if (!apiKey) throw new ErrorServicio('Para usar el equipo de marketing cargá tu clave de Groq en Config (es gratis).', 409, 'SIN_CLAVE');
    const t = ahora().getTime(); const marcas = (usos.get(String(userId)) || []).filter((x) => t - x < VENTANA_MS);
    if (marcas.length >= MAX_POR_HORA) throw new ErrorServicio(`Llegaste al límite de ${MAX_POR_HORA} borradores por hora. Probá más tarde.`, 429, 'LIMITE');
    const ctx = await contexto(userId, ag.usaMetricas === true);
    const pedido = A.armarPedido(agente, datos, ctx); // valida también los datos (ErrorDatos → 400)
    marcas.push(t); usos.set(String(userId), marcas);
    let bruto;
    try { bruto = await llamar({ apiKey, mensajes: [{ role: 'system', content: pedido.sistema }, { role: 'user', content: pedido.usuario }], maxTokens: agente === 'planificador' || agente === 'estratega' ? 2500 : 1500 }); }
    catch (e) {
      log('[marketing] la IA falló:', e.status || '', e.message);
      if (e.status === 401) throw new ErrorServicio('Groq rechazó tu clave. Revisala en Config.', 409, 'CLAVE_INVALIDA');
      if (e.status === 429 || e.isRateLimit) throw new ErrorServicio('La IA está ocupada o llegaste al límite gratuito de Groq. Probá en un minuto.', 429, 'IA_OCUPADA');
      if (/timeout|timed out|abort/i.test(String(e.message)) || e.name === 'APIConnectionTimeoutError') throw new ErrorServicio('La IA tardó demasiado. Probá de nuevo.', 504, 'TIEMPO');
      throw new ErrorServicio('No se pudo generar el borrador. Probá de nuevo en un rato.', 502, 'IA');
    }
    const texto = A.limpiarSalida(bruto);
    if (!texto) throw new ErrorServicio('La IA no devolvió nada. Probá de nuevo.', 502, 'VACIO');
    return { agente, texto, opciones: A.dividirOpciones(texto) };
  }

  return { estado, generar, guardarPerfil };
}

module.exports = { crearServicio, crearLlamadorGroq, calcularMetricas, calcularMetricasVentas, ErrorServicio, MAX_POR_HORA };
