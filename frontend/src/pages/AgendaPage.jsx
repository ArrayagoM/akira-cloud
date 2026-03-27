import { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import {
  CalendarDays, Clock, DollarSign, Phone, User, RefreshCw,
  BedDouble, MapPin, CheckCircle2, AlertCircle, Home,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <span className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function noches(entrada, salida) {
  if (!entrada || !salida) return '—';
  const d = Math.round((new Date(salida) - new Date(entrada)) / 86400000);
  return d > 0 ? d : '—';
}

function formatFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y) return iso;
  return `${d}/${m}/${y}`;
}

// Colores por índice de unidad
const UNIT_COLORS = [
  'text-violet-400 bg-violet-500/10 border-violet-500/20',
  'text-blue-400   bg-blue-500/10   border-blue-500/20',
  'text-cyan-400   bg-cyan-500/10   border-cyan-500/20',
  'text-amber-400  bg-amber-500/10  border-amber-500/20',
  'text-rose-400   bg-rose-500/10   border-rose-500/20',
  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
];
function getUnitColor(unidadNombre, unidades) {
  const idx = unidades.findIndex(u =>
    u.nombre?.toLowerCase() === (unidadNombre || '').toLowerCase()
  );
  return UNIT_COLORS[(idx >= 0 ? idx : 0) % UNIT_COLORS.length];
}

// ─── Componente: tarjeta de turno (modo turnos) ──────────────────────────────
function TurnoCard({ reserva }) {
  const fecha  = reserva.fecha  || '—';
  const hora   = reserva.hora   || '—';
  const nombre = reserva.nombre || 'Sin nombre';
  const total  = reserva.total  != null ? reserva.total : reserva.precio ?? reserva.totalPrecio ?? '—';
  const chatId = reserva.chatId || reserva.telefono || '—';
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <User size={16} className="text-green-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{nombre}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-400"><CalendarDays size={11} />{fecha}</span>
            <span className="flex items-center gap-1 text-xs text-gray-400"><Clock size={11} />{hora}</span>
            {chatId !== '—' && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone size={11} />{chatId}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {total !== '—' && (
          <span className="flex items-center gap-1 text-sm font-bold text-green-400">
            <DollarSign size={13} />{typeof total === 'number' ? total.toLocaleString('es-AR') : total}
          </span>
        )}
        <span className="badge-yellow text-xs">pendiente</span>
      </div>
    </div>
  );
}

// ─── Componente: tarjeta de alojamiento ──────────────────────────────────────
function AlojCard({ r, unidades, estado }) {
  const colorCls  = getUnitColor(r.unidad, unidades);
  const nnochesV  = noches(r.fecha, r.horaFin);
  const telefono  = r.telefono || r.chatId || '';

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-2.5">
      {/* Header: unidad + estado */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {r.unidad && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colorCls}`}>
              <BedDouble size={10} className="inline mr-1" />{r.unidad}
            </span>
          )}
          <span className="text-sm font-semibold text-white flex items-center gap-1.5">
            <User size={13} className="text-gray-500" />{r.nombre || 'Sin nombre'}
          </span>
        </div>
        {estado === 'pendiente' && (
          <span className="flex items-center gap-1 text-xs badge-yellow"><AlertCircle size={10} />pendiente pago</span>
        )}
        {estado === 'confirmada' && (
          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded px-1.5 py-0.5">
            <CheckCircle2 size={10} />confirmada
          </span>
        )}
      </div>

      {/* Fechas */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-gray-900/60 rounded-lg px-2.5 py-1.5">
          <CalendarDays size={12} className="text-indigo-400" />
          <span className="text-xs text-gray-300">
            <span className="text-gray-500">Check-in</span> <span className="font-medium text-white">{formatFecha(r.fecha)}</span>
          </span>
        </div>
        <span className="text-gray-600 text-xs">→</span>
        <div className="flex items-center gap-1.5 bg-gray-900/60 rounded-lg px-2.5 py-1.5">
          <CalendarDays size={12} className="text-pink-400" />
          <span className="text-xs text-gray-300">
            <span className="text-gray-500">Check-out</span> <span className="font-medium text-white">{formatFecha(r.horaFin)}</span>
          </span>
        </div>
        {nnochesV !== '—' && (
          <span className="text-xs text-gray-500 bg-gray-900/60 rounded-lg px-2.5 py-1.5">
            🌙 {nnochesV} {nnochesV === 1 ? 'noche' : 'noches'}
          </span>
        )}
      </div>

      {/* Footer: precio + contacto */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {telefono && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Phone size={10} />{telefono}
            </span>
          )}
          {r.email && (
            <span className="text-xs text-gray-600 truncate max-w-[140px]">{r.email}</span>
          )}
        </div>
        {r.totalPrecio > 0 && (
          <span className="flex items-center gap-1 text-sm font-bold text-green-400">
            <DollarSign size={13} />{Number(r.totalPrecio).toLocaleString('es-AR')} ARS
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Componente: fila de actividad ───────────────────────────────────────────
function LogRow({ log }) {
  const ts      = log.ts      || log.createdAt || '';
  const mensaje = log.mensaje || log.message   || log.msg || '';
  const tipo    = log.tipo    || log.type      || '';
  const badgeColor =
    tipo === 'bot_payment'     ? 'badge-green' :
    tipo === 'bot_reservation' ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5' :
    'badge-gray';
  const tipoLabel =
    tipo === 'bot_payment'     ? 'pago' :
    tipo === 'bot_reservation' ? 'reserva' :
    tipo;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-800 last:border-0">
      <span className={`text-xs flex-shrink-0 mt-0.5 ${badgeColor}`}>{tipoLabel}</span>
      <p className="flex-1 min-w-0 text-xs text-gray-300 leading-relaxed">{mensaje}</p>
      {ts && <span className="text-xs text-gray-600 flex-shrink-0">{String(ts).slice(0, 16).replace('T', ' ')}</span>}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function AgendaPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [filtroUnidad, setFiltroUnidad] = useState('todas');
  const [tab, setTab]         = useState('pendientes'); // 'pendientes' | 'confirmadas' | 'actividad'

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

  const esAlojamiento = data?.tipoNegocio === 'alojamiento';
  const unidades      = data?.unidadesAlojamiento || [];
  const pendientes    = data?.pendientes   || [];
  const confirmadas   = data?.confirmadas  || [];
  const logs          = data?.logs         || [];

  // Filtrar por unidad
  const pendientesFiltrados = useMemo(() =>
    filtroUnidad === 'todas' ? pendientes
      : pendientes.filter(p => (p.unidad || '').toLowerCase().includes(filtroUnidad.toLowerCase())),
    [pendientes, filtroUnidad]
  );
  const confirmadasFiltradas = useMemo(() =>
    filtroUnidad === 'todas' ? confirmadas
      : confirmadas.filter(c => (c.unidad || '').toLowerCase().includes(filtroUnidad.toLowerCase())),
    [confirmadas, filtroUnidad]
  );

  // Próximas reservas: las que tienen check-in >= hoy
  const hoy = new Date().toISOString().slice(0, 10);
  const proximas = confirmadasFiltradas.filter(c => (c.fecha || '') >= hoy);
  const pasadas  = confirmadasFiltradas.filter(c => (c.fecha || '') <  hoy);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              {esAlojamiento
                ? <><Home size={22} className="text-indigo-400" /> Mi Agenda de Alojamiento</>
                : <><CalendarDays size={22} className="text-green-400" /> Mi Agenda</>}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {esAlojamiento
                ? 'Reservas por unidad, check-in / check-out y actividad reciente.'
                : 'Turnos pendientes y actividad reciente del bot.'}
            </p>
          </div>
          <button onClick={fetchAgenda} disabled={loading} className="btn-secondary text-xs flex items-center gap-1.5">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        {loading && <Spinner />}

        {!loading && error && (
          <div className="card border-red-500/20 bg-red-500/5 text-red-400 text-sm py-4 text-center">{error}</div>
        )}

        {/* ══════════════════════════════════════════════════════
            MODO TURNOS — vista original
           ══════════════════════════════════════════════════════ */}
        {!loading && !error && !esAlojamiento && (
          <>
            <div className="card">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <CalendarDays size={16} className="text-yellow-400" />
                Turnos pendientes de pago
                {pendientes.length > 0 && <span className="ml-auto badge-yellow text-xs">{pendientes.length}</span>}
              </h2>
              {pendientes.length === 0
                ? <div className="text-center py-8 text-gray-600 text-sm">No hay turnos pendientes</div>
                : <div className="space-y-3">{pendientes.map((r, i) => <TurnoCard key={i} reserva={r} />)}</div>}
            </div>

            <div className="card">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Clock size={16} className="text-blue-400" /> Actividad reciente
                {logs.length > 0 && <span className="ml-auto text-xs text-gray-500">{logs.length} registros</span>}
              </h2>
              {logs.length === 0
                ? <div className="text-center py-8 text-gray-600 text-sm">Sin actividad registrada</div>
                : <div>{logs.map((l, i) => <LogRow key={l._id || i} log={l} />)}</div>}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════
            MODO ALOJAMIENTO — vista por unidades + rangos
           ══════════════════════════════════════════════════════ */}
        {!loading && !error && esAlojamiento && (
          <>
            {/* Resumen rápido */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Pendientes pago', val: pendientes.length,  color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                { label: 'Próximas',        val: proximas.length,    color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
                { label: 'Pasadas',         val: pasadas.length,     color: 'text-gray-400',  bg: 'bg-gray-500/10'  },
              ].map(s => (
                <div key={s.label} className={`card py-3 flex flex-col items-center gap-1 ${s.bg} border-transparent`}>
                  <span className={`text-2xl font-bold ${s.color}`}>{s.val}</span>
                  <span className="text-xs text-gray-500">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Filtro por unidad */}
            {unidades.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setFiltroUnidad('todas')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    filtroUnidad === 'todas'
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                      : 'border-gray-700 text-gray-500 hover:border-gray-600'
                  }`}
                >
                  Todas las unidades
                </button>
                {unidades.map((u, i) => (
                  <button
                    key={i}
                    onClick={() => setFiltroUnidad(u.nombre)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      filtroUnidad === u.nombre
                        ? `${UNIT_COLORS[i % UNIT_COLORS.length]} border-opacity-40`
                        : 'border-gray-700 text-gray-500 hover:border-gray-600'
                    }`}
                  >
                    <BedDouble size={10} className="inline mr-1" />{u.nombre}
                  </button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-800 gap-1">
              {[
                { key: 'pendientes',  label: `Pendientes pago${pendientesFiltrados.length ? ` (${pendientesFiltrados.length})` : ''}` },
                { key: 'confirmadas', label: `Confirmadas${confirmadasFiltradas.length ? ` (${confirmadasFiltradas.length})` : ''}` },
                { key: 'actividad',   label: 'Actividad' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`text-sm px-4 py-2.5 -mb-px border-b-2 transition-colors ${
                    tab === t.key
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab: Pendientes */}
            {tab === 'pendientes' && (
              <div className="space-y-3">
                {pendientesFiltrados.length === 0
                  ? <div className="card text-center py-10 text-gray-600 text-sm">No hay reservas pendientes de pago</div>
                  : pendientesFiltrados.map((r, i) =>
                      <AlojCard key={i} r={r} unidades={unidades} estado="pendiente" />
                    )}
              </div>
            )}

            {/* Tab: Confirmadas */}
            {tab === 'confirmadas' && (
              <div className="space-y-5">
                {confirmadasFiltradas.length === 0 ? (
                  <div className="card text-center py-10 text-gray-600 text-sm">No hay reservas confirmadas</div>
                ) : (
                  <>
                    {proximas.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5">
                          <CalendarDays size={11} className="text-indigo-400" /> Próximas reservas
                        </p>
                        <div className="space-y-3">
                          {proximas.map((r, i) => <AlojCard key={i} r={r} unidades={unidades} estado="confirmada" />)}
                        </div>
                      </div>
                    )}
                    {pasadas.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5">
                          <Clock size={11} /> Historial
                        </p>
                        <div className="space-y-3 opacity-70">
                          {pasadas.slice(0, 10).map((r, i) => <AlojCard key={i} r={r} unidades={unidades} estado="confirmada" />)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Tab: Actividad */}
            {tab === 'actividad' && (
              <div className="card">
                {logs.length === 0
                  ? <div className="text-center py-8 text-gray-600 text-sm">Sin actividad registrada</div>
                  : <div>{logs.map((l, i) => <LogRow key={l._id || i} log={l} />)}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
