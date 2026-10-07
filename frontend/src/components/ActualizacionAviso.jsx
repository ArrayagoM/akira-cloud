import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Download, RefreshCw, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';

// Solo en la versión de escritorio. Muestra:
//  · mientras se descarga una versión nueva: una barrita de avance;
//  · cuando está lista: "Reiniciar y actualizar ahora" (o se instala sola de madrugada).
// El estado viene del actualizador del programa (main/updater.js).

function useEstadoActualizacion() {
  const { user } = useAuth();
  const { on } = useSocket(user?._id || user?.id);
  const [e, setE] = useState(null);
  const cargar = useCallback(() => api.get('/app/actualizacion').then((r) => setE(r.data)).catch(() => {}), []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 120_000); return () => clearInterval(t); }, [cargar]);
  useEffect(() => { const off = on('app:actualizacion', setE); return () => off?.(); }, [on]);
  return [e, cargar];
}

// Cartel dentro del contenido de la app.
export default function ActualizacionAviso() {
  const [e] = useEstadoActualizacion();
  const [oculto, setOculto] = useState(() => { try { return sessionStorage.getItem('akira_update_oculto'); } catch { return null; } });
  const [reiniciando, setReiniciando] = useState(false);

  if (!e || e.soloEnInstalada) return null;

  const reiniciar = async () => {
    if (!window.confirm('Akira se va a cerrar y volver a abrir en unos segundos. El bot se reconecta solo. ¿Reiniciar ahora?')) return;
    setReiniciando(true);
    try { await api.post('/app/actualizar'); } catch (err) { setReiniciando(false); toast.error(err.response?.data?.error || 'No se pudo reiniciar'); }
  };

  if (e.descargada) {
    if (oculto === String(e.descargada)) return null;
    return (
      <div className="mb-4 rounded-xl border p-3.5 flex flex-wrap items-center gap-3" style={{ borderColor: 'rgba(0,232,123,0.35)', background: 'rgba(0,232,123,0.07)' }}>
        <Sparkles size={18} className="text-[var(--accent)] shrink-0" />
        <div className="min-w-0 flex-1" style={{ minWidth: 220 }}>
          <p className="text-sm font-semibold text-white">Hay una versión nueva de Akira lista ({e.descargada})</p>
          <p className="text-xs text-gray-400">Se instala sola esta madrugada. Si preferís, actualizá ahora: tarda unos segundos y el bot se reconecta solo.</p>
        </div>
        <button className="btn-primary text-sm flex items-center gap-1.5" disabled={reiniciando} onClick={reiniciar}>
          {reiniciando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {reiniciando ? 'Reiniciando…' : 'Reiniciar y actualizar'}
        </button>
        <button className="text-gray-500 hover:text-white" aria-label="Más tarde" title="Más tarde"
          onClick={() => { try { sessionStorage.setItem('akira_update_oculto', String(e.descargada)); } catch { /* sin storage */ } setOculto(String(e.descargada)); }}><X size={16} /></button>
      </div>
    );
  }

  if (e.descargando) {
    return (
      <div className="mb-4 rounded-xl border border-white/10 p-3 flex items-center gap-3 bg-white/[0.03]">
        <Download size={16} className="text-gray-400 shrink-0" />
        <p className="text-xs text-gray-400 flex-1">Descargando la versión {e.disponible} en segundo plano… {e.progreso ? `${e.progreso}%` : ''}</p>
        <div className="w-28 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full" style={{ width: `${e.progreso || 5}%`, background: 'var(--accent)' }} /></div>
      </div>
    );
  }
  return null;
}

// Versión instalada + "Buscar actualizaciones" (va en el menú lateral).
export function VersionApp() {
  const [e, cargar] = useEstadoActualizacion();
  const [buscando, setBuscando] = useState(false);
  if (!e || (!e.versionActual && e.soloEnInstalada)) return null;

  const buscar = async () => {
    setBuscando(true);
    try {
      const r = (await api.post('/app/buscar-actualizacion', {}, { timeout: 40000 })).data;
      if (r.resultado === 'al-dia') toast.success('Estás al día: tenés la última versión');
      else if (r.resultado === 'descargando') toast('Hay una versión nueva: la estamos descargando…', { icon: '⬇️' });
      else if (r.resultado === 'lista') toast.success('La versión nueva ya está lista: usá "Reiniciar y actualizar"');
      else if (r.resultado === 'no-disponible') toast('Las actualizaciones automáticas funcionan solo en la app instalada');
      else toast.error('No se pudo buscar actualizaciones. Revisá tu conexión.');
      cargar();
    } catch { toast.error('No se pudo buscar actualizaciones'); }
    finally { setBuscando(false); }
  };

  return (
    <div className="px-3 pb-2 text-[11px] text-gray-600 flex items-center justify-between">
      <span>Akira v{e.versionActual || '—'}</span>
      {/* span y no <button>: el menú lateral pinta de rojo cualquier botón al pasar el mouse */}
      <span role="button" tabIndex={0} className="cursor-pointer hover:text-[var(--accent)]" style={{ opacity: buscando ? 0.5 : 1, pointerEvents: buscando ? 'none' : 'auto' }}
        onClick={buscar} onKeyDown={(ev) => { if (ev.key === 'Enter') buscar(); }}>{buscando ? 'Buscando…' : 'Buscar actualización'}</span>
    </div>
  );
}
