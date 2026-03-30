import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { Play, Square, RefreshCw, MessageSquare, Calendar, DollarSign, Wifi, WifiOff,
         Clock, AlertCircle, PauseCircle, PlayCircle, Plus, Trash2, Phone, Edit3, Check, X } from 'lucide-react';
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

// ── Sección de conexión WhatsApp (por slot) ──────────────────
function WaConnectionCard({ slot, botStatus, qrData, loading, onStart, onStop, planVigente }) {
  return (
    <div className="card card-glow animate-fade-up delay-150">
      <h2 className="font-semibold text-white mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,232,123,0.1)' }}>
            <Wifi size={13} style={{ color: 'var(--accent)' }} />
          </div>
          Conexión WhatsApp {slot > 0 ? `(Cuenta ${slot + 1})` : ''}
        </span>
        <div className="flex items-center gap-2">
          <BotStatusBadge activo={botStatus.activo} conectado={botStatus.conectado} />
          {!botStatus.activo ? (
            <button onClick={onStart} disabled={loading.start || !planVigente} className="btn-primary text-xs px-3 py-1.5">
              {loading.start
                ? <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                : <><Play size={11} />Iniciar</>}
            </button>
          ) : (
            <button onClick={onStop} disabled={loading.stop} className="btn-danger text-xs px-3 py-1.5">
              {loading.stop
                ? <span className="w-3 h-3 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                : <><Square size={11} />Detener</>}
            </button>
          )}
        </div>
      </h2>

      {!botStatus.activo && !qrData && (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'var(--surface3)', border: '1px solid var(--border)' }}>
            <WifiOff size={22} style={{ color: 'var(--muted)' }} />
          </div>
          <p className="font-medium text-white text-sm">Bot detenido</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>Presioná "Iniciar" para arrancar.</p>
          {!planVigente && (
            <div className="flex items-center gap-2 mt-3 rounded-lg px-3 py-2 text-xs justify-center"
              style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }}>
              <AlertCircle size={12} /> Plan vencido — renovar suscripción
            </div>
          )}
        </div>
      )}

      {botStatus.activo && !botStatus.conectado && !qrData && (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <RefreshCw size={22} className="animate-spin" style={{ color: '#f59e0b' }} />
          </div>
          <p className="font-medium text-white text-sm">Iniciando bot...</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>Esto puede tardar hasta 30 segundos.</p>
        </div>
      )}

      {qrData && (
        <div className="flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-glow">
            <QRCodeSVG value={qrData} size={196} />
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
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-glow-pulse"
            style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.25)' }}>
            <Wifi size={26} style={{ color: 'var(--accent)' }} />
          </div>
          <p className="font-semibold" style={{ color: 'var(--accent)' }}>¡Bot activo y conectado!</p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text2)' }}>Atendiendo mensajes de WhatsApp en tiempo real.</p>
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de cuenta (panel multi-cuenta) ───────────────────
function AccountCard({ account, isActive, onSelect, onDelete, onRename }) {
  const [editing, setEditing]   = useState(false);
  const [nombre, setNombre]     = useState(account.nombre);

  const saveNombre = async () => {
    await onRename(account.slot, nombre);
    setEditing(false);
  };

  const dotColor = account.conectado ? '#00e87b' : account.activo ? '#f59e0b' : '#6b7280';

  return (
    <div
      onClick={() => !editing && onSelect(account.slot)}
      className="rounded-xl p-3 cursor-pointer transition-all duration-200 flex items-center gap-3"
      style={{
        background: isActive ? 'rgba(0,232,123,0.08)' : 'var(--surface2)',
        border: `1px solid ${isActive ? 'rgba(0,232,123,0.3)' : 'var(--border)'}`,
        minWidth: '140px',
      }}
    >
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--surface3)', border: '1px solid var(--border)' }}>
          <Phone size={15} style={{ color: 'var(--text2)' }} />
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
          style={{ background: dotColor, borderColor: 'var(--bg)' }} />
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            className="w-full text-xs font-medium text-white bg-transparent border-b outline-none"
            style={{ borderColor: 'var(--accent)' }}
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Enter') saveNombre(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
          />
        ) : (
          <p className="text-xs font-medium text-white truncate">{account.nombre}</p>
        )}
        <p className="text-xs mt-0.5" style={{ color: account.conectado ? 'var(--accent)' : 'var(--muted)' }}>
          {account.conectado ? 'Conectado' : account.activo ? 'Iniciando...' : 'Inactivo'}
        </p>
      </div>

      <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        {editing ? (
          <>
            <button onClick={saveNombre} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-green-500/20">
              <Check size={11} style={{ color: 'var(--accent)' }} />
            </button>
            <button onClick={() => setEditing(false)} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-500/20">
              <X size={11} style={{ color: '#f43f5e' }} />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10">
              <Edit3 size={11} style={{ color: 'var(--muted)' }} />
            </button>
            {account.slot > 0 && (
              <button onClick={() => onDelete(account.slot)} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-500/20">
                <Trash2 size={11} style={{ color: '#f43f5e' }} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { on }                = useSocket(user?._id);

  const isAgencia = user?.plan === 'agencia' || user?.rol === 'admin';

  // ── Estado por slot activo ──────────────────────────────────
  const [activeSlot, setActiveSlot]   = useState(0);
  const [accounts,   setAccounts]     = useState([]);

  // Estado del bot actual (del slot activo)
  const [botStatus, setBotStatus] = useState({ activo: user?.botActivo, conectado: user?.botConectado });
  const [qrData,    setQrData]    = useState(null);
  const [logs,      setLogs]      = useState([]);
  const [stats,     setStats]     = useState({ mensajes: 0, reservas: 0, pagos: 0 });
  const [loading,   setLoading]   = useState({ start: false, stop: false });
  const [modoPausa, setModoPausa] = useState(false);
  const [savingPausa, setSavingPausa] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const logsRef = useRef(null);

  // ── Cargar cuentas (Agencia) ─────────────────────────────────
  const loadAccounts = useCallback(async () => {
    try {
      const r = await api.get('/bot/accounts');
      setAccounts(r.data.accounts || []);
    } catch {}
  }, []);

  // ── Cargar datos iniciales ──────────────────────────────────
  useEffect(() => {
    api.get(`/bot/status?slot=${activeSlot}`).then(r => setBotStatus(r.data)).catch(() => {});
    api.get('/bot/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/bot/logs?limit=30').then(r => setLogs(r.data.logs.reverse())).catch(() => {});
    api.get('/config').then(r => setModoPausa(!!r.data.config?.modoPausa)).catch(() => {});
    if (isAgencia) loadAccounts();
  }, [activeSlot, isAgencia, loadAccounts]);

  // Resetear QR al cambiar de slot
  useEffect(() => { setQrData(null); }, [activeSlot]);

  // ── Eventos Socket.io ───────────────────────────────────────
  useEffect(() => {
    const removeQR    = on('bot:qr',    ({ qr, slot = 0 }) => {
      if (slot !== activeSlot) return;
      setQrData(qr); setBotStatus(s => ({ ...s, activo: true, conectado: false }));
    });
    const removeReady = on('bot:ready', ({ slot = 0 }) => {
      if (slot !== activeSlot) return;
      setQrData(null); setBotStatus({ activo: true, conectado: true });
      setSessionExpired(false);
      refreshUser(); toast.success('✅ WhatsApp conectado');
      if (isAgencia) loadAccounts();
    });
    const removeDis   = on('bot:disconnected', ({ slot = 0 }) => {
      if (slot !== activeSlot) return;
      setBotStatus({ activo: false, conectado: false }); setQrData(null);
      refreshUser(); toast.error('WhatsApp desconectado');
      if (isAgencia) loadAccounts();
    });
    const removeStop  = on('bot:stopped', ({ slot = 0, sessionCleared = false }) => {
      if (slot !== activeSlot) return;
      setBotStatus({ activo: false, conectado: false }); setQrData(null);
      if (sessionCleared) setSessionExpired(true);
      if (isAgencia) loadAccounts();
    });
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
  }, [on, activeSlot, isAgencia, loadAccounts]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // ── Controles del bot ───────────────────────────────────────
  const startBot = async () => {
    setSessionExpired(false);
    setLoading(l => ({ ...l, start: true }));
    try {
      const r = await api.post(`/bot/start?slot=${activeSlot}`);
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
      await api.post(`/bot/stop?slot=${activeSlot}`);
      setBotStatus({ activo: false, conectado: false });
      setQrData(null);
      toast.success('Bot detenido');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al detener');
    } finally {
      setLoading(l => ({ ...l, stop: false }));
    }
  };

  const addAccount = async () => {
    const nextSlot = accounts.length;
    if (nextSlot >= 5) return;
    try {
      await api.post('/bot/accounts', { slot: nextSlot, nombre: `Cuenta ${nextSlot + 1}` });
      await loadAccounts();
      setActiveSlot(nextSlot);
      toast.success(`Cuenta ${nextSlot + 1} agregada`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al agregar cuenta');
    }
  };

  const deleteAccount = async (slot) => {
    if (!window.confirm(`¿Eliminar la Cuenta ${slot + 1}? Se desvinculará el WhatsApp.`)) return;
    try {
      await api.delete(`/bot/accounts/${slot}`);
      if (activeSlot === slot) setActiveSlot(0);
      await loadAccounts();
      toast.success('Cuenta eliminada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const renameAccount = async (slot, nombre) => {
    try {
      await api.post('/bot/accounts', { slot, nombre });
      await loadAccounts();
    } catch {}
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
          {/* Botones de control solo en vista no-Agencia */}
          {!isAgencia && (
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
          )}
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

        {/* ── Panel multi-cuenta Agencia ── */}
        {isAgencia && (
          <div className="card animate-fade-up" style={{ border: '1px solid rgba(0,232,123,0.2)', background: 'rgba(0,232,123,0.03)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs"
                  style={{ background: 'rgba(0,232,123,0.12)' }}>📱</span>
                Cuentas WhatsApp
                <span className="text-xs px-2 py-0.5 rounded-full font-normal"
                  style={{ background: 'rgba(0,232,123,0.1)', color: 'var(--accent)' }}>
                  {accounts.length}/5
                </span>
              </h2>
              {accounts.length < 5 && (
                <button onClick={addAccount}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: 'rgba(0,232,123,0.1)', color: 'var(--accent)', border: '1px solid rgba(0,232,123,0.2)' }}>
                  <Plus size={12} /> Agregar cuenta
                </button>
              )}
            </div>

            {/* Tarjetas de cuentas */}
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
              {accounts.length === 0 ? (
                <div className="text-center py-6 w-full">
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    No hay cuentas configuradas. Hacé clic en "Agregar cuenta" para empezar.
                  </p>
                </div>
              ) : accounts.map(account => (
                <AccountCard
                  key={account.slot}
                  account={account}
                  isActive={activeSlot === account.slot}
                  onSelect={setActiveSlot}
                  onDelete={deleteAccount}
                  onRename={renameAccount}
                />
              ))}
            </div>

            {/* Info del slot activo */}
            {accounts.length > 0 && (
              <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
                Seleccioná una cuenta para ver su estado y QR de vinculación.
              </p>
            )}
          </div>
        )}

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

        {/* Sesión expirada — banner */}
        {sessionExpired && (
          <div className="rounded-xl px-4 py-3 flex items-start gap-3 mb-2"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
            <span style={{ fontSize: '18px', lineHeight: 1.4 }}>⚠️</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>Sesión de WhatsApp expirada</p>
              <p className="text-xs mt-0.5" style={{ color: '#d1d5db' }}>
                Tu sesión fue cerrada por WhatsApp. Iniciá el bot de nuevo para escanear el QR y reconectar.
              </p>
            </div>
            <button onClick={() => setSessionExpired(false)} className="ml-auto text-xs" style={{ color: '#6b7280' }}>✕</button>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          {/* QR / Estado conexión */}
          <WaConnectionCard
            slot={activeSlot}
            botStatus={botStatus}
            qrData={qrData}
            loading={loading}
            onStart={startBot}
            onStop={stopBot}
            planVigente={planVigente}
          />

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
