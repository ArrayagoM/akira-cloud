import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bot, Eye, EyeOff, AlertCircle, CheckCircle, ArrowRight, Mail, User, Lock, Gift } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Register() {
  const [form, setForm]       = useState({ nombre: '', apellido: '', email: '', password: '', pais: 'Argentina', codigoReferidoUsado: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { register }          = useAuth();
  const navigate              = useNavigate();

  const handle = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const reqPwd = [
    { ok: form.password.length >= 8,   txt: 'Al menos 8 caracteres' },
    { ok: /[A-Z]/.test(form.password), txt: 'Una mayúscula' },
    { ok: /[a-z]/.test(form.password), txt: 'Una minúscula' },
    { ok: /\d/.test(form.password),    txt: 'Un número' },
  ];

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!reqPwd.every(r => r.ok)) {
      setError('La contraseña no cumple los requisitos');
      return;
    }
    setLoading(true);
    try {
      const user = await register(form);
      toast.success(`¡Bienvenido, ${user.nombre}! Tu prueba gratuita de 7 días ya empezó.`);
      navigate('/dashboard');
    } catch (err) {
      const data = err.response?.data;
      setError(data?.error || data?.errors?.[0]?.msg || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      {/* Background orbs */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />

      <div className="w-full max-w-md relative z-10" style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>

        {/* Logo */}
        <div className="text-center mb-6 animate-fade-up">
          <Link to="/" className="inline-flex flex-col items-center gap-2.5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center animate-float"
              style={{
                background: 'rgba(0,232,123,0.1)',
                border: '1px solid rgba(0,232,123,0.25)',
                boxShadow: '0 0 24px rgba(0,232,123,0.12)',
              }}>
              <Bot size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <span className="text-xl font-bold text-white">Akira</span>
              <span className="text-xl font-bold ml-1.5" style={{ color: 'var(--accent)' }}>Cloud</span>
            </div>
          </Link>

          {/* Trial badge */}
          <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(0,232,123,0.08)', border: '1px solid rgba(0,232,123,0.18)', color: 'var(--accent)' }}>
            <span>✦</span> 7 días gratis · Sin tarjeta de crédito
          </div>
        </div>

        {/* Card */}
        <div className="auth-card animate-fade-up delay-100">
          <div className="mb-2">
            <h1 className="text-xl font-bold text-white">Crear cuenta gratis</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Empezá a automatizar tu WhatsApp hoy</p>
          </div>

          <div className="divider my-4" />

          {/* Google OAuth */}
          <div className="mb-5 animate-fade-up delay-150">
            <a
              href={`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}/api/auth/google`}
              className="flex items-center justify-center gap-3 w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
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
              Registrarse con Google
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

          <form onSubmit={submit} className="space-y-3.5">

            {/* Nombre / Apellido */}
            <div className="grid grid-cols-2 gap-3 animate-fade-up delay-200">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>Nombre *</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                  <input name="nombre" value={form.nombre} onChange={handle} required className="input-base pl-8" placeholder="Juan" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>Apellido</label>
                <input name="apellido" value={form.apellido} onChange={handle} className="input-base" placeholder="Pérez" />
              </div>
            </div>

            {/* Email */}
            <div className="animate-fade-up delay-250">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>Email *</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                <input name="email" type="email" value={form.email} onChange={handle} required className="input-base pl-8" placeholder="tu@email.com" />
              </div>
            </div>

            {/* Password */}
            <div className="animate-fade-up delay-300">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>Contraseña *</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                <input
                  name="password" type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={handle} required className="input-base pl-8 pr-10" placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--muted)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text2)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {form.password && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {reqPwd.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs transition-colors"
                      style={{ color: r.ok ? 'var(--accent)' : 'var(--muted)' }}>
                      <CheckCircle size={11} />
                      {r.txt}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* País */}
            <div className="animate-fade-up delay-300">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>País</label>
              <select name="pais" value={form.pais} onChange={handle} className="input-base">
                {['Argentina','Chile','Uruguay','Colombia','México','Perú','España','Otro'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Código referido */}
            <div className="animate-fade-up delay-400">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text2)' }}>
                <span className="flex items-center gap-1.5">
                  <Gift size={12} style={{ color: 'var(--accent)' }} />
                  Código de referido{' '}
                  <span className="normal-case font-normal" style={{ color: 'var(--muted)' }}>(opcional)</span>
                </span>
              </label>
              <input
                name="codigoReferidoUsado"
                value={form.codigoReferidoUsado}
                onChange={e => setForm(f => ({ ...f, codigoReferidoUsado: e.target.value.toUpperCase() }))}
                className="input-base font-mono tracking-widest"
                placeholder="Ej: JUAN-A3K9"
                maxLength={20}
              />
            </div>

            {/* Submit */}
            <div className="pt-1 animate-fade-up delay-500">
              <button type="submit" disabled={loading} className="btn-primary w-full h-11">
                {loading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  <>
                    Crear cuenta gratis
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="text-center text-sm mt-5" style={{ color: 'var(--muted)' }}>
            ¿Ya tenés cuenta?{' '}
            <Link to="/login" className="font-semibold transition-colors" style={{ color: 'var(--accent)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#34ffb0'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--accent)'}>
              Iniciá sesión
            </Link>
          </p>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--muted)' }}>
          Al registrarte aceptás nuestros términos · Datos protegidos
        </p>
      </div>
    </div>
  );
}
