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

  const [resumen, setResumen]     = useState(null);
  const [cuenta, setCuenta]       = useState('');
  const [guardando, setGuardando] = useState(false);

  const codigo = user?.codigoReferido;

  // Cuántos se registraron con tu código, cuántos pagaron y dónde cobrás (alias o CVU)
  useEffect(() => {
    if (!user || user.rol === 'admin') return;
    api.get('/auth/referidos/resumen')
      .then(({ data }) => { setResumen(data); setCuenta(data.cuenta?.valor || ''); })
      .catch(() => {});
  }, [user?._id]);

  const guardarCuenta = async () => {
    setGuardando(true);
    try {
      const { data } = await api.put('/auth/referidos/cuenta', { cuenta });
      setCuenta(data.cuenta.valor);
      setResumen(r => ({ ...(r || {}), cuenta: data.cuenta }));
      toast.success('Listo, ahí te vamos a transferir');
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };
  const cuentaGuardada = resumen?.cuenta?.valor || '';
  const cuentaCambiada = cuenta.trim() !== '' && cuenta.trim().toUpperCase().replace(/[\s-]/g, '') !== cuentaGuardada.replace(/[\s-]/g, '');

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
          $5.000 ARS cuando tu referido paga
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

      {resumen && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded-lg px-2 py-2 text-center" style={{ background: 'var(--surface3)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-bold text-white">{resumen.registrados}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Se registraron</p>
          </div>
          <div className="rounded-lg px-2 py-2 text-center" style={{ background: 'rgba(0,232,123,0.06)', border: '1px solid rgba(0,232,123,0.15)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{resumen.pagaron}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Ya pagaron</p>
          </div>
          <div className="rounded-lg px-2 py-2 text-center" style={{ background: 'var(--surface3)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-bold text-white">${(resumen.porCobrar || 0).toLocaleString('es-AR')}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Por cobrar</p>
          </div>
        </div>
      )}
      {resumen?.cobrado > 0 && (
        <p className="text-xs mt-2" style={{ color: 'var(--text2)' }}>Ya te transferimos ${resumen.cobrado.toLocaleString('es-AR')}.</p>
      )}

      {user?.descuentoReferido > 0 && (
        <div className="rounded-lg px-3 py-2 text-center mt-3"
          style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
          <p className="text-sm font-bold text-blue-400">${user.descuentoReferido.toLocaleString('es-AR')}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Tu descuento en el primer pago</p>
        </div>
      )}

      <div className="mt-3">
        <label className="text-xs font-semibold text-white" htmlFor="cuenta-cobro">¿Dónde te transferimos?</label>
        <div className="flex gap-2 mt-1.5">
          <input id="cuenta-cobro" value={cuenta} onChange={e => setCuenta(e.target.value)}
            placeholder="Tu alias o CVU/CBU" autoComplete="off" spellCheck={false}
            className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm font-mono"
            style={{ background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onKeyDown={e => { if (e.key === 'Enter' && cuentaCambiada && !guardando) guardarCuenta(); }} />
          <button onClick={guardarCuenta} disabled={guardando || !cuentaCambiada} className="btn-primary px-3 disabled:opacity-40">
            {guardando ? '...' : 'Guardar'}
          </button>
        </div>
        <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
          {cuentaGuardada
            ? `Guardado: ${resumen.cuenta.tipo === 'cvu' ? 'CVU/CBU ' : 'alias '}${resumen.cuenta.tipo === 'cvu' ? '••••' + cuentaGuardada.slice(-4) : cuentaGuardada}. Revisá que sea tuya: ahí va el dinero.`
            : 'Cargala para que podamos pagarte. Es un alias (por ejemplo, tu.nombre.mp) o los 22 números del CVU/CBU.'}
        </p>
      </div>

      <p className="text-xs mt-2.5" style={{ color: 'var(--muted)' }}>
        Pasale tu código para que lo use al registrarse. Vos ganás recién cuando tu referido paga su suscripción; compartirlo solo no suma. Te transferimos a la cuenta de arriba.
      </p>
    </div>
  );
}
