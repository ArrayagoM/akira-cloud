import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import InstalarApp from '../components/InstalarApp';

// Página pública y compartible: la guía completa para instalar Akira.
export default function Descargar() {
  return (
    <div className="min-h-screen px-4 py-10" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: 'var(--text2)' }}>
          <ArrowLeft size={14} /> Volver al panel
        </Link>
        <InstalarApp />
      </div>
    </div>
  );
}
