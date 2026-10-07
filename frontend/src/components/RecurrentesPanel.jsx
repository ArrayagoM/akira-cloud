import { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Plus, Trash2, Pencil, X, Loader2, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { pesos } from '../utils/archivos';

// Gastos fijos y vencimientos: el alquiler se anota solo cada mes en la Caja y te avisa unos días antes de cada vencimiento.
const METODOS = [['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['mercadopago', 'MercadoPago'], ['otro', 'Otro']];
const vacio = { descripcion: '', monto: '', dia: '', avisoDias: 3, registrar: true, categoria: 'Otros gastos', metodo: 'transferencia' };
const textoDias = (d) => (d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`);

export default function RecurrentesPanel({ alCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(null);
  const [f, setF] = useState(null);       // formulario (null = cerrado)
  const [editId, setEditId] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => api.get('/app/recurrentes').then((r) => setDatos(r.data)).catch(() => {}), []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const body = { ...f, monto: String(f.monto).replace(',', '.') };
      if (editId) await api.put(`/app/recurrentes/${editId}`, body); else await api.post('/app/recurrentes', body);
      await api.post('/app/recurrentes/revisar').catch(() => {});
      toast.success(editId ? 'Gasto fijo actualizado' : 'Gasto fijo creado');
      setF(null); setEditId(null); cargar(); alCambiar?.();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar'); } finally { setGuardando(false); }
  };
  const borrar = async (r) => {
    if (!window.confirm(`¿Dejar de repetir "${r.descripcion}"? Lo que ya se anotó en la Caja queda como está.`)) return;
    try { await api.delete(`/app/recurrentes/${r._id}`); cargar(); } catch (e) { toast.error(e.response?.data?.error || 'No se pudo borrar'); }
  };
  const alternar = async (r) => { try { await api.put(`/app/recurrentes/${r._id}`, { activo: !r.activo }); cargar(); } catch { toast.error('No se pudo cambiar'); } };

  const lista = datos?.recurrentes || [];
  const proximos = lista.filter((r) => r.activo && r.proximo.dias <= 7);
  const entrada = 'mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-[var(--accent)]/50';

  return (
    <div className="card">
      <button className="w-full flex items-center gap-2 text-left" onClick={() => setAbierto((v) => !v)}>
        <CalendarClock size={16} className="text-[var(--accent)]" />
        <span className="text-sm font-medium text-white flex-1">Gastos fijos y vencimientos</span>
        {proximos.length > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>{proximos.length} por vencer</span>}
        <span className="text-xs text-gray-500">{lista.length ? `${lista.length} cargado(s)` : 'Alquiler, internet, monotributo…'}</span>
        <ChevronDown size={14} className={`text-gray-500 transition ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">Cargá lo que pagás todos los meses: se anota solo en la Caja el día del vencimiento y, si querés, te aviso por WhatsApp unos días antes. También sirve solo como recordatorio (monotributo, impuestos).</p>
          {lista.map((r) => (
            <div key={r._id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2" style={{ opacity: r.activo ? 1 : 0.5 }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{r.descripcion} <span className="text-xs text-gray-500">· el {r.dia} de cada mes</span></p>
                <p className="text-[11px] text-gray-500">{r.monto > 0 ? pesos(r.monto) : 'Sin monto'} · {r.registrar ? 'se anota solo en la Caja' : 'solo recordatorio'}{r.avisoDias > 0 ? ` · aviso ${r.avisoDias} d antes` : ''} · próximo {textoDias(r.proximo.dias)}</p>
              </div>
              <label className="text-[11px] text-gray-500 flex items-center gap-1"><input type="checkbox" checked={r.activo} onChange={() => alternar(r)} /> Activo</label>
              <button className="p-1 text-gray-500 hover:text-white" aria-label="Editar" onClick={() => { setEditId(r._id); setF({ ...r }); }}><Pencil size={14} /></button>
              <button className="p-1 text-gray-500 hover:text-red-400" aria-label="Borrar" onClick={() => borrar(r)}><Trash2 size={14} /></button>
            </div>
          ))}

          {f ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold text-gray-300">{editId ? 'Editar' : 'Nuevo gasto fijo'}</p><button onClick={() => { setF(null); setEditId(null); }} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={14} /></button></div>
              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-2 text-[11px] text-gray-400">Nombre<input className={entrada} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="Ej: Alquiler" maxLength={80} /></label>
                <label className="text-[11px] text-gray-400">Día del mes<input className={entrada} type="number" min="1" max="31" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} placeholder="5" /></label>
                <label className="text-[11px] text-gray-400">Monto ($)<input className={entrada} inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} placeholder="150000" /></label>
                <label className="text-[11px] text-gray-400">Categoría<select className={entrada} value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{[...new Set([...(datos?.categorias || []), f.categoria])].map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="text-[11px] text-gray-400">Se paga con<select className={entrada} value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>{METODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="text-xs text-gray-300 flex items-center gap-1.5"><input type="checkbox" checked={f.registrar} onChange={(e) => setF({ ...f, registrar: e.target.checked })} /> Anotarlo solo en la Caja</label>
                <label className="text-xs text-gray-300 flex items-center gap-1.5">Avisarme <input className="w-14 rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs text-white" type="number" min="0" max="15" value={f.avisoDias} onChange={(e) => setF({ ...f, avisoDias: e.target.value })} /> días antes (0 = no avisar)</label>
              </div>
              <div className="flex justify-end gap-2"><button className="btn-secondary text-xs" onClick={() => { setF(null); setEditId(null); }}>Cancelar</button><button className="btn-primary text-xs flex items-center gap-1.5" disabled={guardando} onClick={guardar}>{guardando && <Loader2 size={12} className="animate-spin" />} Guardar</button></div>
            </div>
          ) : (
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => { setEditId(null); setF({ ...vacio }); }}><Plus size={13} /> Agregar gasto fijo</button>
          )}
        </div>
      )}
    </div>
  );
}
