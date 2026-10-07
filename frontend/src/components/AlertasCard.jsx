import { useState, useEffect } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Solo en la app de escritorio. Si el bot se desconecta no puede avisar por WhatsApp (justamente eso es lo que
// se cayó), así que se avisa por email y, si tenés la app de Akira en el celular, también con una notificación.
// Ambos avisos vienen activados; acá se pueden apagar.
function Interruptor({ activo, cargando, onClick, etiqueta }) {
  return (
    <button onClick={onClick} disabled={cargando} aria-pressed={activo} aria-label={etiqueta}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60" style={{ background: activo ? '#00e87b' : 'rgba(255,255,255,0.15)' }}>
      {cargando ? <Loader2 size={13} className="animate-spin mx-auto text-black" /> : <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: `translateX(${activo ? 24 : 4}px)` }} />}
    </button>
  );
}

export default function AlertasCard() {
  const [prefs, setPrefs] = useState(null);
  const [guardando, setGuardando] = useState(null);

  useEffect(() => { api.get('/auth/alertas').then((r) => setPrefs({ email: r.data.email !== false, push: r.data.push !== false })).catch(() => {}); }, []);
  if (!prefs) return null;

  const cambiar = async (clave, texto) => {
    const nuevo = !prefs[clave];
    setGuardando(clave);
    try {
      const r = await api.put('/auth/alertas', { [clave]: nuevo });
      setPrefs({ email: r.data.email !== false, push: r.data.push !== false });
      toast.success(nuevo ? `Activado: ${texto}` : `Desactivado: ${texto}`);
    } catch { toast.error('No se pudo cambiar'); } finally { setGuardando(null); }
  };

  return (
    <div className="card">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(251,191,36,0.1)' }}><BellRing size={18} style={{ color: '#fbbf24' }} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Avisarme si mi bot se cae</p>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>Si WhatsApp se desconecta o pide vincular de nuevo, el bot no puede avisarte por WhatsApp. Te avisamos por estos medios, y también cuando vuelva.</p>
          <div className="mt-3 space-y-2.5">
            <label className="flex items-center justify-between gap-3 text-sm text-white">Por email
              <Interruptor activo={prefs.email} cargando={guardando === 'email'} onClick={() => cambiar('email', 'avisos por email')} etiqueta="Avisos por email" />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-white">Notificación en el celular <span className="text-[11px] text-gray-500 flex-1 text-right pr-2">(con la app de Akira)</span>
              <Interruptor activo={prefs.push} cargando={guardando === 'push'} onClick={() => cambiar('push', 'notificaciones en el celular')} etiqueta="Notificaciones en el celular" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
