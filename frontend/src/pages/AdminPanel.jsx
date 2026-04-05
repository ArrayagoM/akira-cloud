import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Users, Bot, AlertTriangle, Activity, Search, Shield,
  Ban, Unlock, Key, ChevronLeft, ChevronRight, RefreshCw,
  Square, Eye, X, Crown, FlaskConical, GitBranch, BadgeCheck,
  Lightbulb, TrendingUp
} from 'lucide-react';

// ── Tarjeta de stat admin ────────────────────────────────────
function AdminStat({ icon, label, value, color = 'text-white' }) {
  return (
    <div className="card text-center p-3">
      <div className={`text-2xl font-extrabold mb-1 ${color}`}>{value ?? '—'}</div>
      <div className="flex items-center justify-center gap-1 text-xs text-gray-500 leading-tight">
        {icon} <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

// ── Badge de status ──────────────────────────────────────────
function StatusBadge({ status }) {
  const map = { activo: 'badge-green', bloqueado: 'badge-red', pendiente: 'badge-yellow' };
  return <span className={map[status] || 'badge-gray'}>{status}</span>;
}

// ── Modal de usuario ─────────────────────────────────────────
function UserModal({ user, onClose, onAction }) {
  const [newPwd, setNewPwd]     = useState('');
  const [motivo, setMotivo]     = useState('');
  const [planSel, setPlanSel]   = useState(user.plan || 'trial');
  const [meses,  setMeses]      = useState('1');
  const [loading, setLoading]   = useState({});

  const action = async (tipo, payload) => {
    setLoading(l => ({ ...l, [tipo]: true }));
    try {
      await onAction(tipo, user._id, payload);
    } finally {
      setLoading(l => ({ ...l, [tipo]: false }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '20px 20px 0 0',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border2)' }} />
        </div>

        <div className="px-5 pb-6 pt-3 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-white truncate mr-3">{user.nombre} {user.apellido}</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-white flex-shrink-0"><X size={18} /></button>
          </div>

          <div className="space-y-2 mb-5 text-sm">
            {[
              { label: 'Email',      value: user.email,        cls: 'text-gray-300 text-xs break-all' },
              { label: 'Plan',       value: user.plan,         cls: 'text-gray-300' },
              { label: 'Proveedor',  value: user.auth_provider,cls: 'text-gray-300' },
              { label: 'Logins',     value: user.loginCount,   cls: 'text-gray-300' },
            ].map(row => (
              <div key={row.label} className="flex justify-between gap-3">
                <span className="text-gray-500 flex-shrink-0">{row.label}</span>
                <span className={row.cls}>{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Bot activo</span>
              <span className={user.botConectado ? 'text-green-400' : 'text-gray-500'}>{user.botConectado ? 'Sí' : 'No'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Estado</span>
              <StatusBadge status={user.status} />
            </div>
            {user.bloqueadoPor && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-500 flex-shrink-0">Motivo</span>
                <span className="text-red-400 text-xs text-right">{user.bloqueadoPor}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Registro</span>
              <span className="text-gray-500 text-xs">{new Date(user.createdAt).toLocaleDateString('es-AR')}</span>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            {/* Cambiar contraseña */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase">Nueva contraseña</label>
              <div className="flex gap-2">
                <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  className="input-base flex-1 min-w-0" placeholder="Mín. 8 caracteres" />
                <button onClick={() => action('password', { nuevaPassword: newPwd })}
                  disabled={newPwd.length < 8 || loading.password} className="btn-secondary px-3 text-xs flex-shrink-0">
                  {loading.password ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : <Key size={13} />}
                </button>
              </div>
            </div>

            {/* Bloquear / Desbloquear */}
            {user.status === 'activo' ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400 uppercase">Motivo del bloqueo</label>
                <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)}
                  className="input-base" placeholder="Describe el motivo (opcional)" />
                <button onClick={() => action('block', { motivo })} disabled={loading.block} className="btn-danger w-full">
                  {loading.block ? <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Ban size={15} />}
                  🚨 Bloquear usuario
                </button>
                <p className="text-xs text-gray-600">Detiene el bot y bloquea el acceso inmediatamente.</p>
              </div>
            ) : (
              <button onClick={() => action('unblock', {})} disabled={loading.unblock} className="btn-primary w-full">
                {loading.unblock ? <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Unlock size={15} />}
                Desbloquear usuario
              </button>
            )}

            {/* Activar plan */}
            <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <label className="text-xs font-medium text-gray-400 uppercase flex items-center gap-1">
                <Crown size={11} /> Activar plan manualmente
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select value={planSel} onChange={e => setPlanSel(e.target.value)} className="input-base text-sm">
                  <option value="trial">Trial</option>
                  <option value="basico">Básico</option>
                  <option value="pro">Pro</option>
                  <option value="agencia">Agencia</option>
                  <option value="admin">Admin</option>
                </select>
                <select value={meses} onChange={e => setMeses(e.target.value)} className="input-base text-sm">
                  <option value="1">1 mes</option>
                  <option value="3">3 meses</option>
                  <option value="6">6 meses</option>
                  <option value="12">12 meses</option>
                </select>
              </div>
              <button
                onClick={() => action('activarPlan', { plan: planSel, meses: parseInt(meses) })}
                disabled={loading.activarPlan}
                className="btn-primary w-full text-sm"
              >
                {loading.activarPlan
                  ? <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  : <Crown size={14} />}
                Activar {planSel} — {meses} mes{meses > 1 ? 'es' : ''}
              </button>
            </div>

            {/* Modo Tester */}
            <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-1.5">
                  <FlaskConical size={13} className="text-indigo-400" /> Modo Tester
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Acceso completo sin pagar plan</p>
              </div>
              <button
                onClick={() => action('tester', {})}
                disabled={loading.tester}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${user.esTester ? 'bg-indigo-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${user.esTester ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {/* Detener bot */}
            {user.botActivo && (
              <button onClick={() => action('stopBot', {})} disabled={loading.stopBot}
                className="btn-secondary w-full text-orange-400 border-orange-500/20">
                <Square size={15} /> Detener bot
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const [stats,          setStats]          = useState(null);
  const [users,          setUsers]          = useState([]);
  const [logs,           setLogs]           = useState([]);
  const [bots,           setBots]           = useState([]);
  const [referidos,      setReferidos]      = useState([]);
  const [totalPendiente, setTotalPendiente] = useState(0);
  const [pagandoRef,     setPagandoRef]     = useState(null);
  const [tab,     setTab]     = useState('usuarios');
  const [search,  setSearch]  = useState('');
  const [filtro,  setFiltro]  = useState('');
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [total,   setTotal]   = useState(0);
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [sugerencias, setSugerencias] = useState([]);
  const [loadingSugs, setLoadingSugs] = useState(false);
  const [filtroSug,   setFiltroSug]   = useState('');
  const [actualizandoSug, setActualizandoSug] = useState(null);

  const cargarSugerencias = useCallback(async () => {
    setLoadingSugs(true);
    try {
      const r = await api.get('/suggestions');
      setSugerencias(r.data.sugerencias || []);
    } catch {} finally { setLoadingSugs(false); }
  }, []);

  const cargarStats     = useCallback(async () => { const r = await api.get('/admin/dashboard'); setStats(r.data.stats); }, []);
  const cargarUsuarios  = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/users?page=${page}&search=${search}&status=${filtro}&limit=15`);
      setUsers(r.data.users); setPages(r.data.pages); setTotal(r.data.total);
    } finally { setLoading(false); }
  }, [page, search, filtro]);
  const cargarLogs      = useCallback(async () => { const r = await api.get('/admin/logs?limit=50&nivel=error'); setLogs(r.data.logs); }, []);
  const cargarBots      = useCallback(async () => { const r = await api.get('/admin/bots/active'); setBots(r.data.bots); }, []);
  const cargarReferidos = useCallback(async () => {
    const r = await api.get('/admin/referidos');
    setReferidos(r.data.referidos);
    setTotalPendiente(r.data.totalPendiente || 0);
  }, []);

  const pagarComision = async (refId) => {
    setPagandoRef(refId);
    try {
      await api.post(`/admin/referidos/${refId}/pagar`);
      toast.success('Comisión marcada como pagada');
      cargarReferidos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally { setPagandoRef(null); }
  };

  useEffect(() => { cargarStats(); }, []);
  useEffect(() => { if (tab === 'usuarios')  cargarUsuarios(); },  [tab, page, search, filtro, cargarUsuarios]);
  useEffect(() => { if (tab === 'logs')      cargarLogs(); },      [tab]);
  useEffect(() => { if (tab === 'bots')      cargarBots(); },      [tab]);
  useEffect(() => { if (tab === 'referidos') cargarReferidos(); }, [tab]);
  useEffect(() => { if (tab === 'ideas') cargarSugerencias(); }, [tab, cargarSugerencias]);

  const handleAction = async (tipo, userId, payload) => {
    try {
      if (tipo === 'block')       await api.post(`/admin/users/${userId}/block`, payload)        .then(() => toast.success('Usuario bloqueado'));
      if (tipo === 'unblock')     await api.post(`/admin/users/${userId}/unblock`)               .then(() => toast.success('Usuario desbloqueado'));
      if (tipo === 'password')    await api.post(`/admin/users/${userId}/password`, payload)     .then(() => toast.success('Contraseña cambiada'));
      if (tipo === 'stopBot')     await api.post(`/admin/bots/${userId}/stop`)                   .then(() => toast.success('Bot detenido'));
      if (tipo === 'activarPlan') {
        const r = await api.post(`/admin/users/${userId}/activar-plan`, payload);
        toast.success(`✅ Plan ${payload.plan} activado — expira ${new Date(r.data.expira).toLocaleDateString('es-AR')}`);
      }
      if (tipo === 'tester') {
        const r = await api.post(`/admin/users/${userId}/tester`);
        toast.success(r.data.esTester ? '🧪 Modo tester activado' : 'Modo tester desactivado');
      }
      setSelected(null);
      cargarUsuarios();
      cargarStats();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al ejecutar acción');
    }
  };

  const actualizarSugerencia = async (id, update) => {
    setActualizandoSug(id);
    try {
      await api.patch(`/suggestions/${id}`, update);
      toast.success('Sugerencia actualizada');
      cargarSugerencias();
    } catch { toast.error('Error al actualizar'); }
    finally { setActualizandoSug(null); }
  };

  const tabs = [
    { id: 'usuarios',  label: 'Usuarios',     icon: <Users size={15} /> },
    { id: 'bots',      label: 'Bots',         icon: <Bot size={15} /> },
    { id: 'logs',      label: 'Logs',         icon: <AlertTriangle size={15} /> },
    { id: 'referidos', label: 'Referidos',    icon: <GitBranch size={15} /> },
    { id: 'ideas',     label: 'Ideas 💡',     icon: <Lightbulb size={15} /> },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Shield size={20} className="text-red-400 flex-shrink-0" />
              <span className="truncate">Panel Admin</span>
            </h1>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--muted)' }}>Control total de la plataforma</p>
          </div>
          <button onClick={() => { cargarStats(); cargarUsuarios(); }} className="btn-secondary text-xs py-2 px-3 flex-shrink-0">
            <RefreshCw size={13} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>

        {/* Stats — 2 cols mobile, 4 cols md, 7 cols xl */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
          <AdminStat icon={<Users size={11}/>}       label="Total"        value={stats?.totalUsuarios} />
          <AdminStat icon={<Activity size={11}/>}    label="Activos"      value={stats?.activos}        color="text-green-400" />
          <AdminStat icon={<Ban size={11}/>}         label="Bloqueados"   value={stats?.bloqueados}     color="text-red-400" />
          <AdminStat icon={<Bot size={11}/>}         label="Bots WA"      value={stats?.botsActivos}    color="text-blue-400" />
          <AdminStat icon={<Bot size={11}/>}         label="En memoria"   value={stats?.activeInMemory} color="text-purple-400" />
          <AdminStat icon={<AlertTriangle size={11}/>} label="Errores hoy" value={stats?.erroresHoy}   color="text-yellow-400" />
          <AdminStat icon={<Users size={11}/>}       label="Registros hoy" value={stats?.registrosHoy} color="text-cyan-400" />
        </div>

        {/* Tabs — scrollables en mobile */}
        <div className="overflow-x-auto -mx-4 px-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex gap-0 min-w-max">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  tab === t.id
                    ? 'border-green-500 text-green-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── TAB: Usuarios ── */}
        {tab === 'usuarios' && (
          <div className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Buscar por nombre o email..."
                  className="input-base pl-9 w-full" />
              </div>
              <select value={filtro} onChange={e => { setFiltro(e.target.value); setPage(1); }}
                className="input-base w-full sm:w-36">
                <option value="">Todos</option>
                <option value="activo">Activos</option>
                <option value="bloqueado">Bloqueados</option>
                <option value="pendiente">Pendientes</option>
              </select>
            </div>

            {/* Tabla con scroll horizontal en mobile */}
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm" style={{ minWidth: 340 }}>
                <thead style={{ background: 'var(--surface2)' }}>
                  <tr>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Usuario</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium hidden sm:table-cell">Plan</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Estado</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium hidden md:table-cell">Bot</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium hidden lg:table-cell">Registro</th>
                    <th className="px-3 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-600">Cargando...</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-600">Sin resultados</td></tr>
                  ) : users.map((u, i) => (
                    <tr key={u._id} className="border-t transition-colors hover:bg-gray-900/40"
                      style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td className="px-3 py-3 max-w-[140px]">
                        <p className="font-medium text-white text-sm truncate">{u.nombre} {u.apellido}</p>
                        <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="badge-gray">{u.plan}</span>
                          {u.esTester && <span className="text-xs text-indigo-400 flex items-center gap-0.5"><FlaskConical size={10}/>tester</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={u.status} /></td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {u.botConectado
                          ? <span className="flex items-center gap-1 text-xs text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>Activo</span>
                          : <span className="text-xs text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 hidden lg:table-cell">
                        {new Date(u.createdAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => setSelected(u)}
                          className="text-gray-500 hover:text-white p-1.5 hover:bg-gray-800 rounded-lg transition-colors">
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {pages > 1 && (
              <div className="flex items-center justify-between text-sm flex-wrap gap-2">
                <span className="text-gray-600 text-xs">{total} usuarios</span>
                <div className="flex items-center gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-gray-400 text-xs">Pág {page} / {pages}</span>
                  <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
                    className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Bots activos ── */}
        {tab === 'bots' && (
          <div className="space-y-3">
            {bots.length === 0 ? (
              <div className="card text-center py-12 text-gray-600">No hay bots activos en este momento.</div>
            ) : bots.map(b => (
              <div key={b._id} className="card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{b.nombre}</p>
                  <p className="text-xs text-gray-500 truncate">{b.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="hidden sm:flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Conectado
                  </span>
                  <button onClick={() => handleAction('stopBot', b._id, {})} className="btn-danger py-1.5 px-3 text-xs">
                    <Square size={12} /> Detener
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB: Logs de error ── */}
        {tab === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="card text-center py-12 text-gray-600">Sin errores recientes. ✅</div>
            ) : logs.map(l => (
              <div key={l._id} className="card flex items-start gap-3 py-3 px-3 sm:px-4">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-xs text-gray-500">{new Date(l.createdAt).toLocaleString('es-AR')}</span>
                    {l.userId && <span className="text-xs text-blue-400 truncate max-w-[120px]">{l.userId.email || l.userId}</span>}
                  </div>
                  <p className="text-sm text-gray-300 break-words">{l.mensaje}</p>
                  {l.detalle && <p className="text-xs text-gray-600 mt-0.5 break-words">{typeof l.detalle === 'string' ? l.detalle : JSON.stringify(l.detalle)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB: Referidos ── */}
        {tab === 'referidos' && (
          <div className="space-y-4">
            {/* Stats referidos */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="card text-center p-3">
                <p className="text-xl sm:text-2xl font-bold text-white">{referidos.length}</p>
                <p className="text-xs text-gray-500 mt-1">Total</p>
              </div>
              <div className="card text-center p-3">
                <p className="text-xl sm:text-2xl font-bold text-green-400">
                  {referidos.filter(r => r.estado === 'activo' || r.estado === 'pagado').length}
                </p>
                <p className="text-xs text-gray-500 mt-1">Convertidos</p>
              </div>
              <div className={`card text-center p-3 ${totalPendiente > 0 ? 'border-yellow-500/30 bg-yellow-500/5' : ''}`}>
                <p className={`text-xl sm:text-2xl font-bold ${totalPendiente > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                  ${totalPendiente.toLocaleString('es-AR')}
                </p>
                <p className="text-xs text-gray-500 mt-1">A pagar</p>
              </div>
            </div>

            {/* Comisiones pendientes */}
            {totalPendiente > 0 && (
              <div className="card space-y-3" style={{ border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.03)' }}>
                <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">💸 Comisiones pendientes</p>
                {referidos.filter(r => !r.comisionPagada && r.estado !== 'pendiente').map(r => (
                  <div key={r._id} className="rounded-lg px-3 py-3 space-y-2"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">{r.referente?.nombre}</p>
                        <p className="text-xs text-gray-500 truncate">{r.referente?.email}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Referido: <span className="text-white">{r.referido?.nombre}</span>
                          {' · '}<span className="font-mono text-indigo-400">{r.codigo}</span>
                        </p>
                      </div>
                      <span className="text-sm font-bold text-yellow-400 flex-shrink-0">
                        ${(r.comisionPendiente || 0).toLocaleString('es-AR')}
                      </span>
                    </div>
                    <button
                      onClick={() => pagarComision(r._id)}
                      disabled={pagandoRef === r._id}
                      className="w-full flex items-center justify-center gap-1.5 text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {pagandoRef === r._id
                        ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <BadgeCheck size={12} />}
                      Marcar pagado
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Tabla referidos — scroll horizontal */}
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm" style={{ minWidth: 420 }}>
                <thead style={{ background: 'var(--surface2)' }}>
                  <tr>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Referente</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Referido</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium hidden sm:table-cell">Código</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Estado</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium">Comisión</th>
                  </tr>
                </thead>
                <tbody>
                  {referidos.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-gray-600">Sin referidos aún.</td></tr>
                  ) : referidos.map((r, i) => (
                    <tr key={r._id} className="border-t"
                      style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td className="px-3 py-3 max-w-[110px]">
                        <p className="text-white text-sm truncate">{r.referente?.nombre}</p>
                        <p className="text-xs text-gray-500 truncate">{r.referente?.email}</p>
                      </td>
                      <td className="px-3 py-3 max-w-[110px]">
                        <p className="text-white text-sm truncate">{r.referido?.nombre}</p>
                        <p className="text-xs text-gray-500 truncate">{r.referido?.email}</p>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <span className="font-mono text-xs text-indigo-400">{r.codigo}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium ${r.estado === 'pagado' ? 'text-green-400' : r.estado === 'activo' ? 'text-blue-400' : 'text-yellow-400'}`}>
                          {r.estado}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {r.comisionPagada
                          ? <span className="text-xs text-gray-600">✓ pagado</span>
                          : r.estado === 'pendiente'
                            ? <span className="text-xs text-gray-600">—</span>
                            : <span className="text-xs font-semibold text-yellow-400 whitespace-nowrap">
                                ${(r.comisionPendiente || 0).toLocaleString('es-AR')}
                              </span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

        {/* ── TAB: Ideas ── */}
        {tab === 'ideas' && (
          <div className="space-y-4">
            {/* Filtros */}
            <div className="flex gap-2 flex-wrap">
              {['', 'analizada', 'en_progreso', 'implementada', 'descartada'].map(e => (
                <button key={e} onClick={() => setFiltroSug(e)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    filtroSug === e
                      ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                      : 'border-gray-700 text-gray-500 hover:border-gray-600'
                  }`}>
                  {e === '' ? 'Todas' : e === 'analizada' ? 'Recibidas' : e === 'en_progreso' ? 'En desarrollo' : e === 'implementada' ? '✅ Implementadas' : '❌ Descartadas'}
                </button>
              ))}
              <button onClick={cargarSugerencias} className="ml-auto btn-secondary text-xs py-1.5 px-3">
                <RefreshCw size={12} className={loadingSugs ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingSugs ? (
              <div className="card text-center py-10 text-gray-600">Cargando...</div>
            ) : sugerencias.filter(s => !filtroSug || s.estado === filtroSug).length === 0 ? (
              <div className="card text-center py-10 text-gray-600">No hay sugerencias{filtroSug ? ` con estado "${filtroSug}"` : ''}</div>
            ) : (
              <div className="space-y-3">
                {sugerencias
                  .filter(s => !filtroSug || s.estado === filtroSug)
                  .map(s => {
                    const scoreColor =
                      !s.puntuacion ? 'text-gray-600' :
                      s.puntuacion >= 8 ? 'text-green-400' :
                      s.puntuacion >= 5 ? 'text-yellow-400' : 'text-gray-500';
                    const scoreBg =
                      !s.puntuacion ? 'bg-gray-800' :
                      s.puntuacion >= 8 ? 'bg-green-500/15 border border-green-500/30' :
                      s.puntuacion >= 5 ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-gray-800';
                    return (
                      <div key={s._id} className="card space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-xs text-gray-400 font-medium">{s.userNombre}</span>
                              <span className="text-xs text-gray-600">{s.userEmail}</span>
                              <span className="text-[10px] text-gray-600">
                                {new Date(s.createdAt).toLocaleDateString('es-AR')}
                              </span>
                            </div>
                            <p className="text-sm text-gray-200 leading-relaxed">{s.texto}</p>
                          </div>
                          {/* Score */}
                          {s.puntuacion && (
                            <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center ${scoreBg}`}>
                              <span className={`text-lg font-extrabold leading-none ${scoreColor}`}>{s.puntuacion}</span>
                              <span className="text-[9px] text-gray-600">/10</span>
                            </div>
                          )}
                        </div>

                        {/* Análisis IA */}
                        {s.analisisIA?.resumen && (
                          <div className="bg-gray-900/50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Categoría</p>
                              <p className="text-xs text-white font-medium">{s.analisisIA.categoria || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Dificultad</p>
                              <p className={`text-xs font-medium ${s.analisisIA.dificultad === 'alta' ? 'text-red-400' : s.analisisIA.dificultad === 'media' ? 'text-yellow-400' : 'text-green-400'}`}>
                                {s.analisisIA.dificultad || '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Prioridad</p>
                              <p className={`text-xs font-medium ${s.analisisIA.prioridad === 'crítica' ? 'text-red-400' : s.analisisIA.prioridad === 'alta' ? 'text-orange-400' : s.analisisIA.prioridad === 'media' ? 'text-yellow-400' : 'text-gray-400'}`}>
                                {s.analisisIA.prioridad || '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Estado</p>
                              <p className="text-xs text-gray-300">{s.estado}</p>
                            </div>
                            {s.analisisIA.resumen && (
                              <div className="col-span-2 sm:col-span-4">
                                <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Análisis</p>
                                <p className="text-xs text-gray-400">{s.analisisIA.resumen}</p>
                                {s.analisisIA.valor && <p className="text-xs text-gray-500 mt-0.5 italic">{s.analisisIA.valor}</p>}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Acciones admin */}
                        <div className="flex gap-2 flex-wrap items-center border-t border-gray-800/60 pt-3">
                          {['en_progreso','implementada','descartada'].map(estado => (
                            <button key={estado}
                              onClick={() => actualizarSugerencia(s._id, { estado })}
                              disabled={actualizandoSug === s._id || s.estado === estado}
                              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                                s.estado === estado
                                  ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                  : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                              }`}>
                              {estado === 'en_progreso' ? '🔨 En desarrollo' : estado === 'implementada' ? '✅ Implementada' : '❌ Descartar'}
                            </button>
                          ))}
                          <input
                            placeholder="Nota para el usuario..."
                            defaultValue={s.notaAdmin || ''}
                            onBlur={e => { if (e.target.value !== (s.notaAdmin || '')) actualizarSugerencia(s._id, { notaAdmin: e.target.value }); }}
                            className="flex-1 min-w-[160px] text-xs input-base py-1"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

      {/* Modal */}
      {selected && <UserModal user={selected} onClose={() => setSelected(null)} onAction={handleAction} />}
    </Layout>
  );
}
