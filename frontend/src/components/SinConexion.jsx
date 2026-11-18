import { useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Pantalla que se muestra cuando hay una sesión guardada pero no se pudo confirmar con el servidor (sin internet, timeout o
// error del servidor). La sesión NO se cerró: Akira reintenta sola con espera creciente y apenas vuelve internet entra.
export default function SinConexion() {
  const { reintentarConexion } = useAuth();
  const [probando, setProbando] = useState(false);

  const reintentar = () => {
    setProbando(true);
    reintentarConexion();
    setTimeout(() => setProbando(false), 2500);
  };
  // Salida para quien quiere entrar con otra cuenta: borra la sesión guardada y vuelve a empezar.
  const usarOtraCuenta = () => { try { localStorage.removeItem('akira_token'); } catch { /* sin almacenamiento */ } window.location.href = '/login'; };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: 'var(--bg)' }} role="status" aria-live="polite">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
        <WifiOff size={20} style={{ color: '#f59e0b' }} />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-white">Sin conexión, reintentando</p>
        <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text2)' }}>
          No pudimos comunicarnos con Akira, pero tu sesión sigue guardada. Apenas vuelva internet entrás solo. No hace falta que ingreses de nuevo.
        </p>
      </div>
      <button onClick={reintentar} disabled={probando} className="btn-primary text-sm px-4 py-2 rounded-lg disabled:opacity-60 flex items-center gap-2">
        <RefreshCw size={14} className={probando ? 'animate-spin' : ''} /> {probando ? 'Probando…' : 'Reintentar ahora'}
      </button>
      <button onClick={usarOtraCuenta} className="text-xs underline" style={{ color: 'var(--text2)' }}>Entrar con otra cuenta</button>
    </div>
  );
}
