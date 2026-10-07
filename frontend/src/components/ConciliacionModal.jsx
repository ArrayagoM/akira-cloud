import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { pesos } from '../utils/archivos';

// Conciliación con MercadoPago: qué cobros entraron a tu cuenta y cuáles todavía no están en la Caja.
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fechaCorta = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const VIA = { turno: 'de un turno', pedido: 'de un pedido', caja: 'ya en la Caja', monto: 'coincide con un ingreso de la Caja' };

export default function ConciliacionModal({ mes, onClose, onCambio }) {
  const hoy = hoyLocal();
  const [desde, setDesde] = useState(`${mes}-01`);
  const [hasta, setHasta] = useState(mes === hoy.slice(0, 7) ? hoy : (() => { const [y, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; })());
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [verOk, setVerOk] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { setD((await api.get(`/app/conciliacion?desde=${desde}&hasta=${hasta}`, { timeout: 60000 })).data); }
    catch (e) { setD(null); setError(e.response?.data?.error || 'No se pudo consultar MercadoPago'); }
    finally { setCargando(false); }
  }, [desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  const registrar = async () => {
    setRegistrando(true);
    try { const r = await api.post('/app/conciliacion/registrar', { desde, hasta }, { timeout: 60000 }); toast.success(`${r.data.registrados} cobro(s) anotados en la Caja`); onCambio?.(); cargar(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo registrar'); } finally { setRegistrando(false); }
  };

  const entrada = 'rounded-lg bg-black/30 border border-white/10 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[var(--accent)]/50';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div><h3 className="text-lg font-semibold text-white">Conciliar con MercadoPago</h3><p className="text-xs text-gray-500">Compara lo que entró a tu cuenta con lo que tenés anotado. Solo lee tus cobros: no mueve plata.</p></div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-gray-400">
          Del <input type="date" className={entrada} value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /> al <input type="date" className={entrada} value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} />
          <button className="btn-secondary text-xs flex items-center gap-1" onClick={cargar} disabled={cargando}><RefreshCw size={12} className={cargando ? 'animate-spin' : ''} /> Actualizar</button>
        </div>

        {cargando && !d ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-500" /></div> : error ? (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', color: '#fcd34d' }}>{error}</div>
        ) : d && (<>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[['Cobros', d.totales.cobros, '#e5e7eb'], ['Cobrado', pesos(d.totales.bruto), '#34d399'], ['Comisión de MP', pesos(d.totales.comision), '#f87171'], ['Te quedó', pesos(d.totales.neto), '#38bdf8']].map(([t, v, c]) => (
              <div key={t} className="rounded-lg bg-white/[0.03] px-3 py-2"><p className="text-[11px] text-gray-500">{t}</p><p className="text-base font-bold" style={{ color: c }}>{v}</p></div>))}
          </div>

          {d.sinRegistrar.length === 0 && d.sinPago.length === 0 ? (
            <div className="rounded-lg p-3 text-sm flex items-center gap-2" style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399' }}><CheckCircle2 size={16} /> Todo cuadra: cada cobro de MercadoPago está anotado en tu Caja.</div>
          ) : null}

          {d.sinRegistrar.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5"><p className="text-sm font-medium text-amber-300 flex items-center gap-1.5"><AlertTriangle size={14} /> Entraron a MercadoPago y no están en tu Caja ({d.sinRegistrar.length} · {pesos(d.totales.sinRegistrarMonto)})</p>
                <button className="btn-primary text-xs flex items-center gap-1.5" disabled={registrando} onClick={registrar}>{registrando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Anotarlos todos en la Caja</button></div>
              <div className="space-y-1">{d.sinRegistrar.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2.5 py-1.5 text-xs"><span className="text-gray-500 w-10">{fechaCorta(p.fecha)}</span><span className="flex-1 truncate text-gray-200">{p.pagador || p.descripcion || `Cobro ${p.id}`}</span><span className="text-gray-500">{pesos(p.comision)} de comisión</span><span className="text-white font-medium w-24 text-right">{pesos(p.monto)}</span></div>))}</div>
            </div>
          )}

          {d.sinPago.length > 0 && (
            <div className="mb-3">
              <p className="text-sm font-medium text-sky-300 mb-1.5">Figuran como MercadoPago en tu Caja pero no aparecen en la cuenta ({d.sinPago.length})</p>
              <p className="text-[11px] text-gray-500 mb-1">Puede ser un error de carga (¿fue transferencia o efectivo?) o un cobro de otro período. Revisalos en la Caja.</p>
              <div className="space-y-1">{d.sinPago.map((m) => (
                <div key={m._id} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2.5 py-1.5 text-xs"><span className="text-gray-500 w-10">{fechaCorta(m.fecha)}</span><span className="flex-1 truncate text-gray-200">{m.descripcion}{m.cliente ? ` · ${m.cliente}` : ''}</span><span className="text-white font-medium w-24 text-right">{pesos(m.monto)}</span></div>))}</div>
            </div>
          )}

          {d.conciliados.length > 0 && (
            <div>
              <button className="text-xs text-gray-400 hover:text-white" onClick={() => setVerOk((v) => !v)}>{verOk ? 'Ocultar' : 'Ver'} los {d.conciliados.length} cobros que ya cuadran</button>
              {verOk && <div className="space-y-1 mt-1.5">{d.conciliados.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md bg-white/[0.02] px-2.5 py-1.5 text-xs"><CheckCircle2 size={12} className="text-emerald-400" /><span className="text-gray-500 w-10">{fechaCorta(p.fecha)}</span><span className="flex-1 truncate text-gray-300">{p.pagador || p.descripcion || `Cobro ${p.id}`} <span className="text-gray-600">· {VIA[p.via] || p.via}</span></span><span className="text-gray-200 w-24 text-right">{pesos(p.monto)}</span></div>))}</div>}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
