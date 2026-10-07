import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import MovimientoModal from '../components/MovimientoModal';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import {
  FileText, Image as ImageIcon, X, Loader2, CheckCircle2, Trash2, Download,
  Receipt, Inbox, CalendarClock, DollarSign, Wallet,
} from 'lucide-react';

// Bandeja de documentos: PDF e imágenes que los clientes mandan por WhatsApp
// (comprobantes, facturas…). El dueño los revisa acá; el bot nunca confirma un
// turno por una imagen — solo el dueño (o MercadoPago, verificado).

const TIPOS = {
  comprobante:    { label: 'Comprobante',   color: '#00e87b', bg: 'rgba(0,232,123,0.10)' },
  factura:        { label: 'Factura',       color: '#7dd3fc', bg: 'rgba(56,189,248,0.10)' },
  otro:           { label: 'Otro',          color: '#a5b4fc', bg: 'rgba(99,102,241,0.10)' },
  sin_clasificar: { label: 'Sin clasificar', color: '#fbbf24', bg: 'rgba(245,158,11,0.10)' },
};

function tiempoRelativo(fecha) {
  if (!fecha) return '';
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

const pesos = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const kb = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Detalle({ doc, onClose, onCambio }) {
  const [url, setUrl] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [monto, setMonto] = useState(doc.montoManual ?? '');
  const [notas, setNotas] = useState(doc.notas || '');
  const esPdf = doc.mimetype === 'application/pdf';
  const [caja, setCaja] = useState(null); // { categorias } cuando se abre el formulario de Caja

  useEffect(() => {
    let revocar = null; let vivo = true;
    api.get(`/bot/documentos/${doc._id}/archivo`, { responseType: 'blob' })
      .then((r) => { if (!vivo) return; revocar = URL.createObjectURL(r.data); setUrl(revocar); })
      .catch(() => toast.error('No pude abrir el archivo'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; if (revocar) URL.revokeObjectURL(revocar); };
  }, [doc._id]);

  const accion = async (fn, ok) => {
    setOcupado(true);
    try { await fn(); if (ok) toast.success(ok); onCambio(); return true; }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo completar'); return false; }
    finally { setOcupado(false); }
  };

  const confirmar = () => {
    if (!window.confirm('¿Confirmar el turno? Revisá que el comprobante sea real y el monto correcto. Se le avisará al cliente por WhatsApp.')) return;
    accion(() => api.post(`/bot/documentos/${doc._id}/confirmar-turno`), 'Turno confirmado y cliente avisado').then((ok) => ok && onClose());
  };
  const eliminar = () => {
    if (!window.confirm('¿Eliminar este documento? Se borra el archivo de tu PC.')) return;
    accion(() => api.delete(`/bot/documentos/${doc._id}`), 'Documento eliminado').then((ok) => ok && onClose());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{doc.clienteNombre || doc.clienteNumero || 'Cliente'}</h3>
            <p className="text-xs text-gray-500">{doc.nombreOriginal} · {kb(doc.bytes)} · {tiempoRelativo(doc.createdAt)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="rounded-lg overflow-hidden border border-white/10 bg-black/40 flex items-center justify-center" style={{ minHeight: 280 }}>
          {cargando ? <Loader2 className="animate-spin text-gray-500" />
            : !url ? <p className="text-sm text-gray-500 p-6">No se pudo mostrar el archivo.</p>
            : esPdf ? <iframe title="PDF" src={url} className="w-full" style={{ height: '56vh', border: 0 }} />
            : <img src={url} alt={doc.nombreOriginal} className="max-w-full" style={{ maxHeight: '56vh' }} />}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-sm">
          {doc.montoSugerido && doc.montoManual == null ? (
            <div className="rounded-lg border border-white/10 p-2"><p className="text-[11px] text-gray-500">Monto detectado</p><p className="text-white font-semibold">{pesos(doc.montoSugerido)}</p></div>
          ) : null}
          {doc.fechaSugerida ? (
            <div className="rounded-lg border border-white/10 p-2"><p className="text-[11px] text-gray-500">Fecha detectada</p><p className="text-white font-semibold">{doc.fechaSugerida}</p></div>
          ) : null}
          {doc.turnoId ? (
            <div className="rounded-lg border border-white/10 p-2"><p className="text-[11px] text-gray-500">Turno pendiente</p>
              <p className="text-white font-semibold">{doc.turnoFecha ? new Date(doc.turnoFecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'asociado'}</p></div>
          ) : null}
        </div>
        {!esPdf && !doc.ocrHecho && <p className="text-[11px] text-gray-600 mt-2 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Leyendo el texto de la foto…</p>}
        {!esPdf && doc.ocrHecho && !doc.textoLeido && <p className="text-[11px] text-gray-600 mt-2">No se pudo leer texto en la foto (letra manuscrita o imagen borrosa). Cargá el monto a mano.</p>}

        <div className="grid sm:grid-cols-[160px_1fr_auto] gap-2 mt-4 items-end">
          <label className="text-xs text-gray-500">Monto ($)
            <input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={doc.montoSugerido ? String(doc.montoSugerido) : '0'}
              className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
          </label>
          <label className="text-xs text-gray-500">Nota
            <input type="text" maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: seña del turno del viernes"
              className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
          </label>
          <button disabled={ocupado} onClick={() => accion(() => api.put(`/bot/documentos/${doc._id}`, { monto: monto === '' ? null : Number(monto), notas }), 'Guardado')} className="btn-secondary text-sm">Guardar</button>
        </div>

        {doc.textoLeido ? (
          <details className="mt-3">
            <summary className="text-xs text-gray-500 cursor-pointer">Texto leído de la imagen</summary>
            <pre className="mt-2 text-[11px] text-gray-400 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-2 max-h-40 overflow-y-auto">{doc.textoLeido}</pre>
          </details>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="text-xs text-gray-500">Tipo:</span>
          {Object.entries(TIPOS).filter(([k]) => k !== 'sin_clasificar').map(([k, t]) => (
            <button key={k} disabled={ocupado}
              onClick={() => accion(() => api.put(`/bot/documentos/${doc._id}`, { tipo: k }))}
              className="text-xs px-2.5 py-1 rounded-full border transition"
              style={doc.tipo === k ? { color: t.color, background: t.bg, borderColor: t.color } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {doc.turnoId && doc.estado === 'nuevo' && (
            <button onClick={confirmar} disabled={ocupado} className="btn-primary text-sm flex items-center gap-1.5">
              <CheckCircle2 size={15} /> Confirmar turno
            </button>
          )}
          <button disabled={ocupado} className="btn-secondary text-sm flex items-center gap-1.5"
            onClick={async () => { try { const r = await api.get('/caja'); setCaja({ categorias: r.data.categorias }); } catch { setCaja({ categorias: { gasto: [], ingreso: [] } }); } }}>
            <Wallet size={14} /> Registrar en Caja
          </button>
          {doc.estado === 'nuevo' && (
            <button onClick={() => accion(() => api.put(`/bot/documentos/${doc._id}`, { estado: 'revisado' }), 'Marcado como revisado').then((ok) => ok && onClose())} disabled={ocupado} className="btn-secondary text-sm">
              Marcar revisado
            </button>
          )}
          {url && (
            <a href={url} download={doc.nombreOriginal} className="btn-secondary text-sm flex items-center gap-1.5"><Download size={14} /> Guardar copia</a>
          )}
          <button onClick={eliminar} disabled={ocupado} className="text-sm px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 flex items-center gap-1.5 ml-auto">
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      </div>
      {caja && (
        <MovimientoModal
          titulo="Registrar en la Caja"
          categorias={caja.categorias}
          inicial={{
            tipo: doc.tipo === 'factura' ? 'gasto' : 'ingreso',
            monto: doc.montoManual ?? doc.montoSugerido ?? '',
            fecha: doc.fechaSugerida || undefined,
            metodo: doc.tipo === 'comprobante' ? 'transferencia' : 'efectivo',
            cliente: doc.clienteNombre || '',
            descripcion: doc.notas || (doc.tipo === 'factura' ? 'Factura' : `Comprobante de ${doc.clienteNombre || 'cliente'}`),
            documentoId: doc._id,
          }}
          onClose={() => setCaja(null)}
          onGuardado={() => { onCambio(); onClose(); }}
        />
      )}
    </div>
  );
}

export default function DocumentosPage() {
  const { user } = useAuth();
  const { on } = useSocket(user?._id);
  const [docs, setDocs] = useState([]);
  const [nuevos, setNuevos] = useState(0);
  const [filtro, setFiltro] = useState('nuevo');
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get(`/bot/documentos${filtro === 'nuevo' ? '?estado=nuevo' : ''}`);
      const lista = r.data.documentos || [];
      setDocs(lista);
      setAbierto((a) => (a ? (lista.find((x) => x._id === a._id) || a) : a));
      setNuevos(r.data.nuevos || 0);
    } catch { /* se reintenta solo */ }
    finally { setCargando(false); }
  }, [filtro]);

  useEffect(() => { setCargando(true); cargar(); }, [cargar]);
  useEffect(() => {
    const iv = setInterval(cargar, 20000);
    const off = on('documento:nuevo', () => { cargar(); toast('📎 Llegó un documento nuevo'); });
    const off2 = on('documento:actualizado', () => cargar());
    return () => { clearInterval(iv); off && off(); off2 && off2(); };
  }, [on, cargar]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Documentos</h1>
          <p className="text-sm text-gray-500">Comprobantes, facturas y archivos que te mandan tus clientes por WhatsApp. Quedan guardados solo en tu PC.</p>
        </div>

        <div className="flex gap-2">
          {[['nuevo', `Por revisar${nuevos ? ` (${nuevos})` : ''}`], ['todos', 'Todos']].map(([id, label]) => (
            <button key={id} onClick={() => setFiltro(id)}
              className="text-sm px-3.5 py-1.5 rounded-full border transition"
              style={filtro === id ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>
              {label}
            </button>
          ))}
        </div>

        {cargando ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div>
        ) : docs.length === 0 ? (
          <div className="card text-center py-14">
            <Inbox className="mx-auto text-gray-600 mb-3" size={36} />
            <p className="text-white font-medium">{filtro === 'nuevo' ? 'No hay documentos por revisar' : 'Todavía no recibiste documentos'}</p>
            <p className="text-sm text-gray-500 mt-1">Cuando un cliente te mande un PDF o una foto por WhatsApp, aparece acá y te avisamos.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => {
              const t = TIPOS[d.tipo] || TIPOS.sin_clasificar;
              const Icono = d.mimetype === 'application/pdf' ? FileText : ImageIcon;
              return (
                <button key={d._id} onClick={() => setAbierto(d)} className="card w-full text-left flex items-center gap-3 hover:border-[var(--accent)]/30 transition">
                  <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: t.bg, color: t.color }}>
                    {d.tipo === 'comprobante' ? <Receipt size={18} /> : <Icono size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium truncate">{d.clienteNombre || d.clienteNumero || 'Cliente'}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ color: t.color, background: t.bg }}>{t.label}</span>
                      {d.estado === 'nuevo' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white">Nuevo</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{d.nombreOriginal} · {tiempoRelativo(d.createdAt)}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs space-y-0.5">
                    {(d.montoManual ?? d.montoSugerido) ? <p className="text-white flex items-center gap-1 justify-end"><DollarSign size={11} />{pesos(d.montoManual ?? d.montoSugerido)}</p> : null}
                    {d.turnoId && d.estado === 'nuevo' ? <p className="text-amber-400 flex items-center gap-1 justify-end"><CalendarClock size={11} /> turno pendiente</p> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {abierto && <Detalle doc={abierto} onClose={() => setAbierto(null)} onCambio={cargar} />}
    </Layout>
  );
}
