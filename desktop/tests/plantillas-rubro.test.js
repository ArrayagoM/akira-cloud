// tests/plantillas-rubro.test.js — plantillas por rubro: se ve qué cambia antes de aplicar, "completar" nunca pisa lo
// que el usuario ya cargó, y jamás se tocan los datos de cobro, claves ni el nombre del negocio.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-plan-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const pl = require('../main/plantillas-rubro');

(async () => {
  console.log('\n[plantillas-rubro] Tests:');

  // ── contenido ──
  const rubros = pl.listar();
  assert(rubros.length >= 10 && new Set(rubros.map((r) => r.id)).size === rubros.length, 'hay 10 rubros y sin ids repetidos');
  for (const r of pl.RUBROS) {
    const okTipo = ['turnos', 'servicios', 'alojamiento'].includes(r.tipoNegocio);
    const okServ = r.tipoNegocio === 'alojamiento' ? (r.unidades || []).length > 0 : r.servicios.length > 0 && r.servicios.every((s) => s.nombre && s.precio >= 0 && s.duracion >= 5 && s.duracion <= 1440);
    const hs = r.horarios ? Object.values(r.horarios) : [];
    const okHor = r.tipoNegocio === 'alojamiento' || (Object.keys(r.horarios).length === 7 && hs.every((h) => typeof h.activo === 'boolean' && (h.franjas ? h.franjas.every((f) => /^\d\d:\d\d$/.test(f.inicio) && /^\d\d:\d\d$/.test(f.fin) && f.inicio < f.fin) : /^\d\d:\d\d$/.test(h.inicio) && /^\d\d:\d\d$/.test(h.fin) && h.inicio < h.fin)));
    assert(okTipo && okServ && okHor && r.prompt.length > 40 && r.prompt.length < 2000, `rubro "${r.id}": servicios, horarios y estilo válidos`);
  }
  assert(pl.obtener('consultorio').prompt.toLowerCase().includes('diagnóstic') && /107|guardia/.test(pl.obtener('consultorio').prompt), 'los rubros de salud NO dan diagnósticos y derivan las urgencias');
  assert(pl.obtener('alquiler').tipoNegocio === 'alojamiento' && pl.obtener('taller').tipoNegocio === 'servicios', 'cada rubro usa el flujo del bot que le corresponde (alojamiento / servicios / turnos)');

  // ── completar vs reemplazar ──
  const DEFAULTS = require('../main/bot-engine/models/Config').DEFAULTS;
  const vacia = { ...DEFAULTS, promptPersonalizado: '' };
  let p = pl.planificar(vacia, pl.obtener('peluqueria'), 'completar');
  assert(p.cambios.serviciosList.length === 5 && p.cambios.promptPersonalizado && p.cambios.horariosAtencion && p.cambios.precioTurno === 9000, 'sobre una configuración de fábrica carga servicios, horarios, estilo y precio base');
  assert(p.cambios.serviciosList.every((s) => s.intervaloRecordatorioDias === 0 && s.mensajeRecordatorio === ''), 'los servicios quedan con la misma forma que los que carga el usuario');
  assert(p.resumen.length >= 3 && p.resumen.some((x) => /Servicios: 5/.test(x)), 'devuelve un resumen legible de lo que cambia');

  const cargada = { ...DEFAULTS, serviciosList: [{ nombre: 'Mi corte especial', precio: 12345, duracion: 40 }], promptPersonalizado: 'Mi estilo propio', servicios: 'cortes premium', precioTurno: 8000, horasCancelacion: 6, horariosAtencion: { lunes: { activo: true, inicio: '10:00', fin: '15:00' } }, tipoNegocio: 'turnos' };
  p = pl.planificar(cargada, pl.obtener('peluqueria'), 'completar');
  assert(Object.keys(p.cambios).length === 0, '"completar" sobre algo ya cargado NO pisa nada (servicios, estilo, horarios, precio, texto)');
  p = pl.planificar(cargada, pl.obtener('peluqueria'), 'reemplazar');
  assert(p.cambios.serviciosList.length === 5 && p.cambios.promptPersonalizado !== 'Mi estilo propio' && p.cambios.precioTurno === 9000, '"reemplazar" sí pisa servicios, estilo y precio');
  p = pl.planificar({ ...DEFAULTS, serviciosList: [{ nombre: 'Solo un servicio', precio: 1, duracion: 30 }] }, pl.obtener('peluqueria'), 'completar');
  assert(!p.cambios.serviciosList && !!p.cambios.horariosAtencion, 'completar llena solo lo que falta (mantiene los servicios, completa horarios)');
  const campos = new Set(Object.keys(pl.planificar(vacia, pl.obtener('alquiler'), 'reemplazar').cambios).concat(Object.keys(pl.planificar(vacia, pl.obtener('peluqueria'), 'reemplazar').cambios)));
  const prohibidos = ['negocio', 'miNombre', 'aliasTransferencia', 'cbuTransferencia', 'bancoTransferencia', 'keyGroq', 'keyMP', 'celularNotificaciones', 'catalogo', 'diasBloqueados', 'modoPausa', 'googleCalendarTokens', 'chatsIgnorados'];
  assert(prohibidos.every((c) => !campos.has(c)), 'una plantilla NUNCA toca el nombre del negocio, datos de cobro, claves, celular, catálogo, días bloqueados ni modo pausa');
  p = pl.planificar(vacia, pl.obtener('alquiler'), 'completar');
  assert(p.cambios.tipoNegocio === 'alojamiento' && p.cambios.minimaEstadia === 2 && p.cambios.unidadesAlojamiento.length === 1 && !p.cambios.horariosAtencion, 'alquiler: pasa a alojamiento, estadía mínima y una unidad de ejemplo (sin horarios de turnos)');
  p = pl.planificar({ ...vacia, unidadesAlojamiento: [{ nombre: 'Mi cabaña' }] }, pl.obtener('alquiler'), 'reemplazar');
  assert(!p.cambios.unidadesAlojamiento, 'nunca pisa las unidades de alojamiento que ya cargaste');
  let fallo = null; try { pl.planificar({}, null); } catch (e) { fallo = e; }
  assert(!!fallo, 'plantilla inexistente → error claro');

  // ── rutas ──
  const Config = require('../main/bot-engine/models/Config');
  await Config.create({ userId: 'u1', negocio: 'Mi Barbería', miNombre: 'Tincho', aliasTransferencia: 'mi.alias', celularNotificaciones: '5492241497226', ...DEFAULTS, promptPersonalizado: '' });
  let recargas = 0;
  const app = express(); app.use(express.json());
  app.use('/api/app/plantillas', require('../main/local-api/routes/plantillas.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, botService: { recargarConfig: () => { recargas++; return true; } } }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/plantillas`;
  const j = async (pth, body) => { const x = await fetch(base + pth, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };

  let r = await j('');
  assert(r.status === 200 && r.body.rubros.length >= 10 && r.body.rubros[0].icono && !r.body.rubros[0].servicios, 'lista los rubros (solo lo necesario para mostrar)');
  r = await j('/vista-previa', { id: 'peluqueria' });
  assert(r.status === 200 && r.body.hayCambios && r.body.servicios.length === 5 && r.body.resumen.length >= 3 && r.body.yaTieneServicios === false, 'vista previa: muestra los servicios y el resumen sin aplicar nada');
  assert((await Config.findOne({ userId: 'u1' })).serviciosList.length === 0, 'la vista previa NO modifica nada');
  assert((await j('/vista-previa', { id: 'inventada' })).status === 404, 'rubro inexistente → 404');
  r = await j('/aplicar', { id: 'peluqueria' });
  assert(r.status === 400 && /confirmar/.test(r.body.error), 'sin confirmar no aplica');
  r = await j('/aplicar', { id: 'peluqueria', confirmar: true });
  const cfg = await Config.findOne({ userId: 'u1' });
  assert(r.status === 200 && cfg.serviciosList.length === 5 && cfg.precioTurno === 9000 && /peluquería de barrio/.test(cfg.promptPersonalizado) && recargas >= 1, 'aplicar: carga todo y recarga el bot en caliente');
  assert(cfg.negocio === 'Mi Barbería' && cfg.miNombre === 'Tincho' && cfg.aliasTransferencia === 'mi.alias' && cfg.celularNotificaciones === '5492241497226', 'y conserva el nombre del negocio, el alias de cobro y el celular');
  r = await j('/aplicar', { id: 'estetica', confirmar: true });
  assert(r.status === 409 && /ya tenés todo cargado/.test(r.body.error), 'aplicar otra plantilla en modo "completar" no pisa lo ya cargado y lo explica');
  r = await j('/vista-previa', { id: 'estetica', modo: 'reemplazar' });
  assert(r.body.hayCambios && r.body.yaTieneServicios === true, 'en modo "reemplazar" sí muestra los cambios (y avisa que ya tenía servicios)');
  r = await j('/aplicar', { id: 'estetica', modo: 'reemplazar', confirmar: true });
  assert(r.status === 200 && (await Config.findOne({ userId: 'u1' })).serviciosList.some((s) => /Manicuría/.test(s.nombre)), 'reemplazar aplica la nueva plantilla');
  srv.close();

  console.log('\n✅ Todos los tests de plantillas-rubro pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
