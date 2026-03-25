// services/bot/persistence.service.js
// Lectura y escritura de archivos JSON para memoria y caché del bot.
'use strict';

const fs   = require('fs');
const path = require('path');

function crearPersistencia(dataDir, log) {
  function cargar(ruta) {
    if (!fs.existsSync(ruta)) return {};
    try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return {}; }
  }

  function guardar(ruta, data) {
    try { fs.writeFileSync(ruta, JSON.stringify(data, null, 2), 'utf8'); }
    catch (e) { log('⚠️ guardar: ' + e.message); }
  }

  function cargarMemoria(chatId) {
    const id   = chatId.replace(/[^0-9]/g, '');
    const ruta = path.join(dataDir, `${id}.json`);
    if (!fs.existsSync(ruta)) return null;
    try {
      const d = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      if (!d.historial) d.historial = [];
      d.historial = d.historial.map(m => {
        if (m.tool_calls) {
          m.tool_calls = m.tool_calls.map(tc => {
            if (!tc.type) tc.type = 'function';
            if (tc.function && typeof tc.function.arguments === 'object') {
              tc.function.arguments = JSON.stringify(tc.function.arguments);
            }
            return tc;
          });
        }
        return m;
      });
      return d;
    } catch { return null; }
  }

  function guardarMemoria(chatId, datos) {
    const id = chatId.replace(/[^0-9]/g, '');
    try {
      fs.writeFileSync(path.join(dataDir, `${id}.json`), JSON.stringify(datos, null, 2), 'utf8');
    } catch (e) { log('⚠️ guardarMemoria: ' + e.message); }
  }

  return { cargar, guardar, cargarMemoria, guardarMemoria };
}

module.exports = crearPersistencia;
