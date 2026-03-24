import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bot, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Register() {
  const [form, setForm]       = useState({ nombre: '', apellido: '', email: '', password: '', pais: 'Argentina' });
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
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <Bot size={28} className="text-green-400" />
            <span className="text-xl font-bold text-white">
              Akira <span className="text-green-400">Cloud</span>
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-white">Crear cuenta gratis</h1>
          <p className="text-gray-500 text-sm mt-1">7 días de prueba · Sin tarjeta de crédito</p>
        </div>

        <div className="card">

          <div className="mb-6">
            <a
              href={`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}/api/auth/google`}
              className="flex items-center justify-center gap-3 w-full py-2.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 transition-colors text-sm text-gray-300"
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Registrarse con Google
            </a>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-600">o con email</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4 text-sm text-red-400">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Nombre *</label>
                <input name="nombre" value={form.nombre} onChange={handle} required className="input-base" placeholder="Juan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Apellido</label>
                <input name="apellido" value={form.apellido} onChange={handle} className="input-base" placeholder="Pérez" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Email *</label>
              <input name="email" type="email" value={form.email} onChange={handle} required className="input-base" placeholder="tu@email.com" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Contraseña *</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={handle}
                  required
                  className="input-base pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.password && (
                <div className="mt-2 space-y-1">
                  {reqPwd.map((r, i) => (
                    <div key={i} className={`flex items-center gap-1.5 text-xs ${r.ok ? 'text-green-400' : 'text-gray-600'}`}>
                      <CheckCircle size={11} />
                      {r.txt}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">País</label>
              <select name="pais" value={form.pais} onChange={handle} className="input-base">
                {['Argentina', 'Chile', 'Uruguay', 'Colombia', 'México', 'Perú', 'España', 'Otro'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                'Crear cuenta gratis'
              )}
            </button>

          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            ¿Ya tenés cuenta?{' '}
            <Link to="/login" className="text-green-400 hover:text-green-300 font-medium">
              Iniciá sesión
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
