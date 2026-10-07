import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { bajarArchivo, pesos, aBase64 } from '../utils/archivos';
import { FileText, Plus, Loader2, X, Download, Send, Receipt, Ban, Check, Search, Trash2, ImagePlus } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Presupuestos y recibos en PDF, con tu logo, listos para mandar por WhatsApp.
// No son facturas fiscales: el PDF lo aclara.
// ─────────────────────────────────────────────────────────────

const ESTADO = { emitido: ['Emitido', '#38bdf8'], aceptado: ['Aceptado', '#a78bfa'], cobrado: ['Cobrado', '#34d399'], anulado: ['Anulado', '#f87171'] };
const METODOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['mercadopago', 'MercadoPago'], ['tarjeta', 'Tarjeta'], ['otro', 'Otro']];
const fechaCorta = (f) => (f ? f.split('-').reverse().join('/') : '');
const entrada = 'rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';

function Nuevo({ tipoInicial, opciones, onClose, onCreado }) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [cli, setCli] = useState({ nombre: '', telefono: '', jid: '' });
  const [q, setQ] = useState(''); const [sugeridos, setSugeridos] = useState([]);
  const [lineas, setLineas] = useState([]);                 // [{ nombre, precio, cantidad }]
  const [libre, setLibre] = useState({ nombre: '', precio: '' });
  const [buscarItem, setBuscarItem] = useState('');
  const [descuento, setDescuento] = useState(''); const [validez, setValidez] = useState(15);
  const [metodo, setMetodo] = useState('efectivo'); const [enCaja, setEnCaja] = useState(true);
  const [nota, setNota] = useState(''); const [concepto, setConcepto] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setSugeridos([]); return undefined; }
    const t = setTimeout(() => api.get(`/bot/clientes?q=${encodeURIComponent(q.trim())}`).then((r) => setSugeridos((r.data.clientes || []).slice(0, 5))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const bruto = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const pct = Math.min(100, Math.max(0, Number(String(descuento).replace(',', '.')) || 0));
  const total = Math.round((bruto - bruto * pct / 100) * 100) / 100;
  const agregar = (it) => setLineas((l) => (l.some((x) => x.nombre === it.nombre) ? l.map((x) => (x.nombre === it.nombre ? { ...x, cantidad: x.cantidad + 1 } : x)) : [...l, { nombre: it.nombre, precio: it.precio, cantidad: 1 }]));
  const agregarLibre = () => { const p = Number(String(libre.precio).replace(',', '.')); if (!libre.nombre.trim() || !(p > 0)) { toast.error('Poné el nombre y el precio'); return; } agregar({ nombre: libre.nombre.trim(), precio: p }); setLibre({ nombre: '', precio: '' }); };
  const items = (opciones.items || []).filter((i) => !buscarItem.trim() || i.nombre.toLowerCase().includes(buscarItem.trim().toLowerCase()));

  const crear = async () => {
    setGuardando(true);
    try {
      const r = await api.post('/app/comprobantes', { tipo, cliente: cli, items: lineas, descuentoPct: pct, validezDias: validez, metodo, registrarEnCaja: enCaja, nota, concepto });
      toast.success(`${r.data.codigo} creado`); onCreado(r.data.id);
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo crear'); } finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><FileText size={18} className="text-[var(--accent)]" /> Nuevo {tipo === 'presupuesto' ? 'presupuesto' : 'recibo'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="flex gap-2 mb-3">{[['presupuesto', 'Presupuesto'], ['recibo', 'Recibo (ya me pagó)']].map(([k, t]) => (
          <button key={k} onClick={() => setTipo(k)} className="text-xs px-3 py-1.5 rounded-full border" style={tipo === k ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{t}</button>))}</div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Cliente</p>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-3 text-gray-500" />
                <input className={`${entrada} w-full pl-8`} placeholder="Buscar entre tus clientes…" value={q} onChange={(e) => setQ(e.target.value)} />
                {sugeridos.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-[#0b1017] overflow-hidden">{sugeridos.map((c) => <button key={c.jid} className="w-full text-left text-sm px-3 py-2 text-gray-200 hover:bg-white/5" onClick={() => { setCli({ nombre: c.nombre || '', telefono: String(c.numeroReal || c.telefono || '').replace(/\D/g, ''), jid: c.jid }); setSugeridos([]); setQ(''); }}>{c.nombre || 'Sin nombre'} <span className="text-xs text-gray-500">{c.telefono || ''}</span></button>)}</div>}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <input className={entrada} placeholder="Nombre *" value={cli.nombre} maxLength={80} onChange={(e) => setCli({ ...cli, nombre: e.target.value, jid: '' })} />
                <input className={entrada} placeholder="Teléfono (para enviarlo)" inputMode="tel" value={cli.telefono} onChange={(e) => setCli({ ...cli, telefono: e.target.value, jid: '' })} />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Agregar de tu catálogo</p>
              <input className={`${entrada} w-full`} placeholder="Buscar producto o servicio…" value={buscarItem} onChange={(e) => setBuscarItem(e.target.value)} />
              <div className="mt-1.5 max-h-36 overflow-y-auto space-y-1">
                {items.length === 0 ? <p className="text-xs text-gray-500 py-2">{opciones.items?.length ? 'Nada coincide.' : 'Todavía no cargaste productos ni servicios con precio: podés agregar ítems sueltos abajo.'}</p> : items.map((i) => (
                  <button key={`${i.tipo}${i.nombre}`} className="w-full flex justify-between text-left text-sm rounded-md px-2.5 py-1.5 bg-white/[0.03] hover:bg-white/[0.07] text-gray-200" onClick={() => agregar(i)}><span className="truncate">{i.nombre}</span><span className="text-gray-400">{pesos(i.precio)}</span></button>))}
              </div>
              <div className="flex gap-2 mt-2">
                <input className={`${entrada} flex-1 min-w-0 py-1.5`} placeholder="Ítem suelto" value={libre.nombre} onChange={(e) => setLibre({ ...libre, nombre: e.target.value })} maxLength={80} />
                <input className={`${entrada} w-24 py-1.5`} placeholder="Precio $" inputMode="decimal" value={libre.precio} onChange={(e) => setLibre({ ...libre, precio: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && agregarLibre()} />
                <button className="btn-secondary text-xs" onClick={agregarLibre}>Agregar</button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2.5 h-fit">
            <p className="text-sm font-medium text-white">Detalle</p>
            {lineas.length === 0 ? <p className="text-xs text-gray-500 py-3 text-center">Todavía no agregaste nada.</p> : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">{lineas.map((l, i) => (
                <div key={l.nombre} className="flex items-center gap-1.5 text-xs">
                  <span className="flex-1 truncate text-gray-200">{l.nombre}</span>
                  <input className="w-12 rounded bg-black/30 border border-white/10 px-1.5 py-0.5 text-center text-white" type="number" min="1" value={l.cantidad} onChange={(e) => setLineas((x) => x.map((y, k) => (k === i ? { ...y, cantidad: Math.max(1, Math.floor(Number(e.target.value)) || 1) } : y)))} aria-label="Cantidad" />
                  <input className="w-20 rounded bg-black/30 border border-white/10 px-1.5 py-0.5 text-right text-white" type="number" min="0" value={l.precio} onChange={(e) => setLineas((x) => x.map((y, k) => (k === i ? { ...y, precio: Number(e.target.value) || 0 } : y)))} aria-label="Precio" />
                  <button className="text-gray-500 hover:text-red-400" onClick={() => setLineas((x) => x.filter((_, k) => k !== i))} aria-label="Quitar"><Trash2 size={13} /></button>
                </div>))}</div>)}
            <label className="flex items-center gap-2 text-xs text-gray-400">Descuento %<input className={`${entrada} w-16 py-1 text-xs`} inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="0" /></label>
            {tipo === 'presupuesto' ? (
              <label className="flex items-center gap-2 text-xs text-gray-400">Válido por<input className={`${entrada} w-16 py-1 text-xs`} type="number" min="1" max="365" value={validez} onChange={(e) => setValidez(e.target.value)} />días</label>
            ) : (<>
              <div className="flex flex-wrap gap-1.5">{METODOS.map(([k, t]) => <button key={k} onClick={() => setMetodo(k)} className="text-xs rounded-md border px-2 py-1" style={metodo === k ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.5)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{t}</button>)}</div>
              <input className={`${entrada} w-full py-1.5 text-xs`} placeholder="Concepto (opcional)" maxLength={120} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
              <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={enCaja} onChange={(e) => setEnCaja(e.target.checked)} /> Anotar el cobro en la Caja</label>
            </>)}
            <textarea className={`${entrada} w-full py-1.5 text-xs`} rows={2} maxLength={500} placeholder="Notas para el cliente (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
            <div className="border-t border-white/10 pt-2">
              {pct > 0 && <p className="text-xs text-gray-500 flex justify-between"><span>Subtotal</span><span>{pesos(bruto)}</span></p>}
              <p className="flex justify-between text-white font-semibold text-lg"><span>Total</span><span>{pesos(total)}</span></p>
            </div>
            <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={guardando || !lineas.length || !cli.nombre.trim()} onClick={crear}>{guardando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Crear {tipo}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ComprobantesPage() {
  const [lista, setLista] = useState(null);
  const [opciones, setOpciones] = useState({ items: [] });
  const [tab, setTab] = useState('todos');
  const [nuevo, setNuevo] = useState(null);
  const [ocupado, setOcupado] = useState('');
  const [logoV, setLogoV] = useState(0);
  const archivoLogo = useRef(null);
  const [logoUrl, setLogoUrl] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [l, o] = await Promise.all([api.get('/app/comprobantes'), api.get('/app/comprobantes/opciones')]);
      setLista(l.data.comprobantes); setOpciones(o.data);
    } catch { toast.error('No se pudieron cargar los comprobantes'); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!opciones.tieneLogo) { setLogoUrl(''); return undefined; }
    let vivo = true; let objeto = '';
    api.get('/app/comprobantes/logo/ver', { responseType: 'blob' }).then((r) => { if (vivo) { objeto = URL.createObjectURL(r.data); setLogoUrl(objeto); } }).catch(() => {});
    return () => { vivo = false; if (objeto) URL.revokeObjectURL(objeto); };
  }, [opciones.tieneLogo, logoV]);

  const accion = async (id, nombre, fn, ok) => { setOcupado(`${id}${nombre}`); try { await fn(); if (ok) toast.success(ok); cargar(); } catch (e) { toast.error(e.response?.data?.error || 'No se pudo completar'); } finally { setOcupado(''); } };
  const enviar = (c) => accion(c._id, 'env', () => api.post(`/app/comprobantes/${c._id}/enviar`), `Enviado por WhatsApp a ${c.clienteNombre}`);
  const bajar = (c) => accion(c._id, 'pdf', () => bajarArchivo(`/app/comprobantes/${c._id}/pdf`, `${c.codigo}.pdf`));
  const aceptar = (c) => accion(c._id, 'ok', () => api.post(`/app/comprobantes/${c._id}/estado`, { estado: 'aceptado' }), 'Presupuesto aceptado');
  const anular = (c) => { if (!window.confirm(`¿Anular ${c.codigo}?${c.tipo === 'recibo' ? ' Si lo anotaste en la Caja, el ingreso se quita.' : ''}`)) return; accion(c._id, 'anu', () => api.post(`/app/comprobantes/${c._id}/estado`, { estado: 'anulado' }), `${c.codigo} anulado`); };
  const aRecibo = (c) => { const m = window.prompt('¿Cómo pagó? (efectivo, transferencia, mercadopago, tarjeta)', 'transferencia'); if (m === null) return; accion(c._id, 'rec', () => api.post(`/app/comprobantes/${c._id}/recibo`, { metodo: m.trim().toLowerCase() }), 'Recibo creado y cobro anotado en la Caja'); };
  const subirLogo = async (f) => { if (!f) return; try { await api.post('/app/comprobantes/logo', { base64: await aBase64(f) }); toast.success('Logo guardado'); setLogoV((v) => v + 1); cargar(); } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar el logo'); } };
  const quitarLogo = async () => { await api.delete('/app/comprobantes/logo').catch(() => {}); setLogoV((v) => v + 1); cargar(); };

  const visibles = (lista || []).filter((c) => tab === 'todos' || c.tipo === tab);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-4 animate-page-in">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-2xl font-bold text-white">Presupuestos y recibos</h1>
            <p className="text-sm text-gray-500">Armalos en un minuto, con tu logo, y mandáselos al cliente por WhatsApp en PDF.</p>
          </div>
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setNuevo('presupuesto')}><Plus size={14} /> Presupuesto</button>
          <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setNuevo('recibo')}><Receipt size={14} /> Recibo</button>
        </div>

        <div className="card flex items-center gap-3 py-3">
          {opciones.tieneLogo && logoUrl ? <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded object-contain bg-white/5" /> : <div className="h-10 w-10 rounded bg-white/5 flex items-center justify-center text-gray-600"><ImagePlus size={18} /></div>}
          <div className="flex-1 min-w-0"><p className="text-sm text-white">Logo de tu negocio</p><p className="text-[11px] text-gray-500">{opciones.tieneLogo ? 'Aparece arriba de tus PDF.' : 'Opcional: aparece arriba de tus PDF (JPG o PNG).'}{!opciones.datosDePago && ' Cargá tu alias/CBU en Config para que los presupuestos incluyan cómo pagar.'}</p></div>
          <input ref={archivoLogo} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { subirLogo(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="btn-secondary text-xs" onClick={() => archivoLogo.current?.click()}>{opciones.tieneLogo ? 'Cambiar' : 'Subir logo'}</button>
          {opciones.tieneLogo && <button className="text-xs text-gray-500 hover:text-red-400" onClick={quitarLogo}>Quitar</button>}
        </div>

        <div className="flex gap-2">{[['todos', 'Todos'], ['presupuesto', 'Presupuestos'], ['recibo', 'Recibos']].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className="text-xs px-3 py-1 rounded-full border" style={tab === k ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{t}</button>))}</div>

        {!lista ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div> : visibles.length === 0 ? (
          <div className="card text-center py-12"><FileText className="mx-auto text-gray-600 mb-3" size={34} /><p className="text-white font-medium">Todavía no hay {tab === 'recibo' ? 'recibos' : tab === 'presupuesto' ? 'presupuestos' : 'comprobantes'}</p><p className="text-sm text-gray-500 mt-1">Creá el primero con los botones de arriba.</p></div>
        ) : (
          <div className="space-y-2">{visibles.map((c) => {
            const [txt, col] = ESTADO[c.estado] || [c.estado, '#9ca3af'];
            const ocup = (k) => ocupado === `${c._id}${k}`;
            return (
              <div key={c._id} className="card py-3 flex flex-wrap items-center gap-3" style={{ opacity: c.estado === 'anulado' ? 0.55 : 1 }}>
                <div className="min-w-[110px]"><p className="text-sm font-semibold text-white">{c.codigo}</p><p className="text-[11px] text-gray-500">{fechaCorta(c.fecha)}</p></div>
                <div className="flex-1 min-w-[160px]"><p className="text-sm text-white truncate">{c.clienteNombre}</p><p className="text-[11px] text-gray-500 truncate">{c.items.map((i) => `${i.cantidad > 1 ? `${i.cantidad}× ` : ''}${i.nombre}`).join(', ')}</p>{c.enviadoEn && <p className="text-[11px] text-emerald-400/80">Enviado por WhatsApp</p>}</div>
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${col}22`, color: col }}>{txt}{c.tipo === 'presupuesto' && c.estado !== 'cobrado' && c.estado !== 'anulado' ? ` · vence ${fechaCorta(c.venceEl)}` : ''}</span>
                <p className="text-base font-semibold text-white min-w-[90px] text-right">{pesos(c.total)}</p>
                <div className="flex items-center gap-1">
                  <button className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5" title="Descargar PDF" aria-label="Descargar PDF" disabled={ocup('pdf')} onClick={() => bajar(c)}>{ocup('pdf') ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}</button>
                  {c.estado !== 'anulado' && <button className="p-1.5 rounded-md text-gray-400 hover:text-[var(--accent)] hover:bg-white/5" title="Enviar por WhatsApp" aria-label="Enviar por WhatsApp" disabled={ocup('env')} onClick={() => enviar(c)}>{ocup('env') ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</button>}
                  {c.tipo === 'presupuesto' && c.estado === 'emitido' && <button className="text-xs px-2 py-1 rounded-md text-violet-300 hover:bg-white/5" onClick={() => aceptar(c)}>Aceptado</button>}
                  {c.tipo === 'presupuesto' && (c.estado === 'emitido' || c.estado === 'aceptado') && !c.reciboId && <button className="text-xs px-2 py-1 rounded-md text-emerald-300 hover:bg-white/5 flex items-center gap-1" onClick={() => aRecibo(c)}><Receipt size={12} /> Ya pagó</button>}
                  {c.estado !== 'anulado' && <button className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-white/5" title="Anular" aria-label="Anular" onClick={() => anular(c)}><Ban size={15} /></button>}
                </div>
              </div>
            );
          })}</div>
        )}
      </div>
      {nuevo && <Nuevo tipoInicial={nuevo} opciones={opciones} onClose={() => setNuevo(null)} onCreado={() => { setNuevo(null); cargar(); }} />}
    </Layout>
  );
}
