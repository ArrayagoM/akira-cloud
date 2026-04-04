import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bot } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OAuthCallback() {
  const { loginConToken } = useAuth();
  const navigate        = useNavigate();

  useEffect(() => {
    // Obtener token de la cookie httpOnly via endpoint seguro
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/oauth-token`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const token = data.token;
        if (!token) { navigate('/login?error=oauth_failed'); return; }
        return loginConToken(token);
      })
      .then(user => {
        if (!user) return;
        toast.success(`¡Bienvenido, ${user.nombre}!`);
        navigate(user.rol === 'admin' ? '/admin' : '/dashboard');
      })
      .catch(() => navigate('/login?error=oauth_failed'));
  }, []);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <Bot size={40} className="text-green-400 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-400">Iniciando sesión...</p>
      </div>
    </div>
  );
}
