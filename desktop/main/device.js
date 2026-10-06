// main/device.js — identidad de esta instalación (deviceId).
// UUID v4 generado una sola vez y guardado en userData: es lo que el
// servidor de licencias usa para contar "instalaciones activas" del plan.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function obtenerDeviceId(userDataDir) {
  const archivo = path.join(userDataDir, 'device-id.json');
  try {
    const data = JSON.parse(fs.readFileSync(archivo, 'utf-8'));
    if (data.deviceId) return data.deviceId;
  } catch {}
  const deviceId = crypto.randomUUID();
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify({ deviceId, creadoEn: new Date().toISOString() }, null, 2));
  return deviceId;
}

module.exports = { obtenerDeviceId };
