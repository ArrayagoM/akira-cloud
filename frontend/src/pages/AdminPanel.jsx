import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Users, Bot, AlertTriangle, Activity, Search, Shield,
  Ban, Unlock, Key, ChevronLeft, ChevronRight, RefreshCw,
  Square, Eye, X, Crown
} from 'lucide-react';

// ── Tarjeta de stat admin ────────────────────────────────────
function AdminStat({ icon, label, value, color = 'text-white' }) {
  return (
    <div className="card text-center">
      <div className={`text-3xl font-extrabold mb-1 ${color}`}>{value ?? '—'}</div>
      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
        {icon} {label}
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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-white">{user.nombre} {user.apellido}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-2 mb-5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-300">{user.email}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Plan</span><span className="text-gray-300">{user.plan}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Proveedor</span><span className="text-gray-300">{user.auth_provider}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Logins</span><span className="text-gray-300">{user.loginCount}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Bot activo</span><span className={user.botConectado ? 'text-green-400' : 'text-gray-500'}>{user.botConectado ? 'Sí' : 'No'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Estado</span><StatusBadge status={user.status} /></div>
          {user.bloqueadoPor && <div className="flex justify-between"><span className="text-gray-500">Motivo bloqueo</span><span className="text-red-400 text-xs">{user.bloqueadoPor}</span></div>}
          <div className="flex justify-between"><span className="text-gray-500">Registro</span><span className="text-gray-500 text-xs">{new Date(user.createdAt).toLocaleDateString('es-AR')}</span></div>
        </div>

        <div className="space-y-3 border-t border-gray-800 pt-4">
          {/* Cambiar contraseña */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 uppercase">Nueva contraseña</label>
            <div className="flex gap-2">
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="input-base" placeholder="Nueva contraseña (mín. 8 chars)" />
              <button onClick={() => action('password', { nuevaPassword: newPwd })} disabled={newPwd.length < 8 || loading.password} className="btn-secondary px-3 text-xs whitespace-nowrap">
                {loading.password ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : <Key size={13} />}
              </button>
            </div>
          </div>

          {/* Bloquear / Desbloquear */}
          {user.status === 'activo' ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase">Motivo del bloqueo</label>
              <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} className="input-base" placeholder="Describe el motivo (opcional)" />
              <button onClick={() => action('block', { motivo })} disabled={loading.block} className="btn-danger w-full">
                {loading.block ? <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Ban size={15} />}
                🚨 Bloquear usuario (pánico)
              </button>
              <p className="text-xs text-gray-600">Esto detiene el bot y bloquea el acceso inmediatamente.</p>
            </div>
          ) : (
            <button onClick={() => action('unblock', {})} disabled={loading.unblock} className="btn-primary w-full">
              {loading.unblock ? <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Unlock size={15} />}
              Desbloquear usuario
            </button>
          )}

          {/* Activar / cambiar plan */}
          <div className="space-y-2 border-t border-gray-800 pt-3">
            <label className="text-xs font-medium text-gray-400 uppercase flex items-center gap-1"><Crown size={11} /> Activar plan manualmente</label>
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
              Activar Plan {planSel} — {meses} mes{meses > 1 ? 'es' : ''}
            </button>
          </div>

          {/* Detener bot */}
          {user.botActivo && (
            <button onClick={() => action('stopBot', {})} disabled={loading.stopBot} className="btn-secondary w-full text-orange-400 border-orange-500/20">
              <Square size={15} /> Detener bot
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const [stats,   setStats]   = useState(null);
  const [users,   setUsers]   = useState([]);
  const [logs,    setLogs]    = useState([]);
  const [bots,    setBots]    = useState([]);
  const [tab,     setTab]     = useState('usuarios');
  const [search,  setSearch]  = useState('');
  const [filtro,  setFiltro]  = useState('');
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [total,   setTotal]   = useState(0);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);

  const cargarStats = useCallback(async () => {
    const r = await api.get('/admin/dashboard');
    setStats(r.data.stats);
  }, []);

  const cargarUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/users?page=${page}&search=${search}&status=${filtro}&limit=15`);
      setUsers(r.data.users);
      setPages(r.data.pages);
      setTotal(r.data.total);
    } finally { setLoading(false); }
  }, [page, search, filtro]);

  const cargarLogs = useCallback(async () => {
    const r = await api.get('/admin/logs?limit=50&nivel=error');
    setLogs(r.data.logs);
  }, []);

  const cargarBots = useCallback(async () => {
    const r = await api.get('/admin/bots/active');
    setBots(r.data.bots);
  }, []);

  useEffect(() => { cargarStats(); }, []);
  useEffect(() => { if (tab === 'usuarios') cargarUsuarios(); }, [tab, page, search, filtro, cargarUsuarios]);
  useEffect(() => { if (tab === 'logs') cargarLogs(); }, [tab]);
  useEffect(() => { if (tab === 'bots') cargarBots(); }, [tab]);

  const handleAction = async (tipo, userId, payload) => {
    try {
      if (tipo === 'block')       { await api.post(`/admin/users/${userId}/block`, payload);        toast.success('Usuario bloqueado'); }
      if (tipo === 'unblock')     { await api.post(`/admin/users/${userId}/unblock`);                toast.success('Usuario desbloqueado'); }
      if (tipo === 'password')    { await api.post(`/admin/users/${userId}/password`, payload);      toast.success('Contraseña cambiada'); }
      if (tipo === 'stopBot')     { await api.post(`/admin/bots/${userId}/stop`);                    toast.success('Bot detenido'); }
      if (tipo === 'activarPlan') {
        const r = await api.post(`/admin/users/${userId}/activar-plan`, payload);
        toast.success(`✅ Plan ${payload.plan} activado — expira ${new Date(r.data.expira).toLocaleDateString('es-AR')}`);
      }
      setSelected(null);
      cargarUsuarios();
      cargarStats();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al ejecutar acción');
    }
  };

  const tabs = [
    { id: 'usuarios', label: 'Usuarios', icon: <Users size={15} /> },
    { id: 'bots',     label: 'Bots activos', icon: <Bot size={15} /> },
    { id: 'logs',     label: 'Logs de error', icon: <AlertTriangle size={15} /> },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Shield size={22} className="text-red-400" /> Panel Admin</h1>
            <p className="text-gray-500 text-sm mt-0.5">Control total de la plataforma</p>
          </div>
          <button onClick={() => { cargarStats(); cargarUsuarios(); }} className="btn-secondary text-xs py-2 px-4">
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <AdminStat icon={<Users size={12}/>}    label="Total usuarios"  value={stats?.totalUsuarios} />
          <AdminStat icon={<Activity size={12}/>} label="Activos"         value={stats?.activos}       color="text-green-400" />
          <AdminStat icon={<Ban size={12}/>}      label="Bloqueados"      value={stats?.bloqueados}    color="text-red-400" />
          <AdminStat icon={<Bot size={12}/>}      label="Bots conectados" value={stats?.botsActivos}   color="text-blue-400" />
          <AdminStat icon={<Bot size={12}/>}      label="En memoria"      value={stats?.activeInMemory} color="text-purple-400" />
          <AdminStat icon={<AlertTriangle size={12}/>} label="Errores hoy" value={stats?.erroresHoy}   color="text-yellow-400" />
          <AdminStat icon={<Users size={12}/>}    label="Registros hoy"   value={stats?.registrosHoy} color="text-cyan-400" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-800">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.id ? 'border-green-500 text-green-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Usuarios */}
        {tab === 'usuarios' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nombre o email..."
                  className="input-base pl-9" />
              </div>
              <select value={filtro} onChange={e => { setFiltro(e.target.value); setPage(1); }} className="input-base w-40">
                <option value="">Todos</option>
                <option value="activo">Activos</option>
                <option value="bloqueado">Bloqueados</option>
                <option value="pendiente">Pendientes</option>
              </select>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Usuario</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Plan</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium hidden lg:table-cell">Bot</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium hidden lg:table-cell">Registro</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-600">Cargando...</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-600">Sin resultados</td></tr>
                  ) : users.map((u, i) => (
                    <tr key={u._id} className={`border-t border-gray-800 hover:bg-gray-900 transition-colors ${i % 2 === 0 ? 'bg-black' : 'bg-gray-950'}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white text-sm">{u.nombre} {u.apellido}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="badge-gray">{u.plan}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {u.botConectado
                          ? <span className="flex items-center gap-1 text-xs text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Activo</span>
                          : <span className="text-xs text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell">
                        {new Date(u.createdAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelected(u)} className="text-gray-500 hover:text-white p-1.5 hover:bg-gray-800 rounded-lg transition-colors">
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
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{total} usuarios total</span>
                <div className="flex items-center gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-gray-400">Página {page} de {pages}</span>
                  <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bots activos */}
        {tab === 'bots' && (
          <div className="space-y-3">
            {bots.length === 0 ? (
              <div className="card text-center py-12 text-gray-600">No hay bots activos en este momento.</div>
            ) : bots.map(b => (
              <div key={b._id} className="card flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{b.nombre}</p>
                  <p className="text-xs text-gray-500">{b.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-xs text-green-400">
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

        {/* Logs de error */}
        {tab === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="card text-center py-12 text-gray-600">Sin errores recientes. ✅</div>
            ) : logs.map(l => (
              <div key={l._id} className="card flex items-start gap-3 py-3 px-4">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-gray-500">{new Date(l.createdAt).toLocaleString('es-AR')}</span>
                    {l.userId && <span className="text-xs text-blue-400">{l.userId.email || l.userId}</span>}
                  </div>
                  <p className="text-sm text-gray-300 truncate">{l.mensaje}</p>
                  {l.detalle && <p className="text-xs text-gray-600 mt-0.5 truncate">{typeof l.detalle === 'string' ? l.detalle : JSON.stringify(l.detalle)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {selected && <UserModal user={selected} onClose={() => setSelected(null)} onAction={handleAction} />}
    </Layout>
  );
}
