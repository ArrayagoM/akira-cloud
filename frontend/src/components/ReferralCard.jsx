// components/ReferralCard.jsx
import { useState, useEffect } from 'react';
import { Copy, Check, GitBranch } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function ReferralCard() {
  const { user, refreshUser }  = useAuth();
  const [copiado, setCopiado]  = useState(false);
  const [cargando, setCargando] = useState(false);

  const codigo = user?.codigoReferido;

  // Auto-generar si el usuario no tiene código aún
  useEffect(() => {
    if (user && !user.codigoReferido && user.rol !== 'admin') {
      api.post('/auth/generar-codigo')
        .then(() => refreshUser())
        .catch(() => {});
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

  // No mostrar para admins
  if (user?.rol === 'admin') return null;

  return (
    <div className="card border border-indigo-800/30 bg-gradient-to-br from-indigo-950/30 to-gray-900/60">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitBranch size={15} className="text-indigo-400" />
          <p className="text-sm font-semibold text-white">Referí y ganás</p>
        </div>
        <span className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
          $5.000 ARS por referido
        </span>
      </div>

      {codigo ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
            <span className="font-mono text-sm text-indigo-300 tracking-widest flex-1 select-all">{codigo}</span>
            <button onClick={copiar} className="text-gray-500 hover:text-white transition-colors">
              {copiado ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={generarCodigo}
          disabled={cargando}
          className="w-full py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {cargando
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <GitBranch size={14} />}
          Generar mi código
        </button>
      )}

      {(user?.creditoReferidos > 0 || user?.descuentoReferido > 0) && (
        <div className="flex gap-3 mt-3">
          {user?.creditoReferidos > 0 && (
            <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-center">
              <p className="text-sm font-bold text-green-400">${user.creditoReferidos.toLocaleString('es-AR')}</p>
              <p className="text-xs text-gray-500">Crédito ganado</p>
            </div>
          )}
          {user?.descuentoReferido > 0 && (
            <div className="flex-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 text-center">
              <p className="text-sm font-bold text-indigo-400">${user.descuentoReferido.toLocaleString('es-AR')}</p>
              <p className="text-xs text-gray-500">Tu descuento</p>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-600 mt-2">
        Compartí el código al registrarse. Cuando paguen, ambos ganan automáticamente.
      </p>
    </div>
  );
}
