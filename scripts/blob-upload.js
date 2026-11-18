// scripts/blob-upload.js — herramienta de subida del instalador a Vercel Blob (copia versionada de la que antes vivía suelta en %TEMP%\blobup\up3.js).
// La usa scripts/publicar-version.ps1. No se corre a mano salvo que sepas lo que hacés: SUBE A PRODUCCIÓN.
//
// Variables de entorno:
//   TOK              (obligatoria) el BLOB_READ_WRITE_TOKEN de producción. Nunca se escribe en este archivo: publicar-version.ps1 lo
//                    saca con "vercel env pull" a un archivo temporal que borra al terminar y lo pasa solo por esta variable.
//   SOLO_VERSIONADO  (opcional) "1" = sube solo la copia AkiraCloud-<versión>.exe (la que usa la Microsoft Store) y no toca
//                    AkiraCloud.exe ni latest.yml.
// Argumento: carpeta con AkiraCloud.exe y latest.yml (desktop/dist). Dependencia: el paquete npm @vercel/blob (se resuelve desde
// node_modules o desde NODE_PATH; publicar-version.ps1 lo instala en %TEMP%\blobup y apunta NODE_PATH ahí).
//
// Qué verifica (en este orden, y corta con código de salida distinto de 0 si algo falla):
//   - latest.yml tiene version y sha512 (3) y el sha512 del .exe local coincide con el de latest.yml (4): si no, no sube nada.
//   - tras subir AkiraCloud.exe, la CDN tiene que servir el archivo NUEVO (mismo sha512), hasta 12 intentos de 30 s (5).
//   - la copia por versión no se sobrescribe nunca: si ya existe con otro contenido corta (6); si lo publicado no coincide corta (7).
//   - recién al final, tras esperar 70 s, sube latest.yml (el manifiesto que ven los clientes) y lo relee para confirmar la versión.
//
// up3.js — sube el instalador y el manifiesto de actualización a Vercel Blob, en el orden seguro.
//   TOK=<BLOB_READ_WRITE_TOKEN> node up3.js <carpeta desktop/dist>
// 1) sube AkiraCloud.exe  2) espera a que la CDN sirva el archivo NUEVO (compara el sha512 con el de latest.yml)  3) espera 70 s más
// 4) recién entonces sube latest.yml (si el manifiesto saliera antes, los clientes bajarían el .exe viejo y fallaría el chequeo de hash).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { put } = require('@vercel/blob');
const dist = path.resolve(process.argv[2] || '.'); const token = process.env.TOK;
if (!token) { console.error('Falta TOK (BLOB_READ_WRITE_TOKEN)'); process.exit(2); }
const BASE = 'https://75e2pc5qx5jjfp4g.public.blob.vercel-storage.com/';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = path.join(dist, 'AkiraCloud.exe'), yml = path.join(dist, 'latest.yml');
const texto = fs.readFileSync(yml, 'utf8'); const esperado = (texto.match(/^sha512:\s*(\S+)/m) || [])[1]; const version = (texto.match(/^version:\s*(\S+)/m) || [])[1];
if (!esperado || !version) { console.error('latest.yml sin sha512 o version'); process.exit(3); }
const hashLocal = crypto.createHash('sha512').update(fs.readFileSync(exe)).digest('base64');
if (hashLocal !== esperado) { console.error('El .exe local NO coincide con latest.yml: no se sube nada.'); process.exit(4); }
// Copia con URL propia por versión (AkiraCloud-<versión>.exe) para Microsoft Store: la Store verifica el hash de la URL que se le carga, así que
// esa URL no puede cambiar nunca. Por eso no se sobrescribe: si ya existe con otro contenido, se corta; si es idéntica, se deja como está.
// AkiraCloud.exe (la descarga directa de la web y el actualizador) sigue igual, siempre apuntando a la última versión.
async function subirVersionado() {
  const nombre = `AkiraCloud-${version}.exe`, url = `${BASE}${nombre}`;
  const previo = await fetch(`${url}?v=${Date.now()}`);
  if (previo.ok) {
    const h = crypto.createHash('sha512').update(Buffer.from(await previo.arrayBuffer())).digest('base64');
    if (h === esperado) { console.log(`  ${nombre} ya está publicado y coincide: no se toca.`); return url; }
    console.error(`${nombre} YA existe con otro contenido. No se sobrescribe (la Store verifica ese hash). Subí una versión nueva.`); process.exit(6);
  }
  await put(nombre, fs.createReadStream(exe), { access: 'public', token, addRandomSuffix: false, allowOverwrite: false, multipart: true, contentType: 'application/vnd.microsoft.portable-executable', cacheControlMaxAge: 31536000 });
  const res = await fetch(`${url}?v=${Date.now()}`); const h = crypto.createHash('sha512').update(Buffer.from(await res.arrayBuffer())).digest('base64');
  if (h !== esperado) { console.error(`${nombre}: lo publicado no coincide con latest.yml.`); process.exit(7); }
  console.log(`  copia por versión publicada y verificada: ${url}`); return url;
}

(async () => {
  if (process.env.SOLO_VERSIONADO === '1') { console.log(`Solo copia por versión (${version}); no se toca AkiraCloud.exe ni latest.yml.`); await subirVersionado(); return; }
  // Chequeo de solo lectura ANTES de pisar AkiraCloud.exe: si la copia por versión ya existe con otro contenido, se corta sin haber tocado nada
  // (si no, quedaría un .exe nuevo sirviéndose con un latest.yml viejo y los clientes rechazarían la actualización por hash).
  {
    const nombrePrevio = `AkiraCloud-${version}.exe`;
    const previoV = await fetch(`${BASE}${nombrePrevio}?v=${Date.now()}`);
    if (previoV.ok) {
      const hPrevio = crypto.createHash('sha512').update(Buffer.from(await previoV.arrayBuffer())).digest('base64');
      if (hPrevio !== esperado) { console.error(`${nombrePrevio} YA existe con otro contenido. No se sube nada (la Store verifica ese hash). Subí una versión nueva.`); process.exit(6); }
    }
  }
  console.log(`Subiendo AkiraCloud.exe (versión ${version}, ${(fs.statSync(exe).size / 1048576).toFixed(1)} MB)...`);
  const r1 = await put('AkiraCloud.exe', fs.createReadStream(exe), { access: 'public', token, addRandomSuffix: false, allowOverwrite: true, multipart: true, contentType: 'application/vnd.microsoft.portable-executable', cacheControlMaxAge: 60 });
  console.log('  subido:', r1.url);
  let ok = false;
  for (let i = 1; i <= 12 && !ok; i++) {
    const res = await fetch(`${BASE}AkiraCloud.exe?v=${Date.now()}`); const h = crypto.createHash('sha512').update(Buffer.from(await res.arrayBuffer())).digest('base64');
    ok = h === esperado; console.log(`  verificación ${i}: ${ok ? 'el archivo publicado es el nuevo' : 'todavía se sirve el anterior (caché de la CDN)'}`);
    if (!ok) await dormir(30000);
  }
  if (!ok) { console.error('La CDN no sirvió el archivo nuevo a tiempo: NO se publica el manifiesto.'); process.exit(5); }
  await subirVersionado();
  console.log('Esperando 70 s para que la CDN termine de propagar...'); await dormir(70000);
  const r2 = await put('latest.yml', texto, { access: 'public', token, addRandomSuffix: false, allowOverwrite: true, contentType: 'text/yaml', cacheControlMaxAge: 60 });
  console.log('  manifiesto publicado:', r2.url);
  await dormir(3000); const t = await (await fetch(`${BASE}latest.yml?v=${Date.now()}`)).text();
  console.log('  manifiesto en línea dice versión:', (t.match(/^version:\s*(\S+)/m) || [])[1]);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
