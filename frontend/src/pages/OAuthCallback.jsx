import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bot } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OAuthCallback() {
  const [params]        = useSearchParams();
  const { loginConToken } = useAuth();
  const navigate        = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    if (!token) { navigate('/login?error=oauth_failed'); return; }
    loginConToken(token)
      .then(user => {
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
