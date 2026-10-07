import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ShieldCheck, FolderOpen, Loader2, DatabaseBackup, RotateCcw, AlertTriangle, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';

// ───────────────────────────────────────────────────────
// Respaldo: todo vive en esta PC, así que una copia cifrada protege el negocio si se rompe el disco.
// El archivo se cifra con una contraseña que elige el usuario (si la pierde, no se puede recuperar).
// ───────────────────────────────────────────────────────

const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const mb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const msg = (e, def) => e?.response?.data?.error || def;

function Interruptor({ activo, onClick, disabled, etiqueta }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={activo} aria-label={etiqueta}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50" style={{ background: activo ? '#00e87b' : 'rgba(255,255,255,0.15)' }}>
      <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: `translateX(${activo ? 24 : 4}px)` }} />
    </button>
  );
}

function ModalRestaurar({ archivoInicial, onClose }) {
  const [archivo, setArchivo] = useState(archivoInicial || '');
  const [clave, setClave] = useState('');
  const [info, setInfo] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);

  const elegir = async () => { const r = await api.post('/app/respaldo/elegir-archivo'); if (r.data.archivo) { setArchivo(r.data.archivo); setInfo(null); } };
  const verificar = async () => {
    setTrabajando(true);
    try { const r = await api.post('/app/respaldo/verificar', { archivo, clave }); setInfo(r.data); }
    catch (e) { setInfo(null); toast.error(msg(e, 'No se pudo abrir el respaldo')); } finally { setTrabajando(false); }
  };
  const restaurar = async () => {
    setTrabajando(true);
    try { await api.post('/app/respaldo/restaurar', { archivo, clave, confirmar: true }); setReiniciando(true); }
    catch (e) { toast.error(msg(e, 'No se pudo restaurar')); setTrabajando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={reiniciando ? undefined : onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        {reiniciando ? (
          <div className="text-center py-6">
            <Loader2 className="animate-spin mx-auto text-[var(--accent)] mb-3" />
            <p className="text-white font-semibold">Restaurando…</p>
            <p className="text-sm text-gray-500 mt-1">Akira se está reiniciando para aplicar el respaldo. Si no vuelve a abrir sola en unos segundos, abrila desde el menú de inicio.</p>
          </div>
        ) : (<>
          <h3 className="text-lg font-semibold text-white">Restaurar un respaldo</h3>
          <p className="text-xs text-gray-500 mb-4">Sirve para recuperar tus datos en esta PC o en una PC nueva.</p>

          <label className="text-xs text-gray-400">Archivo de respaldo</label>
          <div className="flex gap-2 mt-1 mb-3">
            <input readOnly value={archivo} placeholder="Ningún archivo elegido" className="flex-1 min-w-0 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-xs text-white" />
            <button className="btn-secondary text-sm shrink-0" onClick={elegir}>Elegir…</button>
          </div>
          <label className="text-xs text-gray-400">Contraseña del respaldo</label>
          <input type="password" value={clave} onChange={(e) => { setClave(e.target.value); setInfo(null); }} autoComplete="off"
            className="w-full mt-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />

          {info && (
            <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: 'rgba(0,232,123,0.08)', border: '1px solid rgba(0,232,123,0.25)' }}>
              <p className="text-white flex items-center gap-1.5"><CheckCircle size={14} className="text-[var(--accent)]" /> Respaldo válido</p>
              <p className="text-xs text-gray-400 mt-1">Creado el {fechaHora(info.creado)} · Akira {info.version || '—'} · {info.documentos} documento(s) guardado(s)</p>
              <div className="flex gap-2 mt-3 text-xs" style={{ color: '#fbbf24' }}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>Se van a reemplazar los datos actuales de esta PC por los del respaldo. Lo que hay ahora se guarda en una carpeta &quot;antes-de-restaurar&quot; por las dudas. Después tenés que volver a cargar tus claves (Groq, MercadoPago…) y vincular WhatsApp con el QR.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-secondary text-sm" onClick={onClose}>Cancelar</button>
            {!info
              ? <button className="btn-primary text-sm flex items-center gap-1.5" disabled={trabajando || !archivo || clave.length < 1} onClick={verificar}>{trabajando && <Loader2 size={14} className="animate-spin" />} Revisar respaldo</button>
              : <button className="btn-primary text-sm flex items-center gap-1.5" disabled={trabajando} onClick={restaurar}>{trabajando ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Restaurar y reiniciar</button>}
          </div>
        </>)}
      </div>
    </div>
  );
}

export default function RespaldoPage() {
  const [est, setEst] = useState(null);
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [respaldando, setRespaldando] = useState(false);
  const [restaurar, setRestaurar] = useState(null); // null | '' | ruta

  const cargar = useCallback(async () => { try { setEst((await api.get('/app/respaldo')).data); } catch { toast.error('No se pudo cargar el respaldo'); } }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (cambios, okMsg) => {
    setGuardando(true);
    try { const r = await api.put('/app/respaldo', cambios); setEst(r.data); if (okMsg) toast.success(okMsg); return true; }
    catch (e) { toast.error(msg(e, 'No se pudo guardar')); return false; } finally { setGuardando(false); }
  };
  const elegirCarpeta = async () => { const r = await api.post('/app/respaldo/elegir-carpeta'); if (r.data.carpeta) guardar({ carpeta: r.data.carpeta }, 'Carpeta guardada'); };
  const usarSugerida = () => guardar({ carpeta: est.carpetaSugerida }, 'Carpeta guardada');
  const guardarClave = async () => { if (await guardar({ clave }, 'Contraseña guardada')) setClave(''); };
  const alternar = () => guardar({ activo: !est.activo }, est.activo ? 'Respaldo automático desactivado' : 'Respaldo automático activado');
  const ahora = async () => {
    setRespaldando(true);
    try { setEst((await api.post('/app/respaldo/ahora')).data); toast.success('Respaldo listo'); }
    catch (e) { toast.error(msg(e, 'No se pudo respaldar')); cargar(); } finally { setRespaldando(false); }
  };

  if (!est) return <Layout><div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div></Layout>;
  const listo = !!est.carpeta && est.tieneClave;
  const u = est.ultimo;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><ShieldCheck size={22} className="text-[var(--accent)]" /> Respaldo</h1>
          <p className="text-sm text-gray-500">Tus clientes, turnos, caja y documentos están en esta PC. Una copia cifrada los protege si se rompe el disco o cambiás de computadora.</p>
        </div>

        {/* Estado */}
        <div className="card flex items-start gap-3" style={{ border: `1px solid ${u?.ok ? 'rgba(0,232,123,0.25)' : u ? 'rgba(248,113,113,0.35)' : 'rgba(251,191,36,0.3)'}` }}>
          {u?.ok ? <CheckCircle size={20} className="text-[var(--accent)] mt-0.5" /> : u ? <XCircle size={20} style={{ color: '#f87171' }} className="mt-0.5" /> : <AlertTriangle size={20} style={{ color: '#fbbf24' }} className="mt-0.5" />}
          <div className="flex-1 min-w-0">
            {u?.ok && <><p className="text-white font-semibold">Último respaldo: {fechaHora(new Date(u.enMs).toISOString())}</p><p className="text-xs text-gray-500">{u.archivo} · {mb(u.bytes)}</p></>}
            {u && !u.ok && <><p className="text-white font-semibold">El último respaldo falló</p><p className="text-xs" style={{ color: '#f87171' }}>{u.error}</p></>}
            {!u && <><p className="text-white font-semibold">Todavía no tenés ningún respaldo</p><p className="text-xs text-gray-500">Configurá la carpeta y la contraseña y hacé el primero.</p></>}
          </div>
          <button className="btn-primary text-sm flex items-center gap-1.5 shrink-0" disabled={!listo || respaldando} onClick={ahora}>
            {respaldando ? <Loader2 size={14} className="animate-spin" /> : <DatabaseBackup size={14} />} Respaldar ahora
          </button>
        </div>

        {/* Configuración */}
        <div className="card space-y-4">
          <div>
            <p className="text-sm font-semibold text-white">1. ¿Dónde se guarda?</p>
            <p className="text-xs text-gray-500 mb-2">Lo ideal es una carpeta que se sincronice con Google Drive, OneDrive o un pendrive: así la copia queda fuera de esta PC.</p>
            <div className="flex gap-2 flex-wrap">
              <input readOnly value={est.carpeta || ''} placeholder="Todavía no elegiste una carpeta" className="flex-1 min-w-[220px] rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-xs text-white" />
              <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={elegirCarpeta}><FolderOpen size={14} /> Elegir carpeta…</button>
              {est.carpeta && <button className="btn-secondary text-sm" onClick={() => api.post('/app/respaldo/abrir-carpeta')}>Abrir</button>}
            </div>
            {!est.carpeta && est.carpetaSugerida && <button className="text-xs mt-2 underline" style={{ color: 'var(--accent)' }} onClick={usarSugerida}>Usar &quot;{est.carpetaSugerida}&quot;</button>}
          </div>

          <div>
            <p className="text-sm font-semibold text-white">2. Contraseña del respaldo</p>
            <p className="text-xs text-gray-500 mb-2">Cifra el archivo. <strong className="text-gray-300">Anotala en un lugar seguro: sin ella no se puede recuperar nada</strong> (ni nosotros podemos). La vas a necesitar para restaurar en otra PC.</p>
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <input type={verClave ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password"
                  placeholder={est.tieneClave ? 'Guardada (escribí una nueva para cambiarla)' : 'Mínimo 8 caracteres'}
                  className="w-full rounded-lg bg-black/30 border border-white/10 pl-3 pr-9 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
                <button type="button" onClick={() => setVerClave((v) => !v)} className="absolute right-2.5 top-2.5 text-gray-500 hover:text-white" aria-label={verClave ? 'Ocultar' : 'Mostrar'}>{verClave ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
              <button className="btn-secondary text-sm" disabled={guardando || clave.length < 8} onClick={guardarClave}>{est.tieneClave ? 'Cambiar' : 'Guardar'}</button>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-3 border-t border-white/10">
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">3. Respaldo automático diario</p>
              <p className="text-xs text-gray-500">{listo ? 'Cuando la app esté abierta, hace una copia por día y conserva las últimas 10.' : 'Primero elegí la carpeta y la contraseña.'}</p>
            </div>
            <Interruptor activo={est.activo} onClick={alternar} disabled={guardando || !listo} etiqueta="Respaldo automático diario" />
          </div>
        </div>

        {/* Copias y restauración */}
        <div className="card">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <p className="text-sm font-semibold text-white">Tus respaldos</p>
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setRestaurar('')}><RotateCcw size={14} /> Restaurar desde un archivo…</button>
          </div>
          {est.archivos.length === 0 ? <p className="text-sm text-gray-500">Todavía no hay copias en esa carpeta.</p> : (
            <ul className="divide-y divide-white/5">
              {est.archivos.map((a) => (
                <li key={a.nombre} className="flex items-center gap-3 py-2">
                  <DatabaseBackup size={15} className="text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{fechaHora(a.fecha)}</p><p className="text-[11px] text-gray-500 truncate">{a.nombre} · {mb(a.bytes)}</p></div>
                  <button className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={() => setRestaurar(a.archivo)}>Restaurar</button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-gray-500 mt-3">El respaldo no incluye la sesión de WhatsApp ni tus claves de API (están protegidas con el Windows de esta PC): al restaurar en otra computadora vas a escanear el QR de nuevo y volver a cargar las claves.</p>
        </div>
      </div>
      {restaurar !== null && <ModalRestaurar archivoInicial={restaurar} onClose={() => setRestaurar(null)} />}
    </Layout>
  );
}
