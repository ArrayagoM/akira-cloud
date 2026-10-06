// slots/atomic-auth.js
// Guardado ATÓMICO de la sesión de WhatsApp (creds + claves). El
// useMultiFileAuthState() oficial de Baileys escribe directo sobre los
// archivos: un corte de luz o un disco lleno a mitad de escritura los deja
// truncados y WhatsApp pide un QR nuevo. Esta versión escribe a .tmp, guarda
// un .bak y hace rename atómico; al leer, si el archivo está corrupto usa el
// .bak. Es la misma implementación del worker (worker/baileys-runner.js),
// con un fallback para cuando OneDrive/antivirus bloquean el rename.
//
// akira.bot.js no se toca: esm-compat.js entrega Baileys con este
// useMultiFileAuthState en lugar del oficial.
'use strict';

const path = require('path');
const fs = require('fs');

function crearUseAtomicMultiFileAuthState({ BufferJSON, initAuthCreds, proto }) {
  return async function useAtomicMultiFileAuthState(folder) {
    const fsp = fs.promises;
    const fixFileName = (file) => file?.replace(/\//g, '__')?.replace(/:/g, '-');
  
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  
    const writeData = async (data, file) => {
      const filePath = path.join(folder, fixFileName(file));
      const tmpPath  = filePath + '.tmp';
      const bakPath  = filePath + '.bak';
      const json     = JSON.stringify(data, BufferJSON.replacer);
  
      // 1) escribir a .tmp (puede fallar/cortarse — no toca el archivo bueno)
      await fsp.writeFile(tmpPath, json, 'utf-8');
  
      // 2) rotar backup: copiar el archivo actual (si existe) a .bak ANTES de pisarlo.
      //    Si esto falla (no existe aún) lo ignoramos.
      try {
        await fsp.copyFile(filePath, bakPath);
      } catch {}
  
      // 3) rename atómico — el .tmp pasa a ser el archivo bueno.
      // En Windows con OneDrive, el archivo puede estar bloqueado por el proceso
      // de sincronización → EPERM/EBUSY. Fallback: writeFile directo (no atómico
      // pero funciona; el .tmp ya tiene el contenido correcto y el .bak protege
      // contra cortes de luz en la escritura directa).
      try {
        await fsp.rename(tmpPath, filePath);
      } catch (renameErr) {
        if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
          // OneDrive/antivirus tiene bloqueado el destino — escribir directo
          await fsp.writeFile(filePath, json, 'utf-8');
          try { await fsp.unlink(tmpPath); } catch {}
        } else {
          throw renameErr; // otro error inesperado — propagar
        }
      }
    };
  
    const readData = async (file) => {
      const filePath = path.join(folder, fixFileName(file));
      const bakPath  = filePath + '.bak';
  
      // Intento 1: archivo principal
      try {
        const data = await fsp.readFile(filePath, { encoding: 'utf-8' });
        return JSON.parse(data, BufferJSON.reviver);
      } catch (e) {
        // archivo ausente o corrupto → probar backup
      }
  
      // Intento 2: backup
      try {
        const data = await fsp.readFile(bakPath, { encoding: 'utf-8' });
        const parsed = JSON.parse(data, BufferJSON.reviver);
        // Restaurar el .bak como archivo principal para futuras lecturas
        try { await fsp.copyFile(bakPath, filePath); } catch {}
        return parsed;
      } catch {
        return null;
      }
    };
  
    const removeData = async (file) => {
      const filePath = path.join(folder, fixFileName(file));
      try { await fsp.unlink(filePath); } catch {}
      try { await fsp.unlink(filePath + '.bak'); } catch {}
      try { await fsp.unlink(filePath + '.tmp'); } catch {}
    };
  
    const creds = (await readData('creds.json')) || initAuthCreds();
  
    return {
      state: {
        creds,
        keys: {
          get: async (type, ids) => {
            const data = {};
            await Promise.all(
              ids.map(async (id) => {
                let value = await readData(`${type}-${id}.json`);
                if (type === 'app-state-sync-key' && value) {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value;
              }),
            );
            return data;
          },
          set: async (data) => {
            const tasks = [];
            for (const category in data) {
              for (const id in data[category]) {
                const value = data[category][id];
                const file  = `${category}-${id}.json`;
                tasks.push(value ? writeData(value, file) : removeData(file));
              }
            }
            await Promise.all(tasks);
          },
        },
      },
      saveCreds: async () => writeData(creds, 'creds.json'),
    };
  }
}

module.exports = { crearUseAtomicMultiFileAuthState };
