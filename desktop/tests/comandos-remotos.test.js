// tests/comandos-remotos.test.js — control remoto mínimo desde el celular: apagado por defecto, solo 4 órdenes,
// y las órdenes se ejecutan y se confirman a la nube.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { crearServicio, activo, TIPOS } = require('../main/comandos-remotos');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-cel-'));

(async () => {
  console.log('\n[comandos-remotos] Tests:');
  assert(activo(dir) === false && TIPOS.join() === 'bot-pausar,bot-reanudar,vacaciones-on,vacaciones-off', 'viene apagado y solo conoce 4 órdenes');

  const llamadas = []; let respuesta = { comandos: [] }; let falla = false;
  const hechosAcc = [];
  const acciones = {
    pausarBot: async () => { hechosAcc.push('pausar'); return [0, 2]; },
    reanudarBot: async (slots) => { hechosAcc.push('reanudar:' + slots.join('+')); },
    vacaciones: async (on) => { hechosAcc.push('vac:' + on); },
  };
  const sv = crearServicio({ userDataDir: dir, llamar: async (b) => { llamadas.push(b); if (falla) throw new Error('sin internet'); const r = respuesta; respuesta = { comandos: [] }; return r; }, acciones, setI: () => 1 });

  // apagado: avisa UNA vez a la nube que está apagado y después no consulta más
  await sv.sondear();
  assert(llamadas.length === 1 && llamadas[0].celularActivo === false, 'apagado: avisa una sola vez a la nube que el control está desactivado');
  await sv.sondear(); await sv.sondear();
  assert(llamadas.length === 1, 'apagado: no vuelve a consultar nada (cero tráfico)');

  // activar
  sv.configurar(true);
  await new Promise((r) => setTimeout(r, 30));
  assert(activo(dir) === true && llamadas[llamadas.length - 1].celularActivo === true, 'al activarlo consulta enseguida');

  // pausar → guarda qué cuentas pausó; reanudar → las reanuda
  respuesta = { comandos: [{ id: 'a1', tipo: 'bot-pausar' }] };
  let n = llamadas.length;
  const h = await sv.sondear();
  assert(h[0].ok && hechosAcc.includes('pausar') && fs.existsSync(path.join(dir, 'pausa-remota.json')), 'pausar: detiene el bot y recuerda qué cuentas pausó');
  assert(llamadas.length === n + 2 && llamadas[n + 1].hechos[0].id === 'a1' && llamadas[n + 1].hechos[0].ok === true, 'confirma a la nube enseguida (la app ve "hecho" sin esperar un minuto)');
  respuesta = { comandos: [{ id: 'a2', tipo: 'bot-reanudar' }] };
  await sv.sondear();
  assert(hechosAcc.includes('reanudar:0+2') && !fs.existsSync(path.join(dir, 'pausa-remota.json')), 'reanudar: vuelve a arrancar exactamente las cuentas que se habían pausado');
  respuesta = { comandos: [{ id: 'a3', tipo: 'bot-reanudar' }] };
  await sv.sondear();
  assert(hechosAcc.includes('reanudar:0'), 'reanudar sin pausa previa: arranca la cuenta principal');
  respuesta = { comandos: [{ id: 'v1', tipo: 'vacaciones-on' }, { id: 'v2', tipo: 'vacaciones-off' }] };
  await sv.sondear();
  assert(hechosAcc.includes('vac:true') && hechosAcc.includes('vac:false'), 'vacaciones on/off');

  // seguridad y errores
  respuesta = { comandos: [{ id: 'x1', tipo: 'borrar-todo' }, { id: 'x2', tipo: 'bot-pausar' }] };
  hechosAcc.length = 0; n = llamadas.length;
  await sv.sondear();
  const conf = llamadas.slice(n).flatMap((l) => l.hechos);
  assert(conf.find((c) => c.id === 'x1').ok === false && !hechosAcc.includes('borrar-todo'), 'una orden desconocida NO se ejecuta y se informa como fallida');
  respuesta = { comandos: [{ id: 'e1', tipo: 'vacaciones-on' }] };
  const sv2 = crearServicio({ userDataDir: dir, llamar: async () => { const r = respuesta; respuesta = { comandos: [] }; return r; }, acciones: { ...acciones, vacaciones: async () => { throw new Error('base bloqueada'); } }, setI: () => 1 });
  const r2 = await sv2.sondear();
  assert(r2[0].ok === false && /base bloqueada/.test(r2[0].detalle), 'si la acción falla, lo informa (no rompe la app)');
  falla = true; n = llamadas.length;
  assert(await sv.sondear() === null, 'sin internet: no pasa nada, reintenta en el próximo ciclo');
  falla = false;
  respuesta = { comandos: Array.from({ length: 20 }, (_, i) => ({ id: 'm' + i, tipo: 'vacaciones-on' })) };
  hechosAcc.length = 0;
  await sv.sondear();
  assert(hechosAcc.filter((x) => x === 'vac:true').length <= 5 + 5, 'nunca ejecuta una avalancha de órdenes de golpe (máximo 5 por consulta)');

  // productos cargados con la cámara del celular: se guardan en la PC y se confirman a la nube
  const llamadasP = []; let respuestaP = { comandos: [], productos: [{ id: 'p1', producto: { nombre: 'Yerba' }, foto: null }, { id: 'malo', producto: { nombre: 'X' }, foto: null }] };
  const importados = [];
  const svP = crearServicio({ userDataDir: dir, llamar: async (b) => { llamadasP.push(b); const r = respuestaP; respuestaP = { comandos: [], productos: [] }; return r; }, acciones: { ...acciones, importarProducto: async (p) => { if (p.id === 'malo') throw new Error('sin permiso'); importados.push(p.id); return 'agregado: ' + p.producto.nombre; } }, setI: () => 1 });
  await svP.sondear();
  assert(importados.join() === 'p1', 'productos del celular: se guardan en el Catálogo de la PC');
  assert(llamadasP.length === 2 && JSON.stringify(llamadasP[1].productosHechos) === JSON.stringify([{ id: 'p1', ok: true, detalle: 'agregado: Yerba' }, { id: 'malo', ok: false, detalle: 'sin permiso' }]), 'confirma a la nube enseguida cuáles guardó y cuáles fallaron (y por qué)');
  const llamadasN = []; let respuestaN = { comandos: [], productos: [{ id: 'q1', producto: { nombre: 'Z' } }] };
  const svN = crearServicio({ userDataDir: dir, llamar: async (b) => { llamadasN.push(b); const r = respuestaN; respuestaN = { comandos: [], productos: [] }; return r; }, acciones, setI: () => 1 });
  await svN.sondear();
  assert(llamadasN[1].productosHechos[0].ok === false && /no recibe productos/.test(llamadasN[1].productosHechos[0].detalle), 'una versión sin importador informa que no puede recibirlos');
  const llamadasR = []; let respuestaR = { comandos: [], productos: [{ id: 'p9', producto: { nombre: 'Q' } }] }; let corte = true;
  const svR = crearServicio({ userDataDir: dir, llamar: async (b) => { llamadasR.push(b); if (corte && b.productosHechos.length) throw new Error('corte'); const r = respuestaR; respuestaR = { comandos: [], productos: [] }; return r; }, acciones: { ...acciones, importarProducto: async () => 'ok' }, setI: () => 1 });
  await svR.sondear();
  corte = false;
  await svR.sondear();
  assert(llamadasR[llamadasR.length - 1].productosHechos.length === 1 && llamadasR[llamadasR.length - 1].productosHechos[0].id === 'p9', 'si se corta internet al confirmar, la confirmación se reintenta y no se pierde');

  // diagnóstico: un fallo al consultar la nube queda anotado (a lo sumo cada 30 min) y "pausar" sin bot activo no dice "hecho"
  const anotado = []; let ahoraFalso = 10 * 60 * 60 * 1000;
  const svF = crearServicio({ userDataDir: dir, llamar: async () => { throw new Error('401 sesión vencida'); }, acciones, log: (...a) => anotado.push(a.join(' ')), ahoraMs: () => ahoraFalso, setI: () => 1 });
  assert(await svF.sondear() === null && anotado.length === 1 && /401 sesión vencida/.test(anotado[0]), 'si no puede consultar la nube lo anota en el registro (antes fallaba en silencio)');
  await svF.sondear(); await svF.sondear();
  assert(anotado.length === 1, 'el mismo fallo no llena el registro (una anotación cada 30 min)');
  ahoraFalso += 31 * 60 * 1000; await svF.sondear();
  assert(anotado.length === 2, 'pasados 30 minutos y con el fallo vigente, vuelve a anotarlo');
  const dirV = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-cel-v-')); fs.writeFileSync(path.join(dirV, 'celular.json'), JSON.stringify({ activo: true }));
  const llamV = []; let respV = { comandos: [{ id: 'z1', tipo: 'bot-pausar' }] };
  const svV = crearServicio({ userDataDir: dirV, llamar: async (b) => { llamV.push(b); const r = respV; respV = { comandos: [] }; return r; }, acciones: { ...acciones, pausarBot: async () => [] }, setI: () => 1 });
  const hV = await svV.sondear();
  assert(hV[0].ok === false && /ningún bot activo/.test(hV[0].detalle) && !fs.existsSync(path.join(dirV, 'pausa-remota.json')), 'pausar sin ningún bot activo se informa como fallo (no "hecho") y no deja una pausa fantasma');
  assert(llamV[llamV.length - 1].hechos[0].ok === false, 'la nube recibe el fallo y la app del celular puede mostrárselo al usuario');

  // desactivar: avisa a la nube y se calla
  n = llamadas.length;
  sv.configurar(false);
  await new Promise((r) => setTimeout(r, 30));
  assert(activo(dir) === false && llamadas[llamadas.length - 1].celularActivo === false, 'al desactivarlo avisa a la nube que quedó apagado');
  const m = llamadas.length; await sv.sondear(); await sv.sondear();
  assert(llamadas.length === m, 'y deja de consultar');

  console.log('\n✅ Todos los tests de comandos-remotos pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
