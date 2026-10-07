// main/respaldo-servicio.js
// Une el respaldo (respaldo.js) con la app: configuración, "respaldar ahora" y el programador que lo hace
// solo cada día (al abrir la app y luego cada 15 min comprueba si ya pasó ~1 día desde el último).
'use strict';

const path = require('path');
const respaldo = require('./respaldo');

function crearServicio({ userDataDir, snapshotDb, credenciales, version = '', carpetaSugerida = null, log = () => {}, ahora = () => Date.now(), setI = setInterval, setT = setTimeout }) {
  let corriendo = false; let timer = null; let inicial = null;

  const cfg = () => respaldo.leerConfig(userDataDir);

  function estado() {
    const c = cfg();
    return {
      activo: c.activo === true,
      carpeta: c.carpeta || null,
      carpetaSugerida,
      tieneClave: !!c.clave,
      ultimo: c.ultimo || null,
      archivos: c.carpeta ? respaldo.listar(c.carpeta).slice(0, respaldo.MAX_ARCHIVOS) : [],
      corriendo,
    };
  }

  function configurar({ activo, carpeta, clave }) {
    const cambios = {};
    if (carpeta !== undefined) {
      if (typeof carpeta !== 'string' || !path.isAbsolute(carpeta)) throw new Error('La carpeta no es válida');
      cambios.carpeta = carpeta;
    }
    if (clave !== undefined) {
      if (typeof clave !== 'string' || clave.length < 8) throw new Error('La contraseña del respaldo debe tener al menos 8 caracteres');
      const c = credenciales.encrypt(clave);
      if (!c) throw new Error('No se pudo proteger la contraseña en este equipo');
      cambios.clave = c;
    }
    if (activo !== undefined) cambios.activo = activo === true;
    const nuevo = respaldo.guardarConfig(userDataDir, cambios);
    if (nuevo.activo && (!nuevo.carpeta || !nuevo.clave)) { respaldo.guardarConfig(userDataDir, { activo: false }); throw new Error('Para activar el respaldo automático elegí una carpeta y una contraseña'); }
    return estado();
  }

  async function respaldarAhora() {
    if (corriendo) throw new Error('Ya hay un respaldo en curso');
    const c = cfg();
    if (!c.carpeta || !c.clave) throw new Error('Elegí una carpeta y una contraseña para el respaldo');
    const clave = credenciales.decrypt(c.clave);
    if (!clave) throw new Error('No se pudo leer la contraseña guardada: volvé a escribirla');
    corriendo = true;
    try {
      const r = await respaldo.crearRespaldo({ userDataDir, destinoDir: c.carpeta, clave, snapshotDb, version, ahora: new Date(ahora()) });
      respaldo.rotar(c.carpeta);
      respaldo.guardarConfig(userDataDir, { ultimo: { ok: true, enMs: ahora(), archivo: path.basename(r.archivo), bytes: r.bytes } });
      log('[respaldo] listo', path.basename(r.archivo), r.bytes);
      return estado();
    } catch (e) {
      respaldo.guardarConfig(userDataDir, { ultimo: { ok: false, enMs: ahora(), error: String(e.message).slice(0, 200) } });
      log('[respaldo] FALLÓ', e.message);
      throw e;
    } finally { corriendo = false; }
  }

  async function revisar() {
    if (!respaldo.debeCorrer(cfg(), ahora())) return false;
    try { await respaldarAhora(); return true; } catch { return false; }
  }

  function programar() {
    inicial = setT(() => { revisar(); }, 2 * 60 * 1000);
    timer = setI(() => { revisar(); }, 15 * 60 * 1000);
  }
  function detener() { if (timer) clearInterval(timer); if (inicial) clearTimeout(inicial); }

  return { estado, configurar, respaldarAhora, revisar, programar, detener };
}

module.exports = { crearServicio };
