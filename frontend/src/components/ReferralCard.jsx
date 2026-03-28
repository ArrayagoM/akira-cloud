// components/ReferralCard.jsx
import { useState, useEffect } from 'react';
import { Copy, Check, Gift } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function ReferralCard() {
  const { user, refreshUser }  = useAuth();
  const [copiado, setCopiado]  = useState(false);
  const [cargando, setCargando] = useState(false);

  const codigo = user?.codigoReferido;

  useEffect(() => {
    if (user && !user.codigoReferido && user.rol !== 'admin') {
      api.post('/auth/generar-codigo').then(() => refreshUser()).catch(() => {});
    }
  }, [user?._id]);

  const generarCodigo = async () => {
    setCargando(true);
    try {
      await api.post('/auth/generar-codigo');
      await refreshUser();
    } catch {
      toast.error('No se pudo generar el código');
    } finally {
      setCargando(false);
    }
  };

  const copiar = () => {
    if (!codigo) return;
    navigator.clipboard.writeText(codigo);
    setCopiado(true);
    toast.success('Código copiado');
    setTimeout(() => setCopiado(false), 2000);
  };

  if (user?.rol === 'admin') return null;

  return (
    <div className="rounded-xl p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(0,232,123,0.04) 0%, var(--surface) 50%)',
        border: '1px solid var(--border)',
      }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.18)' }}>
            <Gift size={13} style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-sm font-semibold text-white">Referí y ganás</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{ background: 'rgba(0,232,123,0.08)', color: 'var(--accent)', border: '1px solid rgba(0,232,123,0.18)' }}>
          $5.000 ARS por referido
        </span>
      </div>

      {codigo ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: 'var(--surface3)', border: '1px solid var(--border)' }}>
            <span className="font-mono text-sm flex-1 select-all tracking-widest" style={{ color: 'var(--accent)' }}>
              {codigo}
            </span>
            <button onClick={copiar}
              className="transition-colors p-0.5 rounded"
              style={{ color: 'var(--muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = copiado ? 'var(--accent)' : 'var(--text2)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
              {copiado
                ? <Check size={13} style={{ color: 'var(--accent)' }} />
                : <Copy size={13} />}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={generarCodigo} disabled={cargando} className="btn-primary w-full">
          {cargando
            ? <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            : <Gift size={14} />}
          Generar mi código
        </button>
      )}

      {(user?.creditoReferidos > 0 || user?.descuentoReferido > 0) && (
        <div className="flex gap-3 mt-3">
          {user?.creditoReferidos > 0 && (
            <div className="flex-1 rounded-lg px-3 py-2 text-center"
              style={{ background: 'rgba(0,232,123,0.06)', border: '1px solid rgba(0,232,123,0.15)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                ${user.creditoReferidos.toLocaleString('es-AR')}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Crédito ganado</p>
            </div>
          )}
          {user?.descuentoReferido > 0 && (
            <div className="flex-1 rounded-lg px-3 py-2 text-center"
              style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
              <p className="text-sm font-bold text-blue-400">
                ${user.descuentoReferido.toLocaleString('es-AR')}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Tu descuento</p>
            </div>
          )}
        </div>
      )}

      <p className="text-xs mt-2.5" style={{ color: 'var(--muted)' }}>
        Compartí el código al registrarse. Cuando paguen, ambos ganan automáticamente.
      </p>
    </div>
  );
}
