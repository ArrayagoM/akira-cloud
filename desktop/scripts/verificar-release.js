// scripts/verificar-release.js — comprobaciones sobre el instalador YA armado,
// antes de publicarlo. Cada punto corresponde a un problema real que ya ocurrió:
//   · interfaz compilada con rutas de Windows ("C:/Program Files/Git/api")
//   · módulos que faltan dentro del paquete ("Cannot find module 'mongoose'")
//   · versión del manifiesto distinta de la del instalador
//   · archivos del OCR que no quedaron fuera del .asar
// Uso:  npm run release:check      (sale con código 1 si algo falla)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const dist = path.join(raiz, 'dist');
const app = path.join(dist, 'win-unpacked');
const asar = path.join(app, 'resources', 'app.asar');
const exeApp = path.join(app, 'Akira.exe');
const pkg = require(path.join(raiz, 'package.json'));

let fallos = 0;
const ok = (m) => console.log('  ✅ ' + m);
const mal = (m) => { fallos++; console.error('  ❌ ' + m); };
const chequear = (cond, bien, malo) => (cond ? ok(bien) : mal(malo));

console.log(`\n[release] Verificando el paquete ${pkg.version}:`);

for (const f of [asar, exeApp, path.join(dist, 'AkiraCloud.exe'), path.join(dist, 'latest.yml')]) {
  if (!fs.existsSync(f)) { mal('falta ' + path.relative(raiz, f) + ' (¿se armó el instalador?)'); }
}
if (fallos) process.exit(1);

// 1) manifiesto de actualización ↔ instalador
const yml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
const verYml = (yml.match(/^version:\s*(\S+)/m) || [])[1];
chequear(verYml === pkg.version, `latest.yml es de la versión ${pkg.version}`, `latest.yml dice ${verYml} y el paquete es ${pkg.version}`);
const sha = crypto.createHash('sha512').update(fs.readFileSync(path.join(dist, 'AkiraCloud.exe'))).digest('base64');
chequear(yml.includes(sha), 'el sha512 del manifiesto coincide con AkiraCloud.exe', 'el sha512 de latest.yml NO coincide con AkiraCloud.exe (las actualizaciones automáticas fallarían)');

// 2) interfaz sin rutas de Windows y con la base de API correcta
const bin = fs.readFileSync(asar);
chequear(bin.indexOf('Program Files') === -1 && bin.indexOf('C:/Users') === -1, 'la interfaz no tiene rutas de Windows incrustadas', 'la interfaz tiene rutas de Windows incrustadas (build hecho desde Git Bash). Usá: npm run build:ui');
chequear(bin.indexOf('/api/auth/oauth-token') !== -1, 'la interfaz llama a /api/auth/…', 'la interfaz no contiene las llamadas a /api/auth');
chequear(bin.indexOf('href:"/api/auth/google"') !== -1 || bin.indexOf('/api/auth/google') !== -1, 'el botón "Continuar con Google" apunta a /api/auth/google', 'no se encontró el enlace de Google en la interfaz');

// 3) OCR fuera del .asar
const sin = path.join(app, 'resources', 'app.asar.unpacked');
chequear(fs.existsSync(path.join(sin, 'ocr-data', 'spa.traineddata')) && fs.existsSync(path.join(sin, 'ocr-data', 'eng.traineddata')), 'los idiomas del OCR están empaquetados', 'faltan los idiomas del OCR en app.asar.unpacked');
chequear(fs.existsSync(path.join(sin, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js')), 'el motor del OCR está fuera del .asar', 'falta tesseract.js en app.asar.unpacked');

// 4) los módulos principales cargan DENTRO del paquete (detecta dependencias que faltan)
const prueba = path.join(__dirname, '_smoke-paquete.js');
fs.writeFileSync(prueba, `
const path = require('path');
const raiz = process.argv[2];
(async () => {
  await require(path.join(raiz, 'main/esm-compat')).preparar();
  const os = require('os'), fs = require('fs');
  // base temporal: los modelos locales la necesitan abierta para cargarse
  require(path.join(raiz, 'main/db/store')).abrir(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'akira-smoke-')), 'smoke.db'));
  for (const m of ['main/db/store', 'main/bot-engine/services/akira.bot', 'main/slots/bot-service', 'main/local-api/server',
    'main/license/guardian', 'main/bot-engine/services/bot/documentos.service', 'main/bot-engine/services/bot/ocr.service']) {
    require(path.join(raiz, m));
  }
  // OCR real sobre una imagen mínima: debe responder sin tirar (texto vacío es válido)
  const ocr = require(path.join(raiz, 'main/bot-engine/services/bot/ocr.service'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+XJ/P2QAAAABJRU5ErkJggg==', 'base64');
  const t = await ocr.leerTexto(png);
  if (typeof t !== 'string') throw new Error('el OCR no devolvió texto');
  await ocr.cerrar();
  // lectura de PDF (pdf.js) y de Excel (exceljs) dentro del paquete
  const pdfTxt = await require(path.join(raiz, 'main/gestion/pdf-texto')).textoDePdf(Buffer.from(process.argv[3], 'base64'));
  if (!/Importe/.test(pdfTxt)) throw new Error('no se pudo leer el PDF de prueba');
  const xl = await require(path.join(raiz, 'main/gestion/exportador')).exportarXlsx('productos', [{ nombre: 'Prueba', precio: 1, categoria: '', stock: -1, descripcion: '' }]);
  const leido = await require(path.join(raiz, 'main/gestion/lector-archivos')).leerArchivo({ buffer: xl, nombre: 'p.xlsx' });
  if (!leido.hojas.length) throw new Error('no se pudo leer el Excel de prueba');
  console.log('SMOKE_OK');
  process.exit(0);
})().catch((e) => { console.error('SMOKE_ERROR ' + e.message); process.exit(1); });
`);
const pdfB64 = fs.readFileSync(path.join(raiz, 'tests', 'fixtures', 'comprobante.pdf')).toString('base64');
const r = spawnSync(exeApp, [prueba, path.join(asar), pdfB64], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 180000 });
fs.unlinkSync(prueba);
chequear(r.status === 0 && /SMOKE_OK/.test(r.stdout || ''), 'los módulos del bot, la base local, el OCR y la lectura de PDF/Excel funcionan dentro del paquete', 'falló la carga dentro del paquete: ' + String(r.stderr || r.stdout || '').split('\n').find((l) => /SMOKE_ERROR|Cannot find|Error/.test(l)));

if (fallos) { console.error(`\n❌ ${fallos} comprobación(es) fallaron: NO publicar este instalador.\n`); process.exit(1); }
console.log('\n✅ Paquete verificado: se puede publicar.\n');
