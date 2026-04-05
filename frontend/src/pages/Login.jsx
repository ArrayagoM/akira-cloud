import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bot, Eye, EyeOff, AlertCircle, ArrowRight, Lock, Mail } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const [form, setForm]       = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { login }             = useAuth();
  const navigate              = useNavigate();
  const [params]              = useSearchParams();

  const handle = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`¡Bienvenido, ${user.nombre}!`);
      navigate(user.rol === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const oauthError = params.get('error');

  return (
    <div className="auth-bg">
      {/* Background orbs */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />

      <div className="w-full max-w-md relative z-10">

        {/* Logo */}
        <div className="text-center mb-8 animate-fade-up">
          <Link to="/" className="inline-flex flex-col items-center gap-3 group">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center animate-float"
              style={{
                background: 'rgba(0,232,123,0.1)',
                border: '1px solid rgba(0,232,123,0.25)',
                boxShadow: '0 0 28px rgba(0,232,123,0.15)',
              }}>
              <Bot size={26} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <span className="text-2xl font-bold text-white">Akira</span>
              <span className="text-2xl font-bold ml-1.5" style={{ color: 'var(--accent)' }}>Cloud</span>
            </div>
          </Link>
          <p className="text-sm mt-3" style={{ color: 'var(--text2)' }}>
            Tu asistente inteligente para WhatsApp
          </p>
        </div>

        {/* Card */}
        <div className="auth-card animate-fade-up delay-100">

          <div className="mb-2">
            <h1 className="text-xl font-bold text-white">Iniciar sesión</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Accedé a tu panel de control</p>
          </div>

          <div className="divider my-4" />

          {/* OAuth error */}
          {oauthError && (
            <div className="flex items-center gap-2.5 rounded-lg px-4 py-3 mb-4 text-sm animate-fade-in"
              style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }}>
              <AlertCircle size={15} className="flex-shrink-0" />
              Error con OAuth. Intentá de nuevo.
            </div>
          )}

          {/* OAuth buttons */}
          <div className="space-y-2.5 mb-5 animate-fade-up delay-150">
            <a
              href={`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}/api/auth/google`}
              className="flex items-center justify-center gap-3 w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group"
              style={{ background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--text2)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.background = 'var(--surface3)'; }}
            >
              <svg width="16" height="16" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continuar con Google
            </a>
            <a
              href="/api/auth/facebook"
              className="flex items-center justify-center gap-3 w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{ background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--text2)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.background = 'var(--surface3)'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Continuar con Facebook
            </a>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>o con email</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2.5 rounded-lg px-4 py-3 mb-4 text-sm animate-scale-in"
              style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }}>
              <AlertCircle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={submit} className="space-y-4">
            <div className="animate-fade-up delay-200">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>
                Email
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                <input
                  name="email" type="email" value={form.email} onChange={handle}
                  required autoComplete="email"
                  className="input-base pl-9"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div className="animate-fade-up delay-250">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>
                Contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                <input
                  name="password" type={showPwd ? 'text' : 'password'} value={form.password} onChange={handle}
                  required autoComplete="current-password"
                  className="input-base pl-9 pr-10"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--muted)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text2)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="animate-fade-up delay-275 text-right -mt-1">
              <Link to="/forgot-password" className="text-xs transition-colors" style={{ color: 'var(--muted)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <div className="animate-fade-up delay-300">
              <button type="submit" disabled={loading} className="btn-primary w-full h-11">
                {loading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  <>
                    Iniciar sesión
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="text-center text-sm mt-5 animate-fade-up delay-400" style={{ color: 'var(--muted)' }}>
            ¿No tenés cuenta?{' '}
            <Link to="/register" className="font-semibold transition-colors" style={{ color: 'var(--accent)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#34ffb0'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--accent)'}>
              Registrate gratis
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-5 animate-fade-up delay-500" style={{ color: 'var(--muted)' }}>
          Datos encriptados · Acceso seguro · 7 días de prueba
        </p>
      </div>
    </div>
  );
}
