import { useState, useEffect } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Solo en la app de escritorio. Si el bot se desconecta no puede avisar por WhatsApp (justamente eso es lo que
// se cayó), así que se avisa por email. Activado por defecto; acá se puede apagar.
export default function AlertasCard() {
  const [activo, setActivo] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { api.get('/auth/alertas').then((r) => setActivo(r.data.email !== false)).catch(() => {}); }, []);
  if (activo === null) return null;

  const cambiar = async () => {
    const nuevo = !activo;
    setGuardando(true);
    try {
      const r = await api.put('/auth/alertas', { email: nuevo });
      setActivo(r.data.email !== false);
      toast.success(nuevo ? 'Te vamos a avisar por email si tu bot se cae' : 'Alertas por email desactivadas');
    } catch { toast.error('No se pudo cambiar'); } finally { setGuardando(false); }
  };

  return (
    <div className="card flex items-center gap-4 flex-wrap">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(251,191,36,0.1)' }}><BellRing size={18} style={{ color: '#fbbf24' }} /></div>
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-semibold text-white">Avisarme por email si mi bot se cae</p>
        <p className="text-xs" style={{ color: 'var(--text2)' }}>
          {activo
            ? 'Activado: si WhatsApp se desconecta o pide vincular de nuevo, te escribimos a tu email (el bot no puede avisar por WhatsApp si es WhatsApp lo que falló) y también cuando vuelva.'
            : 'Desactivado: no vas a recibir avisos si el bot deja de atender. Te recomendamos dejarlo activado.'}
        </p>
      </div>
      <button onClick={cambiar} disabled={guardando} aria-pressed={activo} aria-label="Avisarme por email si mi bot se cae"
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60" style={{ background: activo ? '#00e87b' : 'rgba(255,255,255,0.15)' }}>
        {guardando ? <Loader2 size={13} className="animate-spin mx-auto text-black" /> : <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: `translateX(${activo ? 24 : 4}px)` }} />}
      </button>
    </div>
  );
}
