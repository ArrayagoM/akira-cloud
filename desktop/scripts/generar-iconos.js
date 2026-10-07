// scripts/generar-iconos.js — genera TODOS los íconos de Akira a partir de un único dibujo:
//   build-resources/icon.png  (512 px)   · build-resources/icon.ico (7 tamaños, para el instalador y el acceso directo)
//   main/assets/tray.png (32 px)         · ../frontend/public/favicon.svg (la pestaña de la web)
// El dibujo es el MISMO logo de la interfaz: cajita oscura con el robot verde de contorno
// (ícono "Bot" de lucide). Si alguna vez cambia el logo, se cambia acá y se corre:
//     npx electron scripts/generar-iconos.js
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const VERDE = '#00e87b';
// Robot de lucide-react (v0.383, ISC), 24×24, trazo redondeado.
const BOT = '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>';

const svg = (conGlow = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <!-- el halo cubre todo el ícono (userSpaceOnUse): así no se recorta ni deja un recuadro -->
    <filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect x="3" y="3" width="250" height="250" rx="58" fill="#0b1d16" stroke="#15513a" stroke-width="5"/>
  <g${conGlow ? ' filter="url(#glow)"' : ''}><g transform="translate(46 46) scale(6.5)" fill="none" stroke="${VERDE}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${BOT}</g></g>
</svg>`;

async function aPng(win, tam) {
  win.setContentSize(tam, tam);
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden"><div style="width:${tam}px;height:${tam}px">${svg(tam >= 48).replace('width="256" height="256"', `width="${tam}" height="${tam}"`)}</div></body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 250));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: tam, height: tam });
  return img.toPNG();
}

function armarIco(pngs) {
  const n = pngs.length;
  const cab = Buffer.alloc(6); cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(n, 4);
  let offset = 6 + 16 * n; const dirs = []; const datos = [];
  for (const { tam, png } of pngs) {
    const d = Buffer.alloc(16);
    d.writeUInt8(tam >= 256 ? 0 : tam, 0); d.writeUInt8(tam >= 256 ? 0 : tam, 1); d.writeUInt8(0, 2); d.writeUInt8(0, 3);
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(png.length, 8); d.writeUInt32LE(offset, 12);
    dirs.push(d); datos.push(png); offset += png.length;
  }
  return Buffer.concat([cab, ...dirs, ...datos]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const raiz = path.join(__dirname, '..');
  const win = new BrowserWindow({ show: false, frame: false, transparent: true, width: 256, height: 256, useContentSize: true, webPreferences: { offscreen: false } });
  try {
    const tamanios = [16, 24, 32, 48, 64, 128, 256];
    const pngs = [];
    for (const tam of tamanios) pngs.push({ tam, png: await aPng(win, tam) });
    fs.writeFileSync(path.join(raiz, 'build-resources', 'icon.ico'), armarIco(pngs));
    fs.writeFileSync(path.join(raiz, 'build-resources', 'icon.png'), await aPng(win, 512));
    fs.writeFileSync(path.join(raiz, 'main', 'assets', 'tray.png'), pngs.find((p) => p.tam === 32).png);
    fs.writeFileSync(path.join(raiz, '..', 'frontend', 'public', 'favicon.svg'), svg(true));
    console.log('ÍCONOS_OK');
  } catch (e) { console.error('ÍCONOS_ERROR', e); process.exitCode = 1; }
  app.quit();
});
