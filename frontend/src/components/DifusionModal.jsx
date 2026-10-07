import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Send, Loader2, Users, Cake, Tag, Clock, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Enviar un mensaje a un GRUPO de clientes (reactivar inactivos, cumpleaños, promos por etiqueta).
// Siempre con confirmación: se ve quiénes son y el texto antes de enviar. Envío lento y con tope diario
// para cuidar el número de WhatsApp. Quien responde BAJA no vuelve a recibir mensajes.

const TIPOS = [
  { id: 'inactivos', icon: Clock, titulo: 'Clientes que hace tiempo no vienen', detalle: 'Un mensaje suave para que vuelvan a reservar.' },
  { id: 'cumple-hoy', icon: Cake, titulo: 'Cumpleaños de hoy', detalle: 'Un saludo a quienes cumplen años hoy.' },
  { id: 'cumple-mes', icon: Cake, titulo: 'Cumpleaños de este mes', detalle: 'Saludo a todos los del mes.' },
  { id: 'etiqueta', icon: Tag, titulo: 'Clientes con una etiqueta', detalle: 'Por ejemplo VIP o Frecuente.' },
  { id: 'todos', icon: Users, titulo: 'Todos mis clientes', detalle: 'Úsalo con cuidado: es el que más riesgo tiene de molestar.' },
];
const MOTIVOS = { baja: 'pidieron la baja', silenciado: 'tienen el chat silenciado', bloqueado: 'están bloqueados', 'nunca-hablo': 'nunca escribieron ni vinieron (importados de una planilla)', reciente: 'ya recibieron un mensaje hace menos de 14 días', 'sin-numero': 'no tienen un número de WhatsApp válido' };
const msg = (e, d) => e?.response?.data?.error || d;

export default function DifusionModal({ onClose, etiquetasSugeridas = [] }) {
  const [paso, setPaso] = useState(1);
  const [tipo, setTipo] = useState('inactivos');
  const [dias, setDias] = useState(60);
  const [etiqueta, setEtiqueta] = useState('');
  const [incluirImportados, setIncluirImportados] = useState(false);
  const [vista, setVista] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [excluir, setExcluir] = useState(new Set());
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const timer = useRef(null);

  const criterio = useCallback(() => ({ tipo, dias, etiqueta, incluirImportados }), [tipo, dias, etiqueta, incluirImportados]);

  const verDestinatarios = async () => {
    if (tipo === 'etiqueta' && !etiqueta.trim()) { toast.error('Elegí una etiqueta'); return; }
    setCargando(true);
    try {
      const r = await api.post('/app/difusion/vista-previa', criterio());
      setVista(r.data); setMensaje((m) => m || r.data.plantilla); setExcluir(new Set()); setPaso(2);
    } catch (e) { toast.error(msg(e, 'No se pudo preparar el envío')); } finally { setCargando(false); }
  };

  // al cambiar el criterio estando en la vista previa, se recalcula
  const recalcular = async (cambios) => {
    const c = { ...criterio(), ...cambios };
    setCargando(true);
    try { const r = await api.post('/app/difusion/vista-previa', c); setVista(r.data); setExcluir(new Set()); } catch (e) { toast.error(msg(e, 'No se pudo actualizar')); } finally { setCargando(false); }
  };

  const aEnviar = vista ? vista.elegibles.filter((d) => !excluir.has(d.jid)).length + Math.max(0, vista.total - vista.elegibles.length) : 0;
  const cantidad = Math.min(aEnviar, vista?.disponibleHoy ?? 0);

  const enviar = async () => {
    if (!window.confirm(`Vas a enviar este mensaje a ${cantidad} ${cantidad === 1 ? 'cliente' : 'clientes'}, de a uno y con pausas, desde tu WhatsApp.\n\n¿Confirmás el envío?`)) return;
    setCargando(true);
    try {
      await api.post('/app/difusion/enviar', { ...criterio(), mensaje, excluir: [...excluir], confirmar: true });
      setPaso(3);
    } catch (e) { toast.error(msg(e, 'No se pudo enviar')); } finally { setCargando(false); }
  };

  useEffect(() => {
    if (paso !== 3) return undefined;
    const tick = () => api.get('/app/difusion/estado').then((r) => setProgreso(r.data)).catch(() => {});
    tick(); timer.current = setInterval(tick, 2000);
    return () => clearInterval(timer.current);
  }, [paso]);

  const cancelar = async () => { await api.post('/app/difusion/cancelar').catch(() => {}); };
  const terminado = progreso && !progreso.enCurso && progreso.terminado;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={paso === 3 && !terminado ? undefined : onClose}>
      <div className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Enviar un mensaje a un grupo de clientes</h3>
            <p className="text-xs text-gray-500">Siempre lo revisás y lo confirmás vos antes de que salga.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        {paso === 1 && (
          <div className="space-y-3">
            <div className="grid gap-2">
              {TIPOS.map((t) => { const I = t.icon; const on = tipo === t.id; return (
                <button key={t.id} onClick={() => setTipo(t.id)} className="flex items-start gap-3 rounded-xl p-3 text-left transition"
                  style={{ border: `1px solid ${on ? 'rgba(0,232,123,0.45)' : 'rgba(255,255,255,0.1)'}`, background: on ? 'rgba(0,232,123,0.07)' : 'transparent' }}>
                  <I size={18} className="mt-0.5 shrink-0" style={{ color: on ? '#00e87b' : '#9ca3af' }} />
                  <div><p className="text-sm font-medium text-white">{t.titulo}</p><p className="text-xs text-gray-500">{t.detalle}</p></div>
                </button>
              ); })}
            </div>
            {tipo === 'inactivos' && (
              <label className="flex items-center gap-2 text-sm text-gray-300">Que no vengan hace más de
                <select value={dias} onChange={(e) => setDias(parseInt(e.target.value, 10))} className="rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-white">
                  {[30, 45, 60, 90, 120, 180, 365].map((d) => <option key={d} value={d}>{d} días</option>)}
                </select>
              </label>
            )}
            {tipo === 'etiqueta' && (
              <div className="space-y-2">
                <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Escribí la etiqueta (ej. VIP)" className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none" />
                {etiquetasSugeridas.length > 0 && <div className="flex gap-1.5 flex-wrap">{etiquetasSugeridas.map((t) => <button key={t} onClick={() => setEtiqueta(t)} className="text-[11px] px-2 py-0.5 rounded-full text-gray-400 border border-dashed border-white/20 hover:text-white">{t}</button>)}</div>}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button className="btn-primary text-sm flex items-center gap-1.5" onClick={verDestinatarios} disabled={cargando}>{cargando && <Loader2 size={14} className="animate-spin" />} Ver a quiénes les llegaría</button>
            </div>
          </div>
        )}

        {paso === 2 && vista && (
          <div className="space-y-3">
            {!vista.whatsappConectado && <div className="rounded-lg p-2.5 text-xs flex gap-2" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}><AlertTriangle size={14} className="shrink-0 mt-0.5" /> El bot no está conectado a WhatsApp ahora. Conectalo para poder enviar.</div>}

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full text-emerald-300 bg-emerald-500/10">{vista.total} {vista.total === 1 ? 'cliente puede' : 'clientes pueden'} recibirlo</span>
              {Object.entries(vista.excluidos).map(([k, n]) => <span key={k} className="px-2.5 py-1 rounded-full text-gray-400 bg-white/5">{n} {MOTIVOS[k] || k}</span>)}
            </div>

            {vista.total === 0 ? (
              <p className="text-sm text-gray-400 py-3">No hay clientes para este grupo en este momento. {vista.excluidos['nunca-hablo'] ? 'Podés incluir a los importados que nunca escribieron, pero es más riesgoso.' : ''}</p>
            ) : (<>
              <div className="max-h-40 overflow-auto rounded-lg border border-white/10">
                {vista.elegibles.map((d) => (
                  <label key={d.jid} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 border-b border-white/5 last:border-0 cursor-pointer">
                    <input type="checkbox" checked={!excluir.has(d.jid)} onChange={() => setExcluir((s) => { const n = new Set(s); n.has(d.jid) ? n.delete(d.jid) : n.add(d.jid); return n; })} />
                    <span className="flex-1 truncate">{d.nombre || 'Sin nombre'}</span><span className="text-gray-600">+{d.jid.split('@')[0]}</span>
                  </label>
                ))}
              </div>
              {vista.truncado && <p className="text-[11px] text-gray-500">Se muestran los primeros 100; el resto recibe el mensaje con las mismas reglas.</p>}

              <div>
                <label className="text-xs text-gray-400">Mensaje <span className="text-gray-600">({'{nombre}'} se reemplaza por el primer nombre de cada cliente)</span></label>
                <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={5} maxLength={700} className="w-full mt-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
                <p className="text-[11px] text-gray-500 flex justify-between"><span>Se le agrega solo: “Si no querés recibir más mensajes, respondé BAJA”.</span><span>{mensaje.length}/700</span></p>
              </div>

              <div className="rounded-lg p-2.5 text-xs flex gap-2 text-gray-400" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <ShieldCheck size={14} className="shrink-0 mt-0.5 text-[var(--accent)]" />
                <p>Para cuidar tu número: se envían de a uno, con 12–25 segundos de pausa (unos {vista.minutosEstimados} min en total) y como máximo {vista.tope} por día. Hoy ya enviaste {vista.enviadosHoy}; podés enviar {vista.disponibleHoy} más.</p>
              </div>
            </>)}

            <label className="flex items-start gap-2 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={incluirImportados} onChange={(e) => { setIncluirImportados(e.target.checked); recalcular({ incluirImportados: e.target.checked }); }} />
              Incluir también a clientes importados de una planilla que nunca me escribieron (más riesgo de que lo marquen como spam)
            </label>

            <div className="flex justify-between pt-1">
              <button className="btn-secondary text-sm" onClick={() => setPaso(1)}>Atrás</button>
              <button className="btn-primary text-sm flex items-center gap-1.5" onClick={enviar} disabled={cargando || cantidad === 0 || mensaje.trim().length < 5 || !vista.whatsappConectado}>
                {cargando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar a {cantidad} {cantidad === 1 ? 'cliente' : 'clientes'}
              </button>
            </div>
          </div>
        )}

        {paso === 3 && (
          <div className="py-4 text-center space-y-3">
            {!terminado ? <Loader2 className="animate-spin mx-auto text-[var(--accent)]" /> : <CheckCircle2 className="mx-auto text-emerald-400" size={36} />}
            <p className="text-white font-semibold">{!terminado ? 'Enviando…' : progreso.motivoCorte === 'cancelado' ? 'Envío cancelado' : progreso.motivoCorte === 'sin-conexion' ? 'Se detuvo: el bot perdió la conexión' : 'Listo'}</p>
            {progreso && (<>
              <div className="h-2 rounded-full overflow-hidden mx-auto max-w-sm" style={{ background: 'rgba(255,255,255,0.08)' }}><div className="h-full rounded-full transition-all" style={{ width: `${progreso.total ? Math.round(((progreso.enviados + progreso.fallidos) / progreso.total) * 100) : 0}%`, background: '#00e87b' }} /></div>
              <p className="text-sm text-gray-400">{progreso.enviados} de {progreso.total} enviados{progreso.fallidos ? ` · ${progreso.fallidos} fallaron` : ''}{progreso.motivoCorte === 'tope' ? ` · el resto (${progreso.saltados}) queda para otro día para respetar el tope diario` : ''}</p>
              {!terminado && <p className="text-xs text-gray-500">Podés cerrar esta ventana y seguir usando Akira: el envío continúa, con pausas entre mensajes.</p>}
            </>)}
            <div className="flex justify-center gap-2 pt-1">
              {!terminado && <button className="btn-secondary text-sm" onClick={cancelar}>Cancelar el resto</button>}
              <button className="btn-primary text-sm" onClick={onClose}>{terminado ? 'Cerrar' : 'Seguir en segundo plano'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
