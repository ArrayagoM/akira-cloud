import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { CalendarDays, Clock, DollarSign, Phone, User, RefreshCw } from 'lucide-react';

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <span className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ReservationCard({ reserva }) {
  const fecha  = reserva.fecha  || reserva.date  || '—';
  const hora   = reserva.hora   || reserva.time  || '—';
  const nombre = reserva.nombre || reserva.name  || 'Sin nombre';
  const total  = reserva.total  != null ? reserva.total : reserva.precio ?? '—';
  const chatId = reserva.chatId || reserva.telefono || reserva.phone || '—';

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <User size={16} className="text-green-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{nombre}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <CalendarDays size={11} /> {fecha}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock size={11} /> {hora}
            </span>
            {chatId !== '—' && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Phone size={11} /> {chatId}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {total !== '—' && (
          <span className="flex items-center gap-1 text-sm font-bold text-green-400">
            <DollarSign size={13} />
            {typeof total === 'number' ? total.toLocaleString('es-AR') : total}
          </span>
        )}
        <span className="badge-yellow text-xs">pendiente</span>
      </div>
    </div>
  );
}

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
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 leading-relaxed">{mensaje}</p>
      </div>
      {ts && (
        <span className="text-xs text-gray-600 flex-shrink-0">{typeof ts === 'string' ? ts.slice(0, 16).replace('T', ' ') : ts}</span>
      )}
    </div>
  );
}

export default function AgendaPage() {
  const [pendientes, setPendientes] = useState([]);
  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const fetchAgenda = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get('/bot/agenda');
      setPendientes(Array.isArray(r.data.pendientes) ? r.data.pendientes : []);
      setLogs(Array.isArray(r.data.logs) ? r.data.logs : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar la agenda');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgenda();
  }, []);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <CalendarDays size={24} className="text-green-400" />
              Mi Agenda
            </h1>
            <p className="text-gray-500 text-sm mt-1">Turnos pendientes y actividad reciente del bot.</p>
          </div>
          <button onClick={fetchAgenda} disabled={loading} className="btn-secondary text-xs flex items-center gap-1.5">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {loading && <Spinner />}

        {!loading && error && (
          <div className="card border-red-500/20 bg-red-500/5 text-red-400 text-sm py-4 text-center">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Turnos pendientes */}
            <div className="card">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <CalendarDays size={16} className="text-yellow-400" />
                Turnos pendientes de pago
                {pendientes.length > 0 && (
                  <span className="ml-auto badge-yellow text-xs">{pendientes.length}</span>
                )}
              </h2>

              {pendientes.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-sm">
                  No hay turnos pendientes
                </div>
              ) : (
                <div className="space-y-3">
                  {pendientes.map((r, idx) => (
                    <ReservationCard key={r._id || idx} reserva={r} />
                  ))}
                </div>
              )}
            </div>

            {/* Actividad reciente */}
            <div className="card">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Clock size={16} className="text-blue-400" />
                Actividad reciente
                {logs.length > 0 && (
                  <span className="ml-auto text-xs text-gray-500">{logs.length} registros</span>
                )}
              </h2>

              {logs.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-sm">
                  Sin actividad registrada
                </div>
              ) : (
                <div>
                  {logs.map((log, idx) => (
                    <LogRow key={log._id || idx} log={log} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
