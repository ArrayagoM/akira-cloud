import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, ArrowRight } from 'lucide-react';
import Layout from '../components/Layout';
import InstalarApp from '../components/InstalarApp';
import ReferralCard from '../components/ReferralCard';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

// Panel de la versión web. El bot, la agenda, los clientes y la configuración
// viven en la app de escritorio (en la PC del negocio); la web es para la
// cuenta: plan y pagos, instalar la app, referidos.
export default function CuentaPanel() {
  const { user } = useAuth();
  const [sub, setSub] = useState(null);

  useEffect(() => {
    api.get('/subscriptions/mi-suscripcion').then((r) => setSub(r.data)).catch(() => {});
  }, []);

  const nombre = (user?.nombre || '').split(' ')[0];
  const esAdmin = sub?.esAdmin;
  const etiquetaPlan = sub ? (sub.planBase === 'trial' ? 'Prueba gratis' : `Plan ${sub.planBase}`) : '';

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white">{nombre ? `¡Hola, ${nombre}!` : '¡Hola!'}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Desde acá administrás tu cuenta. Tu bot se maneja desde la app en tu PC.</p>
        </div>

        {sub && !esAdmin && (
          <div className="card flex items-center gap-4 flex-wrap">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,232,123,0.1)' }}>
              <CreditCard size={18} style={{ color: '#00e87b' }} />
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-semibold text-white">{etiquetaPlan}</p>
              <p className="text-xs" style={{ color: sub.planVigente ? 'var(--text2)' : '#f43f5e' }}>
                {sub.planVigente ? `Te quedan ${sub.diasRestantes} día${sub.diasRestantes === 1 ? '' : 's'}.` : 'Tu plan venció — elegí uno para reactivar el bot.'}
              </p>
            </div>
            <Link to="/planes" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: '#00e87b' }}>
              {sub.planVigente && sub.planBase !== 'trial' ? 'Ver planes' : 'Elegir plan'} <ArrowRight size={14} />
            </Link>
          </div>
        )}

        <InstalarApp />

        <ReferralCard />
      </div>
    </Layout>
  );
}
