import { useState, useEffect } from 'react';
import { Smartphone, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Solo en la app de escritorio. Permite que la app de Akira del celular pause/reanude el bot o active el modo
// vacaciones. Es opcional y viene apagado: mientras esté apagado esta PC no consulta nada a la nube. El bot y
// los datos siguen en esta PC; el celular solo manda órdenes mínimas (que vencen a los 10 minutos).
export default function CelularCard() {
  const [activo, setActivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { api.get('/app/avisos/celular').then((r) => setActivo(!!r.data.activo)).catch(() => {}); }, []);
  if (activo === null) return null;

  const cambiar = async () => {
    const nuevo = !activo;
    if (nuevo && !window.confirm('Con esto, la app de Akira en tu celular va a poder: pausar o reanudar el bot y activar o desactivar el modo vacaciones.\n\nNo puede ver tus chats, clientes ni documentos, y solo funciona con tu cuenta. Podés apagarlo cuando quieras.\n\n¿Activar?')) return;
    setGuardando(true);
    try { const r = await api.put('/app/avisos/celular', { activo: nuevo }); setActivo(!!r.data.activo); toast.success(nuevo ? 'Listo: ya podés controlarlo desde la app del celular' : 'Control desde el celular desactivado'); }
    catch { toast.error('No se pudo cambiar'); } finally { setGuardando(false); }
  };

  return (
    <div className="card flex items-center gap-4 flex-wrap">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(125,211,252,0.1)' }}><Smartphone size={18} style={{ color: '#7dd3fc' }} /></div>
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-semibold text-white">Controlar desde la app del celular</p>
        <p className="text-xs" style={{ color: 'var(--text2)' }}>
          {activo ? 'Activado: desde la app de Akira podés pausar/reanudar el bot y activar el modo vacaciones. Lo demás sigue en esta PC.' : 'Opcional. Permite pausar/reanudar el bot y activar el modo vacaciones desde la app de Akira del celular (nada más).'}
        </p>
      </div>
      <button onClick={cambiar} disabled={guardando} aria-pressed={activo} aria-label="Controlar desde la app del celular"
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60" style={{ background: activo ? '#00e87b' : 'rgba(255,255,255,0.15)' }}>
        {guardando ? <Loader2 size={13} className="animate-spin mx-auto text-black" /> : <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: `translateX(${activo ? 24 : 4}px)` }} />}
      </button>
    </div>
  );
}
