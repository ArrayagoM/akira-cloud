// tests/respaldo.test.js — respaldo cifrado de los datos del negocio y restauración (también en otra PC).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const zlib = require('zlib');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'akira-resp-'));
const origen = tmp(); const destino = tmp();
const store = require('../main/db/store');
store.abrir(path.join(origen, 'akira.db'));
const respaldo = require('../main/respaldo');
const { crearServicio } = require('../main/respaldo-servicio');
const credenciales = require('../main/security/credentials-store');
const Database = require('better-sqlite3');

(async () => {
  console.log('\n[respaldo] Tests:');

  // Datos de prueba: una base con clientes + archivos de la cuenta
  store.ensureCollection('clientes_t');
  for (let i = 1; i <= 3; i++) store.insertar('col_clientes_t', { _id: 'c' + i, nombre: i === 1 ? 'Ana López SECRETO' : 'Cliente ' + i });
  const dataDir = path.join(origen, 'sessions', 'principal', 'data');
  fs.mkdirSync(path.join(dataDir, 'documentos'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'documentos', 'factura.pdf'), 'PDF-CONTENIDO-FACTURA');
  fs.writeFileSync(path.join(dataDir, 'clientes.json'), '{"x":1}');
  fs.writeFileSync(path.join(dataDir, 'credentials.json'), '{"client_secret":"NO-DEBE-ENTRAR"}');
  fs.writeFileSync(path.join(origen, 'sessions', 'principal', 'creds.json'), '{"sesion":"WHATSAPP-NO-DEBE-ENTRAR"}');

  // ── contenedor y cifrado ──
  const pk = respaldo.empaquetar([{ nombre: 'a/b.txt', datos: Buffer.from('hola') }, { nombre: 'c.txt', datos: Buffer.alloc(0) }]);
  const de = respaldo.desempaquetar(pk);
  assert(de.length === 2 && de[0].datos.toString() === 'hola' && de[1].datos.length === 0, 'empaqueta y desempaqueta (incluye archivos vacíos)');
  assert(!respaldo.nombreSeguro('../x') && !respaldo.nombreSeguro('/etc/passwd') && !respaldo.nombreSeguro('C:/x') && !respaldo.nombreSeguro('a\\b') && !respaldo.nombreSeguro('a//b') && respaldo.nombreSeguro('cuentas/principal/documentos/a.pdf'), 'solo acepta rutas relativas seguras');
  let fallo = null; try { respaldo.desempaquetar(respaldo.empaquetar([{ nombre: '../escape', datos: Buffer.from('x') }])); } catch (e) { fallo = e; }
  assert(fallo && /ruta no permitida/.test(fallo.message), 'un respaldo malicioso con "../" se rechaza al abrirlo');
  const c = respaldo.cifrar(Buffer.from('texto secreto'), 'clave-de-prueba');
  assert(!c.includes(Buffer.from('texto secreto')) && respaldo.descifrar(c, 'clave-de-prueba').toString() === 'texto secreto', 'cifra y descifra con la contraseña');
  fallo = null; try { respaldo.descifrar(c, 'otra-clave-mala'); } catch (e) { fallo = e; }
  assert(fallo?.codigo === 'CLAVE', 'con otra contraseña no abre');
  const roto = Buffer.from(c); roto[roto.length - 1] ^= 1;
  fallo = null; try { respaldo.descifrar(roto, 'clave-de-prueba'); } catch (e) { fallo = e; }
  assert(fallo?.codigo === 'CLAVE', 'si el archivo se altera o daña, se detecta');
  fallo = null; try { respaldo.descifrar(Buffer.from('no es un respaldo, ni cerca'.repeat(5)), 'x'); } catch (e) { fallo = e; }
  assert(fallo?.codigo === 'FORMATO', 'un archivo que no es un respaldo de Akira se informa claro');

  // ── crear respaldo ──
  fallo = null; try { await respaldo.crearRespaldo({ userDataDir: origen, destinoDir: destino, clave: 'corta', snapshotDb: store.respaldarA }); } catch (e) { fallo = e; }
  assert(fallo && /8 caracteres/.test(fallo.message), 'exige una contraseña de al menos 8 caracteres');
  const r = await respaldo.crearRespaldo({ userDataDir: origen, destinoDir: destino, clave: 'mi-clave-larga', snapshotDb: store.respaldarA, version: '1.0.17', ahora: new Date(2026, 9, 8, 14, 5) });
  assert(path.basename(r.archivo) === 'akira-respaldo-2026-10-08-1405.akbk' && fs.existsSync(r.archivo), 'crea el archivo con fecha y hora en el nombre');
  const crudo = fs.readFileSync(r.archivo);
  assert(!crudo.includes(Buffer.from('SECRETO')) && !crudo.includes(Buffer.from('FACTURA')) && !crudo.includes(Buffer.from('SQLite format')), 'el contenido va cifrado: no se ve nada en texto plano');
  assert(fs.readdirSync(destino).every((f) => !f.includes('.tmp') && !f.endsWith('.parcial')), 'no deja archivos temporales ni a medio escribir');
  const v = respaldo.verificar(r.archivo, 'mi-clave-larga');
  assert(v.version === '1.0.17' && v.documentos === 1, 'se puede verificar sin restaurar (versión y cantidad de documentos)');
  const nombres = zlibEntradas(r.archivo, 'mi-clave-larga');
  assert(!nombres.some((n) => /credentials\.json|creds\.json/.test(n)), 'NO incluye la sesión de WhatsApp ni credentials.json');
  assert(nombres.includes('cuentas/principal/documentos/factura.pdf') && nombres.includes('base/akira.db'), 'incluye la base y los documentos de la cuenta');
  fallo = null; try { respaldo.verificar(r.archivo, 'clave-equivocada'); } catch (e) { fallo = e; }
  assert(fallo?.codigo === 'CLAVE', 'verificar con contraseña incorrecta falla con un mensaje claro');

  // ── restaurar en OTRA PC (otra carpeta de datos) ──
  const nueva = tmp();
  fs.writeFileSync(path.join(nueva, 'akira.db'), 'BASE-VIEJA-DE-LA-PC-NUEVA');
  fs.mkdirSync(path.join(nueva, 'sessions', 'principal', 'data'), { recursive: true });
  fs.writeFileSync(path.join(nueva, 'sessions', 'principal', 'data', 'vieja.txt'), 'dato viejo');
  const man = respaldo.prepararRestauracion({ userDataDir: nueva, archivo: r.archivo, clave: 'mi-clave-larga' });
  assert(man.version === '1.0.17' && fs.existsSync(path.join(nueva, 'restauracion-pendiente', 'base', 'akira.db')), 'deja la restauración en espera (no pisa nada todavía)');
  assert(fs.readFileSync(path.join(nueva, 'akira.db'), 'utf8') === 'BASE-VIEJA-DE-LA-PC-NUEVA', 'hasta reiniciar, la base actual no se toca');
  const ap = respaldo.aplicarRestauracionPendiente(nueva, new Date(2026, 9, 8, 15, 0));
  assert(ap && fs.existsSync(path.join(ap.resguardo, 'akira.db')) && fs.readFileSync(path.join(ap.resguardo, 'akira.db'), 'utf8') === 'BASE-VIEJA-DE-LA-PC-NUEVA', 'al reiniciar, lo que había queda guardado en una carpeta "antes-de-restaurar" (marcha atrás posible)');
  assert(fs.existsSync(path.join(ap.resguardo, 'cuentas', 'principal', 'data', 'vieja.txt')), 'también se guardan los archivos viejos de la cuenta');
  const bd = new Database(path.join(nueva, 'akira.db'), { readonly: true });
  const filas = bd.prepare('SELECT data FROM col_clientes_t').all().map((f) => JSON.parse(f.data));
  bd.close();
  assert(filas.length === 3 && filas.some((f) => f.nombre === 'Ana López SECRETO'), 'la base restaurada tiene todos los clientes');
  assert(fs.readFileSync(path.join(nueva, 'sessions', 'principal', 'data', 'documentos', 'factura.pdf'), 'utf8') === 'PDF-CONTENIDO-FACTURA' && !fs.existsSync(path.join(nueva, 'sessions', 'principal', 'data', 'vieja.txt')), 'los documentos vuelven y los archivos viejos de la cuenta se reemplazan');
  assert(!fs.existsSync(path.join(nueva, 'restauracion-pendiente')) && respaldo.aplicarRestauracionPendiente(nueva) === null, 'la carpeta de espera se limpia y no se aplica dos veces');
  fallo = null; try { respaldo.prepararRestauracion({ userDataDir: tmp(), archivo: r.archivo, clave: 'mala-clave-xx' }); } catch (e) { fallo = e; }
  assert(fallo?.codigo === 'CLAVE', 'con contraseña incorrecta no prepara nada');

  // ── rotación y listado ──
  for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(destino, `akira-respaldo-2026-09-${String(10 + i)}-0000.akbk`), 'x');
  fs.writeFileSync(path.join(destino, 'otra-cosa.txt'), 'no tocar');
  const antes = respaldo.listar(destino).length;
  const borrados = respaldo.rotar(destino, 10);
  assert(antes === 13 && respaldo.listar(destino).length === 10 && borrados.length === 3, 'se conservan los últimos 10 respaldos');
  assert(fs.existsSync(path.join(destino, 'otra-cosa.txt')), 'no toca archivos que no son respaldos');

  // ── cuándo corre solo ──
  const H = 3600 * 1000; const ahora = 1_000_000 * H;
  const base = { activo: true, carpeta: 'C:/x', clave: { encrypted: 'x' } };
  assert(respaldo.debeCorrer({ ...base }, ahora) === true, 'si nunca se hizo uno, corre');
  assert(respaldo.debeCorrer({ ...base, ultimo: { ok: true, enMs: ahora - 5 * H } }, ahora) === false, 'si hay uno de hace 5 horas, no');
  assert(respaldo.debeCorrer({ ...base, ultimo: { ok: true, enMs: ahora - 21 * H } }, ahora) === true, 'si pasó más de un día, sí');
  assert(respaldo.debeCorrer({ ...base, ultimo: { ok: false, enMs: ahora - 30 * 60000 } }, ahora) === false && respaldo.debeCorrer({ ...base, ultimo: { ok: false, enMs: ahora - 2 * H } }, ahora) === true, 'si falló, reintenta cada hora (no en bucle)');
  assert(respaldo.debeCorrer({ ...base, activo: false }, ahora) === false && respaldo.debeCorrer({ activo: true, carpeta: 'C:/x' }, ahora) === false, 'apagado o sin contraseña → no corre');

  // ── servicio ──
  const ud = tmp(); const carpeta = tmp(); const logs = [];
  const sv = crearServicio({ userDataDir: ud, snapshotDb: store.respaldarA, credenciales, version: '1.0.17', log: (...a) => logs.push(a.join(' ')) });
  assert(sv.estado().activo === false && !sv.estado().tieneClave, 'arranca apagado y sin contraseña');
  fallo = null; try { sv.configurar({ activo: true }); } catch (e) { fallo = e; }
  assert(fallo && /carpeta y una contraseña/.test(fallo.message) && sv.estado().activo === false, 'no deja activar sin carpeta y contraseña');
  fallo = null; try { sv.configurar({ clave: '123' }); } catch (e) { fallo = e; }
  assert(fallo && /8 caracteres/.test(fallo.message), 'rechaza contraseñas cortas');
  fallo = null; try { sv.configurar({ carpeta: 'relativa/x' }); } catch (e) { fallo = e; }
  assert(fallo && /no es válida/.test(fallo.message), 'rechaza carpetas que no son absolutas');
  sv.configurar({ carpeta, clave: 'contraseña-del-respaldo' });
  assert(!fs.readFileSync(path.join(ud, 'respaldo.json'), 'utf8').includes('contraseña-del-respaldo'), 'la contraseña no queda en texto plano en el disco');
  const e1 = sv.configurar({ activo: true });
  assert(e1.activo && e1.tieneClave && e1.carpeta === carpeta, 'queda activo con carpeta y contraseña');
  const e2 = await sv.respaldarAhora();
  assert(e2.ultimo.ok && e2.archivos.length === 1 && e2.archivos[0].nombre.endsWith('.akbk'), '"respaldar ahora" crea el archivo y lo informa');
  assert(respaldo.verificar(e2.archivos[0].archivo, 'contraseña-del-respaldo').version === '1.0.17', 'el respaldo del servicio abre con la contraseña elegida');
  let lanzado = 0; const sv2 = crearServicio({ userDataDir: ud, snapshotDb: async () => { lanzado++; throw new Error('disco lleno'); }, credenciales, setI: () => 1, setT: () => 1, ahora: () => Date.now() + 48 * H });
  assert(await sv2.revisar() === false && lanzado === 1 && sv2.estado().ultimo.ok === false && /disco lleno/.test(sv2.estado().ultimo.error), 'si el respaldo falla, queda registrado el motivo y no rompe la app');
  assert(await sv2.revisar() === false && lanzado === 1, 'tras un fallo no reintenta de inmediato');

  console.log('\n✅ Todos los tests de respaldo pasaron.\n');
  store.cerrar();
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });

function zlibEntradas(archivo, clave) {
  return respaldo.desempaquetar(zlib.gunzipSync(respaldo.descifrar(fs.readFileSync(archivo), clave))).map((e) => e.nombre);
}
