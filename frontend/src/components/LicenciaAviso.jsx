import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PauseCircle, WifiOff, LogIn, Laptop } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';

// Solo en la versión de escritorio: avisa cuando la licencia pausa el bot
// (suscripción vencida, equipo desactivado, demasiado tiempo sin conexión)
// o cuando hay un problema que todavía no lo pausó.
const BLOQUEOS = {
  suscripcion_vencida: ['Tu suscripción venció — el bot está en pausa.', 'Renová tu plan y se reactiva solo.', true],
  equipo_revocado: ['Este equipo fue desactivado de tu cuenta — el bot está en pausa.', 'Si fue un error, escribinos desde el soporte.', false],
  sin_conexion_prolongada: ['Hace más de 72 horas que Akira no puede validar tu licencia — el bot está en pausa.', 'Conectá la PC a internet y se reactiva solo.', false],
  sin_licencia_previa: ['Falta validar tu licencia — el bot está en pausa.', 'Conectá la PC a internet e iniciá sesión.', false],
};
const AVISOS = {
  sin_conexion: ['Sin conexión con Akira.', 'El bot sigue funcionando; si pasan 72 horas sin conexión se pausa.'],
  sesion_expirada: ['Tu sesión venció.', 'Cerrá sesión y volvé a ingresar para que el bot siga validando su licencia.'],
};

export default function LicenciaAviso() {
  const { user } = useAuth();
  const { on } = useSocket(user?._id || user?.id);
  const [e, setE] = useState(null);
  const [cambiando, setCambiando] = useState(false);

  const cargar = useCallback(() => api.get('/license/estado').then((r) => setE(r.data)).catch(() => {}), []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 60_000); return () => clearInterval(t); }, [cargar]);
  useEffect(() => { const off = on('licencia:estado', setE); return () => off?.(); }, [on]);

  const usarEsteEquipo = async () => {
    setCambiando(true);
    try { await api.post('/license/reemplazar'); window.location.reload(); } catch { setCambiando(false); cargar(); }
  };

  if (!e) return null;

  // Hay otro equipo activo en la cuenta: se ofrece pasarse a este con un clic.
  if (e.activacion?.codigo === 'LIMITE_DISPOSITIVOS') {
    const otro = e.activacion.dispositivos?.[0]?.nombre;
    return (
      <div className="mb-5 rounded-xl p-4 flex items-center gap-3 flex-wrap"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
        <Laptop size={20} style={{ color: '#f59e0b' }} />
        <div className="flex-1 min-w-[220px] text-sm">
          <p className="font-semibold text-white">Akira ya está activo en otro equipo{otro ? ` (${otro})` : ''}.</p>
          <p style={{ color: 'var(--text2)' }}>Tu plan permite un equipo a la vez. ¿Querés usar este en su lugar? El otro se desactiva.</p>
        </div>
        <button onClick={usarEsteEquipo} disabled={cambiando} className="btn-primary text-sm px-3 py-1.5 rounded-lg disabled:opacity-50">
          {cambiando ? 'Cambiando…' : 'Usar este equipo'}
        </button>
      </div>
    );
  }
  const bloqueo = e.bloqueada ? (BLOQUEOS[e.motivo] || ['El bot está en pausa por un problema de licencia.', '', false]) : null;
  const aviso = !bloqueo && e.aviso ? AVISOS[e.aviso] : null;
  if (!bloqueo && !aviso) return null;

  const [titulo, detalle, renovar] = bloqueo || [...aviso, false];
  const color = bloqueo ? '#f43f5e' : '#f59e0b';
  const Icono = bloqueo ? PauseCircle : e.aviso === 'sesion_expirada' ? LogIn : WifiOff;

  return (
    <div className="mb-5 rounded-xl p-4 flex items-center gap-3 flex-wrap"
      style={{ background: `${color}14`, border: `1px solid ${color}40` }}>
      <Icono size={20} style={{ color }} />
      <div className="flex-1 min-w-[220px] text-sm">
        <p className="font-semibold text-white">{titulo}</p>
        {detalle && <p style={{ color: 'var(--text2)' }}>{detalle}</p>}
      </div>
      {renovar && <Link to="/planes" className="btn-primary text-sm px-3 py-1.5 rounded-lg">Renovar plan</Link>}
    </div>
  );
}
