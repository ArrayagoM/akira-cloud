import { useState, useEffect, useRef } from 'react';
import { MailCheck, AlertCircle, ArrowRight, RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// Pantalla para escribir el código de 6 dígitos que llega al email. La usan el registro y el inicio de sesión de una cuenta sin confirmar.
export default function VerificarEmail({ email, onListo, onVolver }) {
  const { verificarEmail, reenviarCodigo } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(45);     // el mail acaba de salir: se puede pedir otro a los pocos segundos
  const campo = useRef(null);

  useEffect(() => { campo.current?.focus(); }, []);
  useEffect(() => { if (espera <= 0) return undefined; const t = setTimeout(() => setEspera((e) => e - 1), 1000); return () => clearTimeout(t); }, [espera]);

  const confirmar = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(codigo)) { setError('Escribí los 6 dígitos del código.'); return; }
    setError(''); setEnviando(true);
    try { const user = await verificarEmail(email, codigo); toast.success('¡Email confirmado!'); onListo(user); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo confirmar el código.'); setCodigo(''); campo.current?.focus(); }
    finally { setEnviando(false); }
  };

  const reenviar = async () => {
    setError('');
    try { await reenviarCodigo(email); toast.success('Te enviamos un código nuevo.'); setEspera(60); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo reenviar el código.'); const s = err.response?.data?.esperarSeg; if (s) setEspera(s); }
  };

  return (
    <div className="auth-card animate-fade-up">
      <div className="text-center mb-4">
        <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.25)' }}>
          <MailCheck size={22} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 className="text-xl font-bold text-white">Confirmá tu email</h1>
        <p className="text-sm mt-1.5" style={{ color: 'var(--text2)' }}>
          Te enviamos un código de 6 dígitos a <strong className="text-white break-all">{email}</strong>. Escribilo acá para activar tu cuenta. Si no lo ves, revisá la carpeta de spam.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg px-4 py-3 mb-4 text-sm animate-scale-in" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }}>
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={confirmar} className="space-y-4">
        <input
          ref={campo} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="••••••" aria-label="Código de verificación"
          className="input-base text-center font-mono" style={{ fontSize: 28, letterSpacing: 12, height: 56 }}
        />
        <button type="submit" disabled={enviando || codigo.length !== 6} className="btn-primary w-full h-11">
          {enviando ? <><span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" /> Confirmando...</> : <>Confirmar <ArrowRight size={15} /></>}
        </button>
      </form>

      <div className="flex items-center justify-between mt-4 text-sm">
        <button type="button" onClick={onVolver} className="underline" style={{ color: 'var(--muted)' }}>Volver</button>
        <button type="button" onClick={reenviar} disabled={espera > 0} className="flex items-center gap-1.5 font-semibold disabled:opacity-50" style={{ color: 'var(--accent)' }}>
          <RotateCw size={13} /> {espera > 0 ? `Reenviar código (${espera} s)` : 'Reenviar código'}
        </button>
      </div>
    </div>
  );
}
