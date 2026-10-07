import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import CuentaMovimientoModal from '../components/CuentaMovimientoModal';
import api from '../services/api';
import toast from 'react-hot-toast';
import { bajarArchivo, pesos } from '../utils/archivos';
import { HandCoins, Plus, Download, ChevronDown, Search, Loader2, X, Send, Trash2, MessageCircle, Clock, Users } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Deudores: quién te debe y cuánto. Cada venta fiada suma deuda; cada pago a cuenta
// la baja (y entra a la Caja). El recordatorio por WhatsApp se envía SOLO cuando
// lo confirmás vos, y no se puede repetir seguido sin que lo decidas.
// ─────────────────────────────────────────────────────────────

const fechaAR = (f) => (f ? f.split('-').reverse().join('/') : '—');

function ChipAtraso({ dias }) {
  const estilo = dias > 30 ? { c: '#f87171', t: `${dias} días` } : dias > 7 ? { c: '#fbbf24', t: `${dias} días` } : { c: '#9ca3af', t: dias === 0 ? 'al día' : `${dias} días` };
  return <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ color: estilo.c, background: `${estilo.c}1a` }}>{estilo.t}</span>;
}

function Recordatorio({ clave, nombre, mensajeInicial, onClose, onEnviado }) {
  const [texto, setTexto] = useState(mensajeInicial);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (forzar = false) => {
    setEnviando(true);
    try {
      await api.post('/deudores/recordar', { clave, texto, forzar });
      toast.success('Recordatorio enviado por WhatsApp');
      onEnviado(); onClose();
    } catch (e) {
      if (e.response?.data?.requiereConfirmar && window.confirm(`${e.response.data.error}`)) { await enviar(true); return; }
      toast.error(e.response?.data?.error || 'No se pudo enviar');
    } finally { setEnviando(false); }
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-2">
          <div><h3 className="text-lg font-semibold text-white">Recordatorio de pago</h3><p className="text-xs text-gray-500">Para {nombre} · se envía por tu WhatsApp</p></div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} maxLength={1000}
          className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
        <p className="text-[11px] text-gray-500 mt-1">Revisalo y editalo si querés. No se envía nada hasta que toques "Enviar".</p>
        <div className="flex justify-end gap-2 mt-3">
          <button className="btn-secondary text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm flex items-center gap-1.5" disabled={enviando || !texto.trim()} onClick={() => enviar(false)}>
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar por WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

function Detalle({ clave, onClose, onCambio }) {
  const [d, setD] = useState(null);
  const [modal, setModal] = useState(null);
  const [recordar, setRecordar] = useState(false);
  const cargar = useCallback(() => api.get(`/deudores/detalle?clave=${encodeURIComponent(clave)}`).then((r) => setD(r.data)).catch(() => { toast.error('No se pudo abrir el cliente'); onClose(); }), [clave, onClose]);
  useEffect(() => { cargar(); }, [cargar]);

  const borrar = async (m) => {
    if (!window.confirm(`¿Borrar este ${m.tipo === 'cargo' ? 'cargo' : 'pago'} de ${pesos(m.monto)}?${m.cajaId ? ' También se saca de la Caja.' : ''}`)) return;
    try { await api.delete(`/deudores/movimiento/${m._id}`); toast.success('Movimiento borrado'); await cargar(); onCambio(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo borrar'); }
  };
  if (!d) return <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}><Loader2 className="animate-spin text-gray-400" /></div>;
  const c = d.cliente;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{c.nombre}</h3>
            <p className="text-xs text-gray-500">{c.telefono || 'Sin teléfono'}{c.ultimoRecordatorio ? ` · último recordatorio: ${fechaAR(c.ultimoRecordatorio)}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-3 gap-2 my-4 text-center">
          <div className="rounded-lg border border-white/10 py-2"><p className="text-[11px] text-gray-500">Debe</p><p className="text-xl font-bold" style={{ color: c.saldo > 0 ? '#f87171' : '#34d399' }}>{c.saldo < 0 ? `-${pesos(-c.saldo)}` : pesos(c.saldo)}</p>{c.saldo < 0 && <p className="text-[10px] text-emerald-400">saldo a favor</p>}</div>
          <div className="rounded-lg border border-white/10 py-2"><p className="text-[11px] text-gray-500">Total fiado</p><p className="text-lg font-semibold text-white">{pesos(c.cargos)}</p></div>
          <div className="rounded-lg border border-white/10 py-2"><p className="text-[11px] text-gray-500">Total pagado</p><p className="text-lg font-semibold text-white">{pesos(c.pagos)}</p></div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setModal('pago')}><Plus size={14} /> Registrar pago</button>
          <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setModal('cargo')}><Plus size={14} /> Sumar deuda</button>
          {c.saldo > 0 && (
            <button className="btn-secondary text-sm flex items-center gap-1.5 ml-auto" disabled={!c.whatsapp} title={c.whatsapp ? '' : 'Este cliente no tiene teléfono'} onClick={() => setRecordar(true)}>
              <MessageCircle size={14} /> Recordar por WhatsApp
            </button>
          )}
        </div>
        {!c.whatsapp && c.saldo > 0 && <p className="text-[11px] text-amber-300 mb-2">Para poder recordarle el pago por WhatsApp hace falta su teléfono: cargalo en la próxima deuda o pago.</p>}

        <p className="text-sm font-medium text-white mb-1">Historial</p>
        <div className="rounded-lg border border-white/10 divide-y divide-white/5">
          {d.movimientos.map((m) => (
            <div key={m._id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="text-xs text-gray-500 w-20">{fechaAR(m.fecha)}</span>
              <span className="flex-1 text-gray-200 truncate">{m.concepto}{m.tipo === 'pago' && m.metodo ? <span className="text-xs text-gray-500"> · {m.metodo}</span> : null}</span>
              <span className="font-medium" style={{ color: m.tipo === 'cargo' ? '#fbbf24' : '#34d399' }}>{m.tipo === 'cargo' ? '+' : '−'} {pesos(m.monto)}</span>
              <button className="text-gray-600 hover:text-red-400" aria-label="Borrar" onClick={() => borrar(m)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {modal && <CuentaMovimientoModal entidad="cliente" clave={clave} tipoInicial={modal} nombreFijo={c.nombre} onClose={() => setModal(null)} onGuardado={() => { cargar(); onCambio(); }} />}
      {recordar && <Recordatorio clave={clave} nombre={c.nombre} mensajeInicial={d.mensaje} onClose={() => setRecordar(false)} onEnviado={() => { cargar(); onCambio(); }} />}
    </div>
  );
}

export default function DeudoresPage() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [nueva, setNueva] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [menuExp, setMenuExp] = useState(false);

  const cargar = useCallback(async () => {
    try { setDatos((await api.get('/deudores')).data); } catch { toast.error('No se pudo cargar la lista'); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (datos?.deudores || []).filter((d) => !q || `${d.nombre} ${d.telefono}`.toLowerCase().includes(q));
  }, [datos, buscar]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-4 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Deudores</h1>
          <p className="text-sm text-gray-500">Quién te debe y cuánto. Los pagos que registres suman a la Caja.</p>
        </div>

        {cargando || !datos ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div> : (<>
          <div className="grid grid-cols-3 gap-3">
            <div className="card py-3"><div className="flex items-center gap-2 text-xs text-gray-500"><HandCoins size={14} className="text-amber-400" />Total a cobrar</div><p className="text-2xl font-bold text-amber-400 mt-1">{pesos(datos.total)}</p></div>
            <div className="card py-3"><div className="flex items-center gap-2 text-xs text-gray-500"><Users size={14} />Clientes con deuda</div><p className="text-2xl font-bold text-white mt-1">{datos.cantidad}</p></div>
            <div className="card py-3"><div className="flex items-center gap-2 text-xs text-gray-500"><Clock size={14} />Mayor atraso</div><p className="text-2xl font-bold mt-1" style={{ color: datos.mayorAtraso > 30 ? '#f87171' : '#e5e7eb' }}>{datos.mayorAtraso} <span className="text-sm font-normal text-gray-500">días</span></p></div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setNueva(true)}><Plus size={14} /> Nueva deuda</button>
            <div className="relative">
              <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setMenuExp((v) => !v)}><Download size={14} /> Exportar <ChevronDown size={12} /></button>
              {menuExp && (
                <div className="absolute z-20 mt-1 w-48 rounded-lg border border-white/10 bg-[#0b1017] shadow-xl overflow-hidden" onMouseLeave={() => setMenuExp(false)}>
                  {[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV (para Excel)'], ['pdf', 'PDF: quién me debe']].map(([f, txt]) => (
                    <button key={f} className="w-full text-left text-sm px-3 py-2 text-gray-300 hover:bg-white/5" onClick={() => { setMenuExp(false); bajarArchivo(`/deudores/exportar?formato=${f}`, `deudores.${f}`).catch(() => toast.error('No se pudo exportar')); }}>{txt}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative ml-auto"><Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar cliente…" className="w-48 rounded-md bg-black/30 border border-white/10 pl-7 pr-2 py-1.5 text-sm text-white outline-none focus:border-[var(--accent)]/50" /></div>
          </div>

          {datos.deudores.length === 0 ? (
            <div className="card text-center py-14">
              <HandCoins className="mx-auto text-gray-600 mb-3" size={36} />
              <p className="text-white font-medium">Nadie te debe plata</p>
              <p className="text-sm text-gray-500 mt-1">Cuando le fíes algo a un cliente, cargalo acá y llevás la cuenta sin planillas.</p>
              <button className="btn-primary text-sm mt-4" onClick={() => setNueva(true)}>Cargar una deuda</button>
            </div>
          ) : (
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-500 text-left border-b border-white/10"><th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium text-right">Debe</th><th className="px-3 py-2 font-medium">Atraso</th><th className="px-3 py-2 font-medium">Último movimiento</th><th className="px-3 py-2 font-medium">Recordatorio</th></tr></thead>
                <tbody>
                  {visibles.map((d) => (
                    <tr key={d.clave} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer" onClick={() => setAbierto(d.clave)}>
                      <td className="px-3 py-2"><span className="text-white">{d.nombre}</span><span className="block text-xs text-gray-500">{d.telefono || 'sin teléfono'}</span></td>
                      <td className="px-3 py-2 text-right font-semibold text-amber-400">{pesos(d.saldo)}</td>
                      <td className="px-3 py-2"><ChipAtraso dias={d.antiguedadDias} /></td>
                      <td className="px-3 py-2 text-gray-400">{fechaAR(d.ultimoMovimiento)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{d.ultimoRecordatorio ? `Enviado ${fechaAR(d.ultimoRecordatorio)}` : d.whatsapp ? 'Sin enviar' : 'Sin teléfono'}</td>
                    </tr>
                  ))}
                  {visibles.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Ningún cliente coincide con la búsqueda.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {datos.conSaldoAFavor > 0 && <p className="text-xs text-gray-500">{datos.conSaldoAFavor} cliente(s) tienen saldo a favor (pagaron de más). No suman como deuda.</p>}
        </>)}
      </div>

      {nueva && <CuentaMovimientoModal entidad="cliente" tipoInicial="cargo" onClose={() => setNueva(false)} onGuardado={cargar} />}
      {abierto && <Detalle clave={abierto} onClose={() => setAbierto(null)} onCambio={cargar} />}
    </Layout>
  );
}
