import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Users, Search, Calendar, Phone, Loader2, ChevronLeft, ChevronRight,
  X, Star, Tag, MessageCircle, Clock, TrendingUp, DollarSign,
  Bell, Save, Edit3, Plus, AlertTriangle, Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// FILTROS — incluyen los nuevos del CRM
// ─────────────────────────────────────────────────────────────
const FILTROS = [
  { id: '',            label: 'Todos',       icon: Users },
  { id: 'con_turno',   label: 'Con turno',   icon: Calendar },
  { id: 'frecuentes',  label: 'Frecuentes',  icon: TrendingUp },
  { id: 'vip',         label: 'VIP',         icon: Star },
  { id: 'inactivos',   label: 'Inactivos',   icon: Clock },
  { id: 'silenciados', label: 'Silenciados', icon: MessageCircle },
];

// Etiquetas sugeridas (one-click)
const TAGS_SUGERIDAS = ['VIP', 'Frecuente', 'Nuevo', 'Recomendado', 'Alergia', 'Puntual', 'Compra mucho', 'Difícil'];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function tiempoRelativo(fecha) {
  if (!fecha) return '';
  const diff = Date.now() - new Date(fecha).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'ahora';
  if (min < 60)  return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7)     return `hace ${d} d`;
  return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function iniciales(nombre) {
  if (!nombre) return '?';
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

function moneda(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR');
}

// Color de avatar determinístico según el jid
function colorAvatar(seed) {
  const palette = [
    { bg: 'rgba(0,232,123,0.12)',  fg: '#00e87b', br: 'rgba(0,232,123,0.22)' },
    { bg: 'rgba(99,102,241,0.12)', fg: '#a5b4fc', br: 'rgba(99,102,241,0.22)' },
    { bg: 'rgba(244,114,182,0.12)',fg: '#f9a8d4', br: 'rgba(244,114,182,0.22)' },
    { bg: 'rgba(245,158,11,0.12)', fg: '#fbbf24', br: 'rgba(245,158,11,0.22)' },
    { bg: 'rgba(56,189,248,0.12)', fg: '#7dd3fc', br: 'rgba(56,189,248,0.22)' },
  ];
  let h = 0;
  for (const c of (seed || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

// ─────────────────────────────────────────────────────────────
// CARD: cliente en el listado
// ─────────────────────────────────────────────────────────────
function ClienteCard({ cliente, onClick }) {
  const numero = (cliente.numeroReal || cliente.jid?.split('@')[0] || '').replace(/\D/g, '');
  const ultimoTurno = cliente.turnosConfirmados?.slice(-1)[0];
  const totalTurnos = cliente.turnosConfirmados?.length || 0;
  const c = colorAvatar(cliente.jid);

  return (
    <button
      onClick={onClick}
      className="card group relative text-left flex gap-3 transition-all duration-200 hover:border-[var(--accent)]/30"
      style={{ width: '100%' }}>
      {/* Avatar */}
      <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-transform group-hover:scale-105"
        style={{ background: c.bg, color: c.fg, border: `1px solid ${c.br}` }}>
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
            </div>
          </div>
          <span className="text-[10px] text-gray-600 flex-shrink-0 flex items-center gap-1 mt-0.5">
            <Clock size={9} /> {tiempoRelativo(cliente.updatedAt)}
          </span>
        </div>

        {/* Etiquetas */}
        {cliente.etiquetas?.length > 0 && (
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {cliente.etiquetas.slice(0, 4).map((t, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(0,232,123,0.10)', color: '#7df3b6', border: '1px solid rgba(0,232,123,0.18)' }}>
                {t}
              </span>
            ))}
            {cliente.etiquetas.length > 4 && (
              <span className="text-[10px] text-gray-500">+{cliente.etiquetas.length - 4}</span>
            )}
          </div>
        )}

        {/* Stats inline */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {totalTurnos > 0 && (
            <span className="text-[11px] text-indigo-400 flex items-center gap-1">
              <Calendar size={10} /> {totalTurnos} turno{totalTurnos !== 1 ? 's' : ''}
            </span>
          )}
          {ultimoTurno && (
            <span className="text-[11px] text-gray-500">
              último: {ultimoTurno.fecha}
            </span>
          )}
          {cliente.notas?.trim() && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1" title={cliente.notas}>
              <Edit3 size={10} /> con notas
            </span>
          )}
          {cliente.intervaloRecordatorioDias > 0 && (
            <span className="text-[11px] text-cyan-400 flex items-center gap-1">
              <Bell size={10} /> cada {cliente.intervaloRecordatorioDias} d
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// PANEL: detalle del cliente seleccionado (drawer)
// ─────────────────────────────────────────────────────────────
function ClienteDetalle({ cliente, onClose, onSave }) {
  const [detalle, setDetalle]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [notas, setNotas]       = useState(cliente.notas || '');
  const [etiquetas, setEtiquetas] = useState(cliente.etiquetas || []);
  const [intervalo, setIntervalo] = useState(cliente.intervaloRecordatorioDias || '');
  const [nuevaTag, setNuevaTag]   = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    let alive = true;
    api.get(`/bot/clientes/${encodeURIComponent(cliente.jid)}/detalle`)
      .then(r => { if (alive) setDetalle(r.data); })
      .catch(() => { if (alive) toast.error('No se pudo cargar el detalle'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cliente.jid]);

  const agregarTag = (tag) => {
    const t = String(tag).trim();
    if (!t) return;
    if (etiquetas.includes(t)) return;
    if (etiquetas.length >= 12) { toast.error('Máximo 12 etiquetas'); return; }
    setEtiquetas([...etiquetas, t]);
    setNuevaTag('');
  };

  const quitarTag = (t) => setEtiquetas(etiquetas.filter(x => x !== t));

  const guardar = async () => {
    setSaving(true);
    try {
      const r = await api.patch(`/bot/clientes/${encodeURIComponent(cliente.jid)}/notas`, {
        notas: notas.trim(),
        etiquetas,
        intervaloRecordatorioDias: intervalo ? parseInt(intervalo) : null,
      });
      onSave?.(r.data.cliente);
      toast.success('Cliente actualizado');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const numero = (cliente.numeroReal || cliente.jid?.split('@')[0] || '').replace(/\D/g, '');
  const stats  = detalle?.stats || {};
  const c = colorAvatar(cliente.jid);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md h-full overflow-y-auto"
        style={{
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          animation: 'slideInRight 0.25s ease-out both',
        }}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
              style={{ background: c.bg, color: c.fg, border: `1px solid ${c.br}` }}>
              {iniciales(cliente.nombre)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{cliente.nombre || 'Sin nombre'}</p>
              {numero && <p className="text-xs text-gray-500 truncate">+{numero}</p>}
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface3)]">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-5 pb-24">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-gray-500" />
            </div>
          ) : (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="card py-3 text-center">
                  <p className="text-xl font-bold text-white">{stats.totalTurnos || 0}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Turnos</p>
                </div>
                <div className="card py-3 text-center">
                  <p className="text-xl font-bold text-green-400">${moneda(stats.totalGastado)}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Gastado</p>
                </div>
                <div className="card py-3 text-center">
                  <p className={`text-xl font-bold ${stats.diasDesdeUltimoTurno > 30 ? 'text-amber-400' : 'text-white'}`}>
                    {stats.diasDesdeUltimoTurno != null ? `${stats.diasDesdeUltimoTurno}d` : '—'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Sin venir</p>
                </div>
              </div>

              {/* Etiquetas */}
              <section>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mb-2">
                  <Tag size={12} /> Etiquetas
                </label>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {etiquetas.length === 0 && (
                    <p className="text-xs text-gray-600 italic">Sin etiquetas</p>
                  )}
                  {etiquetas.map((t, i) => (
                    <span key={i}
                      className="text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1"
                      style={{ background: 'rgba(0,232,123,0.10)', color: '#7df3b6', border: '1px solid rgba(0,232,123,0.22)' }}>
                      {t}
                      <button onClick={() => quitarTag(t)} className="hover:text-white">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {TAGS_SUGERIDAS.filter(t => !etiquetas.includes(t)).map(t => (
                    <button key={t} onClick={() => agregarTag(t)}
                      className="text-[10px] px-2 py-0.5 rounded-full text-gray-500 transition-colors hover:text-[var(--accent)] hover:bg-[var(--accent-dim)]"
                      style={{ border: '1px dashed var(--border2)' }}>
                      + {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={nuevaTag}
                    onChange={e => setNuevaTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && agregarTag(nuevaTag)}
                    placeholder="Nueva etiqueta…"
                    className="input-base flex-1 text-xs"
                    maxLength={32}
                  />
                  <button onClick={() => agregarTag(nuevaTag)}
                    disabled={!nuevaTag.trim()}
                    className="btn-secondary text-xs disabled:opacity-40">
                    <Plus size={12} />
                  </button>
                </div>
              </section>

              {/* Notas privadas */}
              <section>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mb-2">
                  <Edit3 size={12} /> Notas privadas
                  <span className="text-[10px] text-gray-600 font-normal ml-auto">solo vos las ves</span>
                </label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Ej: Alergia a tinturas con amoníaco. Prefiere turnos a la mañana."
                  className="input-base w-full resize-none text-sm"
                />
                <p className="text-[10px] text-gray-600 mt-1 text-right">{notas.length}/1000</p>
              </section>

              {/* Recordatorio personalizado */}
              <section>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mb-2">
                  <Bell size={12} /> Recordatorio personalizado
                </label>
                <p className="text-[11px] text-gray-500 mb-2">
                  Cada cuántos días el bot le recuerda volver. Si lo dejás vacío, se usa el del servicio que reservó.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={intervalo}
                    onChange={e => setIntervalo(e.target.value)}
                    placeholder="ej: 30"
                    className="input-base text-sm w-32"
                  />
                  <span className="text-xs text-gray-500">días</span>
                </div>
              </section>

              {/* Últimos turnos */}
              {detalle?.turnos?.length > 0 && (
                <section>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mb-2">
                    <Calendar size={12} /> Historial de turnos
                  </p>
                  <div className="space-y-1.5">
                    {detalle.turnos.slice(0, 8).map((t, i) => {
                      const f = new Date(t.fechaInicio);
                      return (
                        <div key={t._id || i}
                          className="flex items-center justify-between px-3 py-2 rounded-lg"
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                          <div className="min-w-0">
                            <p className="text-xs text-white truncate">{t.resumen}</p>
                            <p className="text-[10px] text-gray-500">
                              {f.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {' · '}
                              {f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            t.estado === 'confirmado' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                            t.estado === 'cancelado'  ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                         'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                          }`}>
                            {t.estado}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Últimos mensajes */}
              {detalle?.ultimosMensajes?.length > 0 && (
                <section>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mb-2">
                    <MessageCircle size={12} /> Últimos mensajes
                  </p>
                  <div className="space-y-1.5 rounded-xl p-2"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    {detalle.ultimosMensajes.slice(-6).map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                        <div className="max-w-[80%] px-2.5 py-1.5 rounded-xl text-xs"
                          style={{
                            background: m.role === 'user' ? 'var(--surface3)' : 'rgba(0,232,123,0.10)',
                            color: m.role === 'user' ? 'var(--text2)' : '#cdf5dc',
                            border: m.role === 'user' ? '1px solid var(--border)' : '1px solid rgba(0,232,123,0.18)',
                          }}>
                          {m.content || <span className="italic text-gray-600">[sin texto]</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer fijo: guardar */}
        <div className="sticky bottom-0 px-5 py-3"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <button onClick={guardar} disabled={saving}
            className="btn-primary w-full text-sm">
            {saving
              ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Guardando...</>
              : <><Save size={14} /> Guardar cambios</>}
          </button>
        </div>

        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to   { transform: translateX(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [filtro,   setFiltro]   = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [page,     setPage]     = useState(1);
  const [query,    setQuery]    = useState('');
  const [seleccionado, setSeleccionado] = useState(null);

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
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Error al cargar clientes');
    } finally { setLoading(false); }
  }, [page, filtro, query]);

  useEffect(() => { cargar(); }, [cargar]);

  // Stats globales (calculadas sobre la página actual + total)
  const stats = useMemo(() => {
    const conTurno = clientes.filter(c => c.turnosConfirmados?.length > 0).length;
    const vip      = clientes.filter(c => c.etiquetas?.includes('VIP')).length;
    return { total, conTurno, vip };
  }, [clientes, total]);

  const handleFiltro = (f) => { setFiltro(f); setPage(1); };
  const totalPages = Math.ceil(total / 30);

  const handleSave = (updated) => {
    setClientes(prev => prev.map(c => c._id === updated._id ? { ...c, ...updated } : c));
    setSeleccionado(s => s ? { ...s, ...updated } : null);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5 pb-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <Users size={22} className="text-green-400" />
              Clientes
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Tu CRM: notas, etiquetas, historial y recordatorios.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <Sparkles size={12} className="text-[var(--accent)]" />
            <span className="text-xs text-gray-400">{total} contactos</span>
          </div>
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
          {FILTROS.map(f => {
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                onClick={() => handleFiltro(f.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                style={filtro === f.id
                  ? { background: 'rgba(0,232,123,0.12)', color: 'var(--accent)', border: '1px solid rgba(0,232,123,0.25)' }
                  : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                <Icon size={11} />
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="card text-center py-12">
            <Loader2 size={22} className="animate-spin text-gray-600 mx-auto" />
          </div>
        ) : clientes.length === 0 ? (
          <div className="card text-center py-12 border-dashed border-gray-800 bg-transparent">
            <Users size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-600 text-sm">
              {query || filtro ? 'No hay clientes con esos filtros' : 'Todavía no hay clientes — el bot no recibió mensajes'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {clientes.map(c => (
              <ClienteCard key={c._id} cliente={c} onClick={() => setSeleccionado(c)} />
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

        {/* Tip */}
        <div className="rounded-xl p-3 flex items-start gap-2"
          style={{ background: 'rgba(0,232,123,0.05)', border: '1px solid rgba(0,232,123,0.15)' }}>
          <Sparkles size={14} className="text-[var(--accent)] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-400">
            <strong className="text-white">Tip:</strong> tocá un cliente para ver su historial completo, agregar notas privadas y configurar cada cuántos días querés que el bot le recuerde volver.
          </p>
        </div>
      </div>

      {/* Drawer de detalle */}
      {seleccionado && (
        <ClienteDetalle
          cliente={seleccionado}
          onClose={() => setSeleccionado(null)}
          onSave={handleSave}
        />
      )}
    </Layout>
  );
}
