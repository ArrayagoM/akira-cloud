import { useState, useEffect, useCallback } from 'react';
import { Lock, Loader2, Delete, ArrowLeft, UserCircle2 } from 'lucide-react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { getPase, setPerfil } from '../services/perfil';

// Pantalla de bloqueo del equipo: si el dueño activó los perfiles, la app pide el PIN de cada persona antes de mostrar nada.
// Usa axios directo (sin el interceptor de la app) porque todavía no hay pase.
const DESKTOP = !!import.meta.env.VITE_DESKTOP;
const base = import.meta.env.VITE_API_URL || '/api';
const ROL = { propietario: 'Dueño', encargado: 'Encargado', empleado: 'Empleado' };
const auth = () => { const t = localStorage.getItem('akira_token'); return t ? { Authorization: `Bearer ${t}` } : {}; };

function Bloqueo({ perfiles, alEntrar }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [olvide, setOlvide] = useState(false);
  const [clave, setClave] = useState('');

  const entrar = useCallback(async (p) => {
    setOcupado(true); setError('');
    try { const r = await axios.post(`${base}/app/perfiles/entrar`, { id: sel.id, pin: p }); setPerfil(r.data.token, r.data.perfil); alEntrar(); }
    catch (e) { setError(e.response?.data?.error || 'No se pudo entrar'); setPin(''); } finally { setOcupado(false); }
  }, [sel, alEntrar]);

  const tocar = (d) => { if (ocupado) return; const n = (pin + d).slice(0, 8); setPin(n); setError(''); };
  const recuperar = async () => {
    setOcupado(true); setError('');
    try { await axios.post(`${base}/app/perfiles/recuperar`, { password: clave }, { headers: auth() }); window.location.reload(); }
    catch (e) { setError(e.response?.data?.error || 'No se pudo confirmar la contraseña'); } finally { setOcupado(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'var(--bg, #070b10)' }}>
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}><Lock size={22} style={{ color: 'var(--accent, #00e87b)' }} /></div>
        {!sel ? (<>
          <h1 className="text-xl font-bold text-white">¿Quién está usando Akira?</h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">Elegí tu perfil e ingresá tu PIN.</p>
          <div className="grid grid-cols-2 gap-3">
            {perfiles.map((p) => (
              <button key={p.id} onClick={() => { setSel(p); setPin(''); setError(''); }} className="rounded-xl border border-white/10 bg-white/[0.03] hover:border-[var(--accent)]/50 hover:bg-white/[0.06] px-3 py-4 transition">
                <UserCircle2 size={30} className="mx-auto text-gray-400" /><p className="text-sm text-white mt-1.5 truncate">{p.nombre}</p><p className="text-[11px] text-gray-500">{ROL[p.rol] || p.rol}</p>
              </button>))}
          </div>
        </>) : olvide ? (<>
          <h1 className="text-lg font-bold text-white">Recuperar el acceso</h1>
          <p className="text-sm text-gray-500 mt-1 mb-4">Escribí la contraseña de tu cuenta de Akira. Se desactivan los perfiles y después podés activarlos de nuevo con un PIN nuevo.</p>
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && clave && recuperar()} placeholder="Contraseña de tu cuenta" autoFocus className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          <div className="flex gap-2 mt-4"><button className="btn-secondary flex-1" onClick={() => { setOlvide(false); setError(''); }}>Volver</button><button className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={!clave || ocupado} onClick={recuperar}>{ocupado && <Loader2 size={14} className="animate-spin" />} Confirmar</button></div>
        </>) : (<>
          <button className="text-xs text-gray-500 hover:text-white inline-flex items-center gap-1 mb-3" onClick={() => { setSel(null); setPin(''); setError(''); }}><ArrowLeft size={12} /> Elegir otro perfil</button>
          <h1 className="text-lg font-bold text-white">Hola, {sel.nombre}</h1>
          <p className="text-sm text-gray-500 mb-4">Ingresá tu PIN</p>
          <div className="flex justify-center gap-2 mb-2 h-4">{Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <span key={i} className="w-3 h-3 rounded-full" style={{ background: i < pin.length ? 'var(--accent, #00e87b)' : 'rgba(255,255,255,0.15)' }} />)}</div>
          <p className="text-sm text-red-400 h-5 mb-1">{error}</p>
          <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} className="rounded-lg bg-white/[0.05] hover:bg-white/[0.1] py-3 text-lg text-white" onClick={() => tocar(d)} disabled={ocupado}>{d}</button>)}
            <button className="rounded-lg bg-white/[0.03] hover:bg-white/[0.08] py-3 text-gray-400 flex items-center justify-center" aria-label="Borrar" onClick={() => setPin((x) => x.slice(0, -1))}><Delete size={18} /></button>
            <button className="rounded-lg bg-white/[0.05] hover:bg-white/[0.1] py-3 text-lg text-white" onClick={() => tocar('0')} disabled={ocupado}>0</button>
            <button className="rounded-lg py-3 text-sm font-semibold text-black flex items-center justify-center" style={{ background: 'var(--accent, #00e87b)', opacity: pin.length >= 4 ? 1 : 0.4 }} disabled={pin.length < 4 || ocupado} onClick={() => entrar(pin)} aria-label="Entrar">{ocupado ? <Loader2 size={16} className="animate-spin" /> : 'Entrar'}</button>
          </div>
          {sel.id === 'propietario' && <button className="text-xs text-gray-500 hover:text-white mt-4" onClick={() => { setOlvide(true); setError(''); }}>Olvidé mi PIN</button>}
        </>)}
      </div>
    </div>
  );
}

export default function PerfilGate({ children }) {
  const [estado, setEstado] = useState(null);       // { activo, perfiles } | null mientras carga
  const [pase, setPase] = useState(getPase());
  const { pathname } = useLocation();

  const consultar = useCallback(() => {
    if (!DESKTOP || !localStorage.getItem('akira_token')) { setEstado({ activo: false, perfiles: [] }); return; }
    axios.get(`${base}/app/perfiles/estado`).then((r) => setEstado(r.data)).catch(() => setEstado({ activo: false, perfiles: [] }));
  }, []);
  useEffect(() => {
    consultar();
    const f = () => { setPase(getPase()); consultar(); };
    window.addEventListener('akira:perfil', f); window.addEventListener('storage', f); window.addEventListener('focus', consultar);
    return () => { window.removeEventListener('akira:perfil', f); window.removeEventListener('storage', f); window.removeEventListener('focus', consultar); };
  }, [consultar]);
  useEffect(() => { consultar(); }, [pathname, consultar]); // al iniciar sesión se navega: ahí se revisa si hay perfiles

  if (!DESKTOP) return children;
  if (!estado) return null;
  if (estado.activo && !pase && localStorage.getItem('akira_token')) return <Bloqueo perfiles={estado.perfiles} alEntrar={() => setPase(getPase())} />;
  return children;
}
