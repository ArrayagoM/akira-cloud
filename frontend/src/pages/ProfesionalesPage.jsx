import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { bajarArchivo, pesos } from '../utils/archivos';
import { UserSquare2, Plus, Pencil, Trash2, X, Check, Loader2, Download, ChevronDown } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Profesionales: quién atiende en tu negocio, cuánto cobra de comisión y la liquidación del período.
// Los turnos se asignan a un profesional desde la Agenda.
// ─────────────────────────────────────────────────────────────

const entrada = 'rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';
const DIAS = [['lunes', 'Lun'], ['martes', 'Mar'], ['miercoles', 'Mié'], ['jueves', 'Jue'], ['viernes', 'Vie'], ['sabado', 'Sáb'], ['domingo', 'Dom']];
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const primeroDelMes = () => `${hoyIso().slice(0, 7)}-01`;

function Formulario({ inicial, servicios, colores, sucursales = [], onCancelar, onGuardar, guardando }) {
  const [f, setF] = useState({ nombre: '', comisionPct: 40, color: colores[0], servicios: [], horario: {}, ...inicial });
  const editando = !!inicial?._id;
  const dia = (k) => f.horario?.[k] || { activo: false, inicio: '09:00', fin: '18:00' };
  const setDia = (k, v) => setF({ ...f, horario: { ...f.horario, [k]: { ...dia(k), ...v } } });
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold text-white">{editando ? `Editar a ${inicial.nombre}` : 'Nuevo profesional'}</p><button onClick={onCancelar} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={15} /></button></div>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-[11px] text-gray-400 sm:col-span-2">Nombre<input className={`${entrada} w-full mt-1`} value={f.nombre} maxLength={40} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Marta" /></label>
        <label className="text-[11px] text-gray-400">Comisión (%)<input className={`${entrada} w-full mt-1`} inputMode="decimal" value={f.comisionPct} onChange={(e) => setF({ ...f, comisionPct: e.target.value })} /></label>
      </div>
      {sucursales.length > 0 && <label className="text-[11px] text-gray-400 block">Sucursal donde atiende<select className={`${entrada} w-full mt-1`} value={f.sucursalId || ''} onChange={(e) => setF({ ...f, sucursalId: e.target.value })}><option value="">— cualquiera —</option>{sucursales.map((s) => <option key={s._id} value={s._id}>{s.nombre}</option>)}</select></label>}
      <div><p className="text-[11px] text-gray-400 mb-1">Color en la agenda</p><div className="flex gap-2">{colores.map((c) => <button key={c} onClick={() => setF({ ...f, color: c })} className="w-6 h-6 rounded-full border-2" style={{ background: c, borderColor: f.color === c ? '#fff' : 'transparent' }} aria-label={`Color ${c}`} />)}</div></div>
      {servicios.length > 0 && <div><p className="text-[11px] text-gray-400 mb-1">Servicios que hace</p><div className="flex flex-wrap gap-1.5">{servicios.map((s) => { const on = (f.servicios || []).includes(s); return <button key={s} onClick={() => setF({ ...f, servicios: on ? f.servicios.filter((x) => x !== s) : [...(f.servicios || []), s] })} className="text-xs px-2.5 py-1 rounded-full border" style={on ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{s}</button>; })}</div></div>}
      <div>
        <p className="text-[11px] text-gray-400 mb-1">Horario propio (opcional)</p>
        <div className="grid sm:grid-cols-2 gap-1.5">{DIAS.map(([k, t]) => { const d = dia(k); return (
          <div key={k} className="flex items-center gap-2 text-xs"><label className="flex items-center gap-1.5 w-14 text-gray-300"><input type="checkbox" checked={d.activo === true} onChange={(e) => setDia(k, { activo: e.target.checked })} />{t}</label>
            <input type="time" className={`${entrada} py-1 text-xs`} disabled={!d.activo} value={d.inicio} onChange={(e) => setDia(k, { inicio: e.target.value })} /><span className="text-gray-500">a</span><input type="time" className={`${entrada} py-1 text-xs`} disabled={!d.activo} value={d.fin} onChange={(e) => setDia(k, { fin: e.target.value })} /></div>); })}</div>
      </div>
      <div className="flex justify-end gap-2"><button className="btn-secondary text-xs" onClick={onCancelar}>Cancelar</button><button className="btn-primary text-xs flex items-center gap-1.5" disabled={guardando || !String(f.nombre).trim()} onClick={() => onGuardar(f)}>{guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar</button></div>
    </div>
  );
}

export default function ProfesionalesPage() {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [desde, setDesde] = useState(primeroDelMes()); const [hasta, setHasta] = useState(hoyIso());
  const [liq, setLiq] = useState(null);
  const [menu, setMenu] = useState(false);
  const [sucursales, setSucursales] = useState([]);
  useEffect(() => { api.get('/app/sucursales').then((r) => setSucursales((r.data.sucursales || []).filter((s) => s.activo))).catch(() => {}); }, []);

  const cargar = useCallback(() => api.get('/app/profesionales').then((r) => setD(r.data)).catch(() => toast.error('No se pudieron cargar los profesionales')), []);
  const cargarLiq = useCallback(() => api.get(`/app/profesionales/liquidacion?desde=${desde}&hasta=${hasta}`).then((r) => setLiq(r.data)).catch((e) => { setLiq(null); toast.error(e.response?.data?.error || 'No se pudo calcular'); }), [desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarLiq(); }, [cargarLiq]);

  const guardar = async (f) => {
    setGuardando(true);
    try {
      const body = { nombre: f.nombre, comisionPct: f.comisionPct, color: f.color, servicios: f.servicios, horario: f.horario, sucursalId: f.sucursalId || '' };
      if (f._id) await api.put(`/app/profesionales/${f._id}`, body); else await api.post('/app/profesionales', body);
      toast.success('Guardado'); setForm(null); cargar(); cargarLiq();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar'); } finally { setGuardando(false); }
  };
  const borrar = async (p) => {
    if (!window.confirm(`¿Quitar a ${p.nombre}? Si ya tiene turnos asignados queda desactivado para conservar su historial.`)) return;
    try { const r = await api.delete(`/app/profesionales/${p._id}`); toast.success(r.data.desactivado ? 'Desactivado (conserva su historial)' : 'Eliminado'); cargar(); cargarLiq(); } catch { toast.error('No se pudo quitar'); }
  };
  const reactivar = (p) => api.put(`/app/profesionales/${p._id}`, { activo: true }).then(() => { cargar(); cargarLiq(); }).catch(() => toast.error('No se pudo reactivar'));

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-4 animate-page-in">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]"><h1 className="text-2xl font-bold text-white flex items-center gap-2"><UserSquare2 size={22} className="text-[var(--accent)]" /> Profesionales</h1><p className="text-sm text-gray-500">Quién atiende, qué comisión se lleva y cuánto le corresponde cada mes. Los turnos se asignan desde la Agenda.</p></div>
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setForm({})}><Plus size={14} /> Nuevo profesional</button>
        </div>

        {form && d && <Formulario key={form._id || 'nuevo'} inicial={form} servicios={d.servicios} colores={d.colores} sucursales={sucursales} guardando={guardando} onCancelar={() => setForm(null)} onGuardar={guardar} />}

        {!d ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-500" /></div> : d.profesionales.length === 0 && !form ? (
          <div className="card text-center py-12"><UserSquare2 className="mx-auto text-gray-600 mb-3" size={34} /><p className="text-white font-medium">Todavía no cargaste profesionales</p><p className="text-sm text-gray-500 mt-1">Agregá a quienes atienden en tu negocio para llevar su agenda y calcular sus comisiones.</p></div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">{d.profesionales.map((p) => (
            <div key={p._id} className="card py-3 flex items-center gap-3" style={{ opacity: p.activo ? 1 : 0.55 }}>
              <span className="w-3 h-10 rounded-full flex-shrink-0" style={{ background: p.color }} />
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white truncate">{p.nombre}{!p.activo && <span className="text-[11px] text-gray-500 font-normal"> · desactivado</span>}</p><p className="text-[11px] text-gray-500 truncate">Comisión {p.comisionPct}%{p.servicios.length ? ` · ${p.servicios.join(', ')}` : ''}</p></div>
              {!p.activo && <button className="text-xs text-[var(--accent)]" onClick={() => reactivar(p)}>Reactivar</button>}
              <button className="p-1 text-gray-500 hover:text-white" aria-label="Editar" onClick={() => setForm(p)}><Pencil size={14} /></button>
              <button className="p-1 text-gray-500 hover:text-red-400" aria-label="Quitar" onClick={() => borrar(p)}><Trash2 size={14} /></button>
            </div>))}</div>
        )}

        <div className="card">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <p className="text-sm font-medium text-white flex-1">Liquidación de comisiones</p>
            <span className="text-xs text-gray-500">Del</span><input type="date" className={`${entrada} py-1 text-xs`} value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
            <span className="text-xs text-gray-500">al</span><input type="date" className={`${entrada} py-1 text-xs`} value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
            <div className="relative"><button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => setMenu((v) => !v)}><Download size={13} /> Exportar <ChevronDown size={11} /></button>
              {menu && <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-white/10 bg-[#0b1017] shadow-xl overflow-hidden" onMouseLeave={() => setMenu(false)}>{[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV']].map(([f, t]) => <button key={f} className="w-full text-left text-sm px-3 py-2 text-gray-300 hover:bg-white/5" onClick={() => { setMenu(false); bajarArchivo(`/app/profesionales/liquidacion/exportar?desde=${desde}&hasta=${hasta}&formato=${f}`, `comisiones.${f}`).catch(() => toast.error('No se pudo exportar')); }}>{t}</button>)}</div>}</div>
          </div>
          {!liq ? <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-500" /></div> : liq.profesionales.length === 0 && !liq.sinAsignar.turnos ? <p className="text-sm text-gray-500 text-center py-6">No hay turnos hechos en este período.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 text-left border-b border-white/10"><th className="py-2 font-medium">Profesional</th><th className="py-2 font-medium text-right">Turnos</th><th className="py-2 font-medium text-right">Facturado</th><th className="py-2 font-medium text-right">Comisión</th><th className="py-2 font-medium text-right">Para el local</th></tr></thead>
              <tbody>
                {liq.profesionales.map((p) => (<tr key={p.id} className="border-b border-white/5"><td className="py-2 text-white"><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: p.color }} />{p.nombre} <span className="text-xs text-gray-500">{p.comisionPct}%</span></td><td className="py-2 text-right text-gray-300">{p.turnos}</td><td className="py-2 text-right text-gray-300">{pesos(p.facturado)}</td><td className="py-2 text-right font-medium text-amber-300">{pesos(p.comision)}</td><td className="py-2 text-right text-emerald-300">{pesos(p.paraElLocal)}</td></tr>))}
                {liq.sinAsignar.turnos > 0 && <tr className="border-b border-white/5"><td className="py-2 text-gray-400">Sin asignar a un profesional</td><td className="py-2 text-right text-gray-400">{liq.sinAsignar.turnos}</td><td className="py-2 text-right text-gray-400">{pesos(liq.sinAsignar.facturado)}</td><td className="py-2 text-right text-gray-500">—</td><td className="py-2 text-right text-gray-400">{pesos(liq.sinAsignar.facturado)}</td></tr>}
                <tr><td className="py-2 font-semibold text-white">Total</td><td className="py-2 text-right text-white">{liq.totales.turnos}</td><td className="py-2 text-right text-white">{pesos(liq.totales.facturado)}</td><td className="py-2 text-right font-bold text-amber-300">{pesos(liq.totales.comision)}</td><td className="py-2 text-right font-bold text-emerald-300">{pesos(liq.totales.paraElLocal)}</td></tr>
              </tbody></table></div>
          )}
          <p className="text-[11px] text-gray-500 mt-3">Cuenta lo cobrado en los turnos que ya se hicieron (no los cancelados ni los que no vinieron). Cada turno usa la comisión que tenía el profesional cuando se lo asignaste.</p>
        </div>
      </div>
    </Layout>
  );
}
