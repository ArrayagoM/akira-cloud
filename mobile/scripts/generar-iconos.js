// mobile/scripts/generar-iconos.js — íconos de la app móvil con el MISMO logo de la interfaz (robot verde de
// contorno sobre cajita oscura). Se renderiza con Electron (ya instalado en ../desktop) como el resto de los íconos:
//     cd desktop && npx electron ../mobile/scripts/generar-iconos.js
// Genera en mobile/assets: icon.png (1024, iOS/stores), adaptive-foreground.png (Android, fondo transparente),
// adaptive-background.png (color liso), adaptive-monochrome.png, splash-icon.png, notification-icon.png, favicon.png
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const VERDE = '#00e87b';
const BOT = '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>';
const robot = (color, tr = 'translate(46 46) scale(6.5)', filtro = '') => `<g${filtro}><g transform="${tr}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${BOT}</g></g>`;
const marco = (interior, bg = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${bg}${interior}</svg>`;

const DISENOS = {
  // iOS / tiendas: cuadrado completo (el sistema redondea las esquinas), sin transparencia
  'icon.png': { tam: 1024, svg: marco(robot(VERDE, 'translate(46 46) scale(6.5)', ' filter="url(#glow)"'), '<rect width="256" height="256" fill="#0b1d16"/>') },
  // Android adaptativo: el robot centrado dentro de la zona segura (66%) y fondo aparte
  'adaptive-foreground.png': { tam: 1024, svg: marco(robot(VERDE, 'translate(78 78) scale(4.2)', ' filter="url(#glow)"')) },
  'adaptive-background.png': { tam: 1024, svg: marco('', '<rect width="256" height="256" fill="#0b1d16"/>') },
  'adaptive-monochrome.png': { tam: 1024, svg: marco(robot('#ffffff', 'translate(78 78) scale(4.2)')) },
  'splash-icon.png': { tam: 512, svg: marco(robot(VERDE, 'translate(46 46) scale(6.5)', ' filter="url(#glow)"')) },
  // Ícono de la barra de notificaciones de Android: solo silueta blanca sobre transparente
  'notification-icon.png': { tam: 96, svg: marco(robot('#ffffff', 'translate(40 40) scale(7)')) },
  'favicon.png': { tam: 48, svg: marco(robot(VERDE, 'translate(46 46) scale(6.5)'), '<rect x="3" y="3" width="250" height="250" rx="58" fill="#0b1d16" stroke="#15513a" stroke-width="5"/>') },
};

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const salida = path.join(__dirname, '..', 'assets');
  const win = new BrowserWindow({ show: false, frame: false, transparent: true, width: 256, height: 256, useContentSize: true });
  try {
    for (const [nombre, { tam, svg }] of Object.entries(DISENOS)) {
      win.setContentSize(tam, tam);
      const html = `<html><body style="margin:0;background:transparent;overflow:hidden"><div style="width:${tam}px;height:${tam}px">${svg.replace('<svg ', `<svg width="${tam}" height="${tam}" `)}</div></body></html>`;
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      await new Promise((r) => setTimeout(r, 300));
      const img = await win.webContents.capturePage({ x: 0, y: 0, width: tam, height: tam });
      fs.writeFileSync(path.join(salida, nombre), img.toPNG());
      console.log('✔', nombre, tam);
    }
    console.log('ÍCONOS_OK');
  } catch (e) { console.error('ÍCONOS_ERROR', e); process.exitCode = 1; }
  app.quit();
});
