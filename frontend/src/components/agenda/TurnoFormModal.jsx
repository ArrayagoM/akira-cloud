import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { X, Loader2, Plus, Trash2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import {
  DURACIONES_RAPIDAS, DURACION_MIN, DURACION_MAX, LIM, AYUDA_PUESTOS,
  validarFormulario, validarNombrePuesto, cuerpoDesdeFormulario, formularioDe, finDe, cruzaMedianoche, duracionValida,
} from '../../lib/turnoManual';

// Formulario (en una ventana) para crear un turno a mano o ver y editar uno que ya existe.
// - Nuevo: turno = null.  - Editar: turno = el turno como lo devuelve /bot/agenda.
// Funciona para cualquier rubro: "puesto" es un lugar o equipo de trabajo; dos trabajos a la vez van en puestos distintos.

const campo = 'mt-1 w-full min-h-[44px] rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50 disabled:opacity-50 disabled:cursor-not-allowed';
const etiqueta = 'block text-xs text-gray-400';

export default function TurnoFormModal({ turno = null, fechaInicial = '', puestosInfo, profesionales = [], onPuestos, onClose, onGuardado, onCancelarTurno }) {
  const uid = useId();
  const id = (n) => `${uid}-${n}`;
  const esEdicion = !!turno;
  const inicial = useMemo(() => formularioDe(turno, { fecha: fechaInicial, hora: '' }), [turno, fechaInicial]);
  const [f, setF] = useState(inicial);
  const [otraDuracion, setOtraDuracion] = useState(() => !DURACIONES_RAPIDAS.includes(Number(inicial.duracionMin)));
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [nuevoPuesto, setNuevoPuesto] = useState('');
  const [errorPuesto, setErrorPuesto] = useState('');
  const [guardandoPuesto, setGuardandoPuesto] = useState(false);
  const refDialogo = useRef(null);
  const refPrimero = useRef(null);
  const refNuevoPuesto = useRef(null);

  const puestos = puestosInfo?.puestos || [{ valor: '', nombre: 'General', general: true }];
  const opcionesPuesto = puestos.some((p) => p.valor === f.puesto) ? puestos : [...puestos, { valor: f.puesto, nombre: f.puesto }];

  // Un turno ya sincronizado con Google Calendar, o que espera el pago, no se reprograma desde acá.
  const bloqueoHorario = esEdicion && (turno.sincronizadoGoogle
    ? 'Este turno ya está en tu Google Calendar: no se le puede cambiar el día, la hora ni el puesto desde acá. Si lo necesitás, cancelalo y creá uno nuevo.'
    : turno.estado && turno.estado !== 'confirmado'
      ? 'Este turno todavía espera el pago: no se puede reprogramar. Podés cambiar el detalle y los datos del cliente.'
      : '');

  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrores((e) => (e[k] ? { ...e, [k]: undefined } : e)); setErrorServidor(''); };

  // Foco: entra al primer campo, vuelve al botón que abrió la ventana, Escape cierra y Tab no se escapa de la ventana.
  useEffect(() => {
    const previo = document.activeElement;
    refPrimero.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; if (previo && previo.focus) previo.focus(); };
  }, []);

  const alTeclear = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (!guardando) onClose(); return; }
    if (e.key !== 'Tab') return;
    const nodos = [...(refDialogo.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]') || [])].filter((n) => n.offsetParent !== null);
    if (!nodos.length) return;
    const primero = nodos[0]; const ultimo = nodos[nodos.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  };

  const guardarPuesto = async () => {
    const existentes = (puestosInfo?.puestos || []).map((p) => p.nombre);
    const v = validarNombrePuesto(nuevoPuesto, existentes);
    if (!v.ok) { setErrorPuesto(v.error); refNuevoPuesto.current?.focus(); return; }
    setGuardandoPuesto(true); setErrorPuesto('');
    try {
      const r = await api.put('/turnos/puestos', { puestos: [...(puestosInfo?.configurados || []), v.nombre] });
      onPuestos?.(r.data);
      set('puesto', v.nombre);
      setNuevoPuesto(''); setAgregando(false);
      toast.success('Puesto agregado');
    } catch (e) { setErrorPuesto(e.response?.data?.error || 'No se pudo guardar el puesto.'); }
    finally { setGuardandoPuesto(false); }
  };

  const guardar = async (ev) => {
    ev.preventDefault();
    const e = validarFormulario(f);
    setErrores(e);
    if (Object.keys(e).length) {
      const primero = ['clienteNombre', 'titulo', 'clienteTelefono', 'fecha', 'hora', 'duracionMin', 'detalle', 'precioInformativo'].find((k) => e[k]);
      document.getElementById(id(primero))?.focus();
      return;
    }
    setGuardando(true); setErrorServidor('');
    try {
      if (esEdicion) {
        const cuerpo = cuerpoDesdeFormulario(f, formularioDe(turno));
        if (bloqueoHorario) for (const k of ['fecha', 'hora', 'duracionMin', 'puesto']) delete cuerpo[k];
        if (!Object.keys(cuerpo).length) { toast('No hay cambios para guardar'); onClose(); return; }
        await api.patch(`/turnos/${turno._id}`, cuerpo);
        toast.success('Turno actualizado');
      } else {
        await api.post('/turnos', cuerpoDesdeFormulario(f));
        toast.success('Turno creado');
      }
      onGuardado?.();
      onClose();
    } catch (err) {
      // 409 = el horario choca con otro turno del mismo puesto: el mensaje del servidor lo explica y sugiere otro puesto u otra hora.
      setErrorServidor(err.response?.data?.error || 'No se pudo guardar el turno. Revisá la conexión y probá de nuevo.');
      document.getElementById(id('error'))?.focus();
    } finally { setGuardando(false); }
  };

  const err = (k) => errores[k];
  const desc = (k) => (err(k) ? id(`${k}-err`) : undefined);
  const msg = (k) => (err(k) ? <p id={id(`${k}-err`)} className="mt-1 text-xs text-red-400">{err(k)}</p> : null);

  const durOk = duracionValida(f.duracionMin) && /^\d{2}:\d{2}$/.test(f.hora);
  const profe = profesionales.length > 0;
  const hayCancelar = esEdicion && turno.estado === 'confirmado' && onCancelarTurno;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => { if (!guardando) onClose(); }}>
      <div className="min-h-full flex items-center justify-center p-4">
        <div ref={refDialogo} role="dialog" aria-modal="true" aria-labelledby={id('titulo-dialogo')} onKeyDown={alTeclear} onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg">
          <div className="flex items-start justify-between mb-1">
            <h3 id={id('titulo-dialogo')} className="text-lg font-semibold text-white">{esEdicion ? 'Detalle del turno' : 'Nuevo turno'}</h3>
            <button type="button" onClick={onClose} disabled={guardando} className="w-11 h-11 -mt-2 -mr-2 flex items-center justify-center text-gray-400 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
          </div>
          {esEdicion && <p className="text-xs text-gray-500 mb-3">{turno.origen === 'manual' ? 'Lo cargaste a mano.' : 'Lo agendó el bot.'} Podés cambiar lo que necesites.</p>}
          {!esEdicion && <p className="text-xs text-gray-500 mb-3">Cargá un turno a mano y detallá el trabajo con libertad.</p>}

          <form onSubmit={guardar} noValidate>
            {errorServidor && (
              <div id={id('error')} tabIndex={-1} role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300 outline-none">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{errorServidor}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={id('clienteNombre')} className={etiqueta}>Cliente *</label>
                <input id={id('clienteNombre')} ref={refPrimero} className={campo} maxLength={LIM.cliente} value={f.clienteNombre} onChange={(e) => set('clienteNombre', e.target.value)} aria-invalid={!!err('clienteNombre')} aria-describedby={desc('clienteNombre')} autoComplete="off" />
                {msg('clienteNombre')}
              </div>
              <div>
                <label htmlFor={id('clienteTelefono')} className={etiqueta}>Teléfono</label>
                <input id={id('clienteTelefono')} className={campo} type="tel" inputMode="tel" maxLength={LIM.telefono} value={f.clienteTelefono} onChange={(e) => set('clienteTelefono', e.target.value)} aria-invalid={!!err('clienteTelefono')} aria-describedby={desc('clienteTelefono')} autoComplete="off" />
                {msg('clienteTelefono')}
              </div>
            </div>

            <div className="mt-3">
              <label htmlFor={id('titulo')} className={etiqueta}>Qué se hace *</label>
              <input id={id('titulo')} className={campo} maxLength={LIM.titulo} value={f.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ej: Corte, Revisión, Limpieza completa" aria-invalid={!!err('titulo')} aria-describedby={desc('titulo')} autoComplete="off" />
              {msg('titulo')}
            </div>

            <div className="mt-3">
              <label htmlFor={id('detalle')} className={etiqueta}>Detalle (opcional)</label>
              <textarea id={id('detalle')} className={`${campo} min-h-[88px] resize-y`} maxLength={LIM.detalle} rows={3} value={f.detalle} onChange={(e) => set('detalle', e.target.value)} placeholder="Todo lo que quieras anotar sobre este trabajo" aria-invalid={!!err('detalle')} aria-describedby={desc('detalle')} />
              <div className="flex justify-between">{msg('detalle')}<span className="mt-1 ml-auto text-[11px] text-gray-600">{f.detalle.length}/{LIM.detalle}</span></div>
            </div>

            <fieldset className="mt-4 border-t border-white/10 pt-3 min-w-0" disabled={!!bloqueoHorario}>
              <legend className="text-xs font-semibold text-gray-300 px-0 mb-1">Cuándo y dónde</legend>
              {bloqueoHorario && <p className="mb-2 text-xs text-amber-300 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">{bloqueoHorario}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={id('fecha')} className={etiqueta}>Fecha *</label>
                  <input id={id('fecha')} className={campo} type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} aria-invalid={!!err('fecha')} aria-describedby={desc('fecha')} />
                  {msg('fecha')}
                </div>
                <div>
                  <label htmlFor={id('hora')} className={etiqueta}>Hora *</label>
                  <input id={id('hora')} className={campo} type="time" value={f.hora} onChange={(e) => set('hora', e.target.value)} aria-invalid={!!err('hora')} aria-describedby={desc('hora')} />
                  {msg('hora')}
                </div>
              </div>

              <div className="mt-3" role="group" aria-labelledby={id('dur-etiqueta')}>
                <span id={id('dur-etiqueta')} className={etiqueta}>Duración *</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {DURACIONES_RAPIDAS.map((m) => {
                    const activo = !otraDuracion && Number(f.duracionMin) === m;
                    return (
                      <button key={m} type="button" aria-pressed={activo} onClick={() => { setOtraDuracion(false); set('duracionMin', m); }}
                        className="min-h-[44px] min-w-[56px] px-3 rounded-lg border text-sm font-medium"
                        style={activo ? { color: 'var(--accent)', borderColor: 'var(--accent)', background: 'rgba(0,232,123,0.1)' } : { color: '#d1d5db', borderColor: 'rgba(255,255,255,0.15)' }}>
                        {m} min
                      </button>
                    );
                  })}
                  <button type="button" aria-pressed={otraDuracion} onClick={() => setOtraDuracion(true)}
                    className="min-h-[44px] px-3 rounded-lg border text-sm font-medium"
                    style={otraDuracion ? { color: 'var(--accent)', borderColor: 'var(--accent)', background: 'rgba(0,232,123,0.1)' } : { color: '#d1d5db', borderColor: 'rgba(255,255,255,0.15)' }}>
                    Otra
                  </button>
                </div>
                {otraDuracion && (
                  <div className="mt-2 flex items-center gap-2">
                    <label htmlFor={id('duracionMin')} className="sr-only">Duración en minutos</label>
                    <input id={id('duracionMin')} className={`${campo} !mt-0 max-w-[140px]`} type="number" inputMode="numeric" min={DURACION_MIN} max={DURACION_MAX} step="1" value={f.duracionMin} onChange={(e) => set('duracionMin', e.target.value)} aria-invalid={!!err('duracionMin')} aria-describedby={desc('duracionMin')} />
                    <span className="text-sm text-gray-400">minutos</span>
                  </div>
                )}
                {msg('duracionMin')}
                {durOk && <p className="mt-1.5 text-xs text-gray-500">Termina a las {finDe(f.hora, f.duracionMin)}{cruzaMedianoche(f.hora, f.duracionMin) ? ' del día siguiente' : ''}.</p>}
              </div>

              <div className="mt-3">
                <label htmlFor={id('puesto')} className={etiqueta}>Puesto</label>
                <div className="flex gap-2">
                  <select id={id('puesto')} className={campo} value={f.puesto} onChange={(e) => set('puesto', e.target.value)} aria-describedby={id('puesto-ayuda')}>
                    {opcionesPuesto.map((p) => <option key={p.valor || 'general'} value={p.valor}>{p.nombre}</option>)}
                  </select>
                  <button type="button" onClick={() => { setAgregando(true); setTimeout(() => refNuevoPuesto.current?.focus(), 0); }} disabled={agregando}
                    className="mt-1 min-h-[44px] shrink-0 px-3 rounded-lg border border-white/15 text-sm text-gray-200 hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-50">
                    <Plus size={14} /> Agregar puesto
                  </button>
                </div>
                <p id={id('puesto-ayuda')} className="mt-1 text-[11px] text-gray-500">{AYUDA_PUESTOS}. Por ejemplo, "Puesto 1" y "Box A".</p>
                {agregando && (
                  <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3">
                    <label htmlFor={id('nuevoPuesto')} className={etiqueta}>Nombre del puesto nuevo</label>
                    <div className="flex gap-2">
                      <input id={id('nuevoPuesto')} ref={refNuevoPuesto} className={campo} maxLength={LIM.puesto} value={nuevoPuesto} onChange={(e) => { setNuevoPuesto(e.target.value); setErrorPuesto(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarPuesto(); } }} aria-invalid={!!errorPuesto} aria-describedby={errorPuesto ? id('nuevoPuesto-err') : undefined} placeholder="Ej: Puesto 2" autoComplete="off" />
                      <button type="button" onClick={guardarPuesto} disabled={guardandoPuesto} className="mt-1 min-h-[44px] shrink-0 px-3 rounded-lg btn-primary text-sm">
                        {guardandoPuesto ? <Loader2 size={14} className="animate-spin" /> : 'Guardar puesto'}
                      </button>
                      <button type="button" onClick={() => { setAgregando(false); setNuevoPuesto(''); setErrorPuesto(''); }} className="mt-1 min-h-[44px] shrink-0 px-2 text-sm text-gray-400 hover:text-white">Cancelar</button>
                    </div>
                    {errorPuesto && <p id={id('nuevoPuesto-err')} role="alert" className="mt-1 text-xs text-red-400">{errorPuesto}</p>}
                  </div>
                )}
              </div>
            </fieldset>

            <div className="mt-4 border-t border-white/10 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profe && (
                <div>
                  <label htmlFor={id('profesionalId')} className={etiqueta}>Profesional que atiende</label>
                  <select id={id('profesionalId')} className={campo} value={f.profesionalId} onChange={(e) => set('profesionalId', e.target.value)}>
                    <option value="">Sin asignar</option>
                    {profesionales.map((p) => <option key={p._id} value={p._id}>{p.nombre}</option>)}
                    {f.profesionalId && !profesionales.some((p) => p._id === f.profesionalId) && <option value={f.profesionalId}>{turno?.profesionalNombre || 'Profesional anterior'}</option>}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor={id('precioInformativo')} className={etiqueta}>Precio ($, opcional)</label>
                <input id={id('precioInformativo')} className={campo} type="text" inputMode="decimal" value={f.precioInformativo} onChange={(e) => set('precioInformativo', e.target.value)} aria-invalid={!!err('precioInformativo')} aria-describedby={`${id('precio-ayuda')}${err('precioInformativo') ? ` ${id('precioInformativo-err')}` : ''}`} placeholder="0" autoComplete="off" />
                {msg('precioInformativo')}
                <p id={id('precio-ayuda')} className="mt-1 text-[11px] text-gray-500">Es solo para que lo tengas anotado: no se suma a la Caja.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-5">
              <div>
                {hayCancelar && (
                  <button type="button" onClick={() => onCancelarTurno(turno._id)} disabled={guardando}
                    className="min-h-[44px] px-3 rounded-lg text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-1.5">
                    <Trash2 size={14} /> Cancelar turno
                  </button>
                )}
              </div>
              <div className="flex gap-2 ml-auto">
                <button type="button" className="btn-secondary text-sm min-h-[44px]" onClick={onClose} disabled={guardando}>Cerrar</button>
                <button type="submit" className="btn-primary text-sm min-h-[44px] flex items-center gap-1.5" disabled={guardando}>
                  {guardando && <Loader2 size={14} className="animate-spin" />} {esEdicion ? 'Guardar cambios' : 'Crear turno'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
