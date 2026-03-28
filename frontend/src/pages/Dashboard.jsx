import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { Play, Square, RefreshCw, MessageSquare, Calendar, DollarSign, Wifi, WifiOff, Clock, AlertCircle, PauseCircle, PlayCircle } from 'lucide-react';
import OnboardingChecklist from '../components/OnboardingChecklist';
import ReferralCard from '../components/ReferralCard';

// ── Componente: tarjeta de estadística ──────────────────────
function StatCard({ icon, label, value, color = 'text-green-400', accentBg = 'rgba(0,232,123,0.08)' }) {
  return (
    <div className="card card-glow flex items-center gap-4 animate-fade-up">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: accentBg, border: '1px solid rgba(255,255,255,0.06)' }}>
        <span className={color}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{label}</p>
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
  const [modoPausa, setModoPausa] = useState(false);
  const [savingPausa, setSavingPausa] = useState(false);
  const logsRef = useRef(null);

  // ── Cargar datos iniciales ──────────────────────────────────
  useEffect(() => {
    api.get('/bot/status').then(r => setBotStatus(r.data)).catch(() => {});
    api.get('/bot/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/bot/logs?limit=30').then(r => setLogs(r.data.logs.reverse())).catch(() => {});
    api.get('/config').then(r => setModoPausa(!!r.data.config?.modoPausa)).catch(() => {});
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

  const togglePausa = async () => {
    setSavingPausa(true);
    const nuevoEstado = !modoPausa;
    try {
      await api.put('/config/pausa', { modoPausa: nuevoEstado });
      setModoPausa(nuevoEstado);
      toast.success(nuevoEstado ? '⏸️ Modo pausa activado' : '▶️ Bot disponible nuevamente');
    } catch {
      toast.error('Error al cambiar el modo pausa');
    } finally {
      setSavingPausa(false);
    }
  };

  const planVigente = user?.plan === 'trial' ? new Date(user.trialExpira) > new Date() : true;
  const diasTrial   = user?.plan === 'trial' ? Math.max(0, Math.ceil((new Date(user.trialExpira) - new Date()) / 86400000)) : null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-5 animate-page-in">

        {/* Checklist de onboarding */}
        <OnboardingChecklist user={user} botStatus={botStatus} />

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-up">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>Bienvenido de nuevo, <span className="text-white font-medium">{user?.nombre}</span> 👋</p>
          </div>
          <div className="flex items-center gap-2.5">
            <BotStatusBadge activo={botStatus.activo} conectado={botStatus.conectado} />
            {!botStatus.activo ? (
              <button onClick={startBot} disabled={loading.start || !planVigente} className="btn-primary">
                {loading.start
                  ? <><span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />Iniciando...</>
                  : <><Play size={14} />Iniciar bot</>}
              </button>
            ) : (
              <button onClick={stopBot} disabled={loading.stop} className="btn-danger">
                {loading.stop
                  ? <span className="w-3.5 h-3.5 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                  : <Square size={14} />}
                Detener
              </button>
            )}
          </div>
        </div>

        {/* Alertas */}
        {user?.plan === 'trial' && user?.rol !== 'admin' && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm animate-fade-up delay-50"
            style={diasTrial <= 2
              ? { background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }
              : { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
            <Clock size={15} className="flex-shrink-0" />
            {diasTrial > 0
              ? `Tu prueba gratuita vence en ${diasTrial} día${diasTrial !== 1 ? 's' : ''}. Elegí un plan para no perder el acceso.`
              : 'Tu prueba gratuita venció. Elegí un plan para reactivar el bot.'}
          </div>
        )}
        {user?.rol === 'admin' && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm animate-fade-up delay-50"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', color: '#f59e0b' }}>
            <span>👑</span> Acceso administrador — todas las funciones activas sin límite.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<MessageSquare size={18}/>} label="Mensajes hoy"  value={stats.mensajes}
            color="text-green-400"  accentBg="rgba(0,232,123,0.08)"  />
          <StatCard icon={<Calendar size={18}/>}      label="Reservas"      value={stats.reservas}
            color="text-blue-400"   accentBg="rgba(59,130,246,0.1)"   />
          <StatCard icon={<DollarSign size={18}/>}    label="Cobros del bot" value={stats.pagos}
            color="text-purple-400" accentBg="rgba(168,85,247,0.1)"  />
          <StatCard icon={<Wifi size={18}/>}          label="Estado"         value={botStatus.conectado ? 'Activo' : 'Inactivo'}
            color={botStatus.conectado ? 'text-green-400' : 'text-gray-500'}
            accentBg={botStatus.conectado ? 'rgba(0,232,123,0.08)' : 'rgba(74,98,120,0.15)'} />
        </div>

        {/* Modo pausa */}
        <div className="flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-300 animate-fade-up delay-100"
          style={modoPausa
            ? { background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)' }
            : { background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            {modoPausa
              ? <PauseCircle size={17} style={{ color: '#f43f5e', flexShrink: 0 }} />
              : <PlayCircle  size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            <div>
              <p className="text-sm font-medium text-white">
                {modoPausa ? 'Bot en pausa — no acepta nuevos turnos' : 'Recibiendo turnos'}
              </p>
              {modoPausa && <p className="text-xs mt-0.5" style={{ color: 'rgba(244,63,94,0.7)' }}>Los clientes verán un mensaje de no disponibilidad.</p>}
            </div>
          </div>
          <button
            onClick={togglePausa}
            disabled={savingPausa}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex-shrink-0 flex items-center gap-1.5"
            style={modoPausa
              ? { background: 'var(--accent)', color: '#020f08' }
              : { background: 'rgba(244,63,94,0.15)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.25)' }}
          >
            {savingPausa
              ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : modoPausa ? 'Reactivar' : 'Pausar bot'}
          </button>
        </div>

        {/* Referidos */}
        <ReferralCard />

        <div className="grid md:grid-cols-2 gap-5">
          {/* QR / Estado conexión */}
          <div className="card card-glow animate-fade-up delay-150">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,232,123,0.1)' }}>
                <Wifi size={13} style={{ color: 'var(--accent)' }} />
              </div>
              Conexión WhatsApp
            </h2>

            {!botStatus.activo && !qrData && (
              <div className="text-center py-10">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'var(--surface3)', border: '1px solid var(--border)' }}>
                  <WifiOff size={24} style={{ color: 'var(--muted)' }} />
                </div>
                <p className="font-medium text-white text-sm">Bot detenido</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>Presioná "Iniciar bot" para arrancarlo.</p>
                {!planVigente && (
                  <div className="flex items-center gap-2 mt-4 rounded-lg px-3 py-2 text-xs justify-center"
                    style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }}>
                    <AlertCircle size={12} /> Plan vencido — renovar suscripción
                  </div>
                )}
              </div>
            )}

            {botStatus.activo && !botStatus.conectado && !qrData && (
              <div className="text-center py-10">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ color: '#f59e0b' }} />
                </div>
                <p className="font-medium text-white text-sm">Iniciando bot...</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>Esto puede tardar hasta 30 segundos.</p>
              </div>
            )}

            {qrData && (
              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-glow">
                  <QRCodeSVG value={qrData} size={200} />
                </div>
                <div className="space-y-1.5 text-center">
                  <p className="text-sm font-semibold text-white">Escaneá el QR con WhatsApp</p>
                  <p className="text-xs" style={{ color: 'var(--text2)' }}>
                    Abrí WhatsApp → ⋮ Menú → <strong className="text-white">Dispositivos vinculados</strong> → <strong className="text-white">Vincular</strong>
                  </p>
                  <p className="text-xs" style={{ color: '#f59e0b' }}>⏳ El QR se renueva cada 20 segundos</p>
                </div>
              </div>
            )}

            {botStatus.conectado && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-glow-pulse"
                  style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.25)' }}>
                  <Wifi size={26} style={{ color: 'var(--accent)' }} />
                </div>
                <p className="font-semibold" style={{ color: 'var(--accent)' }}>¡Bot activo y conectado!</p>
                <p className="text-xs mt-1.5" style={{ color: 'var(--text2)' }}>Atendiendo mensajes de WhatsApp en tiempo real.</p>
              </div>
            )}
          </div>

          {/* Logs en vivo */}
          <div className="card animate-fade-up delay-200">
            <h2 className="font-semibold text-white mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <span style={{ fontSize: '11px' }}>📋</span>
                </div>
                Actividad en vivo
              </span>
              <button onClick={() => setLogs([])}
                className="text-xs transition-colors px-2 py-1 rounded-md"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.background = 'var(--surface3)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = ''; }}>
                Limpiar
              </button>
            </h2>
            <div ref={logsRef}
              className="h-72 overflow-y-auto rounded-xl p-3 font-mono text-xs space-y-0.5"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>
              {logs.length === 0 ? (
                <p className="text-center pt-10" style={{ color: 'var(--muted)' }}>Sin actividad aún...</p>
              ) : logs.map((l, i) => (
                <div key={l._id || i} className="flex gap-2 leading-relaxed">
                  <span className="flex-shrink-0 w-14" style={{ color: 'var(--muted)' }}>{l.ts || ''}</span>
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
