// scripts/mac-adhoc.js — hook "afterPack" de electron-builder. Solo hace algo al armar para macOS.
// Sin firma de Apple (cuenta de pago), las Mac con chip M1/M2/M3 se niegan a abrir una app sin NINGUNA firma
// ("está dañada"). Con una firma "ad hoc" (gratis, local) abre con el aviso normal de "desarrollador no
// identificado": clic derecho → Abrir. No reemplaza a la firma/notarización de Apple: sirve para pruebas.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adHoc(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log('[mac-adhoc] firma ad hoc de', app);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
