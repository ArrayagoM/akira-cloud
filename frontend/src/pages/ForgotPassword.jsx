import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setEnviado(true);
    } catch {
      toast.error('Error al enviar. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.25)' }}>
            <Bot size={26} style={{ color: 'var(--accent)' }} />
          </div>
          <span className="text-2xl font-bold text-white">Akira</span>
          <span className="text-2xl font-bold ml-1.5" style={{ color: 'var(--accent)' }}>Cloud</span>
        </div>

        <div className="auth-card">
          {enviado ? (
            <div className="text-center py-4">
              <CheckCircle2 size={40} className="text-green-400 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-white mb-2">¡Listo! Revisá tu email</h2>
              <p className="text-sm text-gray-400 mb-6">Si ese email está registrado, te enviamos un link para recuperar tu contraseña. Expira en 1 hora.</p>
              <Link to="/login" className="btn-secondary text-sm flex items-center justify-center gap-2">
                <ArrowLeft size={14} /> Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-white">Recuperar contraseña</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Te enviamos un link a tu email</p>
              </div>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>Email</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      required className="input-base pl-9" placeholder="tu@email.com" />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full h-11">
                  {loading ? <><span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Enviando...</> : 'Enviar link de recupero'}
                </button>
              </form>
              <p className="text-center text-sm mt-5" style={{ color: 'var(--muted)' }}>
                <Link to="/login" className="flex items-center justify-center gap-1.5 transition-colors hover:text-white">
                  <ArrowLeft size={13} /> Volver al inicio de sesión
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
