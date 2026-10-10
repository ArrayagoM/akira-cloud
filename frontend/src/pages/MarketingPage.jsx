import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Megaphone, PenLine, Tag, MessageSquareQuote, CalendarDays, Send, TrendingUp, Loader2, Copy, RefreshCw, Sparkles, AlertTriangle, ArrowLeft } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Marketing: un equipo de especialistas con IA que le escribe BORRADORES al dueño usando los datos reales de su negocio
// (servicios, precios, productos, horarios y, el consultor, sus números). Nada se publica ni se envía solo.
// Funciona con la clave de Groq del propio negocio (la misma que usa el bot). Todo se calcula en esta PC.
// ─────────────────────────────────────────────────────────────

const ICONOS = { PenLine, Tag, MessageSquareQuote, CalendarDays, Send, TrendingUp };
const entrada = 'rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50 w-full';

function Campo({ c, valor, cambiar, items }) {
  const etiqueta = <span className="text-[11px] text-gray-400">{c.etiqueta}{c.requerido ? ' *' : ''}</span>;
  if (c.tipo === 'largo') return <label className="block space-y-1">{etiqueta}<textarea className={`${entrada} min-h-[84px] resize-y`} maxLength={c.max} value={valor ?? ''} placeholder={c.placeholder} onChange={(e) => cambiar(c.id, e.target.value)} /></label>;
  if (c.tipo === 'texto') return <label className="block space-y-1">{etiqueta}<input className={entrada} maxLength={c.max} value={valor ?? ''} placeholder={c.placeholder} onChange={(e) => cambiar(c.id, e.target.value)} /></label>;
  if (c.tipo === 'fecha') return <label className="block space-y-1">{etiqueta}<input type="date" className={entrada} value={valor ?? ''} onChange={(e) => cambiar(c.id, e.target.value)} /></label>;
  if (c.tipo === 'numero') { const n = []; for (let i = c.min; i <= c.max; i++) n.push(i); return <label className="block space-y-1">{etiqueta}<select className={entrada} value={valor ?? ''} onChange={(e) => cambiar(c.id, e.target.value === '' ? '' : Number(e.target.value))}>{!c.requerido && c.porDefecto === undefined && <option value="">—</option>}{n.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>; }
  if (c.tipo === 'opcion') return <label className="block space-y-1">{etiqueta}<select className={entrada} value={valor ?? ''} onChange={(e) => cambiar(c.id, e.target.value)}>{!c.requerido && <option value="">Automático</option>}{c.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}</select></label>;
  if (c.tipo === 'multiopcion') {
    const sel = Array.isArray(valor) ? valor : [];
    return <div className="space-y-1">{etiqueta}<div className="flex flex-wrap gap-1.5">{c.opciones.map((o) => { const on = sel.includes(o.valor); return <button type="button" key={o.valor} onClick={() => cambiar(c.id, on ? sel.filter((x) => x !== o.valor) : [...sel, o.valor].slice(0, c.max))} className="text-xs px-2.5 py-1 rounded-full border" style={on ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{o.etiqueta}</button>; })}</div><p className="text-[10px] text-gray-600">Hasta {c.max}</p></div>;
  }
  if (c.tipo === 'producto') return <label className="block space-y-1">{etiqueta}<select className={entrada} value={valor ?? ''} onChange={(e) => cambiar(c.id, e.target.value)}><option value="">Ninguno</option>{items.servicios.length > 0 && <optgroup label="Servicios">{items.servicios.map((s) => <option key={`s${s}`} value={s}>{s}</option>)}</optgroup>}{items.productos.length > 0 && <optgroup label="Productos">{items.productos.map((s) => <option key={`p${s}`} value={s}>{s}</option>)}</optgroup>}</select>{c.ayuda && <span className="text-[10px] text-gray-600 block">{c.ayuda}</span>}</label>;
  return null;
}

export default function MarketingPage() {
  const [info, setInfo] = useState(null);
  const [agente, setAgente] = useState(null);
  const [valores, setValores] = useState({});
  const [items, setItems] = useState({ productos: [], servicios: [] });
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    api.get('/app/marketing').then((r) => setInfo(r.data)).catch(() => toast.error('No se pudo cargar el equipo de marketing'));
    Promise.all(['productos', 'servicios'].map((tipo) => api.get(`/gestion/lista?tipo=${tipo}`).then((r) => (r.data.lista || []).map((x) => x.nombre).filter(Boolean)).catch(() => [])))
      .then(([productos, servicios]) => setItems({ productos, servicios }));
  }, []);

  const elegir = (a) => {
    const ini = {};
    for (const c of a.campos) { if (c.porDefecto !== undefined) ini[c.id] = c.porDefecto; else if (c.tipo === 'opcion' && c.requerido) ini[c.id] = c.opciones[0].valor; else if (c.tipo === 'multiopcion') ini[c.id] = []; }
    setValores(ini); setResultado(null); setAgente(a);
  };
  const cambiar = (id, v) => setValores((x) => ({ ...x, [id]: v }));
  const faltan = useMemo(() => (agente ? agente.campos.filter((c) => c.requerido && (valores[c.id] === undefined || valores[c.id] === '' || (Array.isArray(valores[c.id]) && !valores[c.id].length) || (typeof valores[c.id] === 'string' && !valores[c.id].trim()))) : []), [agente, valores]);

  const generar = async () => {
    setGenerando(true);
    try {
      const datos = {}; for (const [k, v] of Object.entries(valores)) if (v !== '' && v !== undefined && !(Array.isArray(v) && !v.length)) datos[k] = v;
      const r = await api.post('/app/marketing/generar', { agente: agente.id, datos });
      setResultado(r.data);
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo generar el borrador'); }
    finally { setGenerando(false); }
  };
  const copiar = (t) => navigator.clipboard?.writeText(t).then(() => toast.success('Copiado')).catch(() => toast.error('No se pudo copiar'));

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Megaphone size={22} className="text-[var(--accent)]" /> Marketing</h1>
          <p className="text-sm text-gray-500">Tu equipo de marketing con IA: te escribe borradores con los datos reales de tu negocio. Nada se publica ni se envía solo: lo revisás y lo usás vos.</p>
        </div>

        {info && !info.claveCargada && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-200/90 flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><p>Para usar el equipo de marketing falta tu clave de Groq (la misma que usa el bot, es gratis). Cargala en <Link to="/config" className="underline">Config</Link>.</p></div>
        )}

        {!agente && info && (
          <div className="grid sm:grid-cols-2 gap-3">
            {info.agentes.map((a) => { const Icono = ICONOS[a.icono] || Sparkles; return (
              <button key={a.id} onClick={() => elegir(a)} className="card text-left hover:border-[var(--accent)]/40 transition-colors space-y-1.5">
                <div className="flex items-center gap-2"><Icono size={18} className="text-[var(--accent)]" /><p className="text-sm font-semibold text-white">{a.nombre}</p></div>
                <p className="text-xs text-gray-500">{a.descripcion}</p>
                {a.usaNumeros && <p className="text-[10px] text-gray-600">Usa tus números reales de los últimos 90 días (sin nombres de clientes).</p>}
              </button>); })}
          </div>
        )}

        {agente && (
          <div className="card space-y-3">
            <button className="text-xs text-gray-500 hover:text-white flex items-center gap-1" onClick={() => { setAgente(null); setResultado(null); }}><ArrowLeft size={12} /> Elegir otro especialista</button>
            <div><p className="text-base font-semibold text-white">{agente.nombre}</p><p className="text-xs text-gray-500">{agente.descripcion}</p></div>
            <div className="space-y-3">{agente.campos.map((c) => <Campo key={c.id} c={c} valor={valores[c.id]} cambiar={cambiar} items={items} />)}</div>
            <div className="flex items-center gap-3">
              <button className="btn-primary text-sm flex items-center gap-2" disabled={generando || faltan.length > 0 || (info && !info.claveCargada)} onClick={generar}>{generando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {resultado ? 'Generar de nuevo' : 'Generar borrador'}</button>
              {faltan.length > 0 && <span className="text-[11px] text-gray-500">Falta: {faltan.map((c) => c.etiqueta).join(', ')}</span>}
            </div>
          </div>
        )}

        {resultado && (
          <div className="space-y-3">
            {resultado.opciones.map((t, i) => (
              <div key={i} className="card space-y-2">
                <div className="flex items-center justify-between"><p className="text-[11px] text-gray-500">{resultado.opciones.length > 1 ? `Opción ${i + 1}` : 'Borrador'}</p><button className="btn-secondary text-xs flex items-center gap-1" onClick={() => copiar(t)}><Copy size={12} /> Copiar</button></div>
                <p className="text-sm text-gray-200 whitespace-pre-wrap">{t}</p>
              </div>
            ))}
            <div className="flex items-center gap-3 flex-wrap">
              <button className="btn-secondary text-xs flex items-center gap-1.5" disabled={generando} onClick={generar}>{generando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Otra versión</button>
              {agente?.id === 'mensajes' && <Link to="/clientes" className="text-xs text-[var(--accent)] hover:underline">Para mandarlo a un grupo de clientes: Clientes → Escribir a un grupo</Link>}
            </div>
            <p className="text-[11px] text-gray-500 flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Es un borrador escrito por una IA: revisá precios, fechas y datos antes de publicar o enviar, y completá lo que esté entre [corchetes].</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
