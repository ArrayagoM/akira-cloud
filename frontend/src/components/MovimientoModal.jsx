import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Formulario para cargar o corregir un ingreso/gasto de la Caja.
// Lo usan la pantalla Caja y la bandeja de Documentos ("Registrar en Caja").
const METODOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['mercadopago', 'MercadoPago'], ['tarjeta', 'Tarjeta'], ['otro', 'Otro']];
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function MovimientoModal({ inicial = {}, id = null, categorias = { gasto: [], ingreso: [] }, proveedores = [], titulo, onClose, onGuardado }) {
  const [f, setF] = useState({ tipo: 'gasto', monto: '', fecha: hoyLocal(), categoria: '', descripcion: '', metodo: 'efectivo', ...inicial, monto: inicial.monto ?? '' });
  const [guardando, setGuardando] = useState(false);
  const set = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }));
  const entrada = 'mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';

  const guardar = async () => {
    const monto = Number(String(f.monto).replace(',', '.'));
    if (!(monto > 0)) { toast.error('Poné un monto mayor a cero'); return; }
    setGuardando(true);
    try {
      const body = { ...f, monto };
      if (id) await api.put(`/caja/movimiento/${id}`, body); else await api.post('/caja/movimiento', body);
      toast.success(id ? 'Movimiento actualizado' : f.tipo === 'ingreso' ? 'Ingreso registrado' : 'Gasto registrado');
      onGuardado?.();
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const esIngreso = f.tipo === 'ingreso';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">{titulo || (id ? 'Editar movimiento' : 'Nuevo movimiento')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          {[['ingreso', 'Ingreso', '#34d399'], ['gasto', 'Gasto', '#f87171']].map(([k, txt, color]) => (
            <button key={k} type="button" onClick={() => set('tipo', k)} className="py-2 rounded-lg border text-sm font-medium"
              style={f.tipo === k ? { color, borderColor: color, background: `${color}14` } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{txt}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">Monto ($) *
            <input className={entrada} type="number" min="0" step="0.01" autoFocus value={f.monto} onChange={(e) => set('monto', e.target.value)} placeholder="0" />
          </label>
          <label className="text-xs text-gray-500">Fecha *
            <input className={entrada} type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">Categoría
            <input className={entrada} list="caja-categorias" value={f.categoria} onChange={(e) => set('categoria', e.target.value)} placeholder={esIngreso ? 'Ej: Ventas' : 'Ej: Alquiler'} />
            <datalist id="caja-categorias">{(categorias[f.tipo] || []).map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="text-xs text-gray-500">Método de pago
            <select className={entrada} value={f.metodo} onChange={(e) => set('metodo', e.target.value)}>
              {METODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
        </div>
        {!esIngreso && proveedores.length > 0 && (
          <label className="text-xs text-gray-500 block mt-3">Proveedor (opcional)
            <select className={entrada} value={f.proveedorId || ''} onChange={(e) => set('proveedorId', e.target.value || null)}>
              <option value="">— ninguno —</option>
              {proveedores.map((p) => <option key={p._id} value={p._id}>{p.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs text-gray-500 block mt-3">Descripción
          <input className={entrada} maxLength={200} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder={esIngreso ? 'Ej: Venta de shampoo' : 'Ej: Factura de luz octubre'} />
        </label>

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm flex items-center gap-1.5" disabled={guardando} onClick={guardar}>
            {guardando && <Loader2 size={14} className="animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
