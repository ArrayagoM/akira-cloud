import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Formulario de cuenta corriente: una deuda nueva ("cargo") o un pago.
//  · entidad 'cliente'   → Deudores: se elige un cliente del bot o se escribe uno nuevo.
//  · entidad 'proveedor' → Proveedores: ya viene fijado el proveedor.
// Un pago además entra (clientes) o sale (proveedores) de la Caja, salvo que se destilde.
const METODOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['mercadopago', 'MercadoPago'], ['tarjeta', 'Tarjeta'], ['otro', 'Otro']];
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const TEXTOS = {
  cliente: { cargo: 'Venta a cuenta (te deben)', pago: 'Pago recibido', conceptoCargo: 'Ej: Corte y color', conceptoPago: 'Ej: Pago parcial', caja: 'Sumar este cobro como ingreso en la Caja' },
  proveedor: { cargo: 'Compra a crédito (le debés)', pago: 'Pago al proveedor', conceptoCargo: 'Ej: Pedido de shampoo', conceptoPago: 'Ej: Transferencia factura 0001', caja: 'Descontar este pago como gasto en la Caja' },
};

export default function CuentaMovimientoModal({ entidad, tipoInicial = 'cargo', clave = null, proveedorId = null, nombreFijo = '', onClose, onGuardado }) {
  const T = TEXTOS[entidad];
  const [f, setF] = useState({ tipo: tipoInicial, monto: '', fecha: hoyLocal(), concepto: '', metodo: 'efectivo', enCaja: true, nombre: '', telefono: '', jid: '' });
  const [sugeridos, setSugeridos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const entrada = 'mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';
  const eligeCliente = entidad === 'cliente' && !clave;

  // Sugerencias de clientes del bot mientras se escribe el nombre
  useEffect(() => {
    if (!eligeCliente || f.nombre.trim().length < 2) { setSugeridos([]); return undefined; }
    const t = setTimeout(() => api.get(`/deudores/clientes?q=${encodeURIComponent(f.nombre)}`).then((r) => setSugeridos(r.data.clientes || [])).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [f.nombre, eligeCliente]);

  const guardar = async () => {
    const monto = Number(String(f.monto).replace(',', '.'));
    if (!(monto > 0)) { toast.error('Poné un monto mayor a cero'); return; }
    if (eligeCliente && !f.nombre.trim()) { toast.error('Poné el nombre del cliente'); return; }
    setGuardando(true);
    try {
      const cuerpo = { tipo: f.tipo, monto, fecha: f.fecha, concepto: f.concepto, metodo: f.tipo === 'pago' ? f.metodo : undefined, enCaja: f.tipo === 'pago' ? f.enCaja : undefined };
      if (entidad === 'cliente') await api.post('/deudores/movimiento', { ...cuerpo, ...(clave ? { clave } : { nombre: f.nombre, telefono: f.telefono, jid: f.jid }) });
      else await api.post(`/proveedores/${proveedorId}/movimiento`, cuerpo);
      toast.success(f.tipo === 'cargo' ? 'Deuda registrada' : 'Pago registrado');
      onGuardado?.();
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{f.tipo === 'cargo' ? 'Registrar deuda' : 'Registrar pago'}</h3>
            {nombreFijo && <p className="text-xs text-gray-500">{nombreFijo}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          {[['cargo', T.cargo, '#fbbf24'], ['pago', T.pago, '#34d399']].map(([k, txt, color]) => (
            <button key={k} type="button" onClick={() => set('tipo', k)} className="py-2 px-2 rounded-lg border text-xs font-medium leading-tight"
              style={f.tipo === k ? { color, borderColor: color, background: `${color}14` } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{txt}</button>
          ))}
        </div>

        {eligeCliente && (
          <div className="space-y-3 mb-3">
            <label className="text-xs text-gray-500 block">Cliente *
              <input className={entrada} autoFocus value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value, jid: '' }))} placeholder="Nombre del cliente" />
            </label>
            {sugeridos.length > 0 && !f.jid && (
              <div className="rounded-lg border border-white/10 divide-y divide-white/5 max-h-32 overflow-y-auto">
                {sugeridos.map((c) => (
                  <button key={c.jid} type="button" className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5" onClick={() => { setF((x) => ({ ...x, nombre: c.nombre, telefono: c.telefono, jid: c.jid })); setSugeridos([]); }}>
                    {c.nombre} <span className="text-xs text-gray-500">· del bot · {c.telefono}</span>
                  </button>
                ))}
              </div>
            )}
            <label className="text-xs text-gray-500 block">Teléfono (para recordarle el pago por WhatsApp)
              <input className={entrada} value={f.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="Ej: 2241 497226" />
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">Monto ($) *
            <input className={entrada} type="number" min="0" step="0.01" autoFocus={!eligeCliente} value={f.monto} onChange={(e) => set('monto', e.target.value)} placeholder="0" />
          </label>
          <label className="text-xs text-gray-500">Fecha
            <input className={entrada} type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </label>
        </div>
        <label className="text-xs text-gray-500 block mt-3">Detalle
          <input className={entrada} maxLength={200} value={f.concepto} onChange={(e) => set('concepto', e.target.value)} placeholder={f.tipo === 'cargo' ? T.conceptoCargo : T.conceptoPago} />
        </label>

        {f.tipo === 'pago' && (<>
          <label className="text-xs text-gray-500 block mt-3">Método de pago
            <select className={entrada} value={f.metodo} onChange={(e) => set('metodo', e.target.value)}>{METODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 mt-3 cursor-pointer">
            <input type="checkbox" checked={f.enCaja} onChange={(e) => set('enCaja', e.target.checked)} /> {T.caja}
          </label>
        </>)}

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm flex items-center gap-1.5" disabled={guardando} onClick={guardar}>{guardando && <Loader2 size={14} className="animate-spin" />} Guardar</button>
        </div>
      </div>
    </div>
  );
}
