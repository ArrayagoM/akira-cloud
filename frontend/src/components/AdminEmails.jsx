import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Mail, Send, RefreshCw, Search, CheckCircle2, AlertTriangle, Loader2, Info } from 'lucide-react';

// Panel Admin → Emails: todo lo que sale de la plataforma (campañas, pruebas y emails del
// sistema), si llegó a destino (entregado / rebotado / spam, lo informa Resend) y el envío
// de campañas a los usuarios. No se rastrean aperturas ni clics.

const ESTADOS = {
  entregado: { txt: 'Entregado', cls: 'text-emerald-300 bg-emerald-500/10', tip: 'El servidor del destinatario lo recibió' },
  enviado:   { txt: 'Enviado',   cls: 'text-gray-300 bg-white/10',        tip: 'Salió de nuestro lado; sin confirmación de entrega' },
  rebotado:  { txt: 'Rebotó',    cls: 'text-red-300 bg-red-500/10',        tip: 'La dirección no existe o rechazó el mensaje' },
  spam:      { txt: 'Spam',      cls: 'text-amber-300 bg-amber-500/10',    tip: 'El destinatario lo marcó como spam' },
  fallido:   { txt: 'Falló',     cls: 'text-red-300 bg-red-500/10',        tip: 'No se pudo enviar' },
};
const TIPOS = { campana: 'Campaña', prueba: 'Prueba', sistema: 'Sistema' };
const fecha = (f) => new Date(f).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function Tarjeta({ titulo, valor, color = 'text-white', onClick, activa }) {
  return (
    <button onClick={onClick} className={`card text-center p-3 transition ${activa ? 'ring-1 ring-[var(--accent)]/50' : ''}`}>
      <div className={`text-2xl font-extrabold ${color}`}>{valor ?? '—'}</div>
      <div className="text-xs text-gray-500 mt-0.5">{titulo}</div>
    </button>
  );
}

export default function AdminEmails() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState({ estado: '', campana: '', tipo: '', q: '' });
  const [buscar, setBuscar] = useState('');
  const [campanaEnvio, setCampanaEnvio] = useState('');
  const [pendientes, setPendientes] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ limite: '200', ...Object.fromEntries(Object.entries(filtro).filter(([, v]) => v)) });
      const r = (await api.get(`/admin/emails?${params}`)).data;
      setDatos(r);
      setCampanaEnvio((c) => c || r.disponibles?.[r.disponibles.length - 1] || '');
    } catch { toast.error('No se pudo cargar el registro de emails'); }
    finally { setCargando(false); }
  }, [filtro]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { const t = setTimeout(() => setFiltro((f) => ({ ...f, q: buscar.trim() })), 350); return () => clearTimeout(t); }, [buscar]);

  const contar = async () => {
    try { const r = (await api.post('/admin/email-novedades', { campana: campanaEnvio })).data; setPendientes(r.pendientes); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo contar'); }
  };
  const prueba = async () => {
    try { const r = (await api.post('/admin/email-prueba', { campana: campanaEnvio })).data; toast.success(`Prueba enviada a ${r.para}`); setTimeout(cargar, 1500); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo enviar la prueba'); }
  };
  const enviarATodos = async () => {
    let n = pendientes;
    if (n == null) { const r = (await api.post('/admin/email-novedades', { campana: campanaEnvio })).data; n = r.pendientes; setPendientes(n); }
    if (!n) { toast('No queda nadie para enviar: todos los usuarios ya recibieron esta campaña.'); return; }
    if (!window.confirm(`Vas a enviar "${campanaEnvio}" a ${n} usuario(s) que no se dieron de baja de las novedades. Cada uno lo recibe una sola vez. ¿Enviar ahora?`)) return;
    setEnviando(true); let total = 0;
    try {
      for (let i = 0; i < 20; i++) {
        const r = (await api.post('/admin/email-novedades', { campana: campanaEnvio, confirmar: true, limite: 5 }, { timeout: 90000 })).data;
        total += r.enviados || 0;
        setProgreso(`Enviados ${total}${r.fallidos ? ` · fallidos ${r.fallidos}` : ''} · quedan ${r.pendientes}`);
        if (!r.pendientes || !r.enviados) break;
      }
      toast.success(`Campaña enviada a ${total} usuario(s)`);
    } catch (e) { toast.error(e.response?.data?.error || 'El envío se interrumpió: podés volver a tocar "Enviar" y continúa donde quedó'); }
    finally { setEnviando(false); setProgreso(''); setPendientes(null); cargar(); }
  };

  const r = datos?.resumen;
  const set = (k, v) => setFiltro((f) => ({ ...f, [k]: f[k] === v ? '' : v }));

  return (
    <div className="space-y-4">
      {datos && !datos.webhookConfigurado && (
        <p className="text-xs text-amber-300 bg-amber-500/10 rounded-lg p-2.5 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />Falta conectar los avisos de entrega de Resend: los emails figuran como "Enviado" y no se confirma si llegaron.</p>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Tarjeta titulo="Total" valor={r?.total} onClick={() => setFiltro((f) => ({ ...f, estado: '' }))} activa={!filtro.estado} />
        <Tarjeta titulo="Entregados" valor={r?.entregado} color="text-emerald-400" onClick={() => set('estado', 'entregado')} activa={filtro.estado === 'entregado'} />
        <Tarjeta titulo="Sin confirmar" valor={r?.enviado} color="text-gray-300" onClick={() => set('estado', 'enviado')} activa={filtro.estado === 'enviado'} />
        <Tarjeta titulo="Rebotados" valor={r?.rebotado} color={r?.rebotado ? 'text-red-400' : 'text-gray-600'} onClick={() => set('estado', 'rebotado')} activa={filtro.estado === 'rebotado'} />
        <Tarjeta titulo="Spam" valor={r?.spam} color={r?.spam ? 'text-amber-400' : 'text-gray-600'} onClick={() => set('estado', 'spam')} activa={filtro.estado === 'spam'} />
        <Tarjeta titulo="Fallidos" valor={r?.fallido} color={r?.fallido ? 'text-red-400' : 'text-gray-600'} onClick={() => set('estado', 'fallido')} activa={filtro.estado === 'fallido'} />
      </div>

      <div className="card">
        <p className="text-sm font-medium text-white mb-2 flex items-center gap-2"><Send size={14} /> Enviar una campaña</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={campanaEnvio} onChange={(e) => { setCampanaEnvio(e.target.value); setPendientes(null); }} className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white">
            {(datos?.disponibles || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn-secondary text-sm" onClick={prueba}>Enviarme una prueba</button>
          <button className="btn-secondary text-sm" onClick={contar}>{pendientes == null ? '¿A cuántos se enviaría?' : `Pendientes: ${pendientes}`}</button>
          <button className="btn-primary text-sm flex items-center gap-1.5" disabled={enviando || !campanaEnvio} onClick={enviarATodos}>
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar a todos
          </button>
        </div>
        {progreso && <p className="text-xs text-gray-400 mt-2">{progreso}</p>}
        <p className="text-[11px] text-gray-500 mt-2 flex gap-1.5"><Info size={12} className="shrink-0 mt-0.5" />Solo reciben el correo los usuarios activos que no se dieron de baja de las novedades, y cada campaña llega una única vez a cada uno.</p>
      </div>

      {datos?.campanas?.length > 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 text-left border-b border-white/10"><th className="px-3 py-2 font-medium">Campaña</th><th className="px-3 py-2 font-medium text-right">Enviados</th><th className="px-3 py-2 font-medium text-right">Entregados</th><th className="px-3 py-2 font-medium text-right">Rebotes</th><th className="px-3 py-2 font-medium text-right">Spam</th><th className="px-3 py-2 font-medium">Último envío</th></tr></thead>
            <tbody>
              {datos.campanas.map((c) => (
                <tr key={c.campana} className={`border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/[0.03] ${filtro.campana === c.campana ? 'bg-white/[0.04]' : ''}`} onClick={() => set('campana', c.campana)}>
                  <td className="px-3 py-2 text-white">{c.campana}</td><td className="px-3 py-2 text-right text-gray-300">{c.total}</td>
                  <td className="px-3 py-2 text-right text-emerald-300">{c.entregado}</td><td className="px-3 py-2 text-right" style={{ color: c.rebotado ? '#f87171' : '#6b7280' }}>{c.rebotado}</td>
                  <td className="px-3 py-2 text-right" style={{ color: c.spam ? '#fbbf24' : '#6b7280' }}>{c.spam}</td><td className="px-3 py-2 text-gray-400">{c.ultimo ? fecha(c.ultimo) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por email…" className="w-56 rounded-md bg-black/30 border border-white/10 pl-7 pr-2 py-1.5 text-sm text-white outline-none focus:border-[var(--accent)]/50" /></div>
        <select value={filtro.tipo} onChange={(e) => setFiltro((f) => ({ ...f, tipo: e.target.value }))} className="rounded-md bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-white">
          <option value="">Todos los tipos</option>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        {(filtro.estado || filtro.campana || filtro.tipo || filtro.q) && <button className="text-xs text-[var(--accent)] hover:underline" onClick={() => { setFiltro({ estado: '', campana: '', tipo: '', q: '' }); setBuscar(''); }}>Quitar filtros</button>}
        <button className="btn-secondary text-xs ml-auto flex items-center gap-1.5" onClick={cargar}><RefreshCw size={12} className={cargando ? 'animate-spin' : ''} /> Actualizar</button>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-500 text-left border-b border-white/10"><th className="px-3 py-2 font-medium w-32">Fecha</th><th className="px-3 py-2 font-medium">Para</th><th className="px-3 py-2 font-medium">Asunto</th><th className="px-3 py-2 font-medium">Tipo</th><th className="px-3 py-2 font-medium">Estado</th></tr></thead>
          <tbody>
            {(datos?.filas || []).map((f) => {
              const e = ESTADOS[f.estado] || ESTADOS.enviado;
              const detalle = f.error || f.eventos?.find((x) => x.detalle)?.detalle;
              return (
                <tr key={f._id} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fecha(f.enviadoEn)}</td>
                  <td className="px-3 py-2 text-white">{f.para}</td>
                  <td className="px-3 py-2 text-gray-300 max-w-[320px] truncate" title={f.asunto}>{f.asunto}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{TIPOS[f.tipo] || f.tipo}{f.campana ? <span className="block text-[11px] text-gray-600">{f.campana}</span> : null}</td>
                  <td className="px-3 py-2"><span title={e.tip + (f.reconstruido ? ' · registro reconstruido de un envío anterior' : '')} className={`text-[11px] px-2 py-0.5 rounded-full ${e.cls}`}>{e.txt}</span>{detalle ? <span className="block text-[11px] text-red-300 mt-0.5 max-w-[220px] truncate" title={detalle}>{detalle}</span> : null}</td>
                </tr>
              );
            })}
            {!cargando && (datos?.filas || []).length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500"><Mail className="mx-auto mb-2 text-gray-600" size={26} />No hay emails con estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-600 flex items-center gap-1.5"><CheckCircle2 size={11} />Los emails enviados antes de conectar los avisos de entrega quedan como "Enviado" (sin confirmación). Los nuevos pasan a "Entregado" solos.</p>
    </div>
  );
}
