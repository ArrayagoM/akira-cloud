import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import CuentaMovimientoModal from '../components/CuentaMovimientoModal';
import ImportarAsistente from '../components/ImportarAsistente';
import api from '../services/api';
import toast from 'react-hot-toast';
import { bajarArchivo, pesos } from '../utils/archivos';
import { Truck, Plus, Upload, Download, ChevronDown, Search, Loader2, X, Trash2, Pencil, Phone, Archive, ShoppingCart, Wallet } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Proveedores: a quién le comprás y cuánto le debés. Una compra a crédito suma deuda;
// un pago la baja y sale de la Caja como gasto. Los gastos al contado de la Caja
// también se pueden asignar a un proveedor para ver cuánto le comprás por mes.
// ─────────────────────────────────────────────────────────────

const fechaAR = (f) => (f ? f.split('-').reverse().join('/') : '—');
const entrada = 'mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';

function ProveedorForm({ inicial, onClose, onGuardado }) {
  const [f, setF] = useState({ nombre: '', telefono: '', cuit: '', rubro: '', notas: '', ...inicial });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const guardar = async () => {
    if (!f.nombre.trim()) { toast.error('Poné el nombre del proveedor'); return; }
    setGuardando(true);
    try {
      if (inicial?._id) await api.put(`/proveedores/${inicial._id}`, f); else await api.post('/proveedores', f);
      toast.success(inicial?._id ? 'Proveedor actualizado' : 'Proveedor agregado');
      onGuardado(); onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar'); } finally { setGuardando(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3"><h3 className="text-lg font-semibold text-white">{inicial?._id ? 'Editar proveedor' : 'Nuevo proveedor'}</h3><button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button></div>
        <label className="text-xs text-gray-500 block">Nombre *<input className={entrada} autoFocus value={f.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej: Distribuidora Sur" /></label>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <label className="text-xs text-gray-500">Teléfono<input className={entrada} value={f.telefono} onChange={(e) => set('telefono', e.target.value)} /></label>
          <label className="text-xs text-gray-500">CUIT<input className={entrada} value={f.cuit} onChange={(e) => set('cuit', e.target.value)} placeholder="30-12345678-9" /></label>
        </div>
        <label className="text-xs text-gray-500 block mt-3">Rubro<input className={entrada} value={f.rubro} onChange={(e) => set('rubro', e.target.value)} placeholder="Ej: Insumos, bebidas…" /></label>
        <label className="text-xs text-gray-500 block mt-3">Notas<textarea className={entrada} rows={2} maxLength={500} value={f.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Días de entrega, contacto, condiciones…" /></label>
        <div className="flex justify-end gap-2 mt-5"><button className="btn-secondary text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm flex items-center gap-1.5" disabled={guardando} onClick={guardar}>{guardando && <Loader2 size={14} className="animate-spin" />} Guardar</button></div>
      </div>
    </div>
  );
}

function Detalle({ id, onClose, onCambio }) {
  const [d, setD] = useState(null);
  const [modal, setModal] = useState(null);
  const [editando, setEditando] = useState(false);
  const cargar = useCallback(() => api.get(`/proveedores/${id}`).then((r) => setD(r.data)).catch(() => { toast.error('No se pudo abrir el proveedor'); onClose(); }), [id, onClose]);
  useEffect(() => { cargar(); }, [cargar]);

  const borrarMov = async (m) => {
    if (!window.confirm(`¿Borrar este ${m.tipo === 'cargo' ? 'cargo' : 'pago'} de ${pesos(m.monto)}?${m.cajaId ? ' También se saca de la Caja.' : ''}`)) return;
    try { await api.delete(`/proveedores/movimiento/${m._id}`); toast.success('Movimiento borrado'); await cargar(); onCambio(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo borrar'); }
  };
  const archivar = async () => {
    if (!window.confirm('¿Archivar este proveedor? Sale de la lista pero conservás todo su historial.')) return;
    try { const r = await api.delete(`/proveedores/${id}`); toast.success(r.data.archivado ? 'Proveedor archivado' : 'Proveedor eliminado'); onCambio(); onClose(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo archivar'); }
  };
  if (!d) return <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}><Loader2 className="animate-spin text-gray-400" /></div>;
  const p = d.proveedor;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{p.nombre} {p.activo === false && <span className="text-[11px] ml-1 px-2 py-0.5 rounded-full bg-white/10 text-gray-300">Archivado</span>}</h3>
            <p className="text-xs text-gray-500">{[p.rubro, p.telefono, p.cuit && `CUIT ${p.cuit}`].filter(Boolean).join(' · ') || 'Sin más datos'}</p>
            {p.notas && <p className="text-xs text-gray-400 mt-1">{p.notas}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-3 gap-2 my-4 text-center">
          <div className="rounded-lg border border-white/10 py-2"><p className="text-[11px] text-gray-500">Le debés</p><p className="text-xl font-bold" style={{ color: p.saldo > 0 ? '#f87171' : '#34d399' }}>{p.saldo < 0 ? `-${pesos(-p.saldo)}` : pesos(p.saldo)}</p>{p.saldo < 0 && <p className="text-[10px] text-emerald-400">saldo a tu favor</p>}</div>
          <div className="rounded-lg border border-white/10 py-2"><p className="text-[11px] text-gray-500">Comprado este mes</p><p className="text-lg font-semibold text-white">{pesos(p.compradoMes)}</p></div>
          <div className="rounded-lg border border-white/10 py-2"><p className="text-[11px] text-gray-500">Última compra</p><p className="text-lg font-semibold text-white">{fechaAR(p.ultimaCompra)}</p></div>
        </div>

        {p.activo !== false && (
          <div className="flex flex-wrap gap-2 mb-3">
            <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setModal('pago')}><Wallet size={14} /> Registrar pago</button>
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setModal('cargo')}><ShoppingCart size={14} /> Compra a crédito</button>
            <button className="btn-secondary text-sm flex items-center gap-1.5 ml-auto" onClick={() => setEditando(true)}><Pencil size={14} /> Editar</button>
            <button className="text-sm px-3 py-2 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-1.5" onClick={archivar}><Archive size={14} /> Archivar</button>
          </div>
        )}

        <p className="text-sm font-medium text-white mb-1">Historial</p>
        {d.movimientos.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">Todavía no hay compras ni pagos con este proveedor.</p> : (
          <div className="rounded-lg border border-white/10 divide-y divide-white/5">
            {d.movimientos.map((m) => {
              const esCaja = m.origen === 'caja';
              const color = m.tipo === 'cargo' ? '#fbbf24' : m.tipo === 'pago' ? '#34d399' : '#9ca3af';
              return (
                <div key={m._id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="text-xs text-gray-500 w-20">{fechaAR(m.fecha)}</span>
                  <span className="flex-1 text-gray-200 truncate">{m.concepto}
                    <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400">{m.tipo === 'cargo' ? 'a crédito' : m.tipo === 'pago' ? 'pago' : 'contado'}</span></span>
                  <span className="font-medium" style={{ color }}>{m.tipo === 'pago' ? '−' : '+'} {pesos(m.monto)}</span>
                  {esCaja ? <span className="w-[14px]" /> : <button className="text-gray-600 hover:text-red-400" aria-label="Borrar" onClick={() => borrarMov(m)}><Trash2 size={14} /></button>}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-gray-600 mt-2">Las compras al contado se asignan al proveedor desde la Caja, al cargar el gasto.</p>
      </div>

      {modal && <CuentaMovimientoModal entidad="proveedor" proveedorId={id} tipoInicial={modal} nombreFijo={p.nombre} onClose={() => setModal(null)} onGuardado={() => { cargar(); onCambio(); }} />}
      {editando && <ProveedorForm inicial={p} onClose={() => setEditando(false)} onGuardado={() => { cargar(); onCambio(); }} />}
    </div>
  );
}

export default function ProveedoresPage() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [importando, setImportando] = useState(false);
  const [menuExp, setMenuExp] = useState(false);

  const cargar = useCallback(async () => {
    try { setDatos((await api.get('/proveedores')).data); } catch { toast.error('No se pudo cargar la lista'); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (datos?.proveedores || []).filter((p) => !q || `${p.nombre} ${p.rubro || ''} ${p.telefono || ''}`.toLowerCase().includes(q));
  }, [datos, buscar]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-4 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Proveedores</h1>
          <p className="text-sm text-gray-500">A quién le comprás y cuánto le debés. Los pagos que registres salen de la Caja.</p>
        </div>

        {cargando || !datos ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div> : (<>
          <div className="grid grid-cols-3 gap-3">
            <div className="card py-3"><div className="flex items-center gap-2 text-xs text-gray-500"><Wallet size={14} className="text-red-400" />Total que debés</div><p className="text-2xl font-bold text-red-400 mt-1">{pesos(datos.totalDeuda)}</p></div>
            <div className="card py-3"><div className="flex items-center gap-2 text-xs text-gray-500"><ShoppingCart size={14} />Comprado este mes</div><p className="text-2xl font-bold text-white mt-1">{pesos(datos.compradoMes)}</p></div>
            <div className="card py-3"><div className="flex items-center gap-2 text-xs text-gray-500"><Truck size={14} />Proveedores</div><p className="text-2xl font-bold text-white mt-1">{datos.proveedores.length}</p></div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setNuevo(true)}><Plus size={14} /> Proveedor</button>
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setImportando(true)}><Upload size={14} /> Importar planilla</button>
            <div className="relative">
              <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setMenuExp((v) => !v)}><Download size={14} /> Exportar <ChevronDown size={12} /></button>
              {menuExp && (
                <div className="absolute z-20 mt-1 w-48 rounded-lg border border-white/10 bg-[#0b1017] shadow-xl overflow-hidden" onMouseLeave={() => setMenuExp(false)}>
                  {[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV (para Excel)'], ['pdf', 'PDF: lo que debo']].map(([f, txt]) => (
                    <button key={f} className="w-full text-left text-sm px-3 py-2 text-gray-300 hover:bg-white/5" onClick={() => { setMenuExp(false); bajarArchivo(`/proveedores/exportar?formato=${f}`, `proveedores.${f}`).catch(() => toast.error('No se pudo exportar')); }}>{txt}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative ml-auto"><Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar proveedor…" className="w-48 rounded-md bg-black/30 border border-white/10 pl-7 pr-2 py-1.5 text-sm text-white outline-none focus:border-[var(--accent)]/50" /></div>
          </div>

          {datos.proveedores.length === 0 ? (
            <div className="card text-center py-14">
              <Truck className="mx-auto text-gray-600 mb-3" size={36} />
              <p className="text-white font-medium">Todavía no cargaste proveedores</p>
              <p className="text-sm text-gray-500 mt-1">Agregalos a mano o importá tu lista desde Excel. Después podés registrar compras y pagos.</p>
              <div className="flex justify-center gap-2 mt-4"><button className="btn-primary text-sm" onClick={() => setNuevo(true)}>Agregar proveedor</button><button className="btn-secondary text-sm" onClick={() => setImportando(true)}>Importar planilla</button></div>
            </div>
          ) : (
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-500 text-left border-b border-white/10"><th className="px-3 py-2 font-medium">Proveedor</th><th className="px-3 py-2 font-medium text-right">Le debés</th><th className="px-3 py-2 font-medium text-right">Comprado en el mes</th><th className="px-3 py-2 font-medium">Última compra</th><th className="px-3 py-2 font-medium">Contacto</th></tr></thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr key={p._id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer" onClick={() => setAbierto(p._id)}>
                      <td className="px-3 py-2"><span className="text-white">{p.nombre}</span>{p.rubro && <span className="block text-xs text-gray-500">{p.rubro}</span>}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color: p.saldo > 0.005 ? '#f87171' : '#9ca3af' }}>{pesos(Math.max(0, p.saldo))}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{pesos(p.compradoMes)}</td>
                      <td className="px-3 py-2 text-gray-400">{fechaAR(p.ultimaCompra)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{p.telefono ? <span className="inline-flex items-center gap-1"><Phone size={11} />{p.telefono}</span> : '—'}</td>
                    </tr>
                  ))}
                  {visibles.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Ningún proveedor coincide con la búsqueda.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>)}
      </div>

      {nuevo && <ProveedorForm onClose={() => setNuevo(false)} onGuardado={cargar} />}
      {abierto && <Detalle id={abierto} onClose={() => setAbierto(null)} onCambio={cargar} />}
      {importando && <ImportarAsistente tipoInicial="proveedores" tipos={['proveedores']} onClose={() => setImportando(false)} onListo={cargar} />}
    </Layout>
  );
}
