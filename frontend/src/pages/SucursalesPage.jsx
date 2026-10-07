import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { pesos } from '../utils/archivos';
import { Store, Plus, Pencil, Trash2, X, Check, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Sucursales: separá la plata y los turnos por local. En la Caja elegís la sucursal para ver solo lo suyo; cada profesional puede
// pertenecer a un local y sus turnos cuentan para esa sucursal.
// ─────────────────────────────────────────────────────────────

const entrada = 'rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';
const mesLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const moverMes = (mes, n) => { const [y, m] = mes.split('-').map(Number); return mesLocal(new Date(y, m - 1 + n, 1)); };
const nombreMes = (mes) => { const [y, m] = mes.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };

export default function SucursalesPage() {
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mes, setMes] = useState(mesLocal());
  const [res, setRes] = useState(null);

  const cargar = useCallback(() => api.get('/app/sucursales').then((r) => setLista(r.data.sucursales)).catch(() => toast.error('No se pudieron cargar las sucursales')), []);
  const cargarRes = useCallback(() => api.get(`/app/sucursales/resumen?mes=${mes}`).then((r) => setRes(r.data)).catch(() => setRes(null)), [mes]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarRes(); }, [cargarRes, lista]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const body = { nombre: form.nombre, direccion: form.direccion, telefono: form.telefono };
      if (form._id) await api.put(`/app/sucursales/${form._id}`, body); else await api.post('/app/sucursales', body);
      toast.success('Guardado'); setForm(null); cargar();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar'); } finally { setGuardando(false); }
  };
  const borrar = async (s) => {
    if (!window.confirm(`¿Quitar la sucursal ${s.nombre}? Si ya tiene movimientos o turnos queda desactivada para conservar su historial.`)) return;
    try { const r = await api.delete(`/app/sucursales/${s._id}`); toast.success(r.data.desactivada ? 'Desactivada (conserva su historial)' : 'Eliminada'); cargar(); } catch { toast.error('No se pudo quitar'); }
  };
  const reactivar = (s) => api.put(`/app/sucursales/${s._id}`, { activo: true }).then(cargar).catch(() => toast.error('No se pudo reactivar'));

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-4 animate-page-in">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]"><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Store size={22} className="text-[var(--accent)]" /> Sucursales</h1><p className="text-sm text-gray-500">Si tenés más de un local, separá la plata y los turnos de cada uno.</p></div>
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setForm({ nombre: '', direccion: '', telefono: '' })}><Plus size={14} /> Nueva sucursal</button>
        </div>

        {form && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-white">{form._id ? `Editar ${form.nombre}` : 'Nueva sucursal'}</p><button onClick={() => setForm(null)} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={15} /></button></div>
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="text-[11px] text-gray-400">Nombre<input className={`${entrada} w-full mt-1`} value={form.nombre} maxLength={40} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Centro" /></label>
              <label className="text-[11px] text-gray-400">Dirección<input className={`${entrada} w-full mt-1`} value={form.direccion || ''} maxLength={120} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></label>
              <label className="text-[11px] text-gray-400">Teléfono<input className={`${entrada} w-full mt-1`} value={form.telefono || ''} maxLength={20} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
            </div>
            <div className="flex justify-end gap-2"><button className="btn-secondary text-xs" onClick={() => setForm(null)}>Cancelar</button><button className="btn-primary text-xs flex items-center gap-1.5" disabled={guardando || !form.nombre.trim()} onClick={guardar}>{guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar</button></div>
          </div>
        )}

        {!lista ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-500" /></div> : lista.length === 0 && !form ? (
          <div className="card text-center py-12"><Store className="mx-auto text-gray-600 mb-3" size={34} /><p className="text-white font-medium">Todavía no cargaste sucursales</p><p className="text-sm text-gray-500 mt-1">Si tu negocio tiene un solo local, no hace falta. Si tiene más, agregá cada uno para ver cuánto mueve por separado.</p></div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">{lista.map((s) => (
            <div key={s._id} className="card py-3 flex items-center gap-3" style={{ opacity: s.activo ? 1 : 0.55 }}>
              <Store size={18} className="text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white truncate">{s.nombre}{!s.activo && <span className="text-[11px] text-gray-500 font-normal"> · desactivada</span>}</p><p className="text-[11px] text-gray-500 truncate">{s.direccion || 'Sin dirección'}{s.telefono ? ` · ${s.telefono}` : ''}</p></div>
              {!s.activo && <button className="text-xs text-[var(--accent)]" onClick={() => reactivar(s)}>Reactivar</button>}
              <button className="p-1 text-gray-500 hover:text-white" aria-label="Editar" onClick={() => setForm(s)}><Pencil size={14} /></button>
              <button className="p-1 text-gray-500 hover:text-red-400" aria-label="Quitar" onClick={() => borrar(s)}><Trash2 size={14} /></button>
            </div>))}</div>
        )}

        {lista && lista.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-3"><p className="text-sm font-medium text-white flex-1">Cómo le fue a cada sucursal</p>
              <div className="flex items-center gap-1 rounded-full border border-white/10 px-1 py-1"><button className="p-1 rounded-full text-gray-400 hover:text-white" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior"><ChevronLeft size={14} /></button><span className="text-xs text-white min-w-[110px] text-center">{nombreMes(mes)}</span><button className="p-1 rounded-full text-gray-400 hover:text-white" onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente"><ChevronRight size={14} /></button></div></div>
            {!res ? <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-500" /></div> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-500 text-left border-b border-white/10"><th className="py-2 font-medium">Sucursal</th><th className="py-2 font-medium text-right">Turnos</th><th className="py-2 font-medium text-right">Ingresos</th><th className="py-2 font-medium text-right">Gastos</th><th className="py-2 font-medium text-right">Resultado</th></tr></thead>
                <tbody>{res.sucursales.map((s) => (<tr key={s.id || 'sin'} className="border-b border-white/5"><td className="py-2 text-white">{s.nombre}{!s.activo && <span className="text-[11px] text-gray-500"> · desactivada</span>}</td><td className="py-2 text-right text-gray-300">{s.turnos}</td><td className="py-2 text-right text-emerald-300">{pesos(s.ingresos)}</td><td className="py-2 text-right text-red-300">{pesos(s.gastos)}</td><td className="py-2 text-right font-medium" style={{ color: s.resultado >= 0 ? '#34d399' : '#f87171' }}>{s.resultado < 0 ? '-' : ''}{pesos(Math.abs(s.resultado))}</td></tr>))}
                  <tr><td className="py-2 font-semibold text-white">Total</td><td className="py-2 text-right text-white">{res.totales.turnos}</td><td className="py-2 text-right text-white">{pesos(res.totales.ingresos)}</td><td className="py-2 text-right text-white">{pesos(res.totales.gastos)}</td><td className="py-2 text-right font-bold text-white">{pesos(res.totales.ingresos - res.totales.gastos)}</td></tr></tbody></table></div>
            )}
            <p className="text-[11px] text-gray-500 mt-3">Los ingresos y gastos van a la sucursal que elegís al cargarlos en la Caja o al vender. Los turnos cuentan para la sucursal del profesional que los atiende.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
