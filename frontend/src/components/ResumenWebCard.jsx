import { useState, useEffect } from 'react';
import { Smartphone, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Solo en la app de escritorio. Interruptor OPCIONAL (apagado por defecto) para ver un resumen
// del negocio desde la web / el celular. Se envían únicamente números agregados.
export default function ResumenWebCard() {
  const [activo, setActivo] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { api.get('/app/resumen-web').then((r) => setActivo(!!r.data.activo)).catch(() => {}); }, []);
  if (activo === null) return null;

  const cambiar = async () => {
    const nuevo = !activo;
    if (nuevo && !window.confirm('Se van a enviar a tu cuenta de Akira SOLO estos números: mensajes de hoy, turnos del día y del mes, ingresos y gastos del mes, lo que te deben, lo que debés, cantidad de clientes y de documentos sin revisar.\n\nNunca se envían nombres, teléfonos, conversaciones ni documentos. Podés desactivarlo cuando quieras y se borra del servidor.\n\n¿Activar?')) return;
    setGuardando(true);
    try {
      const r = await api.put('/app/resumen-web', { activo: nuevo });
      setActivo(!!r.data.activo);
      toast.success(nuevo ? 'Listo: ya podés ver tu resumen entrando a akiracloud.lat' : 'Desactivado: se borró el resumen del servidor');
    } catch { toast.error('No se pudo cambiar'); } finally { setGuardando(false); }
  };

  return (
    <div className="card flex items-center gap-4 flex-wrap">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,232,123,0.1)' }}><Smartphone size={18} style={{ color: '#00e87b' }} /></div>
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-semibold text-white">Ver tu negocio desde el celular</p>
        <p className="text-xs" style={{ color: 'var(--text2)' }}>
          {activo ? 'Activado: entrando a akiracloud.lat ves un resumen (solo números) aunque no estés frente a esta PC.' : 'Opcional. Entrá a akiracloud.lat desde cualquier lado y mirá cómo viene el día. Se envían solo números, nunca datos de tus clientes.'}
        </p>
      </div>
      <button onClick={cambiar} disabled={guardando} aria-pressed={activo} aria-label="Ver mi negocio desde la web"
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60" style={{ background: activo ? '#00e87b' : 'rgba(255,255,255,0.15)' }}>
        {guardando ? <Loader2 size={13} className="animate-spin mx-auto text-black" /> : <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: `translateX(${activo ? 24 : 4}px)` }} />}
      </button>
    </div>
  );
}
