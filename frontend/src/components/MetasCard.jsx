import { useState, useEffect, useCallback } from 'react';
import { Target, Pencil, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { pesos } from '../utils/archivos';

// Metas del mes: cuánto querés facturar y/o cuántos turnos querés tener, con barra de avance y proyección al ritmo actual.
function Barra({ titulo, a, formato }) {
  if (!a) return null;
  const pct = Math.min(100, a.porcentaje);
  const color = a.cumplida ? '#34d399' : a.proyeccion != null && a.proyeccion >= a.meta ? '#34d399' : '#fbbf24';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-300"><span>{titulo}</span><span>{formato(a.logrado)} de {formato(a.meta)} · {a.porcentaje}%</span></div>
      <div className="h-2 rounded-full bg-white/10 mt-1 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} /></div>
      <p className="text-[11px] text-gray-500 mt-1">
        {a.cumplida ? '🎉 ¡Meta cumplida!' : a.diasRestantes > 0 ? `Faltan ${formato(a.falta)}${a.porDiaNecesario ? ` (${formato(Math.ceil(a.porDiaNecesario))} por día)` : ''}.` : `Faltaron ${formato(a.falta)}.`}
        {!a.cumplida && a.proyeccion != null && ` A este ritmo cerrás el mes en ${formato(Math.round(a.proyeccion))}.`}
      </p>
    </div>
  );
}

export default function MetasCard({ alCambiar }) {
  const [d, setD] = useState(null);
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ ingresos: '', turnos: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => api.get('/app/metas').then((r) => { setD(r.data); setF({ ingresos: r.data.metas.ingresos || '', turnos: r.data.metas.turnos || '' }); }).catch(() => {}), []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    setGuardando(true);
    try { const r = await api.put('/app/metas', { ingresos: f.ingresos === '' ? 0 : f.ingresos, turnos: f.turnos === '' ? 0 : f.turnos }); setD(r.data); setEditando(false); toast.success('Metas guardadas'); alCambiar?.(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudieron guardar'); } finally { setGuardando(false); }
  };

  if (!d) return null;
  const hay = d.progreso.ingresos || d.progreso.turnos;
  const entrada = 'rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-[var(--accent)]/50 w-full';
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-white flex items-center gap-2"><Target size={15} className="text-[var(--accent)]" /> Meta del mes</p>
        {!editando && <button className="text-xs text-gray-400 hover:text-white flex items-center gap-1" onClick={() => setEditando(true)}><Pencil size={12} /> {hay ? 'Cambiar' : 'Poner una meta'}</button>}
      </div>
      {editando ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-gray-400">Quiero facturar ($)<input className={entrada} inputMode="decimal" value={f.ingresos} onChange={(e) => setF({ ...f, ingresos: e.target.value })} placeholder="Ej: 800000" /></label>
            <label className="text-[11px] text-gray-400">Quiero tener (turnos)<input className={entrada} inputMode="numeric" value={f.turnos} onChange={(e) => setF({ ...f, turnos: e.target.value })} placeholder="Ej: 60" /></label>
          </div>
          <p className="text-[11px] text-gray-500">Dejá un campo vacío para no usar esa meta. Se aplica todos los meses hasta que la cambies.</p>
          <div className="flex gap-2 justify-end"><button className="btn-secondary text-xs" onClick={() => setEditando(false)}>Cancelar</button><button className="btn-primary text-xs flex items-center gap-1.5" disabled={guardando} onClick={guardar}>{guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar</button></div>
        </div>
      ) : hay ? (
        <div className="space-y-3"><Barra titulo="Facturación" a={d.progreso.ingresos} formato={(n) => pesos(n)} /><Barra titulo="Turnos" a={d.progreso.turnos} formato={(n) => `${n}`} /></div>
      ) : <p className="text-xs text-gray-500">Ponete un objetivo (por ejemplo, cuánto querés facturar) y mirá cómo vas día a día.</p>}
    </div>
  );
}
