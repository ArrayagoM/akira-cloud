import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  MessageSquare, Search, Calendar, VolumeX, Volume2,
  ShieldOff, Shield, User, Clock, Phone, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';

const FILTROS = [
  { id: '',            label: 'Todos'        },
  { id: 'con_turno',   label: 'Con turno'    },
  { id: 'silenciados', label: 'Silenciados'  },
  { id: 'bloqueados',  label: 'Bloqueados'   },
];

function tiempoRelativo(fecha) {
  if (!fecha) return '';
  const diff = Date.now() - new Date(fecha).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'ahora';
  if (min < 60)  return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7)     return `hace ${d} días`;
  return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function iniciales(nombre) {
  if (!nombre) return '?';
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

function ChatCard({ cliente: initial, onUpdate }) {
  const [cliente, setCliente] = useState(initial);
  const [loadingSil, setLoadingSil] = useState(false);
  const [loadingBlq, setLoadingBlq] = useState(false);

  const toggleSilenciar = async () => {
    setLoadingSil(true);
    try {
      const r = await api.patch(`/bot/clientes/${encodeURIComponent(cliente.jid)}`, {
        silenciado: !cliente.silenciado,
      });
      const updated = { ...r.data.cliente };
      setCliente(updated);
      onUpdate?.(updated);
      toast.success(updated.silenciado ? '🔇 Bot detenido en este chat' : '🔊 Bot reactivado');
    } catch { toast.error('Error al cambiar estado'); }
    finally { setLoadingSil(false); }
  };

  const toggleBloquear = async () => {
    setLoadingBlq(true);
    try {
      const r = await api.patch(`/bot/clientes/${encodeURIComponent(cliente.jid)}`, {
        bloqueado: !cliente.bloqueado,
      });
      const updated = { ...r.data.cliente };
      setCliente(updated);
      onUpdate?.(updated);
      toast.success(updated.bloqueado ? '🚫 Cliente bloqueado' : '✅ Cliente desbloqueado');
    } catch { toast.error('Error al bloquear'); }
    finally { setLoadingBlq(false); }
  };

  const numero = (cliente.numeroReal || cliente.jid?.split('@')[0] || '').replace(/\D/g, '');
  const ultimoTurno = cliente.turnosConfirmados?.slice(-1)[0];

  return (
    <div className={`card flex gap-3 transition-all duration-200 ${cliente.bloqueado ? 'opacity-60' : ''}`}>
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{
          background: cliente.bloqueado ? 'rgba(244,63,94,0.12)' :
                      cliente.silenciado ? 'rgba(245,158,11,0.12)' : 'rgba(0,232,123,0.1)',
          color: cliente.bloqueado ? '#f43f5e' :
                 cliente.silenciado ? '#f59e0b' : 'var(--accent)',
          border: `1px solid ${cliente.bloqueado ? 'rgba(244,63,94,0.2)' :
                  cliente.silenciado ? 'rgba(245,158,11,0.2)' : 'rgba(0,232,123,0.2)'}`,
        }}>
        {iniciales(cliente.nombre)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {cliente.nombre || 'Sin nombre'}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {numero && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Phone size={10} /> +{numero}
                </span>
              )}
              {ultimoTurno && (
                <span className="text-xs text-indigo-400 flex items-center gap-1">
                  <Calendar size={10} /> {ultimoTurno.fecha} {ultimoTurno.hora}
                </span>
              )}
            </div>
          </div>
          {/* Timestamp */}
          <span className="text-[10px] text-gray-600 flex-shrink-0 flex items-center gap-1 mt-0.5">
            <Clock size={9} /> {tiempoRelativo(cliente.updatedAt)}
          </span>
        </div>

        {/* Badges de estado */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {cliente.silenciado && !cliente.bloqueado && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1">
              <VolumeX size={9} /> Bot detenido
            </span>
          )}
          {cliente.bloqueado && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-1">
              <ShieldOff size={9} /> Bloqueado
            </span>
          )}
          {cliente.turnosConfirmados?.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              {cliente.turnosConfirmados.length} turno{cliente.turnosConfirmados.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 mt-3">
          {/* Silenciar bot en este chat */}
          <button
            onClick={toggleSilenciar}
            disabled={loadingSil || cliente.bloqueado}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-40"
            style={cliente.silenciado
              ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }
              : { background: 'var(--surface3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            {loadingSil
              ? <Loader2 size={11} className="animate-spin" />
              : cliente.silenciado ? <Volume2 size={11} /> : <VolumeX size={11} />}
            {cliente.silenciado ? 'Reactivar bot' : 'Detener bot'}
          </button>

          {/* Bloquear completamente */}
          <button
            onClick={toggleBloquear}
            disabled={loadingBlq}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150"
            style={cliente.bloqueado
              ? { background: 'rgba(244,63,94,0.12)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.2)' }
              : { background: 'var(--surface3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            {loadingBlq
              ? <Loader2 size={11} className="animate-spin" />
              : cliente.bloqueado ? <Shield size={11} /> : <ShieldOff size={11} />}
            {cliente.bloqueado ? 'Desbloquear' : 'Bloquear'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatsPage() {
  const [clientes,   setClientes]   = useState([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [filtro,     setFiltro]     = useState('');
  const [busqueda,   setBusqueda]   = useState('');
  const [page,       setPage]       = useState(1);
  const [query,      setQuery]      = useState('');  // query debounced

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => { setQuery(busqueda); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, filtro });
      if (query) params.set('q', query);
      const r = await api.get(`/bot/clientes?${params}`);
      setClientes(r.data.clientes || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Error al cargar los chats'); }
    finally { setLoading(false); }
  }, [page, filtro, query]);

  useEffect(() => { cargar(); }, [cargar]);

  const handleFiltro = (f) => { setFiltro(f); setPage(1); };

  const totalPages = Math.ceil(total / 30);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <MessageSquare size={22} className="text-green-400" />
            Chats
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Todos los clientes que hablaron con tu bot.
          </p>
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o número..."
            className="input-base pl-8 w-full"
          />
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          {FILTROS.map(f => (
            <button
              key={f.id}
              onClick={() => handleFiltro(f.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
              style={filtro === f.id
                ? { background: 'rgba(0,232,123,0.12)', color: 'var(--accent)', border: '1px solid rgba(0,232,123,0.25)' }
                : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
              {f.label}
            </button>
          ))}
          {total > 0 && (
            <span className="ml-auto text-xs text-gray-600 self-center">{total} chat{total !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="card text-center py-12">
            <Loader2 size={22} className="animate-spin text-gray-600 mx-auto" />
          </div>
        ) : clientes.length === 0 ? (
          <div className="card text-center py-12 border-dashed border-gray-800 bg-transparent">
            <User size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-600 text-sm">
              {query || filtro ? 'No hay chats con esos filtros' : 'Todavía no hay chats — el bot no recibió mensajes'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {clientes.map(c => (
              <ChatCard
                key={c._id}
                cliente={c}
                onUpdate={updated => setClientes(prev => prev.map(x => x._id === updated._id ? { ...x, ...updated } : x))}
              />
            ))}
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <ChevronLeft size={16} className="text-gray-400" />
            </button>
            <span className="text-xs text-gray-500">Página {page} de {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          </div>
        )}

        {/* Leyenda */}
        <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-medium text-gray-400">¿Qué hace cada acción?</p>
          <div className="flex items-start gap-2">
            <VolumeX size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-600"><strong className="text-gray-400">Detener bot</strong> — el bot deja de responder a ese chat. El cliente puede reactivarlo escribiendo <span className="font-mono">akira reactivate</span>.</p>
          </div>
          <div className="flex items-start gap-2">
            <ShieldOff size={11} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-600"><strong className="text-gray-400">Bloquear</strong> — el bot ignora completamente ese número. No procesa ni responde nada.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
