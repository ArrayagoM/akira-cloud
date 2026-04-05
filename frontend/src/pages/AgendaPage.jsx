import { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  CalendarDays, Clock, DollarSign, Phone, User, RefreshCw,
  BedDouble, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Wrench, Trash2,
} from 'lucide-react';

// ─── Constantes ──────────────────────────────────────────────────────────────
const MESES      = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_CORTO = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DIAS_LARGO = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isoHoy() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
}

function formatDiaLargo(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DIAS_LARGO[dt.getDay()]} ${d} de ${MESES[m - 1]}`;
}

function formatFechaCorta(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function noches(entrada, salida) {
  if (!entrada || !salida) return null;
  const d = Math.round((new Date(salida) - new Date(entrada)) / 86400000);
  return d > 0 ? d : null;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Grilla del calendario ────────────────────────────────────────────────────
function CalendarGrid({ year, month, eventsByDate, selectedDate, onSelectDate, tipoNegocio }) {
  const hoy = isoHoy();

  // Primer día del mes: qué día de la semana es (ajustado a Lun=0)
  const dow = new Date(year, month, 1).getDay();
  const startOffset = dow === 0 ? 6 : dow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Color del dot según modo
  const dotColor =
    tipoNegocio === 'alojamiento' ? 'bg-indigo-400' :
    tipoNegocio === 'servicios'   ? 'bg-amber-400'  : 'bg-green-400';

  return (
    <div>
      {/* Nombres de días */}
      <div className="grid grid-cols-7 mb-2">
        {DIAS_CORTO.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-gray-500 uppercase tracking-wide py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Semanas */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0.5">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="min-h-[52px]" />;

              const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isToday    = dateStr === hoy;
              const isSelected = dateStr === selectedDate;
              const events     = eventsByDate[dateStr] || [];
              const hasPending   = events.some(e => e._estado === 'pendiente');
              const hasConfirmed = events.some(e => e._estado === 'confirmado');

              return (
                <button
                  key={di}
                  onClick={() => onSelectDate(dateStr)}
                  className={[
                    'relative flex flex-col items-center rounded-xl p-1 min-h-[52px] transition-all duration-150 focus:outline-none',
                    isSelected ? 'bg-green-500/15 ring-1 ring-green-500/40' : 'hover:bg-gray-800/50',
                    isToday && !isSelected ? 'ring-1 ring-green-500/25' : '',
                  ].join(' ')}
                >
                  {/* Número del día */}
                  <span className={[
                    'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors',
                    isToday    ? 'bg-green-500 text-black font-bold' :
                    isSelected ? 'text-green-400 font-semibold' :
                                 'text-gray-300',
                  ].join(' ')}>
                    {day}
                  </span>

                  {/* Dots de eventos */}
                  <div className="flex gap-0.5 mt-1 flex-wrap justify-center px-0.5">
                    {hasPending   && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                    {hasConfirmed && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
                    {events.length > 3 && (
                      <span className="text-[9px] leading-none text-gray-500 mt-px">+{events.length - 2}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tarjeta de evento (panel del día seleccionado) ───────────────────────────
function EventCard({ r, tipoNegocio, onCancelar, cancelando }) {
  const isPending = r._estado === 'pendiente';

  // ── Alojamiento ──
  if (tipoNegocio === 'alojamiento') {
    const nn = noches(r.fecha, r.horaFin);
    return (
      <div className={`rounded-xl border p-3.5 ${isPending ? 'bg-yellow-500/5 border-yellow-500/25' : 'bg-indigo-500/5 border-indigo-500/25'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white flex items-center gap-1.5 truncate">
              <BedDouble size={13} className={isPending ? 'text-yellow-400' : 'text-indigo-400'} />
              {r.nombre || 'Sin nombre'}
            </p>
            {r.unidad && (
              <p className="text-xs text-gray-400 mt-0.5">🏠 {r.unidad}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs bg-gray-800 rounded-lg px-2 py-1 text-gray-300">
                📅 Entrada <strong>{formatFechaCorta(r.fecha)}</strong>
              </span>
              <span className="text-gray-600 text-xs">→</span>
              <span className="text-xs bg-gray-800 rounded-lg px-2 py-1 text-gray-300">
                📅 Salida <strong>{formatFechaCorta(r.horaFin)}</strong>
              </span>
              {nn && <span className="text-xs text-gray-500">🌙 {nn} {nn === 1 ? 'noche' : 'noches'}</span>}
            </div>
            {r.telefono && (
              <p className="text-xs text-gray-600 mt-1.5 flex items-center gap-1">
                <Phone size={10} />{r.telefono}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {isPending ? (
              <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-0.5 flex items-center gap-1 whitespace-nowrap">
                <AlertCircle size={10} /> Sin pago
              </span>
            ) : (
              <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2 py-0.5 flex items-center gap-1 whitespace-nowrap">
                <CheckCircle2 size={10} /> Confirmada
              </span>
            )}
            {r.totalPrecio > 0 && (
              <p className="text-sm font-bold text-green-400 flex items-center gap-0.5">
                <DollarSign size={12} />{Number(r.totalPrecio).toLocaleString('es-AR')}
              </p>
            )}
            {r._estado === 'confirmado' && onCancelar && (
              <button
                onClick={() => onCancelar(r._id)}
                disabled={cancelando === r._id}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors mt-1 disabled:opacity-50"
              >
                <Trash2 size={11} />
                {cancelando === r._id ? 'Cancelando...' : 'Cancelar'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Servicios ──
  if (tipoNegocio === 'servicios') {
    return (
      <div className={`rounded-xl border p-3.5 ${isPending ? 'bg-yellow-500/5 border-yellow-500/25' : 'bg-amber-500/5 border-amber-500/25'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Wrench size={13} className={isPending ? 'text-yellow-400' : 'text-amber-400'} />
              {r.resumen || r.nombre || 'Servicio'}
            </p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Clock size={10} />
              {r.hora}{r.horaFin ? ` — ${r.horaFin}` : ''}
            </p>
            {r.telefono && (
              <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                <Phone size={10} />{r.telefono}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {isPending ? (
              <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-0.5 whitespace-nowrap">
                Sin pago
              </span>
            ) : (
              <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-0.5 whitespace-nowrap">
                Confirmado
              </span>
            )}
            {r.totalPrecio > 0 && (
              <p className="text-sm font-bold text-green-400 flex items-center gap-0.5">
                <DollarSign size={12} />{Number(r.totalPrecio).toLocaleString('es-AR')}
              </p>
            )}
            {r._estado === 'confirmado' && onCancelar && (
              <button
                onClick={() => onCancelar(r._id)}
                disabled={cancelando === r._id}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors mt-1 disabled:opacity-50"
              >
                <Trash2 size={11} />
                {cancelando === r._id ? 'Cancelando...' : 'Cancelar'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Turnos (default) ──
  return (
    <div className={`rounded-xl border p-3.5 ${isPending ? 'bg-yellow-500/5 border-yellow-500/25' : 'bg-green-500/5 border-green-500/25'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white flex items-center gap-1.5">
            <User size={13} className={isPending ? 'text-yellow-400' : 'text-green-400'} />
            {r.nombre || 'Sin nombre'}
          </p>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Clock size={10} />
            {r.hora}{r.horaFin ? ` — ${r.horaFin}` : ''}
          </p>
          {r.telefono && (
            <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
              <Phone size={10} />{r.telefono}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {isPending ? (
            <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-0.5 whitespace-nowrap">
              Sin pago
            </span>
          ) : (
            <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2 py-0.5 whitespace-nowrap">
              Confirmado
            </span>
          )}
          {r.totalPrecio > 0 && (
            <p className="text-sm font-bold text-green-400 flex items-center gap-0.5">
              <DollarSign size={12} />{Number(r.totalPrecio).toLocaleString('es-AR')}
            </p>
          )}
          {r._estado === 'confirmado' && onCancelar && (
            <button
              onClick={() => onCancelar(r._id)}
              disabled={cancelando === r._id}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors mt-1 disabled:opacity-50"
            >
              <Trash2 size={11} />
              {cancelando === r._id ? 'Cancelando...' : 'Cancelar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AgendaPage() {
  const hoy = isoHoy();
  const ahora = new Date();

  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [calYear,      setCalYear]      = useState(ahora.getFullYear());
  const [calMonth,     setCalMonth]     = useState(ahora.getMonth());
  const [selectedDate, setSelectedDate] = useState(hoy);
  const [cancelando, setCancelando] = useState(null); // id del turno que se está cancelando

  const cancelarTurno = async (turnoId) => {
    if (!window.confirm('¿Cancelar este turno? Esta acción no se puede deshacer.')) return;
    setCancelando(turnoId);
    try {
      await api.delete(`/turnos/${turnoId}`);
      toast.success('Turno cancelado');
      await fetchAgenda(); // recargar
    } catch {
      toast.error('Error al cancelar el turno');
    } finally {
      setCancelando(null);
    }
  };

  const fetchAgenda = async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get('/bot/agenda');
      setData(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar la agenda');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAgenda(); }, []);

  const tipoNegocio = data?.tipoNegocio || 'turnos';
  const confirmadas = data?.confirmadas || [];
  const pendientes  = data?.pendientes  || [];
  const logs        = data?.logs        || [];

  // ── Construir mapa fecha → eventos ──
  const eventsByDate = useMemo(() => {
    const map = {};
    const add = (dateStr, event) => {
      if (!dateStr) return;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(event);
    };

    confirmadas.forEach(r => add(r.fecha, { ...r, _estado: 'confirmado' }));
    pendientes.forEach(r  => add(r.fecha, { ...r, _estado: 'pendiente'  }));

    // Alojamiento: también marcar días de estadía en el calendario
    if (tipoNegocio === 'alojamiento') {
      [...confirmadas, ...pendientes].forEach(r => {
        if (!r.fecha || !r.horaFin) return;
        const ini = new Date(r.fecha + 'T00:00:00');
        const fin = new Date(r.horaFin + 'T00:00:00');
        for (let d = new Date(ini); d < fin; d.setDate(d.getDate() + 1)) {
          const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (ds === r.fecha) continue; // ya está agregado
          // Solo marcar con dot, no duplicar la tarjeta
          if (!map[ds]) map[ds] = [];
          const yaEsta = map[ds].some(e => e._id === r._id);
          if (!yaEsta) map[ds].push({ ...r, _estado: r._estado || 'confirmado', _soloMarca: true });
        }
      });
    }

    return map;
  }, [confirmadas, pendientes, tipoNegocio]);

  // Eventos del día seleccionado (sin los que son solo marca visual)
  const selectedEvents = (eventsByDate[selectedDate] || []).filter(e => !e._soloMarca);

  // Stats
  const totalHoy     = (eventsByDate[hoy] || []).filter(e => !e._soloMarca).length;
  const totalProximas = confirmadas.filter(r => (r.fecha || '') >= hoy).length;
  const totalPendientes = pendientes.length;

  // Navegación de mes
  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };
  const irHoy = () => {
    setCalYear(ahora.getFullYear());
    setCalMonth(ahora.getMonth());
    setSelectedDate(hoy);
  };

  const labelTipo =
    tipoNegocio === 'alojamiento' ? 'Reservas y check-ins' :
    tipoNegocio === 'servicios'   ? 'Servicios programados' :
                                    'Turnos y citas';

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <CalendarDays size={22} className="text-green-400" />
              Agenda
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">{labelTipo}</p>
          </div>
          <button onClick={fetchAgenda} disabled={loading}
            className="btn-secondary text-xs flex items-center gap-1.5">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        {loading && <Spinner />}
        {!loading && error && (
          <div className="card border-red-500/20 bg-red-500/5 text-red-400 text-sm py-4 text-center">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* ── Stats ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="card py-4 text-center">
                <p className="text-2xl font-bold text-green-400">{totalHoy}</p>
                <p className="text-xs font-medium text-white mt-0.5">Hoy</p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {tipoNegocio === 'alojamiento' ? 'check-ins' : 'citas'}
                </p>
              </div>
              <div className="card py-4 text-center">
                <p className="text-2xl font-bold text-blue-400">{totalProximas}</p>
                <p className="text-xs font-medium text-white mt-0.5">Próximas</p>
                <p className="text-[10px] text-gray-600 mt-0.5">confirmadas</p>
              </div>
              <div className="card py-4 text-center">
                <p className={`text-2xl font-bold ${totalPendientes > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                  {totalPendientes}
                </p>
                <p className="text-xs font-medium text-white mt-0.5">Por cobrar</p>
                <p className="text-[10px] text-gray-600 mt-0.5">pendientes pago</p>
              </div>
            </div>

            {/* ── Calendario ── */}
            <div className="card">
              {/* Cabecera del mes */}
              <div className="flex items-center justify-between mb-5">
                <button onClick={prevMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700/60 text-gray-400 hover:text-white transition-colors">
                  <ChevronLeft size={18} />
                </button>

                <div className="text-center">
                  <h2 className="text-base font-semibold text-white">
                    {MESES[calMonth]} {calYear}
                  </h2>
                  {(calMonth !== ahora.getMonth() || calYear !== ahora.getFullYear()) && (
                    <button onClick={irHoy}
                      className="text-[11px] text-green-400 hover:text-green-300 mt-0.5 transition-colors">
                      Ir a hoy
                    </button>
                  )}
                </div>

                <button onClick={nextMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700/60 text-gray-400 hover:text-white transition-colors">
                  <ChevronRight size={18} />
                </button>
              </div>

              <CalendarGrid
                year={calYear}
                month={calMonth}
                eventsByDate={eventsByDate}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                tipoNegocio={tipoNegocio}
              />

              {/* Leyenda */}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-800/60">
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-green-400" /> Confirmado
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" /> Sin pago
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Hoy
                </span>
              </div>
            </div>

            {/* ── Panel del día seleccionado ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white capitalize flex items-center gap-2">
                  {formatDiaLargo(selectedDate)}
                  {selectedDate === hoy && (
                    <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                      Hoy
                    </span>
                  )}
                </h3>
                {selectedEvents.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {selectedEvents.length} {selectedEvents.length === 1 ? 'evento' : 'eventos'}
                  </span>
                )}
              </div>

              {selectedEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/30 text-center py-10">
                  <CalendarDays size={28} className="text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-600 text-sm">Sin eventos este día</p>
                  <p className="text-gray-700 text-xs mt-1">
                    El bot agenda automáticamente cuando los clientes confirman
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((r, i) => (
                    <EventCard key={r._id || i} r={r} tipoNegocio={tipoNegocio} onCancelar={cancelarTurno} cancelando={cancelando} />
                  ))}
                </div>
              )}
            </div>

            {/* ── Actividad reciente ── */}
            {logs.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Clock size={14} className="text-gray-500" />
                  Actividad reciente
                  <span className="ml-auto text-xs text-gray-600">{logs.length} registros</span>
                </h3>
                <div>
                  {logs.slice(0, 10).map((l, i) => {
                    const tipo    = l.tipo || l.type || '';
                    const isPago  = tipo === 'bot_payment';
                    const isRes   = tipo === 'bot_reservation';
                    const dotCls  = isPago ? 'bg-green-400' : isRes ? 'bg-blue-400' : 'bg-gray-700';
                    const hora    = l.ts ? String(l.ts).slice(11, 16) : '';
                    const msg     = l.mensaje || l.message || l.msg || '';
                    return (
                      <div key={l._id || i}
                        className="flex items-start gap-3 py-2.5 border-b border-gray-800/50 last:border-0">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotCls}`} />
                        <p className="flex-1 min-w-0 text-xs text-gray-400 leading-relaxed">{msg}</p>
                        {hora && (
                          <span className="text-[10px] text-gray-600 flex-shrink-0 font-mono">{hora}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
