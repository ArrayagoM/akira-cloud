// main/mcp/servicio.js
// Conexión de asistentes de IA (MCP) a Akira. APAGADA por defecto: no se abre ningún puerto hasta que el dueño la activa.
// Une las piezas (llaves, herramientas de solo lectura, protocolo, servidor y auditoría) y expone lo que necesita la pantalla.
// Por diseño no hay forma de saltearse la llave, de usarla desde internet ni de pedir algo que no sea una consulta de lectura.
'use strict';

const { crearAlmacen, MAX_LLAVES, DIAS_POR_DEFECTO } = require('./tokens');
const { crearAuditoria } = require('./auditoria');
const { crearHerramientas } = require('./herramientas');
const { crearProtocolo } = require('./protocolo');
const { crearServidor } = require('./servidor');

function crearServicio({ userDataDir, obtenerUserId, modelos, version = '0.0.0', log = () => {}, ahora, puertoPreferido }) {
  const tokens = crearAlmacen({ userDataDir, ahora });
  const auditoria = crearAuditoria({ userDataDir, ahora });
  const herramientas = crearHerramientas({ modelos, ahora });
  const protocolo = crearProtocolo({ herramientas, obtenerUserId, auditoria, version });
  const servidor = crearServidor({ tokens, protocolo, log, puertoPreferido });

  const estado = () => ({
    activo: tokens.activo(),
    escuchando: servidor.escuchando(),
    puerto: servidor.puerto(),
    url: servidor.puerto() ? `http://127.0.0.1:${servidor.puerto()}/mcp` : null,
    conexiones: tokens.lista(),
    maximoConexiones: MAX_LLAVES,
    diasPorDefecto: DIAS_POR_DEFECTO,
    herramientas: herramientas.listar().map((h) => ({ nombre: h.name, titulo: h.title, descripcion: h.description })),
    actividad: auditoria.ultimos(30),
  });

  async function activar(v) {
    if (v === true) { tokens.fijarActivo(true); await servidor.iniciar(); } else { tokens.fijarActivo(false); await servidor.detener(); }
    return estado();
  }
  async function iniciarSiActivo() {
    if (!tokens.activo()) return false;
    try { await servidor.iniciar(); log('[mcp] escuchando en 127.0.0.1:' + servidor.puerto()); return true; } catch (e) { log('[mcp] no pudo iniciar:', e.message); return false; }
  }
  function crearConexion(datos) {
    if (!tokens.activo() || !servidor.escuchando()) return { ok: false, error: 'Primero activá la conexión con asistentes de IA.' };
    return tokens.crear(datos);
  }

  return {
    estado, activar, iniciarSiActivo, crearConexion,
    revocar: (id) => tokens.revocar(id),
    revocarTodas: () => tokens.revocarTodas(),
    detener: () => servidor.detener(),
  };
}

module.exports = { crearServicio };
