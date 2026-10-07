import { useState, useEffect } from 'react';
import { X, Loader2, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { pesos } from '../utils/archivos';

// Cierre de caja: el sistema calcula el efectivo que debería haber en el cajón; vos contás y anotás cuánto hay.
const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', tarjeta: 'Tarjeta', otro: 'Otro' };
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function CierreCajaModal({ onClose, onCerrado }) {
  const [d, setD] = useState(null);
  const [contado, setContado] = useState('');
  const [nota, setNota] = useState('');
  const [inicial, setInicial] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { api.get('/app/cierres').then((r) => { setD(r.data); if (r.data.cerrado) { setContado(String(r.data.cierre.contado)); setNota(r.data.nota || ''); } }).catch(() => toast.error('No se pudo cargar el cierre')); }, []);

  const c = d?.cierre;
  const num = Number(String(contado).replace(',', '.'));
  const hayNum = contado !== '' && Number.isFinite(num) && num >= 0;
  const esperado = c ? (inicial !== '' && Number.isFinite(Number(inicial)) ? c.esperado - c.inicial + Number(inicial) : c.esperado) : 0;
  const dif = hayNum ? Math.round((num - esperado) * 100) / 100 : null;

  const cerrar = async () => {
    setGuardando(true);
    try {
      const r = await api.post('/app/cierres', { fecha: d.fecha, contado, nota, ...(inicial !== '' ? { inicial } : {}) });
      if (r.data.cierre.estado === 'falta' || r.data.cierre.estado === 'sobra') toast(r.data.mensaje, { icon: '⚠️', duration: 6000 }); else toast.success(r.data.mensaje || 'Caja cerrada', { duration: 5000 });
      onCerrado?.(); onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo cerrar la caja'); } finally { setGuardando(false); }
  };

  const entrada = 'mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Lock size={16} className="text-[var(--accent)]" /> Cierre de caja</h3>
            {d && <p className="text-xs text-gray-500 first-letter:uppercase">{fechaLarga(d.fecha)}{d.cerrado ? ' · ya cerrada (podés corregirla)' : ''}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        {!d ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-500" /></div> : (<>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-400"><span>Fondo con el que arrancó el día</span><span>{pesos(c.inicial)}</span></div>
            <div className="flex justify-between text-gray-400"><span>+ Cobrado en efectivo</span><span className="text-emerald-300">{pesos(c.efectivoIngresos)}</span></div>
            <div className="flex justify-between text-gray-400"><span>− Gastos en efectivo</span><span className="text-red-300">{pesos(c.efectivoGastos)}</span></div>
            <div className="flex justify-between text-white font-semibold border-t border-white/10 pt-1.5 mt-1"><span>En el cajón debería haber</span><span>{pesos(esperado)}</span></div>
          </div>
          {Object.keys(c.porMetodo).some((k) => k !== 'efectivo') && (
            <p className="text-[11px] text-gray-500 mt-2">Cobrado hoy por otros medios (no va al cajón): {Object.entries(c.porMetodo).filter(([k]) => k !== 'efectivo').map(([k, v]) => `${METODOS[k] || k} ${pesos(v)}`).join(' · ')}.</p>
          )}

          <label className="block text-xs text-gray-400 mt-3">Contá el efectivo y anotá cuánto hay ($)
            <input className={entrada} inputMode="decimal" autoFocus value={contado} onChange={(e) => setContado(e.target.value)} placeholder="0" />
          </label>
          {dif !== null && (
            <div className="mt-2 rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={Math.abs(dif) < 0.005 ? { background: 'rgba(52,211,153,0.1)', color: '#34d399' } : { background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
              {Math.abs(dif) < 0.005 ? <><CheckCircle2 size={15} /> La caja cierra justa</> : dif > 0 ? <><AlertTriangle size={15} /> Sobran {pesos(dif)}</> : <><AlertTriangle size={15} /> Faltan {pesos(-dif)}</>}
            </div>
          )}
          <label className="block text-xs text-gray-400 mt-3">Nota (opcional)
            <input className={entrada} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Ej: se dio vuelto de más" />
          </label>
          <details className="mt-2 text-xs text-gray-500"><summary className="cursor-pointer hover:text-gray-300">El fondo inicial no es correcto</summary>
            <label className="block mt-1.5">Fondo con el que arrancó el día ($)<input className={entrada} inputMode="decimal" value={inicial} onChange={(e) => setInicial(e.target.value)} placeholder={String(c.inicial)} /></label>
          </details>

          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-secondary text-sm" onClick={onClose}>Cancelar</button>
            <button className="btn-primary text-sm flex items-center gap-1.5" disabled={!hayNum || guardando} onClick={cerrar}>{guardando ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} {d.cerrado ? 'Guardar corrección' : 'Cerrar la caja'}</button>
          </div>

          {d.recientes.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-xs text-gray-500 mb-1.5">Últimos cierres</p>
              <div className="space-y-1">{d.recientes.slice(0, 5).map((x) => (
                <div key={x.fecha} className="flex items-center gap-2 text-xs"><span className="text-gray-500 w-12">{x.fecha.slice(8)}/{x.fecha.slice(5, 7)}</span><span className="flex-1 text-gray-400 truncate">{x.nota}</span>
                  <span style={{ color: Math.abs(x.diferencia) < 0.005 ? '#34d399' : '#fbbf24' }}>{Math.abs(x.diferencia) < 0.005 ? 'justa' : x.diferencia > 0 ? `+${pesos(x.diferencia)}` : `-${pesos(-x.diferencia)}`}</span></div>
              ))}</div>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
