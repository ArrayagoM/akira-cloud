import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { setPerfil, salirPerfil } from '../services/perfil';
import { Users2, Plus, Trash2, Pencil, Loader2, ShieldCheck, KeyRound, X, Check } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Equipo: perfiles con PIN para tus empleados. Cada persona entra con su PIN y ve solo lo que le corresponde.
// ─────────────────────────────────────────────────────────────

const entrada = 'rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';
const ROL_TXT = { empleado: 'Empleado', encargado: 'Encargado' };
const ROL_COLOR = { empleado: '#38bdf8', encargado: '#a78bfa' };

function Permisos() {
  return (
    <div className="card">
      <p className="text-sm font-medium text-white mb-2 flex items-center gap-2"><ShieldCheck size={15} className="text-[var(--accent)]" /> Qué puede hacer cada uno</p>
      <div className="grid md:grid-cols-3 gap-3 text-xs">
        {[
          ['Dueño', '#34d399', 'Todo: caja, reportes, configuración, respaldos y el equipo.'],
          ['Encargado', '#a78bfa', 'Maneja el negocio: caja, reportes, catálogo, comprobantes, clientes, chats y agenda. No toca la configuración, las claves, los respaldos ni el equipo.'],
          ['Empleado', '#38bdf8', 'Atiende: chats, clientes, agenda, pedidos y ventas de mostrador. No ve la plata (caja, reportes, deudas) ni cambia nada del negocio.'],
        ].map(([t, c, d]) => (<div key={t} className="rounded-lg bg-white/[0.03] p-3"><p className="font-semibold mb-1" style={{ color: c }}>{t}</p><p className="text-gray-400 leading-relaxed">{d}</p></div>))}
      </div>
      <p className="text-[11px] text-gray-500 mt-3">Los perfiles evitan accesos accidentales y curiosos en la misma computadora. Si querés una separación más fuerte, cada persona debería tener su propio usuario de Windows.</p>
    </div>
  );
}

function Formulario({ inicial, onCancelar, onGuardar, guardando }) {
  const [f, setF] = useState({ nombre: '', rol: 'empleado', pin: '', ...inicial });
  const editando = !!inicial?.id;
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
      <div className="flex items-center justify-between"><p className="text-xs font-semibold text-gray-300">{editando ? `Editar a ${inicial.nombre}` : 'Agregar una persona'}</p><button onClick={onCancelar} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={14} /></button></div>
      <div className="grid sm:grid-cols-3 gap-2">
        <label className="text-[11px] text-gray-400">Nombre<input className={`${entrada} w-full mt-1`} value={f.nombre} maxLength={40} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Luz" /></label>
        <label className="text-[11px] text-gray-400">Rol<select className={`${entrada} w-full mt-1`} value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}><option value="empleado">Empleado</option><option value="encargado">Encargado</option></select></label>
        <label className="text-[11px] text-gray-400">{editando ? 'PIN nuevo (opcional)' : 'PIN (4 a 8 números)'}<input className={`${entrada} w-full mt-1`} inputMode="numeric" type="password" maxLength={8} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} placeholder={editando ? 'Dejar igual' : '••••'} /></label>
      </div>
      <div className="flex justify-end gap-2"><button className="btn-secondary text-xs" onClick={onCancelar}>Cancelar</button><button className="btn-primary text-xs flex items-center gap-1.5" disabled={guardando || !f.nombre.trim() || (!editando && f.pin.length < 4)} onClick={() => onGuardar(f)}>{guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar</button></div>
    </div>
  );
}

export default function EquipoPage() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [pin1, setPin1] = useState(''); const [pin2, setPin2] = useState('');
  const [form, setForm] = useState(null);       // null | {} | perfil
  const [guardando, setGuardando] = useState(false);
  const [apagando, setApagando] = useState(false); const [pinApagar, setPinApagar] = useState('');
  const [cambiandoPin, setCambiandoPin] = useState(false);

  const cargar = useCallback(() => api.get('/app/perfiles/admin').then((r) => { setD(r.data); setError(''); }).catch((e) => setError(e.response?.data?.error || 'No se pudo cargar')), []);
  useEffect(() => { cargar(); }, [cargar]);

  const activar = async () => {
    if (pin1 !== pin2) { toast.error('Los dos PIN tienen que ser iguales'); return; }
    setGuardando(true);
    try { const r = await api.post('/app/perfiles/pin-propietario', { pin: pin1 }); setPerfil(r.data.token, r.data.perfil); toast.success(cambiandoPin ? 'PIN cambiado' : 'Perfiles activados: desde ahora la app pide PIN al abrirse'); setPin1(''); setPin2(''); setCambiandoPin(false); cargar(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar el PIN'); } finally { setGuardando(false); }
  };
  const guardarPerfil = async (f) => {
    setGuardando(true);
    try {
      if (f.id) await api.put(`/app/perfiles/perfil/${f.id}`, { nombre: f.nombre, rol: f.rol, ...(f.pin ? { pin: f.pin } : {}) });
      else await api.post('/app/perfiles/perfil', { nombre: f.nombre, rol: f.rol, pin: f.pin });
      toast.success('Guardado'); setForm(null); cargar();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar'); } finally { setGuardando(false); }
  };
  const alternar = (p) => api.put(`/app/perfiles/perfil/${p.id}`, { activo: !p.activo }).then(cargar).catch(() => toast.error('No se pudo cambiar'));
  const borrar = (p) => { if (!window.confirm(`¿Eliminar el perfil de ${p.nombre}?`)) return; api.delete(`/app/perfiles/perfil/${p.id}`).then(() => { toast.success('Perfil eliminado'); cargar(); }).catch(() => toast.error('No se pudo eliminar')); };
  const apagar = async () => {
    try { await api.delete('/app/perfiles/pin-propietario', { data: { pin: pinApagar } }); salirPerfil(); toast.success('Perfiles desactivados'); setApagando(false); setPinApagar(''); cargar(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo desactivar'); }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Users2 size={22} className="text-[var(--accent)]" /> Equipo</h1>
          <p className="text-sm text-gray-500">Dales un PIN a tus empleados: cada uno entra con el suyo y ve solo lo que le corresponde.</p>
        </div>

        {error ? <div className="card text-sm text-amber-300">{error}</div> : !d ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div> : !d.activo || cambiandoPin ? (
          <div className="card space-y-3">
            <p className="text-sm font-medium text-white flex items-center gap-2"><KeyRound size={15} className="text-[var(--accent)]" /> {cambiandoPin ? 'Cambiar tu PIN de dueño' : 'Activar los perfiles'}</p>
            {!cambiandoPin && <p className="text-xs text-gray-500">Primero elegí tu PIN de dueño (4 a 8 números). Con los perfiles activos, Akira se abre bloqueada y cada persona entra con su PIN. Si te olvidás del tuyo, se recupera con la contraseña de tu cuenta.</p>}
            <div className="grid grid-cols-2 gap-2 max-w-sm">
              <input className={entrada} type="password" inputMode="numeric" maxLength={8} placeholder="Tu PIN" value={pin1} onChange={(e) => setPin1(e.target.value.replace(/\D/g, ''))} />
              <input className={entrada} type="password" inputMode="numeric" maxLength={8} placeholder="Repetilo" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="flex gap-2">{cambiandoPin && <button className="btn-secondary text-sm" onClick={() => { setCambiandoPin(false); setPin1(''); setPin2(''); }}>Cancelar</button>}<button className="btn-primary text-sm flex items-center gap-1.5" disabled={pin1.length < 4 || guardando} onClick={activar}>{guardando && <Loader2 size={13} className="animate-spin" />} {cambiandoPin ? 'Guardar PIN' : 'Activar perfiles'}</button></div>
          </div>
        ) : (
          <div className="card space-y-2">
            <div className="flex items-center justify-between"><p className="text-sm font-medium text-white">Personas con acceso</p><button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setForm({})}><Plus size={13} /> Agregar</button></div>
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2"><div className="flex-1"><p className="text-sm text-white">Dueño (vos)</p><p className="text-[11px] text-gray-500">Acceso total</p></div><button className="text-xs text-gray-400 hover:text-white" onClick={() => setCambiandoPin(true)}>Cambiar mi PIN</button></div>
            {d.perfiles.length === 0 && !form && <p className="text-xs text-gray-500 py-3 text-center">Todavía no agregaste a nadie. Tocá “Agregar” para crear el perfil de un empleado.</p>}
            {d.perfiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2" style={{ opacity: p.activo ? 1 : 0.5 }}>
                <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{p.nombre}</p><p className="text-[11px]" style={{ color: ROL_COLOR[p.rol] }}>{ROL_TXT[p.rol]}{p.activo ? '' : ' · desactivado'}</p></div>
                <label className="text-[11px] text-gray-500 flex items-center gap-1"><input type="checkbox" checked={p.activo} onChange={() => alternar(p)} /> Activo</label>
                <button className="p-1 text-gray-500 hover:text-white" aria-label="Editar" onClick={() => setForm(p)}><Pencil size={14} /></button>
                <button className="p-1 text-gray-500 hover:text-red-400" aria-label="Eliminar" onClick={() => borrar(p)}><Trash2 size={14} /></button>
              </div>))}
            {form && <Formulario key={form.id || 'nuevo'} inicial={form} guardando={guardando} onCancelar={() => setForm(null)} onGuardar={guardarPerfil} />}
            <div className="pt-2 border-t border-white/10 mt-2">
              {!apagando ? <button className="text-xs text-gray-500 hover:text-red-400" onClick={() => setApagando(true)}>Desactivar los perfiles</button> : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">Tu PIN para confirmar: <input className={`${entrada} w-24 py-1`} type="password" inputMode="numeric" maxLength={8} value={pinApagar} onChange={(e) => setPinApagar(e.target.value.replace(/\D/g, ''))} /><button className="btn-secondary text-xs" onClick={apagar} disabled={pinApagar.length < 4}>Desactivar</button><button className="text-gray-500 hover:text-white" onClick={() => { setApagando(false); setPinApagar(''); }}>Cancelar</button></div>
              )}
            </div>
          </div>
        )}
        <Permisos />
      </div>
    </Layout>
  );
}
