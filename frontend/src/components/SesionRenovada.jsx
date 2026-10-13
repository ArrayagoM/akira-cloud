import { useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';

// Solo en la versión de escritorio: el programa renueva la sesión solo (cada vez que a la actual le quedan menos de 20 días) y le avisa
// a la ventana por el socket para que use la nueva. Así no hay que volver a ingresar mientras se use el programa.
export default function SesionRenovada() {
  const { user } = useAuth();
  const { on } = useSocket(user?._id || user?.id);
  useEffect(() => {
    const off = on('sesion:token', (d) => {
      if (typeof d?.token === 'string' && d.token.split('.').length === 3) { try { localStorage.setItem('akira_token', d.token); } catch { /* sin almacenamiento */ } }
    });
    return () => off?.();
  }, [on]);
  return null;
}
