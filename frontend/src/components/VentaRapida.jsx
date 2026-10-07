import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Loader2, Minus, Plus, Search, ShoppingBag, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { pesos } from '../utils/archivos';

// Venta rápida del mostrador: tocás los productos, elegís cómo te pagaron y cobrás. Descuenta el stock y suma a la Caja.
const METODOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['mercadopago', 'MercadoPago'], ['tarjeta', 'Tarjeta']];
const clave = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export default function VentaRapida({ onClose, onVendido, sucursalId = '' }) {
  const [datos, setDatos] = useState(null);
  const [carrito, setCarrito] = useState({});          // nombre → cantidad
  const [libres, setLibres] = useState([]);            // [{ nombre, precio, cantidad }]
  const [libre, setLibre] = useState({ nombre: '', precio: '' });
  const [metodo, setMetodo] = useState('efectivo');
  const [descuento, setDescuento] = useState('');
  const [buscar, setBuscar] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [sinStock, setSinStock] = useState(null);
  const claveVenta = useRef(clave());                  // un doble toque en "Cobrar" no vende dos veces

  const cargar = () => api.get('/app/ventas').then((r) => setDatos(r.data)).catch(() => toast.error('No se pudieron cargar los productos'));
  useEffect(() => { cargar(); }, []);

  const productos = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (datos?.productos || []).filter((p) => !q || `${p.nombre} ${p.categoria}`.toLowerCase().includes(q));
  }, [datos, buscar]);

  const cambiar = (nombre, d) => setCarrito((c) => { const n = Math.max(0, (c[nombre] || 0) + d); const x = { ...c }; if (n) x[nombre] = n; else delete x[nombre]; return x; });
  const lineas = [
    ...Object.entries(carrito).map(([nombre, cantidad]) => { const p = datos.productos.find((z) => z.nombre === nombre); return { nombre, cantidad, precio: p?.precio ?? 0 }; }),
    ...libres,
  ];
  const bruto = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const pct = Math.min(100, Math.max(0, Number(String(descuento).replace(',', '.')) || 0));
  const total = Math.round((bruto - bruto * pct / 100) * 100) / 100;

  // Lector de códigos: escribe el código como un teclado y termina con Enter
  const alLeer = (e) => {
    if (e.key !== 'Enter') return;
    const k = buscar.trim().toLowerCase(); if (!k) return;
    const p = (datos?.productos || []).find((z) => z.codigo && z.codigo.toLowerCase() === k);
    if (p) { e.preventDefault(); if (p.stock === 0) toast.error(`${p.nombre}: sin stock`); cambiar(p.nombre, 1); setBuscar(''); toast.success(p.nombre, { duration: 1200 }); }
    else if (productos.length === 0) toast.error('No encontré ese código en tu catálogo');
  };
  const agregarLibre = () => {
    const precio = Number(String(libre.precio).replace(',', '.'));
    if (!libre.nombre.trim() || !(precio > 0)) { toast.error('Poné el nombre y el precio'); return; }
    setLibres((l) => [...l, { nombre: libre.nombre.trim(), precio, cantidad: 1 }]);
    setLibre({ nombre: '', precio: '' });
  };

  const cobrar = async (forzar = false) => {
    setCobrando(true);
    try {
      const items = [...Object.entries(carrito).map(([nombre, cantidad]) => ({ nombre, cantidad })), ...libres.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio: l.precio }))];
      const r = await api.post('/app/ventas', { items, metodo, descuentoPct: pct, clave: claveVenta.current, forzar, sucursalId });
      toast.success(`Venta registrada: ${pesos(r.data.total)}`);
      if (r.data.aviso) toast(r.data.aviso, { icon: '📉', duration: 6000 });
      onVendido?.();
      onClose();
    } catch (e) {
      if (e.response?.status === 409) setSinStock(e.response.data);
      else toast.error(e.response?.data?.error || 'No se pudo registrar la venta');
    } finally { setCobrando(false); }
  };

  const anular = async (v) => {
    if (!window.confirm(`¿Anular esta venta de ${pesos(v.monto)}? El stock vuelve al catálogo.`)) return;
    try { await api.delete(`/app/ventas/${v._id}`); toast.success('Venta anulada'); cargar(); onVendido?.(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo anular'); }
  };

  const entrada = 'rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2"><ShoppingBag size={18} className="text-[var(--accent)]" /> Venta rápida</h3>
            <p className="text-xs text-gray-500">Tocá los productos, elegí cómo pagó y cobrá. Descuenta el stock y suma a la Caja.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        {!datos ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-500" /></div> : (
          <div className="grid md:grid-cols-[1fr_280px] gap-4">
            <div className="space-y-3 min-w-0">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} onKeyDown={alLeer} autoFocus placeholder="Buscar producto o escanear código de barras…" className={`${entrada} w-full pl-8`} />
              </div>
              {datos.productos.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">Todavía no cargaste productos en el Catálogo. Podés vender algo suelto abajo.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {productos.map((p) => {
                    const n = carrito[p.nombre] || 0; const agotado = p.stock === 0;
                    return (
                      <button key={p.nombre} type="button" onClick={() => cambiar(p.nombre, 1)}
                        className="text-left rounded-lg border px-3 py-2 transition hover:border-[var(--accent)]/50"
                        style={n ? { borderColor: 'rgba(0,232,123,0.5)', background: 'rgba(0,232,123,0.08)' } : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
                        <p className="text-sm text-white truncate">{p.nombre}</p>
                        <p className="text-xs text-gray-400">{pesos(p.precio)}</p>
                        <p className="text-[11px]" style={{ color: agotado ? '#f87171' : p.stock >= 0 && p.stock <= 3 ? '#fbbf24' : '#6b7280' }}>{p.stock < 0 ? 'Sin control de stock' : agotado ? 'Agotado' : `Stock: ${p.stock}`}</p>
                        {n > 0 && <span className="text-[11px] text-[var(--accent)]">× {n} en la venta</span>}
                      </button>
                    );
                  })}
                  {productos.length === 0 && <p className="col-span-full text-xs text-gray-500 py-3 text-center">Nada coincide con la búsqueda.</p>}
                </div>
              )}

              <div className="rounded-lg border border-dashed border-white/15 p-2.5">
                <p className="text-xs text-gray-400 mb-1.5">Algo que no está en el catálogo</p>
                <div className="flex gap-2">
                  <input value={libre.nombre} onChange={(e) => setLibre({ ...libre, nombre: e.target.value })} placeholder="Nombre" maxLength={80} className={`${entrada} flex-1 min-w-0 py-1.5`} />
                  <input value={libre.precio} onChange={(e) => setLibre({ ...libre, precio: e.target.value })} placeholder="Precio $" inputMode="decimal" className={`${entrada} w-24 py-1.5`} onKeyDown={(e) => e.key === 'Enter' && agregarLibre()} />
                  <button type="button" className="btn-secondary text-xs" onClick={agregarLibre}>Agregar</button>
                </div>
              </div>

              {datos.recientes.length > 0 && (
                <details className="text-xs">
                  <summary className="text-gray-500 cursor-pointer hover:text-gray-300">Últimas ventas (por si te equivocaste)</summary>
                  <div className="mt-1.5 space-y-1">
                    {datos.recientes.map((v) => (
                      <div key={v._id} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1.5">
                        <span className="text-gray-500 w-10">{v.fecha.slice(8, 10)}/{v.fecha.slice(5, 7)}</span>
                        <span className="flex-1 truncate text-gray-300">{v.descripcion.replace(/^Venta: /, '')}</span>
                        <span className="text-white">{pesos(v.monto)}</span>
                        <button className="p-1 text-gray-500 hover:text-red-400" title="Anular esta venta" aria-label="Anular venta" onClick={() => anular(v)}><Undo2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3 flex flex-col gap-3 h-fit">
              <p className="text-sm font-medium text-white">La venta</p>
              {lineas.length === 0 ? <p className="text-xs text-gray-500 py-3 text-center">Todavía no agregaste nada.</p> : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {lineas.map((l, i) => (
                    <div key={`${l.nombre}-${i}`} className="flex items-center gap-1.5 text-xs">
                      <span className="flex-1 truncate text-gray-200">{l.nombre}</span>
                      {i < Object.keys(carrito).length ? (
                        <span className="flex items-center gap-1">
                          <button type="button" className="p-0.5 rounded bg-white/10 text-gray-300" aria-label="Menos" onClick={() => cambiar(l.nombre, -1)}><Minus size={11} /></button>
                          <span className="w-5 text-center text-white">{l.cantidad}</span>
                          <button type="button" className="p-0.5 rounded bg-white/10 text-gray-300" aria-label="Más" onClick={() => cambiar(l.nombre, 1)}><Plus size={11} /></button>
                        </span>
                      ) : (
                        <button type="button" className="p-0.5 rounded bg-white/10 text-gray-300" aria-label="Quitar" onClick={() => setLibres((x) => x.filter((_, k) => k !== i - Object.keys(carrito).length))}><X size={11} /></button>
                      )}
                      <span className="w-16 text-right text-gray-300">{pesos(l.precio * l.cantidad)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <p className="text-[11px] text-gray-500 mb-1">¿Cómo pagó?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {METODOS.map(([k, t]) => (
                    <button key={k} type="button" onClick={() => setMetodo(k)} className="text-xs rounded-md border py-1.5"
                      style={metodo === k ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.5)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{t}</button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-400">Descuento %
                <input value={descuento} onChange={(e) => setDescuento(e.target.value)} inputMode="decimal" placeholder="0" className={`${entrada} w-16 py-1 text-xs`} />
              </label>
              <div className="border-t border-white/10 pt-2">
                {pct > 0 && <p className="text-xs text-gray-500 flex justify-between"><span>Subtotal</span><span>{pesos(bruto)}</span></p>}
                <p className="flex justify-between text-white font-semibold text-lg"><span>Total</span><span>{pesos(total)}</span></p>
              </div>
              <button className="btn-primary flex items-center justify-center gap-2" disabled={cobrando || lineas.length === 0 || !(total > 0)} onClick={() => cobrar(false)}>
                {cobrando ? <Loader2 size={15} className="animate-spin" /> : <ShoppingBag size={15} />} Cobrar {total > 0 ? pesos(total) : ''}
              </button>
            </div>
          </div>
        )}

        {sinStock && (
          <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
            <p className="text-amber-200">{sinStock.error}</p>
            <p className="text-xs text-gray-400 mt-1">Si en realidad lo tenés (el stock del catálogo estaba desactualizado), podés vender igual: el stock queda en 0.</p>
            <div className="flex gap-2 mt-2 justify-end">
              <button className="btn-secondary text-xs" onClick={() => setSinStock(null)}>Volver</button>
              <button className="btn-primary text-xs" onClick={() => { setSinStock(null); cobrar(true); }}>Vender igual</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
