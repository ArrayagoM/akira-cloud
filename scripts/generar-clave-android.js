// scripts/generar-clave-android.js
// Crea la CLAVE DE FIRMA FIJA de la app de Android de Akira (una sola vez en la vida del proyecto).
// Con esta clave cada .apk nuevo se instala ENCIMA del anterior y la app puede actualizarse sola. Si la clave se pierde o cambia,
// quien tenga la app instalada tendrá que desinstalarla una vez más: por eso hay que GUARDAR LA CARPETA que crea este script
// (un pendrive, el gestor de contraseñas…), nunca subirla a GitHub ni mandarla por mail.
//
// Uso (no necesita Java ni Android Studio):
//   node scripts/generar-clave-android.js "C:\Users\TU-USUARIO\Desktop\Akira-clave-android"
//
// Crea en esa carpeta:
//   akira-release.p12          la clave (guardala en lugar seguro)
//   LEEME-SECRETOS.txt         las 4 contraseñas/valores para cargar en GitHub (Settings → Secrets and variables → Actions)
// y muestra en pantalla solo la huella pública del certificado (SHA-256), que no es secreta.
//
// La única dependencia es node-forge (se instala sola en una carpeta temporal, no se agrega al proyecto).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ALIAS = 'akira';
const VALIDEZ_ANIOS = 30; // Android pide que el certificado dure al menos hasta 2033

function cargarForge() {
  try { return require('node-forge'); } catch { /* se instala abajo */ }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-forge-'));
  console.log('Instalando node-forge en una carpeta temporal…');
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-save', '--silent', '--prefix', tmp, 'node-forge@1.3.1'], { stdio: 'inherit', shell: process.platform === 'win32' });
  return require(path.join(tmp, 'node_modules', 'node-forge'));
}

const contrasena = () => crypto.randomBytes(18).toString('base64url'); // 24 caracteres sin símbolos raros

// Devuelve { p12: Buffer, claveAlmacen, claveAlias, alias, huellaSha256 } sin escribir nada en disco (así se puede probar).
function crear(forge = cargarForge(), { alias = ALIAS, anios = VALIDEZ_ANIOS } = {}) {
  const claveAlmacen = contrasena(); const claveAlias = claveAlmacen; // mismo valor: con PKCS12 es lo más compatible
  const par = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = par.publicKey;
  cert.serialNumber = '01' + crypto.randomBytes(8).toString('hex');
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + anios * 365 * 24 * 3600 * 1000);
  const atributos = [{ name: 'commonName', value: 'Akira Cloud' }, { name: 'organizationName', value: 'TinTech SAS' }, { name: 'countryName', value: 'AR' }];
  cert.setSubject(atributos); cert.setIssuer(atributos);
  cert.sign(par.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, [cert], claveAlmacen, { friendlyName: alias, algorithm: '3des' });
  const p12 = Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
  const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');
  return { p12, claveAlmacen, claveAlias, alias, huellaSha256: crypto.createHash('sha256').update(der).digest('hex').toUpperCase().match(/../g).join(':') };
}

function principal() {
  const carpeta = process.argv[2];
  if (!carpeta) { console.error('Falta la carpeta de destino. Ejemplo:\n  node scripts/generar-clave-android.js "C:\\Users\\TU-USUARIO\\Desktop\\Akira-clave-android"'); process.exit(1); }
  const destino = path.resolve(carpeta);
  const repo = path.resolve(__dirname, '..');
  if (destino === repo || destino.startsWith(repo + path.sep)) { console.error('La carpeta de destino no puede estar dentro del proyecto: la clave nunca debe subirse a GitHub.'); process.exit(1); }
  const archivo = path.join(destino, 'akira-release.p12');
  if (fs.existsSync(archivo)) { console.error(`Ya existe ${archivo}. No se pisa: si la perdés de verdad, borrala a mano y volvé a correr esto (la app instalada tendrá que reinstalarse una vez).`); process.exit(1); }
  fs.mkdirSync(destino, { recursive: true });
  const k = crear();
  fs.writeFileSync(archivo, k.p12, { mode: 0o600 });
  const secretos = [
    'SECRETOS PARA GITHUB — repositorio ArrayagoM/akira-cloud → Settings → Secrets and variables → Actions → New repository secret',
    'Creá estos 4 secretos con EXACTAMENTE estos nombres y valores. No compartas este archivo.',
    '',
    'ANDROID_KEY_ALIAS',
    k.alias,
    '',
    'ANDROID_KEYSTORE_PASSWORD',
    k.claveAlmacen,
    '',
    'ANDROID_KEY_PASSWORD',
    k.claveAlias,
    '',
    'ANDROID_KEYSTORE_B64   (una sola línea larga: copiala entera)',
    k.p12.toString('base64'),
    '',
    `Huella pública del certificado (SHA-256, no es secreta): ${k.huellaSha256}`,
    'GUARDÁ esta carpeta entera (el archivo .p12 y este texto) en un lugar seguro. Si se pierden, no se puede actualizar la app instalada: habría que reinstalarla.',
  ].join('\n');
  fs.writeFileSync(path.join(destino, 'LEEME-SECRETOS.txt'), secretos, { mode: 0o600 });
  console.log(`\nListo. Carpeta creada: ${destino}\n  - akira-release.p12\n  - LEEME-SECRETOS.txt (los 4 valores para cargar en GitHub)\nHuella pública del certificado (SHA-256): ${k.huellaSha256}\nGuardá esa carpeta en un lugar seguro y NO la subas a GitHub.`);
}

if (require.main === module) principal();
module.exports = { crear, ALIAS };
