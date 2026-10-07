import { useState, useEffect } from 'react';
import { X, Loader2, Sparkles, CheckCircle2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { pesos } from '../utils/archivos';

// Elegís tu rubro y se precargan servicios (con precios de EJEMPLO que después editás), horarios típicos y el estilo con el
// que habla el bot. Antes de aplicar se ve exactamente qué va a cambiar. Nunca toca tu nombre, tus datos de cobro ni tus claves.
const msg = (e, d) => e?.response?.data?.error || d;

export default function PlantillasRubro({ onClose, onAplicada }) {
  const [rubros, setRubros] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [modo, setModo] = useState('completar');
  const [vista, setVista] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(null);

  useEffect(() => { api.get('/app/plantillas').then((r) => setRubros(r.data.rubros)).catch(() => toast.error('No se pudieron cargar las plantillas')); }, []);

  const ver = async (id, m = modo) => {
    setCargando(true);
    try { const r = await api.post('/app/plantillas/vista-previa', { id, modo: m }); setVista(r.data); setElegido(id); }
    catch (e) { toast.error(msg(e, 'No se pudo preparar la vista previa')); } finally { setCargando(false); }
  };
  const cambiarModo = (m) => { setModo(m); if (elegido) ver(elegido, m); };
  const aplicar = async () => {
    setCargando(true);
    try { const r = await api.post('/app/plantillas/aplicar', { id: elegido, modo, confirmar: true }); setListo(r.data.resumen); onAplicada?.(); }
    catch (e) { toast.error(msg(e, 'No se pudo aplicar')); } finally { setCargando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Sparkles size={18} className="text-[var(--accent)]" /> Empezar con una plantilla de tu rubro</h3>
            <p className="text-xs text-gray-500">Te ahorra cargar todo desde cero. Los precios son de ejemplo: después los editás.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        {listo ? (
          <div className="text-center py-5 space-y-3">
            <CheckCircle2 className="mx-auto text-emerald-400" size={38} />
            <p className="text-white font-semibold">¡Listo! Tu bot ya está configurado para tu rubro</p>
            <ul className="text-sm text-gray-400 space-y-1">{listo.map((l) => <li key={l}>✓ {l}</li>)}</ul>
            <p className="text-xs text-gray-500">Revisá los precios y los horarios en Catálogo y Config para dejarlos como los tuyos.</p>
            <button className="btn-primary text-sm" onClick={onClose}>Cerrar</button>
          </div>
        ) : !elegido ? (
          !rubros ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-500" /></div> : (
            <div className="grid sm:grid-cols-2 gap-2">
              {rubros.map((r) => (
                <button key={r.id} onClick={() => ver(r.id)} disabled={cargando} className="flex items-start gap-3 rounded-xl p-3 text-left border border-white/10 hover:border-[var(--accent)]/40 hover:bg-white/5 transition disabled:opacity-60">
                  <span className="text-2xl leading-none">{r.icono}</span>
                  <div><p className="text-sm font-medium text-white">{r.nombre}</p><p className="text-xs text-gray-500">{r.descripcion}</p></div>
                </button>
              ))}
            </div>
          )
        ) : vista && (
          <div className="space-y-3">
            <button className="text-xs text-gray-400 hover:text-white flex items-center gap-1" onClick={() => { setElegido(null); setVista(null); }}><ArrowLeft size={13} /> Elegir otro rubro</button>
            <p className="text-white font-semibold">{vista.icono} {vista.nombre}</p>

            {vista.yaTieneServicios && (
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2 text-gray-300 cursor-pointer"><input type="radio" checked={modo === 'completar'} onChange={() => cambiarModo('completar')} /> Completar solo lo que falta</label>
                <label className="flex items-center gap-2 text-gray-300 cursor-pointer"><input type="radio" checked={modo === 'reemplazar'} onChange={() => cambiarModo('reemplazar')} /> Reemplazar mis servicios y horarios</label>
              </div>
            )}

            {!vista.hayCambios ? (
              <p className="text-sm text-gray-400 py-3">Ya tenés todo cargado, así que no hay nada para completar. Si querés empezar de cero con esta plantilla, elegí “Reemplazar”.</p>
            ) : (<>
              <div className="rounded-lg border border-white/10 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-300">Esto es lo que se va a cargar:</p>
                <ul className="text-xs text-gray-400 space-y-0.5">{vista.resumen.map((l) => <li key={l}>✓ {l}</li>)}</ul>
              </div>
              {vista.servicios.length > 0 && (
                <div className="rounded-lg border border-white/10 max-h-44 overflow-auto">
                  <table className="w-full text-xs"><tbody>
                    {vista.servicios.map((s) => <tr key={s.nombre} className="border-b border-white/5 last:border-0"><td className="px-3 py-1.5 text-white">{s.nombre}</td><td className="px-3 py-1.5 text-gray-400">{s.duracion} min</td><td className="px-3 py-1.5 text-right text-gray-300">{s.precio > 0 ? pesos(s.precio) : 'gratis'}</td></tr>)}
                  </tbody></table>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-300 mb-1">Así va a hablar tu bot:</p>
                <p className="text-xs text-gray-400 rounded-lg p-2.5 italic" style={{ background: 'rgba(255,255,255,0.04)' }}>{vista.estilo}</p>
              </div>
              <p className="text-[11px] text-gray-500">No se toca el nombre de tu negocio, tus datos de cobro (alias, CBU, MercadoPago), tus claves ni tu celular de avisos.</p>
            </>)}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-secondary text-sm" onClick={onClose}>Cancelar</button>
              <button className="btn-primary text-sm flex items-center gap-1.5" disabled={cargando || !vista.hayCambios} onClick={aplicar}>{cargando && <Loader2 size={14} className="animate-spin" />} Aplicar plantilla</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
