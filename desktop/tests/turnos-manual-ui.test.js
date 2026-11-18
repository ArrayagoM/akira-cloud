// tests/turnos-manual-ui.test.js — lógica pura de la UI de turnos a mano y vista por puestos (frontend/src/lib/turnoManual.js).
// Además compara esas reglas con las del servidor (main/gestion/turnos-manual.js) para que la pantalla y la API no se desalineen.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const TM = require('../main/gestion/turnos-manual');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[turnos-manual-ui] Tests:');
  const U = await import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'turnoManual.js')).href);

  assert(U.DURACIONES_RAPIDAS.join() === '15,30,45,60,90,120', 'duraciones rápidas: 15, 30, 45, 60, 90 y 120 minutos');
  assert(U.finDe('10:00', 45) === '10:45' && U.finDe('23:30', 60) === '00:30' && U.cruzaMedianoche('23:30', 60) && !U.cruzaMedianoche('10:00', 60) && U.finDe('00:00', 1440) === '00:00', 'hora de fin, incluso cruzando la medianoche');
  assert(U.duracionEntre('10:00', '11:30') === 90 && U.duracionEntre('23:00', '01:00') === 120 && U.duracionEntre('x', '10:00') === 0, 'duración a partir de hora de inicio y de fin');

  // agrupar por puesto
  const T = (id, hora, horaFin, puesto, extra = {}) => ({ _id: id, hora, horaFin, puesto, nombre: id, ...extra });
  const dia = [T('a', '10:00', '11:00', ''), T('b', '10:00', '11:00', 'Box A'), T('c', '09:00', '09:30', 'Box A'), T('d', '12:00', '13:00', 'Box B'), T('e', '08:00', '08:30', '')];
  const g = U.agruparPorPuesto(dia);
  assert(g.map((x) => x.nombre).join() === 'General,Box A,Box B', 'agrupa por puesto: General primero, después por nombre');
  assert(g[0].turnos.map((x) => x._id).join() === 'e,a' && g[1].turnos.map((x) => x._id).join() === 'c,b', 'cada puesto queda ordenado por hora');
  assert(U.hayParalelo(dia) && !U.hayParalelo([T('a', '10:00', '11:00', ''), T('b', '12:00', '13:00', '')]) && !U.hayParalelo([]) && !U.hayParalelo([T('a', '10:00', '11:00', 'Box A')]), 'hay vista por puestos solo si el día usa más de un puesto');
  assert(U.agruparPorPuesto([]).length === 0 && U.agruparPorPuesto(null).length === 0, 'un día vacío no rompe');

  // solapes
  const s = U.solapados(dia);
  assert((s.a || []).map((x) => x._id).join() === 'b' && (s.b || []).map((x) => x._id).join() === 'a' && !s.c && !s.d && !s.e, 'marca los turnos que se hacen a la vez con otro (de cualquier puesto); los que solo se tocan en el borde no');
  const s2 = U.solapados([T('x', '10:00', '11:00', '', { duracionMin: 90 }), T('y', '11:15', '12:00', 'Box A')]);
  assert(s2.x?.length === 1 && s2.y?.length === 1, 'usa la duración cuando viene (10:00 + 90 min pisa a las 11:15)');
  const sn = U.solapados([T('x', '23:00', '01:00', ''), T('y', '00:30', '02:00', 'Box A', { duracionMin: 90 })]);
  assert(!sn.x, 'un turno de otro día que arranca después de medianoche no se mezcla con el de la noche anterior (se comparan en el mismo día)');

  // formulario
  const ok = { clienteNombre: 'Ana', titulo: 'Corte', fecha: '2027-03-10', hora: '10:00', duracionMin: 60, clienteTelefono: '', detalle: '', puesto: '', precioInformativo: '' };
  assert(Object.keys(U.validarFormulario(ok)).length === 0, 'formulario completo: sin errores');
  const e = U.validarFormulario({ ...ok, clienteNombre: ' ', titulo: '', fecha: '2027-02-31', hora: '', duracionMin: 3, clienteTelefono: 'abc', precioInformativo: 'x', detalle: 'x'.repeat(1001) });
  assert(['clienteNombre', 'titulo', 'fecha', 'hora', 'duracionMin', 'clienteTelefono', 'precioInformativo', 'detalle'].every((k) => e[k]), 'formulario con todo mal: marca cada campo con su mensaje');
  assert(U.validarNombrePuesto(' Box   C ', ['Box A']).nombre === 'Box C' && !U.validarNombrePuesto('', []).ok && !U.validarNombrePuesto('box a', ['Box A']).ok && !U.validarNombrePuesto('General', []).ok && !U.validarNombrePuesto('x'.repeat(41), []).ok && !U.validarNombrePuesto('Nuevo', Array.from({ length: 20 }, (_, i) => `P${i}`)).ok, 'nombre de puesto nuevo: limpia, y rechaza vacío, repetido, reservado, largo o pasarse de 20');
  assert(U.AYUDA_PUESTOS === 'Si dos trabajos se hacen a la vez, ponelos en puestos distintos', 'texto de ayuda de puestos');

  // cuerpo para el servidor
  const nuevo = U.cuerpoDesdeFormulario({ ...ok, duracionMin: '45', puesto: 'Box A', precioInformativo: ' 1500 ', profesionalId: 'p1' });
  assert(nuevo.duracionMin === 45 && nuevo.puesto === 'Box A' && nuevo.precioInformativo === '1500' && nuevo.profesionalId === 'p1' && U.cuerpoDesdeFormulario(ok).precioInformativo === null, 'cuerpo de alta: duración numérica, precio limpio (o null si está vacío)');
  const turno = { _id: 't1', nombre: 'Ana', telefono: '11', titulo: 'Corte', detalle: 'x', fecha: '2027-03-10', hora: '10:00', horaFin: '11:00', duracionMin: 60, puesto: '', profesionalId: '', precioInformativo: null };
  const orig = U.formularioDe(turno);
  assert(U.formularioDe(null, { fecha: '2027-01-01' }).fecha === '2027-01-01' && U.formularioDe(null).duracionMin === 60 && orig.clienteNombre === 'Ana' && orig.duracionMin === 60 && orig.precioInformativo === '', 'formulario inicial: en blanco (60 min por defecto) o con los datos del turno');
  assert(JSON.stringify(U.cuerpoDesdeFormulario({ ...orig, detalle: 'nuevo' }, orig)) === '{"detalle":"nuevo"}', 'al editar solo se manda lo que cambió');
  assert(Object.keys(U.cuerpoDesdeFormulario(orig, orig)).length === 0, 'sin cambios no se manda nada');
  assert(U.formularioDe({ ...turno, nombre: 'Sin nombre', duracionMin: 0, horaFin: '10:45' }).duracionMin === 45 && U.formularioDe({ ...turno, nombre: 'Sin nombre' }).clienteNombre === '', 'si falta el nombre o la duración se completa con lo que se puede');

  // ── comparación con el servidor ──
  assert(JSON.stringify(U.LIM) === JSON.stringify(TM.LIM) && U.MAX_PUESTOS === TM.MAX_PUESTOS && U.DURACION_MIN === TM.DURACION_MIN && U.DURACION_MAX === TM.DURACION_MAX, 'mismos límites (largos, puestos, duración) en pantalla y servidor');
  const fechas = ['2027-03-10', '2027-02-29', '2028-02-29', '2019-12-31', '2101-01-01', '10/03/2027', '', null, '2027-13-01', '2027-00-10'];
  assert(fechas.every((f) => U.fechaValida(f) === !!TM.parsearFecha(f)), 'misma regla de fecha válida');
  const horas = ['00:00', '23:59', '24:00', '9:30', '12:60', '', null, '10:00', 'ab:cd'];
  assert(horas.every((h) => U.horaValida(h) === !!TM.parsearHora(h)), 'misma regla de hora válida');
  const durs = [5, 4, 60, 1440, 1441, '45', '', 'x', 10.5, true, null, undefined, -1];
  assert(durs.every((x) => U.duracionValida(x) === (TM.parsearDuracion(x) !== null)), 'misma regla de duración válida');
  let finOk = true;
  for (const h of ['00:00', '09:15', '10:00', '23:30', '23:59']) for (const d of [5, 15, 45, 60, 90, 600, 1440]) {
    const srv = TM.aFechaAR(TM.calcularFin(TM.aFechaUTC('2027-01-10', h), d)).hora;
    if (U.finDe(h, d) !== srv) finOk = false;
  }
  assert(finOk, 'la hora de fin calculada en pantalla coincide con la del servidor');
  let solOk = true;
  const base = TM.aFechaUTC('2027-01-10', '10:00');
  for (const [o1, d1, o2, d2] of [[0, 60, 30, 60], [0, 60, 60, 30], [0, 60, -30, 30], [0, 60, -30, 31], [0, 60, 59, 5], [0, 30, 0, 30], [10, 20, 0, 60]]) {
    const ini1 = new Date(base.getTime() + o1 * 60000); const ini2 = new Date(base.getTime() + o2 * 60000);
    const srv = TM.solapan(ini1, TM.calcularFin(ini1, d1), ini2, TM.calcularFin(ini2, d2));
    const h = (m) => { const t = 600 + m; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
    const ui = U.solapan(U.intervalo({ hora: h(o1), duracionMin: d1 }), U.intervalo({ hora: h(o2), duracionMin: d2 }));
    if (srv !== ui) solOk = false;
  }
  assert(solOk, 'el solapamiento en pantalla da lo mismo que el del servidor (los bordes no chocan)');
  const formas = [
    ok, { ...ok, clienteNombre: '' }, { ...ok, clienteNombre: 'x'.repeat(81) }, { ...ok, titulo: ' ' }, { ...ok, titulo: 'x'.repeat(121) }, { ...ok, fecha: '2027-02-30' }, { ...ok, hora: '25:00' },
    { ...ok, duracionMin: 4 }, { ...ok, duracionMin: 1441 }, { ...ok, duracionMin: '' }, { ...ok, clienteTelefono: '11 5555-1234' }, { ...ok, clienteTelefono: 'llamar' }, { ...ok, clienteTelefono: '1'.repeat(31) },
    { ...ok, detalle: 'x'.repeat(1000) }, { ...ok, detalle: 'x'.repeat(1001) }, { ...ok, precioInformativo: '12,5' }, { ...ok, precioInformativo: '-1' }, { ...ok, precioInformativo: 'abc' }, { ...ok, puesto: 'x'.repeat(41) }, { ...ok, puesto: 'Box A' },
  ];
  assert(formas.every((f) => (Object.keys(U.validarFormulario(f)).length === 0) === TM.validarAlta(f).ok), `el formulario y la API aceptan y rechazan lo mismo (${formas.length} casos)`);
  const nombresPuesto = ['Box A', 'box a', '', 'General', 'principal', 'x'.repeat(41), 'Sillón 2', '   '];
  assert(nombresPuesto.every((n) => U.validarNombrePuesto(n, []).ok === TM.validarPuestos([n]).ok), 'mismas reglas de nombre de puesto');

  console.log('✅ turnos-manual-ui: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
