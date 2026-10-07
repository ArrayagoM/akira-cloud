import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import ImportarAsistente from '../components/ImportarAsistente';
import DifusionModal from '../components/DifusionModal';
import ProgramasPanel from '../components/ProgramasPanel';
import { Link } from 'react-router-dom';
import { bajarArchivo } from '../utils/archivos';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Users, Search, Calendar, Phone, Loader2, ChevronLeft, ChevronRight,
  X, Star, Tag, MessageCircle, Clock, TrendingUp, DollarSign,
  Bell, Save, Edit3, Plus, AlertTriangle, Sparkles, Upload, Download, HandCoins, FileText, Send, Cake, Gift,
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
// "25/10" → "10-25" (o '' si está vacío / null si no es válido)
function aMMDD(txt) {
  const t = String(txt || '').trim();
  if (!t) return '';
  const m = /^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})$/.exec(t);
  if (!m) return null;
  const d = parseInt(m[1], 10); const mes = parseInt(m[2], 10);
  return mes >= 1 && mes <= 12 && d >= 1 && d <= 31 ? `${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}

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
function ClienteDetalle({ cliente, onClose, onSave, onDelete }) {
  const [detalle, setDetalle]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [notas, setNotas]       = useState(cliente.notas || '');
  const [etiquetas, setEtiquetas] = useState(cliente.etiquetas || []);
  const [intervalo, setIntervalo] = useState(cliente.intervaloRecordatorioDias || '');
  const [cumple, setCumple]       = useState(cliente.cumple ? cliente.cumple.split('-').reverse().join('/') : ''); // se muestra DD/MM
  const [nuevaTag, setNuevaTag]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [fichaVersion, setFichaVersion] = useState(0);

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

  const marcarAusente = async (t) => {
    try {
      await api.patch(`/turnos/${t._id}`, { ausente: !t.ausente });
      setDetalle((d) => ({ ...d, turnos: d.turnos.map((x) => (x._id === t._id ? { ...x, ausente: !t.ausente } : x)) }));
      setFichaVersion((v) => v + 1);
    } catch (e) { toast.error(e?.response?.data?.error || 'No se pudo marcar'); }
  };

  const eliminar = async () => {
    if (!confirm(`¿Eliminar a ${cliente.nombre || 'este cliente'} del sistema? Esto borra su historial y no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/bot/clientes/${encodeURIComponent(cliente.jid)}`);
      toast.success('Cliente eliminado');
      onDelete?.(cliente._id);
      onClose();
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const guardar = async () => {
    const mmdd = aMMDD(cumple);
    if (mmdd === null) { toast.error('El cumpleaños no es válido (ejemplo: 25/10)'); return; }
    setSaving(true);
    try {
      const r = await api.patch(`/bot/clientes/${encodeURIComponent(cliente.jid)}/notas`, {
        notas: notas.trim(),
        etiquetas,
        intervaloRecordatorioDias: intervalo ? parseInt(intervalo) : null,
        cumple: mmdd,
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

              {/* Ficha 360: deuda, próximo turno y documentos */}
              <FichaExtra key={fichaVersion} jid={cliente.jid} />

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

              {/* Cumpleaños (para saludarlo, con tu confirmación) */}
              <section>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mb-2">
                  <Cake size={12} /> Cumpleaños
                  <span className="text-[10px] text-gray-600 font-normal ml-auto">día/mes</span>
                </label>
                <input value={cumple} onChange={e => setCumple(e.target.value)} placeholder="Ej: 25/10" maxLength={5} className="input-base w-full text-sm" />
                <p className="text-[10px] text-gray-600 mt-1">Con esto podés saludarlo el día de su cumpleaños desde “Escribir a un grupo” (siempre lo confirmás vos).</p>
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
                          {t.estado === 'confirmado' && f < new Date() && (
                            <button onClick={() => marcarAusente(t)} className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 mr-1.5 transition-colors"
                              style={t.ausente ? { color: '#fca5a5', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)' } : { color: '#9ca3af', border: '1px dashed rgba(255,255,255,0.2)' }}
                              title={t.ausente ? 'Quitar la marca de ausencia' : 'Marcar que el cliente no vino'}>
                              {t.ausente ? 'No vino ✕' : 'No vino'}
                            </button>
                          )}
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

        {/* Footer fijo: guardar + eliminar */}
        <div className="sticky bottom-0 px-5 py-3 space-y-2"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <button onClick={guardar} disabled={saving}
            className="btn-primary w-full text-sm">
            {saving
              ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Guardando...</>
              : <><Save size={14} /> Guardar cambios</>}
          </button>
          <button onClick={eliminar} disabled={deleting}
            className="w-full text-xs py-1.5 rounded-lg transition-colors disabled:opacity-40"
            style={{ color: '#f43f5e', background: 'transparent', border: '1px solid rgba(244,63,94,0.2)' }}>
            {deleting ? 'Eliminando...' : '🗑 Eliminar este cliente'}
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

// ───────────────────────────────────────────────────────
// FICHA 360 — lo que debe, sus documentos y su próximo turno (junto a las notas y etiquetas)
// ───────────────────────────────────────────────────────
function FichaExtra({ jid }) {
  const [f, setF] = useState(null);
  const [canjeando, setCanjeando] = useState(false); // los hooks siempre van antes de cualquier return condicional
  useEffect(() => {
    let vivo = true;
    api.get(`/bot/clientes/${encodeURIComponent(jid)}/ficha`).then((r) => { if (vivo) setF(r.data); }).catch(() => {});
    return () => { vivo = false; };
  }, [jid]);
  if (!f) return null;
  const fecha = (x) => (x ? String(x).slice(0, 10).split('-').reverse().join('/') : '');
  const debe = f.deuda?.saldo > 0.005;
  const faltador = (f.ausencias || 0) >= (f.umbralAusencias || 2);
  const canjear = async () => { setCanjeando(true); try { await api.post('/app/programas/canjear', { jid }); toast.success('Premio anotado como entregado'); const x = await api.get(`/bot/clientes/${encodeURIComponent(jid)}/ficha`); setF(x.data); } catch (e) { toast.error(e?.response?.data?.error || 'No se pudo anotar'); } finally { setCanjeando(false); } };
  const ESTADO_DOC = { nuevo: ['Sin revisar', '#fbbf24'], revisado: ['Revisado', '#9ca3af'], cargado: ['En la Caja', '#00e87b'] };
  return (
    <section className="space-y-3">
      {f.ausencias > 0 && (
        <div className="rounded-lg px-3 py-2 text-xs flex gap-2" style={{ background: faltador ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.08)', color: faltador ? '#fca5a5' : '#fcd34d' }}>
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <p>Faltó a {f.ausencias} {f.ausencias === 1 ? 'turno' : 'turnos'} sin avisar.{faltador ? ' El bot le pide el pago por adelantado antes de confirmarle un turno nuevo (si tenés cobros configurados).' : ''}</p>
        </div>
      )}
      <div className="card" style={{ border: `1px solid ${debe ? 'rgba(251,191,36,0.35)' : 'var(--border)'}` }}>
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-300"><HandCoins size={13} /> Cuenta corriente</p>
          <Link to="/deudores" className="text-[11px] underline" style={{ color: 'var(--accent)' }}>Ver en Deudores</Link>
        </div>
        {debe ? (
          <p className="mt-1.5 text-sm text-white">Debe <strong style={{ color: '#fbbf24' }}>${moneda(f.deuda.saldo)}</strong>{f.deuda.antiguedadDias > 0 ? <span className="text-gray-500"> · hace {f.deuda.antiguedadDias} {f.deuda.antiguedadDias === 1 ? 'día' : 'días'}</span> : null}</p>
        ) : (
          <p className="mt-1.5 text-sm text-gray-500">{f.deuda?.tiene ? 'Está al día, no debe nada.' : 'Sin deudas registradas.'}</p>
        )}
        {f.deuda?.movimientos?.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {f.deuda.movimientos.map((m, i) => (
              <li key={i} className="flex justify-between text-[11px] text-gray-500"><span>{fecha(m.fecha)} · {m.tipo === 'cargo' ? 'Fiado' : 'Pago'}{m.concepto ? ` · ${m.concepto}` : ''}</span><span style={{ color: m.tipo === 'pago' ? '#6ee7b7' : '#fcd34d' }}>{m.tipo === 'pago' ? '−' : '+'}${moneda(m.monto)}</span></li>
            ))}
          </ul>
        )}
      </div>

      {f.fidelidad && (
        <div className="card" style={{ border: `1px solid ${f.fidelidad.premioDisponible ? 'rgba(0,232,123,0.4)' : 'var(--border)'}` }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-300"><Gift size={13} /> Fidelidad</p>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}><div className="h-full rounded-full" style={{ width: `${f.fidelidad.premioDisponible ? 100 : Math.round((f.fidelidad.enCiclo / f.fidelidad.cada) * 100)}%`, background: '#00e87b' }} /></div>
          {f.fidelidad.premioDisponible ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-sm text-white">🎁 Ya tiene su premio: <strong>{f.fidelidad.premio}</strong></p>
              <button className="btn-secondary text-xs shrink-0" onClick={canjear} disabled={canjeando}>{canjeando ? 'Anotando…' : 'Ya se lo entregué'}</button>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-gray-500">{f.fidelidad.enCiclo} de {f.fidelidad.cada} visitas · le faltan {f.fidelidad.faltan} para {f.fidelidad.premio}</p>
          )}
        </div>
      )}

      {f.resenas && (
        <div className="card">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">⭐ Reseñas</p>
          <p className="mt-1.5 text-sm text-white">Promedio <strong style={{ color: f.resenas.promedio >= 4 ? '#6ee7b7' : '#fbbf24' }}>{f.resenas.promedio}/5</strong> <span className="text-gray-500">({f.resenas.cantidad} {f.resenas.cantidad === 1 ? 'opinión' : 'opiniones'})</span></p>
          {f.resenas.ultima.comentario && <p className="text-[11px] text-gray-500 mt-1">Última: “{f.resenas.ultima.comentario}”</p>}
        </div>
      )}

      {f.proximoTurno && (
        <div className="card">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-300"><Calendar size={13} /> Próximo turno</p>
          <p className="mt-1.5 text-sm text-white">{new Date(f.proximoTurno.fechaInicio).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-[11px] text-gray-500">{f.proximoTurno.resumen}{f.proximoTurno.estado === 'pendiente' ? ' · pago pendiente' : ''}</p>
        </div>
      )}

      {f.documentos?.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-300"><FileText size={13} /> Documentos que mandó</p>
            <Link to="/documentos" className="text-[11px] underline" style={{ color: 'var(--accent)' }}>Ver todos</Link>
          </div>
          <ul className="mt-2 space-y-1">
            {f.documentos.map((d) => { const [txt, color] = ESTADO_DOC[d.estado] || ESTADO_DOC.nuevo; return (
              <li key={d._id} className="flex items-center justify-between gap-2 text-[11px]"><span className="text-gray-300 truncate">{d.nombre}{d.monto ? ` · $${moneda(d.monto)}` : ''}</span><span style={{ color }}>{txt}</span></li>
            ); })}
          </ul>
        </div>
      )}
    </section>
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
  const [importando, setImportando] = useState(false);
  const [difundiendo, setDifundiendo] = useState(false);

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

  const handleDelete = (clienteId) => {
    setClientes(prev => prev.filter(c => c._id !== clienteId));
    setTotal(t => Math.max(0, t - 1));
    setSeleccionado(null);
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
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <Sparkles size={12} className="text-[var(--accent)]" />
              <span className="text-xs text-gray-400">{total} contactos</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => setDifundiendo(true)}><Send size={13} /> Escribir a un grupo</button>
              <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => setImportando(true)}><Upload size={13} /> Importar</button>
              <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => bajarArchivo('/gestion/exportar?tipo=clientes&formato=xlsx', 'clientes.xlsx').catch(() => toast.error('No se pudo exportar'))}><Download size={13} /> Exportar</button>
            </div>
          </div>
        </div>

        <ProgramasPanel />

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
          onDelete={handleDelete}
        />
      )}

      {difundiendo && <DifusionModal onClose={() => setDifundiendo(false)} etiquetasSugeridas={[...new Set(clientes.flatMap((c) => c.etiquetas || []))].slice(0, 12)} />}
      {importando && <ImportarAsistente tipoInicial="clientes" tipos={['clientes']} onClose={() => setImportando(false)} onListo={cargar} />}
    </Layout>
  );
}
