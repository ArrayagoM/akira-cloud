import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plug, FolderSync, Webhook, Plus, Trash2, Loader2, Check, X, Copy, FolderOpen, RefreshCw, Play, KeyRound, AlertTriangle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Integraciones: llevar tus datos a otras herramientas.
//  · Planillas en una carpeta (Google Drive / OneDrive / Dropbox) siempre al día.
//  · Webhooks: Akira avisa a Zapier / Make / n8n cuando pasa algo (una venta, un pedido pagado, un turno confirmado…).
// ─────────────────────────────────────────────────────────────

const entrada = 'rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';
const hace = (iso) => { if (!iso) return 'todavía no'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
const ESTADO = { entregado: ['Entregado', '#34d399'], fallido: ['Falló', '#f87171'], reintentando: ['Reintentando', '#fbbf24'], enviando: ['Enviando', '#38bdf8'] };

function Planillas() {
  const [c, setC] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => api.get('/app/exportacion').then((r) => setC(r.data)).catch(() => {}), []);
  useEffect(() => { cargar(); }, [cargar]);
  const guardar = async (cambios) => { try { const r = await api.put('/app/exportacion', cambios); setC(r.data); return true; } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar'); return false; } };
  const elegir = async () => { const r = await api.post('/app/exportacion/elegir-carpeta').catch(() => null); if (r?.data?.carpeta) { await guardar({ carpeta: r.data.carpeta }); toast.success('Carpeta elegida'); } };
  const ahora = async () => { setOcupado(true); try { const r = await api.post('/app/exportacion/ahora'); setC(r.data); toast.success(`Listo: ${r.data.archivos.length} planillas actualizadas`); } catch (e) { toast.error(e.response?.data?.error || 'No se pudo exportar'); cargar(); } finally { setOcupado(false); } };
  if (!c) return null;
  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3"><FolderSync size={20} className="text-[var(--accent)] mt-0.5" /><div className="flex-1"><p className="text-sm font-semibold text-white">Planillas siempre al día en tu carpeta</p><p className="text-xs text-gray-500 mt-0.5">Akira deja actualizadas la Caja del mes, los Clientes, los Productos y los Servicios en una carpeta. Si esa carpeta está sincronizada con Google Drive, OneDrive o Dropbox, las planillas aparecen solas en la nube y se pueden abrir con Google Sheets o Excel.</p></div>
        <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={c.activa} onChange={(e) => guardar({ activa: e.target.checked })} /> Activada</label></div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={elegir}><FolderOpen size={13} /> {c.carpeta ? 'Cambiar carpeta' : 'Elegir carpeta'}</button>
        <span className="text-xs text-gray-400 truncate max-w-[420px]" title={c.carpeta}>{c.carpeta || 'Todavía no elegiste una carpeta'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
        Actualizar cada <select className={`${entrada} py-1 text-xs`} value={c.cadaHoras} onChange={(e) => guardar({ cadaHoras: Number(e.target.value) })}>{c.horas.map((h) => <option key={h} value={h}>{h === 1 ? '1 hora' : `${h} horas`}</option>)}</select>
        <button className="btn-primary text-xs flex items-center gap-1.5" disabled={!c.carpeta || ocupado} onClick={ahora}>{ocupado ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Actualizar ahora</button>
        <span>Última vez: {hace(c.ultima)}</span>
      </div>
      {c.error && <p className="text-xs text-amber-300 flex items-center gap-1.5"><AlertTriangle size={13} /> {c.error}</p>}
      {c.archivos.length > 0 && <p className="text-[11px] text-gray-500">Archivos: {c.archivos.join(' · ')}</p>}
    </div>
  );
}

function Webhooks() {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [secreto, setSecreto] = useState(null);       // { id, valor } recién creado o regenerado
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState('');
  const cargar = useCallback(() => api.get('/app/webhooks').then((r) => setD(r.data)).catch(() => {}), []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 8000); return () => clearInterval(t); }, [cargar]);

  const crear = async () => {
    setGuardando(true);
    try { const r = await api.post('/app/webhooks', form); setSecreto({ id: r.data.destino.id, valor: r.data.destino.secreto }); setForm(null); cargar(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo crear'); } finally { setGuardando(false); }
  };
  const cambiar = (id, cambios) => api.put(`/app/webhooks/${id}`, cambios).then(cargar).catch((e) => toast.error(e.response?.data?.error || 'No se pudo cambiar'));
  const borrar = (x) => { if (!window.confirm(`¿Borrar el destino "${x.nombre}"?`)) return; api.delete(`/app/webhooks/${x.id}`).then(cargar).catch(() => toast.error('No se pudo borrar')); };
  const probar = async (x) => { setProbando(x.id); try { const r = await api.post(`/app/webhooks/${x.id}/probar`); r.data.ok ? toast.success('La prueba llegó bien') : toast.error(r.data.error || 'La prueba falló'); } catch { toast.error('No se pudo probar'); } finally { setProbando(''); cargar(); } };
  const nuevoSecreto = async (x) => { if (!window.confirm('El secreto anterior deja de valer: tenés que actualizarlo en la otra herramienta. ¿Seguir?')) return; const r = await api.post(`/app/webhooks/${x.id}/secreto`).catch(() => null); if (r) setSecreto({ id: x.id, valor: r.data.destino.secreto }); };
  const copiar = (t) => navigator.clipboard?.writeText(t).then(() => toast.success('Copiado')).catch(() => toast.error('No se pudo copiar'));
  if (!d) return null;
  const toggleEv = (ev) => setForm((f) => ({ ...f, eventos: f.eventos.includes(ev) ? f.eventos.filter((x) => x !== ev) : [...f.eventos, ev] }));

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3"><Webhook size={20} className="text-[var(--accent)] mt-0.5" /><div className="flex-1"><p className="text-sm font-semibold text-white">Webhooks: avisar a otras herramientas</p><p className="text-xs text-gray-500 mt-0.5">Cuando pasa algo en tu negocio, Akira le manda un aviso a la dirección que pongas (por ejemplo, un “Catch Hook” de Zapier o un webhook de Make). Cada aviso va firmado para que puedas comprobar que viene de Akira. Akira solo informa: no recibe órdenes de afuera.</p></div>
        <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setForm({ nombre: '', url: '', eventos: [] })}><Plus size={13} /> Nuevo destino</button></div>

      {secreto && (
        <div className="rounded-lg p-3 text-xs space-y-1.5" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)' }}>
          <p className="text-emerald-300 font-medium flex items-center gap-1.5"><KeyRound size={13} /> Guardá este secreto ahora: no se vuelve a mostrar completo</p>
          <div className="flex items-center gap-2"><code className="flex-1 bg-black/40 rounded px-2 py-1 text-gray-200 break-all">{secreto.valor}</code><button className="btn-secondary text-xs flex items-center gap-1" onClick={() => copiar(secreto.valor)}><Copy size={12} /> Copiar</button><button className="text-gray-500 hover:text-white" onClick={() => setSecreto(null)} aria-label="Cerrar"><X size={14} /></button></div>
          <p className="text-gray-400">Sirve para verificar la firma (<code>X-Akira-Firma</code>, HMAC-SHA256 del cuerpo).</p>
        </div>
      )}

      {form && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-[11px] text-gray-400">Nombre<input className={`${entrada} w-full mt-1`} value={form.nombre} maxLength={40} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Zapier" /></label>
            <label className="text-[11px] text-gray-400 sm:col-span-2">Dirección (https://…)<input className={`${entrada} w-full mt-1`} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://hooks.zapier.com/hooks/catch/…" /></label>
          </div>
          <div><p className="text-[11px] text-gray-400 mb-1">Avisar cuando…</p><div className="flex flex-wrap gap-1.5">{Object.entries(d.eventos).map(([k, t]) => { const on = form.eventos.includes(k); return <button key={k} onClick={() => toggleEv(k)} className="text-xs px-2.5 py-1 rounded-full border" style={on ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{t}</button>; })}</div></div>
          <p className="text-[11px] text-gray-500">Los avisos incluyen datos de tu negocio (montos, nombres y teléfonos de clientes): pasan al servicio que elijas.</p>
          <div className="flex justify-end gap-2"><button className="btn-secondary text-xs" onClick={() => setForm(null)}>Cancelar</button><button className="btn-primary text-xs flex items-center gap-1.5" disabled={guardando || !form.url.trim() || !form.eventos.length} onClick={crear}>{guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Crear</button></div>
        </div>
      )}

      {d.destinos.length === 0 && !form ? <p className="text-xs text-gray-500 py-2">Todavía no agregaste ningún destino.</p> : d.destinos.map((x) => (
        <div key={x.id} className="rounded-lg bg-white/[0.03] px-3 py-2.5 space-y-1.5" style={{ opacity: x.activo ? 1 : 0.55 }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{x.nombre}</p><p className="text-[11px] text-gray-500 truncate">{x.url}</p></div>
            <label className="text-[11px] text-gray-500 flex items-center gap-1"><input type="checkbox" checked={x.activo} onChange={(e) => cambiar(x.id, { activo: e.target.checked })} /> Activo</label>
            <button className="btn-secondary text-xs flex items-center gap-1" disabled={probando === x.id} onClick={() => probar(x)}>{probando === x.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Probar</button>
            <button className="p-1 text-gray-500 hover:text-white" title="Generar un secreto nuevo" aria-label="Secreto nuevo" onClick={() => nuevoSecreto(x)}><KeyRound size={14} /></button>
            <button className="p-1 text-gray-500 hover:text-red-400" aria-label="Borrar" onClick={() => borrar(x)}><Trash2 size={14} /></button>
          </div>
          <div className="flex flex-wrap gap-1">{x.eventos.map((e) => <span key={e} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400">{d.eventos[e] || e}</span>)}</div>
          <p className="text-[10px] text-gray-600">Secreto: whsec_••••{x.secretoFin}</p>
        </div>
      ))}

      {d.entregas.length > 0 && (
        <details className="text-xs"><summary className="text-gray-400 cursor-pointer hover:text-white">Últimos avisos enviados ({d.entregas.length})</summary>
          <div className="mt-2 space-y-1">{d.entregas.slice(0, 15).map((e) => { const [t, c] = ESTADO[e.estado] || [e.estado, '#9ca3af']; return (
            <div key={`${e.id}${e.destinoId}`} className="flex items-center gap-2 rounded-md bg-white/[0.02] px-2.5 py-1.5"><span className="text-gray-500 w-16">{hace(e.creadoEn)}</span><span className="flex-1 truncate text-gray-300">{e.tipo} → {e.destino}</span>{e.error && <span className="text-gray-500 truncate max-w-[200px]" title={e.error}>{e.error}</span>}<span style={{ color: c }}>{t}{e.intentos > 1 ? ` (${e.intentos} intentos)` : ''}</span></div>); })}</div></details>
      )}
    </div>
  );
}

function EstadisticasUso() {
  const [activo, setActivo] = useState(null);
  useEffect(() => { api.get('/app/uso').then((r) => setActivo(r.data.activo)).catch(() => setActivo(false)); }, []);
  const cambiar = async (v) => { try { const r = await api.put('/app/uso', { activo: v }); setActivo(r.data.activo); toast.success(v ? 'Gracias: vamos a contar qué pantallas se usan' : 'Estadísticas apagadas'); } catch { toast.error('No se pudo cambiar'); } };
  if (activo === null) return null;
  return (
    <div className="card flex items-start gap-3">
      <div className="flex-1"><p className="text-sm font-semibold text-white">Ayudanos a mejorar Akira</p><p className="text-xs text-gray-500 mt-0.5">Si lo activás, Akira cuenta cuántas veces se abre cada pantalla (por ejemplo, “Caja” o “Reportes”) para saber qué se usa y qué hay que explicar mejor. Solo son esos contadores: nunca se envían datos de tus clientes, montos, mensajes ni nada de lo que cargás. Podés apagarlo cuando quieras.</p></div>
      <label className="flex items-center gap-2 text-xs text-gray-300 whitespace-nowrap"><input type="checkbox" checked={activo} onChange={(e) => cambiar(e.target.checked)} /> Activado</label>
    </div>
  );
}

export default function IntegracionesPage() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-page-in">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Plug size={22} className="text-[var(--accent)]" /> Integraciones</h1><p className="text-sm text-gray-500">Llevá los datos de tu negocio a otras herramientas, sin cargar nada dos veces.</p></div>
        <Planillas />
        <Webhooks />
        <EstadisticasUso />
      </div>
    </Layout>
  );
}
