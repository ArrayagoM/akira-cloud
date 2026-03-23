import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { CheckCircle, Zap, Star, AlertCircle, Crown } from 'lucide-react';

const PLANES = [
  {
    key:      'basico',
    nombre:   'Básico',
    precio:   15,
    desc:     'Para negocios que empiezan',
    features: [
      '1 número de WhatsApp',
      'IA con LLaMA 3.3 70B',
      'Hasta 500 mensajes/mes',
      'Recordatorios automáticos',
      'Soporte por email',
    ],
    color:    'border-gray-700',
    badge:    null,
  },
  {
    key:      'pro',
    nombre:   'Pro',
    precio:   35,
    desc:     'El más popular',
    features: [
      '1 número de WhatsApp',
      'IA + Google Calendar',
      'MercadoPago integrado',
      'Mensajes ilimitados',
      'Respuesta por audio (TTS)',
      'Soporte prioritario',
    ],
    color:    'border-green-500/40',
    badge:    'Más popular',
  },
  {
    key:      'agencia',
    nombre:   'Agencia',
    precio:   80,
    desc:     'Para agencias y revendedores',
    features: [
      'Hasta 5 números de WhatsApp',
      'Todo el plan Pro',
      'Panel multi-cliente',
      'Marca blanca disponible',
      'Soporte dedicado',
    ],
    color:    'border-purple-500/40',
    badge:    'Premium',
  },
];

export default function PlanesPage() {
  const { user, refreshUser }       = useAuth();
  const [suscripcion, setSuscripcion] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  useEffect(() => {
    api.get('/subscriptions/mi-suscripcion')
      .then(r => setSuscripcion(r.data))
      .catch(() => {})
      .finally(() => setLoadingInfo(false));
  }, []);

  const handleElegir = async (planKey) => {
    setLoadingPlan(planKey);
    try {
      const r = await api.post('/subscriptions/checkout', { plan: planKey });
      if (r.data.init_point) {
        toast.success('Redirigiendo a MercadoPago...');
        setTimeout(() => { window.location.href = r.data.init_point; }, 800);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al generar el pago');
    } finally {
      setLoadingPlan(null);
    }
  };

  const diasRestantes = () => {
    if (!suscripcion) return 0;
    const expira = suscripcion.plan === 'trial'
      ? new Date(suscripcion.trialExpira)
      : new Date(suscripcion.planExpira);
    return Math.max(0, Math.ceil((expira - new Date()) / 86400000));
  };

  const planActual = user?.plan || 'trial';
  const dias = diasRestantes();

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Crown size={22} className="text-yellow-400" /> Planes y suscripción
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Elegí el plan que mejor se adapta a tu negocio.
          </p>
        </div>

        {/* Estado actual */}
        {!loadingInfo && (
          <div className={`card flex items-center gap-4 ${!suscripcion?.planVigente ? 'border-red-500/30 bg-red-500/5' : planActual === 'trial' ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
            {!suscripcion?.planVigente ? (
              <AlertCircle size={22} className="text-red-400 flex-shrink-0" />
            ) : (
              <Zap size={22} className={planActual === 'trial' ? 'text-yellow-400 flex-shrink-0' : 'text-green-400 flex-shrink-0'} />
            )}
            <div className="flex-1">
              {!suscripcion?.planVigente ? (
                <>
                  <p className="font-semibold text-red-400">Plan vencido</p>
                  <p className="text-xs text-gray-500 mt-0.5">Tu plan venció. El bot está desactivado. Elegí un plan para reactivarlo.</p>
                </>
              ) : planActual === 'trial' ? (
                <>
                  <p className="font-semibold text-yellow-400">Prueba gratuita — {dias} día{dias !== 1 ? 's' : ''} restante{dias !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Elegí un plan para continuar después del trial sin interrupciones.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-green-400">Plan {planActual.charAt(0).toUpperCase() + planActual.slice(1)} activo — vence en {dias} día{dias !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Tu suscripción se renueva automáticamente.</p>
                </>
              )}
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${planActual === 'trial' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
              {planActual.toUpperCase()}
            </span>
          </div>
        )}

        {/* Cards de planes */}
        <div className="grid md:grid-cols-3 gap-5">
          {PLANES.map((p) => {
            const esPlanActual = planActual === p.key && suscripcion?.planVigente;
            return (
              <div key={p.key} className={`relative rounded-2xl border p-6 transition-all ${p.color} ${esPlanActual ? 'bg-green-500/5' : 'bg-gray-900'}`}>

                {/* Badge */}
                {p.badge && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1 ${p.key === 'pro' ? 'bg-green-500 text-black' : 'bg-purple-500 text-white'}`}>
                    <Star size={10} /> {p.badge}
                  </div>
                )}

                {/* Plan actual badge */}
                {esPlanActual && (
                  <div className="absolute -top-3 right-4 bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-bold px-3 py-1 rounded-full">
                    Plan actual ✓
                  </div>
                )}

                <div className="mb-5">
                  <p className="text-gray-400 text-sm">{p.nombre}</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-extrabold text-white">${p.precio}</span>
                    <span className="text-gray-500 text-sm">ARS/mes</span>
                  </div>
                  <p className="text-gray-600 text-xs mt-1">{p.desc}</p>
                </div>

                <ul className="space-y-2.5 mb-6">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <CheckCircle size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleElegir(p.key)}
                  disabled={loadingPlan === p.key || esPlanActual}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                    esPlanActual
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
                      : p.key === 'pro'
                      ? 'bg-green-500 hover:bg-green-400 text-black disabled:opacity-50'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 disabled:opacity-50'
                  }`}
                >
                  {loadingPlan === p.key ? (
                    <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Procesando...</>
                  ) : esPlanActual ? (
                    '✓ Plan activo'
                  ) : (
                    `Elegir ${p.nombre}`
                  )}
                </button>

              </div>
            );
          })}
        </div>

        {/* Info de pago */}
        <div className="card text-sm text-gray-500 space-y-2">
          <p className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-400" />
            El pago se procesa de forma segura a través de <strong className="text-gray-300">MercadoPago</strong>.
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-400" />
            Podés pagar con tarjeta de crédito, débito, transferencia bancaria o efectivo (Rapipago/Pago Fácil).
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-400" />
            La suscripción se renueva automáticamente cada mes. Podés cancelarla cuando quieras.
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-400" />
            ¿Dudas? Contactanos en <a href="https://martin-arrayago.com" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">martin-arrayago.com</a>
          </p>
        </div>

      </div>
    </Layout>
  );
}
