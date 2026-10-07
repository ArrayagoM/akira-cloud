import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { pesos } from '../utils/archivos';
import { ShoppingBag, Loader2, CheckCircle2, Truck, Store, XCircle, Clock } from 'lucide-react';

// Pedidos de productos que el bot toma por WhatsApp (se activan en Clientes → Programas con tus clientes).
// Cuando un pedido se paga, se descuenta el stock y entra a la Caja solo.
const ESTADOS = {
  'pendiente-pago': { txt: 'Falta pagar', color: '#fbbf24', icono: Clock },
  pagado: { txt: 'Pagado · por entregar', color: '#00e87b', icono: CheckCircle2 },
  entregado: { txt: 'Entregado', color: '#9ca3af', icono: CheckCircle2 },
  cancelado: { txt: 'Cancelado', color: '#f87171', icono: XCircle },
};
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const msg = (e, d) => e?.response?.data?.error || d;

export default function PedidosPage() {
  const [datos, setDatos] = useState(null);
  const [activo, setActivo] = useState(null);
  const [trabajando, setTrabajando] = useState('');
  const [metodo, setMetodo] = useState('transferencia');

  const cargar = useCallback(async () => {
    try { const [p, c] = await Promise.all([api.get('/app/pedidos'), api.get('/app/programas')]); setDatos({ ...p.data, habilitado: !!c.data.pedidos?.activa }); }
    catch { toast.error('No se pudieron cargar los pedidos'); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 20000); return () => clearInterval(t); }, [cargar]);

  const accion = async (id, ruta, cuerpo, ok) => {
    setTrabajando(id + ruta);
    try { const r = await api.post(`/app/pedidos/${id}/${ruta}`, cuerpo); toast.success(ok); if (r.data.pocoStock) toast(r.data.pocoStock, { icon: '📉', duration: 6000 }); cargar(); }
    catch (e) { toast.error(msg(e, 'No se pudo completar')); } finally { setTrabajando(''); }
  };
  const cancelar = (p) => { if (window.confirm(`¿Cancelar el pedido #${p.numero}?${p.estado === 'pagado' ? ' Se devuelve el stock y se quita el ingreso de la Caja.' : ''}`)) accion(p._id, 'estado', { estado: 'cancelado' }, 'Pedido cancelado'); };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-4 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><ShoppingBag size={22} className="text-[var(--accent)]" /> Pedidos</h1>
          <p className="text-sm text-gray-500">Lo que tus clientes piden por WhatsApp. Al pagarse, se descuenta el stock y entra a la Caja.</p>
        </div>

        {!datos ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div> : (<>
          {!datos.habilitado && (
            <div className="card" style={{ border: '1px solid rgba(251,191,36,0.3)' }}>
              <p className="text-sm text-white font-medium">Los pedidos por WhatsApp están apagados</p>
              <p className="text-xs text-gray-400 mt-1">Para que el bot tome pedidos, activalo en <Link to="/clientes" className="underline text-[var(--accent)]">Clientes → Programas con tus clientes → Pedidos por WhatsApp</Link>. Necesitás tener productos con precio en el <Link to="/catalogo" className="underline text-[var(--accent)]">Catálogo</Link>.</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="card py-3"><p className="text-xl font-bold" style={{ color: '#fbbf24' }}>{datos.resumen.pendientes}</p><p className="text-[11px] text-gray-500">Faltan pagar</p></div>
            <div className="card py-3"><p className="text-xl font-bold text-[var(--accent)]">{datos.resumen.porEntregar}</p><p className="text-[11px] text-gray-500">Por entregar</p></div>
            <div className="card py-3"><p className="text-xl font-bold text-white">{pesos(datos.resumen.cobradoTotal)}</p><p className="text-[11px] text-gray-500">Cobrado</p></div>
          </div>

          {datos.pedidos.length === 0 ? (
            <div className="card text-center py-12"><ShoppingBag className="mx-auto text-gray-600 mb-3" size={34} /><p className="text-white font-medium">Todavía no hay pedidos</p><p className="text-sm text-gray-500 mt-1">Cuando un cliente le pida productos al bot, van a aparecer acá.</p></div>
          ) : datos.pedidos.map((p) => {
            const e = ESTADOS[p.estado] || ESTADOS.cancelado; const I = e.icono; const abierto = activo === p._id;
            return (
              <div key={p._id} className="card" style={{ opacity: p.estado === 'cancelado' ? 0.55 : 1 }}>
                <button className="w-full flex items-center gap-3 text-left" onClick={() => setActivo(abierto ? null : p._id)} aria-expanded={abierto}>
                  <I size={18} style={{ color: e.color }} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">#{p.numero} · {p.nombre || p.telefono || 'Cliente'} <span className="text-xs font-normal text-gray-500">· {fecha(p.confirmadoEn)}</span></p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">{p.entrega === 'envio' ? <><Truck size={12} /> Envío</> : <><Store size={12} /> Retira</>} · {p.items.reduce((s, i) => s + i.cantidad, 0)} {p.items.reduce((s, i) => s + i.cantidad, 0) === 1 ? 'producto' : 'productos'}</p>
                  </div>
                  <div className="text-right shrink-0"><p className="text-sm font-bold text-white">{pesos(p.total)}</p><p className="text-[11px]" style={{ color: e.color }}>{e.txt}</p></div>
                </button>

                {abierto && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                    <ul className="text-sm space-y-1">
                      {p.items.map((i) => <li key={i.nombre} className="flex justify-between text-gray-300"><span>{i.cantidad} × {i.nombre}</span><span>{pesos(i.precio * i.cantidad)}</span></li>)}
                      {p.envio > 0 && <li className="flex justify-between text-gray-400"><span>Envío</span><span>{pesos(p.envio)}</span></li>}
                    </ul>
                    {p.entrega === 'envio' && <p className="text-xs text-gray-400">📍 {p.direccion}</p>}
                    {p.notas && <p className="text-xs text-gray-400">📝 {p.notas}</p>}
                    <p className="text-xs text-gray-500">Se paga por {p.metodoPago === 'mercadopago' ? 'MercadoPago (se confirma solo cuando se acredita)' : 'transferencia'}{p.pago?.metodo && p.estado !== 'pendiente-pago' ? ` · pagado con ${p.pago.metodo}` : ''}.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.estado === 'pendiente-pago' && (<>
                        <select value={metodo} onChange={(e2) => setMetodo(e2.target.value)} className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white" aria-label="Cómo pagó">
                          <option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="mercadopago">MercadoPago</option>
                        </select>
                        <button className="btn-primary text-xs flex items-center gap-1.5" disabled={!!trabajando} onClick={() => accion(p._id, 'pagar', { metodo }, 'Pago registrado: se descontó el stock y entró a la Caja')}>{trabajando === p._id + 'pagar' && <Loader2 size={13} className="animate-spin" />} Ya me pagó</button>
                      </>)}
                      {p.estado === 'pagado' && <button className="btn-primary text-xs flex items-center gap-1.5" disabled={!!trabajando} onClick={() => accion(p._id, 'estado', { estado: 'entregado' }, 'Marcado como entregado')}>{trabajando === p._id + 'estado' && <Loader2 size={13} className="animate-spin" />} Ya lo entregué</button>}
                      {(p.estado === 'pendiente-pago' || p.estado === 'pagado') && <button className="btn-secondary text-xs" disabled={!!trabajando} onClick={() => cancelar(p)}>Cancelar pedido</button>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>)}
      </div>
    </Layout>
  );
}
