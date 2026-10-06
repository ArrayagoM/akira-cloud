// Genera el ícono de la app (ICO para el instalador/.exe y PNG para la
// bandeja) renderizando un SVG con el propio Electron — sin dependencias de
// imagen extra. Correr con:  node_modules\electron\dist\electron.exe scripts\gen-icon.js
'use strict';
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SVG = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dff9c"/><stop offset="1" stop-color="#00c46a"/></linearGradient></defs>
  <rect width="256" height="256" rx="58" fill="url(#g)"/>
  <path d="M64 70h128a14 14 0 0 1 14 14v70a14 14 0 0 1-14 14h-72l-38 32v-32H64a14 14 0 0 1-14-14V84a14 14 0 0 1 14-14z" fill="#06150e"/>
  <circle cx="102" cy="119" r="10" fill="#2dff9c"/><circle cx="154" cy="119" r="10" fill="#2dff9c"/>
  <rect x="104" y="140" width="48" height="7" rx="3.5" fill="#2dff9c"/>
</svg>`;

async function render(size) {
  const win = new BrowserWindow({ show: false, width: size, height: size, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;background:transparent">${SVG(size)}</body>`));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage();
  win.destroy();
  return img.resize({ width: size, height: size }).toPNG();
}

// ICO con un solo PNG de 256 px embebido (formato válido desde Windows Vista)
function aIco(png) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head[6] = 0; head[7] = 0; head[8] = 0; head[9] = 0;       // 0 = 256 px
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

app.whenReady().then(async () => {
  const raiz = path.join(__dirname, '..');
  const png256 = await render(256);
  fs.writeFileSync(path.join(raiz, 'build-resources', 'icon.png'), png256);
  fs.writeFileSync(path.join(raiz, 'build-resources', 'icon.ico'), aIco(png256));
  fs.writeFileSync(path.join(raiz, 'main', 'assets', 'tray.png'), nativeImage.createFromBuffer(png256).resize({ width: 32, height: 32, quality: 'best' }).toPNG());
  console.log('íconos generados');
  app.quit();
});
