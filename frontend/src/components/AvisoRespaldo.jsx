import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import api from '../services/api';
import { avisoDeRespaldo } from '../lib/avisoRespaldo';

// Solo en la app de escritorio: avisa (sin activar nada) si el respaldo no está configurado, falló o tiene más de 3 días.
// Si la consulta falla no muestra nada. "Recordarme mañana" lo oculta por un día.
const ESCRITORIO = !!import.meta.env.VITE_DESKTOP;
const CLAVE_POSPUESTO = 'akira_aviso_respaldo_hasta';
const DIA_MS = 24 * 60 * 60 * 1000;
const pospuestoHasta = () => { try { return Number(localStorage.getItem(CLAVE_POSPUESTO)) || 0; } catch { return 0; } };

export default function AvisoRespaldo() {
  const [aviso, setAviso] = useState(null);
  const [oculto, setOculto] = useState(() => Date.now() < pospuestoHasta());

  useEffect(() => {
    if (!ESCRITORIO || oculto) return undefined;
    let vivo = true;
    api.get('/app/respaldo')
      .then((r) => { if (vivo) setAviso(avisoDeRespaldo(r.data)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [oculto]);

  if (!ESCRITORIO || oculto || !aviso) return null;

  const luego = () => { try { localStorage.setItem(CLAVE_POSPUESTO, String(Date.now() + DIA_MS)); } catch { /* sin almacenamiento */ } setOculto(true); };

  return (
    <div role="status" className="flex items-center gap-3 flex-wrap rounded-xl px-4 py-3 animate-fade-up"
      style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
      <ShieldAlert size={18} className="shrink-0" style={{ color: '#f59e0b' }} aria-hidden="true" />
      <div className="flex-1 min-w-[220px] text-sm">
        <p className="font-semibold text-white">{aviso.titulo}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{aviso.detalle}</p>
      </div>
      <Link to="/respaldo" className="btn-secondary text-xs flex items-center gap-1 shrink-0">Ir a Respaldo <ArrowRight size={12} /></Link>
      <button onClick={luego} className="text-xs underline shrink-0" style={{ color: 'var(--text2)' }}>Recordarme mañana</button>
    </div>
  );
}
