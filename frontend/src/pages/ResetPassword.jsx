import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Eye, EyeOff, Lock } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const [params]           = useSearchParams();
  const navigate           = useNavigate();
  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [loading,   setLoading]   = useState(false);

  const token = params.get('token');
  const email = params.get('email');

  const submit = async (e) => {
    e.preventDefault();
    if (password !== password2) { toast.error('Las contraseñas no coinciden'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, token, password });
      toast.success('Contraseña actualizada. Ya podés iniciar sesión.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Link inválido o expirado');
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) return (
    <div className="auth-bg"><div className="text-center text-red-400 p-8">Link inválido. <Link to="/forgot-password" className="underline">Solicitá uno nuevo</Link></div></div>
  );

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
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Nueva contraseña</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Elegí una contraseña segura</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>Nueva contraseña</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  required className="input-base pl-9 pr-10" placeholder="Mínimo 8 caracteres" />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Debe tener mayúsculas, minúsculas y números</p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>Repetir contraseña</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                <input type={showPwd ? 'text' : 'password'} value={password2} onChange={e => setPassword2(e.target.value)}
                  required className="input-base pl-9" placeholder="••••••••" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full h-11">
              {loading ? <><span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Actualizando...</> : 'Actualizar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
