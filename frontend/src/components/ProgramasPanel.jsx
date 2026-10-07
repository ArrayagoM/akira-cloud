import { useState, useEffect, useCallback } from 'react';
import { Gift, Star, ChevronDown, Loader2, Save, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Programas OPCIONALES (apagados por defecto): fidelidad ("a la décima visita, una gratis") y reseñas
// después del servicio ("¿cómo te fue? del 1 al 5" → si fue bien, el enlace de Google).
function Interruptor({ activo, onClick, etiqueta, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={activo} aria-label={etiqueta}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50" style={{ background: activo ? '#00e87b' : 'rgba(255,255,255,0.15)' }}>
      <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: `translateX(${activo ? 24 : 4}px)` }} />
    </button>
  );
}
const campo = 'rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-[var(--accent)]/50';
const msg = (e, d) => e?.response?.data?.error || d;

export default function ProgramasPanel() {
  const [abierto, setAbierto] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [fid, setFid] = useState(null);
  const [res, setRes] = useState(null);
  const [ped, setPed] = useState(null);
  const [premios, setPremios] = useState([]);
  const [guardando, setGuardando] = useState('');

  const cargar = useCallback(async () => {
    try { const r = await api.get('/app/programas'); setCfg(r.data); setFid(r.data.fidelidad); setRes(r.data.resenas); setPed(r.data.pedidos); setPremios(r.data.premios || []); } catch { /* sin conexión local: no se muestra */ }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!cfg) return null;

  const guardar = async (cual, datos, ok) => {
    setGuardando(cual);
    try { const r = await api.put('/app/programas', { [cual]: datos }); setCfg((c) => ({ ...c, ...r.data })); setFid(r.data.fidelidad); setRes(r.data.resenas); setPed(r.data.pedidos); if (ok) toast.success(ok); cargar(); }
    catch (e) { toast.error(msg(e, 'No se pudo guardar')); } finally { setGuardando(''); }
  };
  const canjear = async (p) => {
    try { await api.post('/app/programas/canjear', { jid: p.jid }); toast.success(`Premio entregado a ${p.nombre || 'el cliente'}`); cargar(); }
    catch (e) { toast.error(msg(e, 'No se pudo anotar')); }
  };
  const algunoActivo = fid.activa || res.activa || ped?.activa;

  return (
    <div className="card">
      <button className="w-full flex items-center gap-3 text-left" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(249,168,212,0.1)' }}><Gift size={17} style={{ color: '#f9a8d4' }} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Programas con tus clientes</p>
          <p className="text-xs text-gray-500">Fidelidad (“a la décima visita, una gratis”), reseñas y pedidos por WhatsApp. {algunoActivo ? 'Hay programas activos.' : 'Opcionales, vienen apagados.'}</p>
        </div>
        {premios.length > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,232,123,0.12)', color: '#00e87b' }}>🎁 {premios.length} para entregar</span>}
        <ChevronDown size={16} className="text-gray-500 transition-transform shrink-0" style={{ transform: abierto ? 'rotate(180deg)' : 'none' }} />
      </button>

      {abierto && (
        <div className="mt-4 space-y-5 border-t border-white/10 pt-4">
          {/* Fidelidad */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-medium text-white flex items-center gap-1.5"><Gift size={14} /> Programa de fidelidad</p>
                <p className="text-xs text-gray-500">Se cuenta solo con los turnos a los que el cliente vino. El bot le cuenta cuántas visitas lleva si pregunta.</p></div>
              <Interruptor activo={fid.activa} etiqueta="Programa de fidelidad" disabled={guardando === 'fidelidad'} onClick={() => guardar('fidelidad', { activa: !fid.activa }, fid.activa ? 'Fidelidad desactivada' : 'Fidelidad activada')} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
              <span>Cada</span>
              <input type="number" min="2" max="100" value={fid.cada} onChange={(e) => setFid({ ...fid, cada: parseInt(e.target.value, 10) || '' })} className={`${campo} w-20`} aria-label="Cantidad de visitas" />
              <span>visitas, el cliente recibe</span>
              <input value={fid.premio} onChange={(e) => setFid({ ...fid, premio: e.target.value })} maxLength={80} className={`${campo} flex-1 min-w-[180px]`} aria-label="Premio" />
              <button className="btn-secondary text-xs flex items-center gap-1.5" disabled={guardando === 'fidelidad'} onClick={() => guardar('fidelidad', { cada: fid.cada, premio: fid.premio }, 'Guardado')}>{guardando === 'fidelidad' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar</button>
            </div>
            {cfg.fidelidad.activa && (premios.length === 0
              ? <p className="text-xs text-gray-500">Todavía nadie tiene un premio para entregar.</p>
              : <ul className="rounded-lg border border-white/10 divide-y divide-white/5">
                {premios.map((p) => (
                  <li key={p.jid} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-white truncate">🎁 {p.nombre || 'Cliente'}{p.premios > 1 ? ` · ${p.premios} premios` : ''}</span>
                    <button className="btn-secondary text-xs shrink-0" onClick={() => canjear(p)}>Ya se lo entregué</button>
                  </li>
                ))}
              </ul>)}
          </section>

          <div className="border-t border-white/10" />

          {/* Reseñas */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-medium text-white flex items-center gap-1.5"><Star size={14} /> Reseñas después del servicio</p>
                <p className="text-xs text-gray-500">Un día después le pregunta “¿cómo te fue? del 1 al 5”. Si fue bien (4 o 5) le pasa tu enlace de Google; si fue mal, te avisa a vos en privado y no le pide reseña pública.</p></div>
              <Interruptor activo={res.activa} etiqueta="Reseñas" disabled={guardando === 'resenas'} onClick={() => guardar('resenas', { activa: !res.activa }, res.activa ? 'Reseñas desactivadas' : 'Reseñas activadas')} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
              <input value={res.link} onChange={(e) => setRes({ ...res, link: e.target.value })} placeholder="Enlace para dejar reseñas en Google (https://…)" className={`${campo} flex-1 min-w-[240px]`} aria-label="Enlace de reseñas de Google" />
              <label className="flex items-center gap-1.5 text-xs">Preguntar a las
                <select value={res.horasDespues} onChange={(e) => setRes({ ...res, horasDespues: parseInt(e.target.value, 10) })} className={campo}>
                  {[[4, '4 h'], [12, '12 h'], [20, '20 h'], [24, '24 h'], [48, '48 h']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select> de terminado el turno</label>
              <button className="btn-secondary text-xs flex items-center gap-1.5" disabled={guardando === 'resenas'} onClick={() => guardar('resenas', { link: res.link, horasDespues: res.horasDespues }, 'Guardado')}>{guardando === 'resenas' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar</button>
            </div>
            <p className="text-[11px] text-gray-500">¿Cómo conseguís el enlace? En Google, buscá tu negocio → “Pedir reseñas” → copiá el enlace. Solo se pregunta de 9 a 21 h y a clientes que vinieron y no pidieron la baja.</p>
          </section>

          <div className="border-t border-white/10" />

          {/* Pedidos */}
          {ped && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium text-white flex items-center gap-1.5"><ShoppingBag size={14} /> Pedidos por WhatsApp</p>
                  <p className="text-xs text-gray-500">El cliente arma su pedido charlando con el bot: suma productos de tu Catálogo, ve el total y recibe el link de MercadoPago (o tu alias para transferir). Los precios y el stock salen siempre del Catálogo. Los ves en Pedidos.</p></div>
                <Interruptor activo={ped.activa} etiqueta="Pedidos por WhatsApp" disabled={guardando === 'pedidos'} onClick={() => guardar('pedidos', { activa: !ped.activa }, ped.activa ? 'Pedidos desactivados' : 'Pedidos activados')} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
                <label className="flex items-center gap-1.5 text-xs">Entrega
                  <select value={ped.entrega} onChange={(e) => setPed({ ...ped, entrega: e.target.value })} className={campo}>
                    <option value="ambos">Retiro y envío</option><option value="retiro">Solo retiro en el local</option><option value="envio">Solo envío</option>
                  </select></label>
                {ped.entrega !== 'retiro' && <label className="flex items-center gap-1.5 text-xs">Costo de envío $
                  <input type="number" min="0" value={ped.costoEnvio} onChange={(e) => setPed({ ...ped, costoEnvio: e.target.value === '' ? '' : Number(e.target.value) })} className={`${campo} w-28`} aria-label="Costo de envío" /></label>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={ped.nota} onChange={(e) => setPed({ ...ped, nota: e.target.value })} maxLength={200} placeholder="Nota para el cliente (ej: Entregamos de lunes a viernes)" className={`${campo} flex-1 min-w-[240px]`} aria-label="Nota para el cliente" />
                <button className="btn-secondary text-xs flex items-center gap-1.5" disabled={guardando === 'pedidos'} onClick={() => guardar('pedidos', { entrega: ped.entrega, costoEnvio: ped.costoEnvio === '' ? 0 : ped.costoEnvio, nota: ped.nota }, 'Guardado')}>{guardando === 'pedidos' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar</button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
