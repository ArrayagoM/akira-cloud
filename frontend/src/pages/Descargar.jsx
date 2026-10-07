import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import InstalarApp from '../components/InstalarApp';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

// La guía completa para instalar Akira. Con sesión iniciada se muestra DENTRO de la app (con el menú
// lateral y todas las pestañas); sin sesión (enlace compartido) es una página pública.
export default function Descargar() {
  const { user } = useAuth();
  if (user) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto animate-page-in">
          <InstalarApp />
        </div>
      </Layout>
    );
  }
  return (
    <div className="min-h-screen px-4 py-10" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: 'var(--text2)' }}>
          <ArrowLeft size={14} /> Ir al inicio
        </Link>
        <InstalarApp />
      </div>
    </div>
  );
}
