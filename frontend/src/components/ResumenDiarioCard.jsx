import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Loader2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Solo en la app de escritorio. A la hora elegida el bot le escribe al DUEÑO un resumen del día
// (mensajes, turnos, plata, deudas, documentos). Opcional; los datos van de tu PC a tu WhatsApp.
export default function ResumenDiarioCard() {
  const [est, setEst] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);

  useEffect(() => { api.get('/app/avisos').then((r) => setEst(r.data)).catch(() => {}); }, []);
  if (!est) return null;
  const r = est.resumenDiario;

  const guardar = async (cambios, ok) => {
    setGuardando(true);
    try { const x = await api.put('/app/avisos/resumen-diario', cambios); setEst(x.data); if (ok) toast.success(ok); }
    catch (e) { toast.error(e?.response?.data?.error || 'No se pudo guardar'); } finally { setGuardando(false); }
  };
  const probar = async () => {
    setProbando(true);
    try { await api.post('/app/avisos/resumen-diario/probar'); toast.success('Listo: mirá tu WhatsApp'); }
    catch (e) { toast.error(e?.response?.data?.error || 'No se pudo enviar'); } finally { setProbando(false); }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,232,123,0.1)' }}><MessageCircle size={18} style={{ color: '#00e87b' }} /></div>
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold text-white">Resumen del día por WhatsApp</p>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>
            {r.activo
              ? `Todos los días a las ${r.hora} el bot te escribe cómo fue el día: mensajes, turnos, plata, quién te debe y documentos sin revisar.`
              : 'Opcional. A la hora que elijas, el bot te escribe cómo fue el día: mensajes, turnos, plata, quién te debe y documentos sin revisar.'}
          </p>
        </div>
        <button onClick={() => guardar({ activo: !r.activo }, r.activo ? 'Resumen diario desactivado' : 'Resumen diario activado')} disabled={guardando || (!r.activo && !est.celularConfigurado)}
          aria-pressed={r.activo} aria-label="Resumen del día por WhatsApp"
          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50" style={{ background: r.activo ? '#00e87b' : 'rgba(255,255,255,0.15)' }}>
          <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: `translateX(${r.activo ? 24 : 4}px)` }} />
        </button>
      </div>

      {!est.celularConfigurado && (
        <p className="text-xs mt-3" style={{ color: '#fbbf24' }}>Para recibirlo, primero cargá tu celular en <Link to="/config" className="underline">Config → Notificaciones al dueño</Link>.</p>
      )}
      {est.celularConfigurado && (
        <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-white/10">
          <label className="text-xs text-gray-400 flex items-center gap-2">Hora
            <input type="time" value={r.hora} disabled={guardando} onChange={(e) => e.target.value && guardar({ hora: e.target.value })}
              className="rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
          </label>
          <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={probar} disabled={probando || !est.whatsappConectado}>
            {probando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviarme uno de prueba
          </button>
          {!est.whatsappConectado && <span className="text-[11px] text-gray-500">El bot tiene que estar conectado a WhatsApp.</span>}
        </div>
      )}
    </div>
  );
}
