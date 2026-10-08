import { Link } from 'react-router-dom';
import { Smartphone, ArrowRight } from 'lucide-react';

// Invita a instalar la app del celular (se instala desde esta misma web, sin tiendas de apps). Es un control
// remoto: ver si el bot atiende, resumen del día, pausar y recibir avisos si se cae.
export default function AppCelularCard() {
  return (
    <div className="card flex items-start gap-4">
      <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,232,123,0.12)' }}><Smartphone size={20} style={{ color: '#00e87b' }} /></div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">App de Akira en tu celular</p>
        <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text2)' }}>Mirá si tu bot está atendiendo, el resumen del día, pausalo y recibí un aviso si se cae. Funciona en iPhone y en Android, y se instala desde acá, sin tiendas de apps.</p>
        <Link to="/celular" className="btn-secondary text-sm inline-flex items-center gap-1.5 mt-3">Abrir la app del celular <ArrowRight size={14} /></Link>
      </div>
    </div>
  );
}
