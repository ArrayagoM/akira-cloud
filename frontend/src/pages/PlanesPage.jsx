import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle, Zap, Star, AlertCircle, Crown, TrendingDown, MessageSquare, Calendar, CreditCard, Mic, Users, Copy, GitBranch } from 'lucide-react';

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

    // Retorno desde MercadoPago
    const paymentId = params.get('payment_id') || params.get('collection_id') || '';
    const mpStatus  = params.get('status') || params.get('collection_status') || '';

    if (params.get('suscripcion') === 'ok' || mpStatus === 'approved') {
      const refrescarSub = () =>
        api.get('/subscriptions/mi-suscripcion').then(r => setSuscripcion(r.data)).catch(() => {});

      const activar = async () => {
        // Intento 1: re-fetchear (el /return ya debería haber activado el plan)
        await refrescarSub();
        refreshUser();

        // Intento 2: si sigue en trial, forzar verificación con payment_id
        if (paymentId) {
          try {
            const r = await api.post('/subscriptions/verificar-pago', { payment_id: paymentId });
            if (r.data.ok) {
              await refrescarSub();
              refreshUser();
            }
          } catch {}
        }
      };

      toast.success('¡Suscripción activada! 🎉 Ya podés usar todas las funciones.');
      setTimeout(activar, 1500);
      // Segundo intento más tarde por si el servidor tardó
      setTimeout(() => { refrescarSub(); refreshUser(); }, 5000);
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
      <div className="max-w-5xl mx-auto space-y-6 animate-page-in">

        {/* Header */}
        <div className="animate-fade-up">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Crown size={22} className="text-yellow-400" /> Planes y suscripción
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Elegí el plan que mejor se adapta a tu negocio.</p>
        </div>

        {/* Estado actual */}
        {suscripcion && !esAdmin && (
          <div className="card flex items-center gap-4 animate-fade-up delay-50"
            style={!suscripcion.planVigente
              ? { borderColor: 'rgba(244,63,94,0.25)', background: 'rgba(244,63,94,0.04)' }
              : planActual === 'trial'
              ? { borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.04)' }
              : { borderColor: 'rgba(0,232,123,0.2)', background: 'rgba(0,232,123,0.04)' }}>
            {!suscripcion.planVigente
              ? <AlertCircle size={20} style={{ color: '#f43f5e', flexShrink: 0 }} />
              : <Zap size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            <div className="flex-1">
              {planActual === 'admin'
                ? <p className="font-semibold" style={{ color: '#a78bfa' }}>Plan Administrador — Acceso ilimitado y gratuito</p>
                : !suscripcion.planVigente
                ? <p className="font-semibold" style={{ color: '#f43f5e' }}>Plan vencido — El bot está desactivado</p>
                : planActual === 'trial'
                ? <p className="font-semibold" style={{ color: '#f59e0b' }}>Prueba gratuita — {dias} día{dias !== 1 ? 's' : ''} restante{dias !== 1 ? 's' : ''}</p>
                : <p className="font-semibold" style={{ color: 'var(--accent)' }}>Plan {planActual} activo — {dias} día{dias !== 1 ? 's' : ''} restante{dias !== 1 ? 's' : ''}</p>}
              {planActual !== 'admin' && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>
                  {suscripcion.planVigente ? 'La suscripción se renueva automáticamente.' : 'Elegí un plan para reactivar el bot.'}
                </p>
              )}
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
              planActual === 'admin' ? 'badge-gray' : planActual === 'trial' ? 'badge-yellow' : 'badge-green'
            }`}>{planActual}</span>
          </div>
        )}

        {/* Badge admin */}
        {esAdmin && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm animate-fade-up delay-50"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
            <span>👑</span>
            <div>
              <p className="font-semibold">Acceso Admin — Ilimitado y gratuito</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Tenés todas las funciones activas. No necesitás suscripción.</p>
            </div>
          </div>
        )}

        {/* Toggle mensual/anual */}
        {planActual !== 'admin' && (
          <div className="flex items-center justify-center gap-4 animate-fade-up delay-100">
            <span className="text-sm font-medium" style={{ color: !anual ? 'var(--text)' : 'var(--muted)' }}>Mensual</span>
            <button
              onClick={() => setAnual(!anual)}
              className="relative w-12 h-6 rounded-full transition-all duration-300"
              style={{ background: anual ? 'var(--accent)' : 'var(--surface3)', border: '1px solid var(--border)' }}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${anual ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: anual ? 'var(--text)' : 'var(--muted)' }}>
              Anual
              <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: 'rgba(0,232,123,0.1)', color: 'var(--accent)', border: '1px solid rgba(0,232,123,0.2)' }}>
                <TrendingDown size={10} /> 20% OFF
              </span>
            </span>
          </div>
        )}

        {/* Cards de planes */}
        {planActual !== 'admin' && (
          <div className="grid md:grid-cols-3 gap-4">
            {PLANES_INFO.map((p, idx) => {
              const precioMensual = p.mensual;
              const precioAnual   = Math.round(p.mensual * 12 * (1 - DESCUENTO));
              const precioMostrar = anual ? precioAnual : precioMensual;
              const esPlanActual  = planActual === p.key && suscripcion?.planVigente;
              const isPro = p.key === 'pro';

              return (
                <div key={p.key}
                  className="relative rounded-2xl p-6 transition-all duration-200 animate-fade-up"
                  style={{
                    animationDelay: `${idx * 80}ms`,
                    background: isPro
                      ? 'linear-gradient(135deg, rgba(0,232,123,0.07) 0%, var(--surface) 60%)'
                      : 'var(--surface)',
                    border: isPro
                      ? '1px solid rgba(0,232,123,0.28)'
                      : esPlanActual ? '1px solid rgba(0,232,123,0.18)' : '1px solid var(--border)',
                    boxShadow: isPro ? '0 0 32px rgba(0,232,123,0.08)' : 'none',
                  }}>
                  {/* Badge superior */}
                  {p.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1"
                      style={isPro
                        ? { background: 'var(--accent)', color: '#020f08' }
                        : { background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}>
                      <Star size={9} /> {p.badge}
                    </div>
                  )}
                  {esPlanActual && !p.badge && (
                    <div className="absolute -top-3 right-4 text-xs font-bold px-3 py-1 rounded-full"
                      style={{ background: 'rgba(0,232,123,0.12)', color: 'var(--accent)', border: '1px solid rgba(0,232,123,0.25)' }}>
                      ✓ Plan actual
                    </div>
                  )}

                  {/* Info */}
                  <div className="mb-5 mt-1">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: isPro ? 'rgba(0,232,123,0.12)' : 'var(--surface3)', color: isPro ? 'var(--accent)' : 'var(--text2)' }}>
                        {p.icon}
                      </div>
                      <span className="font-semibold text-white">{p.nombre}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-white">${formatPrecio(precioMostrar)}</span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>ARS/{anual ? 'año' : 'mes'}</span>
                    </div>
                    {anual && (
                      <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>
                        = ${formatPrecio(Math.round(precioAnual/12))}/mes · Ahorrás ${formatPrecio(Math.round(p.mensual*12*DESCUENTO))}
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 mb-5">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs"
                        style={{ color: f.ok ? 'var(--text)' : 'var(--muted)' }}>
                        <CheckCircle size={12} className="flex-shrink-0"
                          style={{ color: f.ok ? 'var(--accent)' : 'var(--border2)' }} />
                        {f.texto}
                        {!f.ok && <span className="ml-auto text-[10px]" style={{ color: 'var(--muted)' }}>no incluido</span>}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    onClick={() => handleElegir(p.key)}
                    disabled={loadingPlan === p.key || esPlanActual}
                    className={isPro ? 'btn-primary w-full' : 'btn-secondary w-full'}
                    style={esPlanActual ? { opacity: 0.7, cursor: 'default' } : {}}>
                    {loadingPlan === p.key ? (
                      <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Procesando...</>
                    ) : esPlanActual ? '✓ Plan activo' : `Elegir ${p.nombre}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Comparativa */}
        <div className="card animate-fade-up delay-200">
          <h3 className="font-semibold text-white mb-4 text-sm flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,232,123,0.1)' }}>
              <MessageSquare size={12} style={{ color: 'var(--accent)' }} />
            </div>
            Comparativa completa de funciones
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-2.5 pr-4 font-medium" style={{ color: 'var(--text2)' }}>Función</th>
                  <th className="text-center py-2.5 px-3" style={{ color: 'var(--text2)' }}>Trial</th>
                  <th className="text-center py-2.5 px-3" style={{ color: 'var(--text2)' }}>Básico</th>
                  <th className="text-center py-2.5 px-3 font-bold" style={{ color: 'var(--accent)' }}>Pro</th>
                  <th className="text-center py-2.5 px-3 font-bold" style={{ color: '#a78bfa' }}>Agencia</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Mensajes/mes',         '100',    '500',    'Ilimitado', 'Ilimitado'],
                  ['Números WhatsApp',     '1',      '1',      '1',         'Hasta 5'],
                  ['IA LLaMA 3.3 70B',    '✓',      '✓',      '✓',         '✓'],
                  ['Recordatorios',        '✓',      '✓',      '✓',         '✓'],
                  ['Google Calendar',      '✗',      '✗',      '✓',         '✓'],
                  ['Cobros MercadoPago',   '✗',      '✗',      '✓',         '✓'],
                  ['Respuestas por audio', '✗',      '✗',      '✓',         '✓'],
                  ['Duración',             '7 días', 'Mensual','Mensual/Anual','Mensual/Anual'],
                ].map(([func, trial, basico, pro, agencia], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(30,45,61,0.5)', background: i%2===0 ? 'rgba(0,0,0,0.15)' : '' }}>
                    <td className="py-2 pr-4" style={{ color: 'var(--text)' }}>{func}</td>
                    {[trial, basico, pro, agencia].map((v, j) => (
                      <td key={j} className="text-center py-2 px-3 font-medium"
                        style={{ color: v==='✓' ? 'var(--accent)' : v==='✗' ? 'var(--border2)' : j===2 ? 'var(--accent)' : j===3 ? '#a78bfa' : 'var(--text2)' }}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Referidos */}
        <div className="card animate-fade-up delay-250" style={{ borderColor: 'rgba(0,232,123,0.15)' }}>
          <h3 className="font-semibold text-white mb-1 flex items-center gap-2">
            <GitBranch size={15} style={{ color: 'var(--accent)' }} /> Programa de referidos
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text2)' }}>
            Compartí tu código y ambos ganan <strong className="text-white">$5.000 ARS</strong> de descuento cuando tu referido pague un plan.
          </p>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: 'var(--text2)' }}>Tu código de referido</p>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: 'var(--surface3)', border: '1px solid var(--border)' }}>
                <span className="font-mono text-sm tracking-widest flex-1 select-all" style={{ color: 'var(--accent)' }}>
                  {user?.codigoReferido || '—'}
                </span>
                {user?.codigoReferido && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(user.codigoReferido); toast.success('Código copiado'); }}
                    className="transition-colors" style={{ color: 'var(--muted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text2)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                    <Copy size={13} />
                  </button>
                )}
              </div>
            </div>
            {(user?.creditoReferidos > 0 || user?.descuentoReferido > 0) && (
              <div className="space-y-2">
                {user?.creditoReferidos > 0 && (
                  <div className="rounded-lg px-3 py-2 text-center"
                    style={{ background: 'rgba(0,232,123,0.06)', border: '1px solid rgba(0,232,123,0.15)' }}>
                    <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>${user.creditoReferidos.toLocaleString('es-AR')}</p>
                    <p className="text-xs" style={{ color: 'var(--text2)' }}>Crédito ganado</p>
                  </div>
                )}
                {user?.descuentoReferido > 0 && (
                  <div className="rounded-lg px-3 py-2 text-center"
                    style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                    <p className="text-lg font-bold text-blue-400">${user.descuentoReferido.toLocaleString('es-AR')}</p>
                    <p className="text-xs" style={{ color: 'var(--text2)' }}>Tu descuento</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Compartí tu código al registrarse en Akira Cloud. Cuando paguen su primer plan, vos ganás crédito y ellos obtienen descuento automáticamente.
          </p>
        </div>

        {/* Info de pago */}
        <div className="text-xs space-y-1.5" style={{ color: 'var(--muted)' }}>
          <p>✓ Pagos seguros vía <strong style={{ color: 'var(--text2)' }}>MercadoPago</strong> — tarjeta, transferencia, Rapipago o Pago Fácil</p>
          <p>✓ Cancelá cuando quieras · Sin permanencia · Los planes anuales se pagan en un solo pago</p>
          <p>✓ ¿Dudas? <a href="https://martin-arrayago.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }} className="hover:underline">Contactá al soporte</a></p>
        </div>

      </div>
    </Layout>
  );
}
