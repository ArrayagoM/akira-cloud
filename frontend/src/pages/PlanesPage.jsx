import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle, Zap, Star, AlertCircle, Crown, TrendingDown, MessageSquare, Calendar, CreditCard, Mic, Users } from 'lucide-react';

const PLANES_INFO = [
  {
    key: 'basico',
    nombre: 'Básico',
    mensual: 15000,
    color: 'border-gray-700',
    badge: null,
    icon: <Zap size={18} />,
    features: [
      { texto: '1 número de WhatsApp',     ok: true },
      { texto: 'IA con LLaMA 3.3 70B',     ok: true },
      { texto: 'Hasta 500 mensajes/mes',    ok: true },
      { texto: 'Recordatorios automáticos', ok: true },
      { texto: 'Google Calendar',           ok: false },
      { texto: 'Cobros con MercadoPago',    ok: false },
      { texto: 'Respuestas por audio',      ok: false },
      { texto: 'Soporte por email',         ok: true },
    ],
  },
  {
    key: 'pro',
    nombre: 'Pro',
    mensual: 35000,
    color: 'border-green-500/50',
    badge: 'Más popular',
    icon: <Star size={18} />,
    features: [
      { texto: '1 número de WhatsApp',     ok: true },
      { texto: 'IA con LLaMA 3.3 70B',     ok: true },
      { texto: 'Mensajes ilimitados',       ok: true },
      { texto: 'Recordatorios automáticos', ok: true },
      { texto: 'Google Calendar',           ok: true },
      { texto: 'Cobros con MercadoPago',    ok: true },
      { texto: 'Respuestas por audio',      ok: true },
      { texto: 'Soporte prioritario',       ok: true },
    ],
  },
  {
    key: 'agencia',
    nombre: 'Agencia',
    mensual: 80000,
    color: 'border-purple-500/40',
    badge: 'Multi-cliente',
    icon: <Users size={18} />,
    features: [
      { texto: 'Hasta 5 números de WhatsApp', ok: true },
      { texto: 'Todo el plan Pro',           ok: true },
      { texto: 'Panel multi-cliente',        ok: true },
      { texto: 'Soporte dedicado',           ok: true },
      { texto: 'Reportes avanzados',         ok: true },
      { texto: 'Onboarding personalizado',   ok: true },
    ],
  },
];

const DESCUENTO = 0.20;

function formatPrecio(n) {
  return n.toLocaleString('es-AR');
}

export default function PlanesPage() {
  const { user, refreshUser } = useAuth();
  const [params] = useSearchParams();
  const [anual, setAnual]           = useState(false);
  const [suscripcion, setSuscripcion] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);

  useEffect(() => {
    api.get('/subscriptions/mi-suscripcion')
      .then(r => setSuscripcion(r.data))
      .catch(() => {});

    // Plan preseleccionado desde la landing
    const planParam = params.get('plan') || '';
    if (planParam.includes('_anual')) setAnual(true);

    // Notificaciones de retorno de MP
    if (params.get('suscripcion') === 'ok') {
      toast.success('¡Suscripción activada! 🎉 Ya podés usar todas las funciones.');
      refreshUser();
    }
    if (params.get('error') === 'pago_fallido') {
      toast.error('El pago no se pudo procesar. Intentá de nuevo.');
    }
  }, []);

  const handleElegir = async (planKey) => {
    const planId = `${planKey}_${anual ? 'anual' : 'mensual'}`;
    setLoadingPlan(planKey);
    try {
      const r = await api.post('/subscriptions/checkout', { plan: planId });
      if (r.data.init_point) {
        toast.success('Redirigiendo a MercadoPago...');
        setTimeout(() => { window.location.href = r.data.init_point; }, 600);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al generar el pago. Verificá que MP esté configurado.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const esAdmin    = user?.rol === 'admin';
  // Usamos planBase (normalizado) del endpoint para evitar valores como 'pro_mensual'
  const planActual = esAdmin ? 'admin' : (suscripcion?.planBase || user?.plan || 'trial');
  const dias = suscripcion?.diasRestantes || 0;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-7">

        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Crown size={22} className="text-yellow-400" /> Planes y suscripción
          </h1>
          <p className="text-gray-500 text-sm mt-1">Elegí el plan que mejor se adapta a tu negocio.</p>
        </div>

        {/* Estado actual */}
        {suscripcion && !esAdmin && (
          <div className={`card flex items-center gap-4 ${!suscripcion.planVigente ? 'border-red-500/30 bg-red-500/5' : planActual === 'trial' ? 'border-yellow-500/30 bg-yellow-500/5' : planActual === 'admin' ? 'border-purple-500/30 bg-purple-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
            {!suscripcion.planVigente
              ? <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
              : <Zap size={20} className="text-green-400 flex-shrink-0" />}
            <div className="flex-1">
              {planActual === 'admin'
                ? <p className="font-semibold text-purple-400">Plan Administrador — Acceso ilimitado y gratuito</p>
                : !suscripcion.planVigente
                ? <p className="font-semibold text-red-400">Plan vencido — El bot está desactivado</p>
                : planActual === 'trial'
                ? <p className="font-semibold text-yellow-400">Prueba gratuita — {dias} día{dias !== 1 ? 's' : ''} restante{dias !== 1 ? 's' : ''}</p>
                : <p className="font-semibold text-green-400">Plan {planActual} activo — {dias} día{dias !== 1 ? 's' : ''} restante{dias !== 1 ? 's' : ''}</p>
              }
              {planActual !== 'admin' && <p className="text-xs text-gray-500 mt-0.5">
                {suscripcion.planVigente ? 'La suscripción se renueva automáticamente.' : 'Elegí un plan para reactivar el bot.'}
              </p>}
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${planActual === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : planActual === 'trial' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
              {planActual}
            </span>
          </div>
        )}

        {/* Badge admin */}
        {esAdmin && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-yellow-500/30 bg-yellow-500/5 text-sm text-yellow-400">
            <span>👑</span>
            <div>
              <p className="font-semibold">Acceso Admin — Ilimitado y gratuito</p>
              <p className="text-xs text-gray-500 mt-0.5">Tenés todas las funciones activas. No necesitás suscripción.</p>
            </div>
          </div>
        )}

        {/* Toggle mensual/anual */}
        {planActual !== 'admin' && (
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${!anual ? 'text-white' : 'text-gray-500'}`}>Mensual</span>
            <button
              onClick={() => setAnual(!anual)}
              className={`relative w-14 h-7 rounded-full transition-colors ${anual ? 'bg-green-500' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${anual ? 'translate-x-7' : 'translate-x-0.5'}`} />
            </button>
            <span className={`text-sm font-medium flex items-center gap-1.5 ${anual ? 'text-white' : 'text-gray-500'}`}>
              Anual
              <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <TrendingDown size={10} /> 20% OFF
              </span>
            </span>
          </div>
        )}

        {/* Cards de planes */}
        {planActual !== 'admin' && (
          <div className="grid md:grid-cols-3 gap-5">
            {PLANES_INFO.map((p) => {
              const precioMensual = p.mensual;
              const precioAnual   = Math.round(p.mensual * 12 * (1 - DESCUENTO));
              const precioMostrar = anual ? precioAnual : precioMensual;
              const esPlanActual  = planActual === p.key && suscripcion?.planVigente;

              return (
                <div key={p.key} className={`relative rounded-2xl border p-6 transition-all ${p.color} ${esPlanActual ? 'bg-green-500/5' : 'bg-gray-900'}`}>
                  {p.badge && (
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 ${p.key === 'pro' ? 'bg-green-500 text-black' : 'bg-purple-500 text-white'}`}>
                      <Star size={10} /> {p.badge}
                    </div>
                  )}
                  {esPlanActual && (
                    <div className="absolute -top-3 right-4 bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-bold px-3 py-1 rounded-full">
                      Plan actual ✓
                    </div>
                  )}

                  <div className="mb-5">
                    <div className="flex items-center gap-2 text-gray-400 mb-2">
                      {p.icon} <span className="text-sm font-medium">{p.nombre}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-white">${formatPrecio(precioMostrar)}</span>
                      <span className="text-gray-500 text-xs">ARS/{anual ? 'año' : 'mes'}</span>
                    </div>
                    {anual && (
                      <p className="text-green-400 text-xs mt-1">
                        = ${formatPrecio(Math.round(precioAnual/12))}/mes · Ahorrás ${formatPrecio(Math.round(p.mensual*12*DESCUENTO))}
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2 mb-6">
                    {p.features.map((f, i) => (
                      <li key={i} className={`flex items-center gap-2 text-xs ${f.ok ? 'text-gray-300' : 'text-gray-600'}`}>
                        <CheckCircle size={12} className={f.ok ? 'text-green-400 flex-shrink-0' : 'text-gray-700 flex-shrink-0'} />
                        {f.texto}
                        {!f.ok && <span className="ml-auto text-gray-700 text-[10px]">no incluido</span>}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleElegir(p.key)}
                    disabled={loadingPlan === p.key || esPlanActual}
                    className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      esPlanActual ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
                      : p.key === 'pro' ? 'bg-green-500 hover:bg-green-400 text-black disabled:opacity-50'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 disabled:opacity-50'
                    }`}
                  >
                    {loadingPlan === p.key ? (
                      <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Procesando...</>
                    ) : esPlanActual ? '✓ Plan activo' : `Elegir ${p.nombre}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Comparativa de limitaciones */}
        <div className="card">
          <h3 className="font-semibold text-white mb-4 text-sm flex items-center gap-2">
            <MessageSquare size={15} className="text-green-400" /> Comparativa completa de funciones
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Función</th>
                  <th className="text-center py-2 px-3 text-gray-400">Trial</th>
                  <th className="text-center py-2 px-3 text-gray-400">Básico</th>
                  <th className="text-center py-2 px-3 text-green-400">Pro</th>
                  <th className="text-center py-2 px-3 text-purple-400">Agencia</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Mensajes/mes',        '100',  '500',  'Ilimitado', 'Ilimitado'],
                  ['Números WhatsApp',    '1',    '1',    '1',         'Hasta 5'],
                  ['IA LLaMA 3.3 70B',   '✓',    '✓',    '✓',         '✓'],
                  ['Recordatorios',       '✓',    '✓',    '✓',         '✓'],
                  ['Google Calendar',     '✗',    '✗',    '✓',         '✓'],
                  ['Cobros MercadoPago',  '✗',    '✗',    '✓',         '✓'],
                  ['Respuestas por audio','✗',    '✗',    '✓',         '✓'],
                  ['Duración',           '7 días','Mensual','Mensual/Anual','Mensual/Anual'],
                ].map(([func, trial, basico, pro, agencia], i) => (
                  <tr key={i} className={`border-b border-gray-800/50 ${i%2===0?'bg-black/20':''}`}>
                    <td className="py-2 pr-4 text-gray-300">{func}</td>
                    {[trial, basico, pro, agencia].map((v, j) => (
                      <td key={j} className={`text-center py-2 px-3 ${v==='✓'?'text-green-400':v==='✗'?'text-gray-700':j===2?'text-green-300':j===3?'text-purple-300':'text-gray-400'}`}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info de pago */}
        <div className="text-xs text-gray-600 space-y-1">
          <p>✓ Pagos seguros vía <strong className="text-gray-400">MercadoPago</strong> — tarjeta, transferencia, Rapipago o Pago Fácil</p>
          <p>✓ Cancelá cuando quieras · Sin permanencia · Los planes anuales se pagan en un solo pago</p>
          <p>✓ ¿Dudas? <a href="https://martin-arrayago.com" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">Contactá al soporte</a></p>
        </div>

      </div>
    </Layout>
  );
}
