import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { Play, Square, RefreshCw, MessageSquare, Calendar, DollarSign, Wifi, WifiOff, Clock, AlertCircle } from 'lucide-react';
import OnboardingChecklist from '../components/OnboardingChecklist';
import ReferralCard from '../components/ReferralCard';

// ── Componente: tarjeta de estadística ──────────────────────
function StatCard({ icon, label, value, color = 'text-green-400' }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Componente: indicador de estado del bot ──────────────────
function BotStatusBadge({ activo, conectado }) {
  if (conectado) return <span className="badge-green flex items-center gap-1.5"><Wifi size={11} /> Conectado</span>;
  if (activo)    return <span className="badge-yellow flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /> Iniciando...</span>;
  return             <span className="badge-red flex items-center gap-1.5"><WifiOff size={11} /> Desconectado</span>;
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { on }                = useSocket(user?._id);

  const [botStatus, setBotStatus] = useState({ activo: user?.botActivo, conectado: user?.botConectado });
  const [qrData,    setQrData]    = useState(null);
  const [logs,      setLogs]      = useState([]);
  const [stats,     setStats]     = useState({ mensajes: 0, reservas: 0, pagos: 0 });
  const [loading,   setLoading]   = useState({ start: false, stop: false });
  const logsRef = useRef(null);

  // ── Cargar datos iniciales ──────────────────────────────────
  useEffect(() => {
    api.get('/bot/status').then(r => setBotStatus(r.data)).catch(() => {});
    api.get('/bot/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/bot/logs?limit=30').then(r => setLogs(r.data.logs.reverse())).catch(() => {});
  }, []);

  // ── Eventos Socket.io ───────────────────────────────────────
  useEffect(() => {
    const removeQR    = on('bot:qr',    ({ qr }) => { setQrData(qr); setBotStatus(s => ({ ...s, activo: true, conectado: false })); });
    const removeReady = on('bot:ready', () => { setQrData(null); setBotStatus({ activo: true, conectado: true }); refreshUser(); toast.success('✅ WhatsApp conectado'); });
    const removeDis   = on('bot:disconnected', () => { setBotStatus({ activo: false, conectado: false }); setQrData(null); refreshUser(); toast.error('WhatsApp desconectado'); });
    const removeStop  = on('bot:stopped', () => { setBotStatus({ activo: false, conectado: false }); setQrData(null); });
    const removeErr   = on('bot:error',  ({ msg }) => toast.error(msg));
    const removeBlock = on('bot:blocked', ({ motivo }) => { toast.error('Cuenta bloqueada: ' + motivo); });
    const removeSub   = on('suscripcion:activada', ({ plan }) => {
      toast.success(`✅ Plan ${plan} activado. ¡Gracias por suscribirte!`);
      refreshUser();
    });
    const removeLog   = on('bot:log',   ({ msg, ts }) => {
      setLogs(prev => {
        const next = [...prev, { mensaje: msg, ts, _id: Date.now() }];
        return next.slice(-100);
      });
    });
    return () => { removeQR(); removeReady(); removeDis(); removeStop(); removeErr(); removeBlock(); removeSub(); removeLog(); };
  }, [on]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // ── Controles del bot ───────────────────────────────────────
  const startBot = async () => {
    setLoading(l => ({ ...l, start: true }));
    try {
      const r = await api.post('/bot/start');
      if (!r.data.ok) throw new Error(r.data.msg);
      setBotStatus(s => ({ ...s, activo: true }));
      toast.success(r.data.msg);
    } catch (err) {
      toast.error(err.response?.data?.msg || err.message);
    } finally {
      setLoading(l => ({ ...l, start: false }));
    }
  };

  const stopBot = async () => {
    setLoading(l => ({ ...l, stop: true }));
    try {
      await api.post('/bot/stop');
      setBotStatus({ activo: false, conectado: false });
      setQrData(null);
      toast.success('Bot detenido');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al detener');
    } finally {
      setLoading(l => ({ ...l, stop: false }));
    }
  };

  const logColor = (msg) => {
    if (!msg) return 'text-gray-500';
    if (msg.includes('✅') || msg.includes('🟢') || msg.includes('listo')) return 'text-green-400';
    if (msg.includes('❌') || msg.includes('Error') || msg.includes('ERROR')) return 'text-red-400';
    if (msg.includes('⚠️') || msg.includes('WARN')) return 'text-yellow-400';
    if (msg.includes('🔧') || msg.includes('Tool')) return 'text-blue-400';
    if (msg.includes('🤖')) return 'text-purple-400';
    return 'text-gray-400';
  };

  const planVigente = user?.plan === 'trial' ? new Date(user.trialExpira) > new Date() : true;
  const diasTrial   = user?.plan === 'trial' ? Math.max(0, Math.ceil((new Date(user.trialExpira) - new Date()) / 86400000)) : null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Checklist de onboarding */}
        <OnboardingChecklist user={user} botStatus={botStatus} />

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-500 text-sm mt-0.5">Bienvenido, {user?.nombre} 👋</p>
          </div>
          <div className="flex items-center gap-3">
            <BotStatusBadge activo={botStatus.activo} conectado={botStatus.conectado} />
            {!botStatus.activo ? (
              <button onClick={startBot} disabled={loading.start || !planVigente} className="btn-primary">
                {loading.start ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Iniciando...</> : <><Play size={15} />Iniciar bot</>}
              </button>
            ) : (
              <button onClick={stopBot} disabled={loading.stop} className="btn-danger">
                {loading.stop ? <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Square size={15} />}
                Detener
              </button>
            )}
          </div>
        </div>

        {/* Alerta trial — no mostrar para admins */}
        {user?.plan === 'trial' && user?.rol !== 'admin' && (
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border text-sm ${diasTrial <= 2 ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
            <Clock size={16} />
            {diasTrial > 0
              ? `Tu prueba gratuita vence en ${diasTrial} día${diasTrial !== 1 ? 's' : ''}. Elegí un plan para no perder el acceso.`
              : 'Tu prueba gratuita venció. Elegí un plan para reactivar el bot.'}
          </div>
        )}
        {/* Badge admin */}
        {user?.rol === 'admin' && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-yellow-500/30 bg-yellow-500/5 text-sm text-yellow-400">
            <span>👑</span>
            Acceso administrador — todas las funciones activas sin límite.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<MessageSquare size={18} />} label="Mensajes hoy" value={stats.mensajes} />
          <StatCard icon={<Calendar size={18} />}      label="Reservas" value={stats.reservas} color="text-blue-400" />
          <StatCard icon={<DollarSign size={18} />}    label="Cobros del bot" value={stats.pagos} color="text-purple-400" />
          <StatCard icon={<Wifi size={18} />}          label="Estado bot" value={botStatus.conectado ? 'Activo' : 'Inactivo'} color={botStatus.conectado ? 'text-green-400' : 'text-gray-500'} />
        </div>

        {/* Referidos */}
        <ReferralCard />

        <div className="grid md:grid-cols-2 gap-5">
          {/* QR / Estado */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Wifi size={16} className="text-green-400" /> Conexión WhatsApp
            </h2>

            {!botStatus.activo && !qrData && (
              <div className="text-center py-10">
                <WifiOff size={36} className="text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">El bot está detenido.</p>
                <p className="text-gray-600 text-xs mt-1">Presioná "Iniciar bot" para arrancarlo.</p>
                {!planVigente && (
                  <div className="flex items-center gap-2 mt-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 justify-center">
                    <AlertCircle size={13} /> Plan vencido — renovar suscripción
                  </div>
                )}
              </div>
            )}

            {botStatus.activo && !botStatus.conectado && !qrData && (
              <div className="text-center py-10">
                <RefreshCw size={36} className="text-yellow-400 mx-auto mb-3 animate-spin" />
                <p className="text-gray-400 text-sm">Iniciando bot...</p>
                <p className="text-gray-600 text-xs mt-1">Esto puede tardar hasta 30 segundos.</p>
              </div>
            )}

            {qrData && (
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-xl mb-4">
                  <QRCodeSVG value={qrData} size={200} />
                </div>
                <div className="space-y-1.5 text-center">
                  <p className="text-sm font-medium text-white">Escaneá el QR con WhatsApp</p>
                  <p className="text-xs text-gray-500">Abrí WhatsApp → ⋮ Menú → <strong>Dispositivos vinculados</strong> → <strong>Vincular</strong></p>
                  <p className="text-xs text-yellow-500">⏳ El QR se renueva cada 20 segundos</p>
                </div>
              </div>
            )}

            {botStatus.conectado && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-green-500/30">
                  <Wifi size={28} className="text-green-400" />
                </div>
                <p className="text-green-400 font-semibold">¡Bot activo y conectado!</p>
                <p className="text-gray-500 text-xs mt-1">Atendiendo mensajes de WhatsApp en tiempo real.</p>
              </div>
            )}
          </div>

          {/* Logs en vivo */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4 flex items-center justify-between">
              <span>📋 Actividad en vivo</span>
              <button onClick={() => setLogs([])} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Limpiar</button>
            </h2>
            <div ref={logsRef} className="h-72 overflow-y-auto bg-black/50 rounded-lg p-3 font-mono text-xs space-y-0.5 border border-gray-800">
              {logs.length === 0 ? (
                <p className="text-gray-700 text-center pt-10">Sin actividad aún...</p>
              ) : logs.map((l, i) => (
                <div key={l._id || i} className="flex gap-2">
                  <span className="text-gray-700 flex-shrink-0 w-14">{l.ts || ''}</span>
                  <span className={logColor(l.mensaje)}>{l.mensaje}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
