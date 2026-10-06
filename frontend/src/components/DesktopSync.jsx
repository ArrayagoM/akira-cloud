import { useEffect, useState, useCallback } from 'react';
import { CloudDownload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';

// Solo en la versión de escritorio: trae a esta PC lo que ya estaba cargado en
// la plataforma (configuración, API keys, clientes, turnos). La primera vez
// corre sola al iniciar sesión; este banner muestra el avance y permite
// repetirla a mano.
export default function DesktopSync() {
  const { user } = useAuth();
  const { on } = useSocket(user?._id || user?.id);
  const [estado, setEstado] = useState({ corriendo: false, ultimo: null, error: null });
  const [progreso, setProgreso] = useState(null);
  const [visible, setVisible] = useState(true);
  const [huboCorrida, setHuboCorrida] = useState(false);

  const cargar = useCallback(() => api.get('/sync/estado').then((r) => setEstado(r.data)).catch(() => {}), []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const offE = on('sync:estado', (e) => {
      setEstado(e);
      if (e.corriendo) setHuboCorrida(true);
      // Terminó una importación automática: recargar para que toda la pantalla
      // (checklist, configuración, clientes) muestre lo que se trajo.
      if (!e.corriendo) { setProgreso(null); if (e.ultimo && huboCorrida) setTimeout(() => window.location.reload(), 1200); }
    });
    const offP = on('sync:progreso', (p) => setProgreso(p));
    return () => { offE?.(); offP?.(); };
  }, [on, huboCorrida]);

  const importar = async () => {
    setEstado((e) => ({ ...e, corriendo: true, error: null }));
    try { await api.post('/sync/importar'); } catch (err) {
      setEstado((e) => ({ ...e, corriendo: false, error: err.response?.data?.error || err.message }));
    }
    cargar();
  };

  // Solo se muestra mientras importa o si falló. Terminada la importación no
  // queda ningún cartel (antes reaparecía en cada pestaña).
  if (!estado.corriendo && !estado.error) return null;
  const r = estado.ultimo;

  return (
    <div className="mb-5 rounded-xl p-4 flex items-center gap-3 flex-wrap"
      style={{ background: 'rgba(0,232,123,0.06)', border: '1px solid rgba(0,232,123,0.18)' }}>
      {estado.corriendo ? <Loader2 size={18} className="animate-spin" style={{ color: '#00e87b' }} />
        : estado.error ? <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
        : r ? <CheckCircle2 size={18} style={{ color: '#00e87b' }} />
        : <CloudDownload size={18} style={{ color: '#00e87b' }} />}
      <div className="flex-1 min-w-[220px] text-sm" style={{ color: 'var(--text2)' }}>
        {estado.corriendo ? <>Importando desde la nube{progreso ? ` — ${progreso.coleccion}: ${progreso.n}` : '…'}</>
          : estado.error ? <>No se pudo importar: {estado.error}</>
          : r ? <>Importado: {r.config?.keys || 0} key(s), {r.clientes?.importados || 0} cliente(s), {r.turnos?.importados || 0} turno(s). Las API keys quedan cifradas en esta PC.</>
          : <>Traé a esta PC tu configuración, API keys, clientes y turnos de Akira Cloud.</>}
      </div>
      <button onClick={importar} disabled={estado.corriendo}
        className="btn-primary text-sm px-3 py-1.5 rounded-lg disabled:opacity-50">
        {r ? 'Volver a importar' : 'Importar desde la nube'}
      </button>
      {r && !estado.corriendo && (
        <button onClick={() => setVisible(false)} className="text-xs" style={{ color: 'var(--muted)' }}>Ocultar</button>
      )}
    </div>
  );
}
