// main/programas.js
// "Programas con tus clientes": fidelidad ("a la décima visita, una gratis") y reseñas después del servicio.
// Ambos son OPCIONALES y vienen apagados. Configuración en userData/programas.json.
'use strict';

const fs = require('fs');
const path = require('path');

const archivo = (dir) => path.join(dir, 'programas.json');
const POR_DEFECTO = {
  fidelidad: { activa: false, cada: 10, premio: 'un servicio gratis' },
  resenas: { activa: false, link: '', horasDespues: 20 },
  pedidos: { activa: false, entrega: 'ambos', costoEnvio: 0, nota: '' },
};

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function leer(userDataDir) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(archivo(userDataDir), 'utf8')); } catch { /* primera vez */ }
  const f = j.fidelidad || {}; const r = j.resenas || {}; const pe = j.pedidos || {};
  return {
    fidelidad: { activa: f.activa === true, cada: Number.isInteger(f.cada) && f.cada >= 2 && f.cada <= 100 ? f.cada : POR_DEFECTO.fidelidad.cada, premio: texto(f.premio, 80) || POR_DEFECTO.fidelidad.premio },
    resenas: { activa: r.activa === true, link: esLinkValido(r.link) ? String(r.link).trim() : '', horasDespues: [4, 12, 20, 24, 48].includes(r.horasDespues) ? r.horasDespues : POR_DEFECTO.resenas.horasDespues },
    pedidos: { activa: pe.activa === true, entrega: ['retiro', 'envio', 'ambos'].includes(pe.entrega) ? pe.entrega : 'ambos', costoEnvio: Number.isFinite(pe.costoEnvio) && pe.costoEnvio >= 0 && pe.costoEnvio <= 10000000 ? Math.round(pe.costoEnvio * 100) / 100 : 0, nota: texto(pe.nota, 200) },
  };
}

// Solo https:// (los enlaces de reseñas de Google son https). Evita que se meta un esquema raro en un mensaje a clientes.
function esLinkValido(l) { try { const u = new URL(String(l || '').trim()); return u.protocol === 'https:' && !!u.hostname.includes('.'); } catch { return false; } }

function guardar(userDataDir, cambios = {}) {
  const actual = leer(userDataDir);
  const f = { ...actual.fidelidad }; const r = { ...actual.resenas }; const pe = { ...actual.pedidos };
  if (cambios.fidelidad) {
    const c = cambios.fidelidad;
    if (c.activa !== undefined) f.activa = c.activa === true;
    if (c.cada !== undefined) { const n = Number(c.cada); if (!Number.isInteger(n) || n < 2 || n > 100) throw new Error('La cantidad de visitas tiene que ser un número entre 2 y 100.'); f.cada = n; }
    if (c.premio !== undefined) { f.premio = texto(c.premio, 80); if (!f.premio) throw new Error('Escribí cuál es el premio.'); }
  }
  if (cambios.resenas) {
    const c = cambios.resenas;
    if (c.link !== undefined) { const l = String(c.link || '').trim(); if (l && !esLinkValido(l)) throw new Error('El enlace tiene que empezar con https:// (el que te da Google para dejar reseñas).'); r.link = l; }
    if (c.horasDespues !== undefined) { const h = Number(c.horasDespues); if (![4, 12, 20, 24, 48].includes(h)) throw new Error('Horario de envío no válido.'); r.horasDespues = h; }
    if (c.activa !== undefined) r.activa = c.activa === true;
  }
  if (cambios.pedidos) {
    const c = cambios.pedidos;
    if (c.activa !== undefined) pe.activa = c.activa === true;
    if (c.entrega !== undefined) { if (!['retiro', 'envio', 'ambos'].includes(c.entrega)) throw new Error('Forma de entrega no válida.'); pe.entrega = c.entrega; }
    if (c.costoEnvio !== undefined) { const n = Number(c.costoEnvio); if (!Number.isFinite(n) || n < 0 || n > 10000000) throw new Error('El costo de envío no es válido.'); pe.costoEnvio = Math.round(n * 100) / 100; }
    if (c.nota !== undefined) pe.nota = texto(c.nota, 200);
  }
  const nuevo = { fidelidad: f, resenas: r, pedidos: pe };
  fs.writeFileSync(archivo(userDataDir), JSON.stringify(nuevo));
  return nuevo;
}

// ── Fidelidad: se calcula SOLA con los turnos (visitas = turnos confirmados que ya pasaron y a los que vino) ──
// canjes = cuántas veces ya se entregó el premio a ese cliente.
function progreso({ visitas, canjes = 0, cada }) {
  const enCiclo = Math.max(0, visitas - canjes * cada);
  const premiosDisponibles = Math.floor(enCiclo / cada);
  return { visitas, canjes, cada, enCiclo: enCiclo % cada, premiosDisponibles, premioDisponible: premiosDisponibles > 0, faltan: premiosDisponibles > 0 ? 0 : cada - (enCiclo % cada) };
}

function contarVisitas(turnos, ahora = new Date()) {
  return (turnos || []).filter((t) => t.estado === 'confirmado' && t.ausente !== true && new Date(t.fechaInicio).getTime() <= ahora.getTime()).length;
}

// Clientes que ya tienen un premio para canjear. Teléfono real del cliente (no el id interno @lid).
const telCliente = (c) => String(c.numeroReal || c.telefono || (/@s\.whatsapp\.net$/.test(c.jid || '') ? String(c.jid).split('@')[0] : '') || '').replace(/\D/g, '').slice(-10);
function clientesConPremio(clientes, turnos, cada, ahora = new Date()) {
  const porTel = new Map();
  for (const t of turnos || []) { const k = String(t.clienteTelefono || '').replace(/\D/g, '').slice(-10); if (k.length === 10) { if (!porTel.has(k)) porTel.set(k, []); porTel.get(k).push(t); } }
  const salida = [];
  for (const c of clientes || []) {
    const k = telCliente(c); if (k.length !== 10) continue;
    const p = progreso({ visitas: contarVisitas(porTel.get(k) || [], ahora), canjes: c.canjesFidelidad || 0, cada });
    if (p.premioDisponible) salida.push({ jid: c.jid, nombre: c.nombre || '', premios: p.premiosDisponibles });
  }
  return salida;
}

module.exports = { clientesConPremio, telCliente, POR_DEFECTO, leer, guardar, esLinkValido, progreso, contarVisitas };
