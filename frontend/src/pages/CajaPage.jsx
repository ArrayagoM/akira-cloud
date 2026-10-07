import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import ImportarAsistente from '../components/ImportarAsistente';
import MovimientoModal from '../components/MovimientoModal';
import api from '../services/api';
import toast from 'react-hot-toast';
import { bajarArchivo, pesos } from '../utils/archivos';
import {
  ChevronLeft, ChevronRight, Plus, Upload, Download, ChevronDown, Loader2, Pencil, Trash2,
  TrendingUp, TrendingDown, Wallet, Clock, Search, CalendarCheck,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Caja: ingresos y gastos del mes. Los turnos cobrados entran solos como ingresos;
// el resto se carga a mano, se importa de una planilla o sale de un comprobante
// de la bandeja de Documentos. Todo queda en esta PC.
// ─────────────────────────────────────────────────────────────

const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', tarjeta: 'Tarjeta', otro: 'Otro' };
const mesLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const moverMes = (mes, delta) => { const [y, m] = mes.split('-').map(Number); return mesLocal(new Date(y, m - 1 + delta, 1)); };
const nombreMes = (mes) => { const [y, m] = mes.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const fechaCorta = (f) => { const [, m, d] = f.split('-'); return `${d}/${m}`; };

function Tarjeta({ icono: I, titulo, valor, color, detalle }) {
  return (
    <div className="card py-3">
      <div className="flex items-center gap-2 text-xs text-gray-500"><I size={14} style={{ color }} />{titulo}</div>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{valor}</p>
      {detalle && <p className="text-[11px] text-gray-500 mt-0.5">{detalle}</p>}
    </div>
  );
}

function Barras({ titulo, datos, color, formato = (k) => k }) {
  const items = Object.entries(datos || {}).sort((a, b) => b[1] - a[1]);
  const max = items.length ? items[0][1] : 1;
  return (
    <div className="card">
      <p className="text-sm font-medium text-white mb-2">{titulo}</p>
      {items.length === 0 ? <p className="text-xs text-gray-500">Sin datos este mes.</p> : (
        <div className="space-y-2">
          {items.slice(0, 6).map(([k, v]) => (
            <div key={k}>
              <div className="flex justify-between text-xs text-gray-300"><span className="truncate pr-2">{formato(k)}</span><span>{pesos(v)}</span></div>
              <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (v / max) * 100)}%`, background: color }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CajaPage() {
  const [mes, setMes] = useState(mesLocal());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const [modal, setModal] = useState(null);       // { id?, inicial }
  const [importando, setImportando] = useState(false);
  const [menuExp, setMenuExp] = useState(false);

  const cargar = useCallback(async () => {
    try { setDatos((await api.get(`/caja?mes=${mes}`)).data); }
    catch { toast.error('No se pudo cargar la Caja'); }
    finally { setCargando(false); }
  }, [mes]);
  useEffect(() => { setCargando(true); cargar(); }, [cargar]);

  const borrar = async (m) => {
    if (!window.confirm(`¿Borrar este ${m.tipo}? (${pesos(m.monto)} · ${m.categoria})`)) return;
    try { await api.delete(`/caja/movimiento/${m._id}`); toast.success('Movimiento borrado'); cargar(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo borrar'); }
  };

  const visibles = useMemo(() => {
    if (!datos) return [];
    const q = buscar.trim().toLowerCase();
    return datos.movimientos.filter((m) => (filtro === 'todos' || (filtro === 'ingresos' && m.tipo === 'ingreso') || (filtro === 'gastos' && m.tipo === 'gasto'))
      && (!q || `${m.categoria} ${m.descripcion || ''} ${m.cliente || ''}`.toLowerCase().includes(q)));
  }, [datos, filtro, buscar]);

  const r = datos?.resumen;
  const maxDia = r ? Math.max(1, ...r.porDia.map((d) => Math.max(d.ingresos, d.gastos))) : 1;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-4 animate-page-in">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-2xl font-bold text-white">Caja</h1>
            <p className="text-sm text-gray-500">Lo que entra y lo que sale de tu negocio. Los turnos cobrados suman solos.</p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 px-1 py-1">
            <button className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
            <span className="text-sm text-white min-w-[130px] text-center">{nombreMes(mes)}</span>
            <button className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5" onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
          </div>
          {mes !== mesLocal() && <button className="text-xs text-[var(--accent)] hover:underline" onClick={() => setMes(mesLocal())}>Ir al mes actual</button>}
        </div>

        {cargando || !datos ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-500" /></div>
        ) : (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta icono={TrendingUp} titulo="Ingresos" valor={pesos(r.ingresos)} color="#34d399" />
            <Tarjeta icono={TrendingDown} titulo="Gastos" valor={pesos(r.gastos)} color="#f87171" />
            <Tarjeta icono={Wallet} titulo="Resultado del mes" valor={`${r.resultado < 0 ? '-' : ''}${pesos(Math.abs(r.resultado))}`} color={r.resultado >= 0 ? '#34d399' : '#f87171'} detalle={r.resultado >= 0 ? 'Ganancia' : 'Pérdida'} />
            <Tarjeta icono={Clock} titulo="Por cobrar" valor={pesos(datos.porCobrar.total)} color="#fbbf24" detalle={datos.porCobrar.cantidad ? `${datos.porCobrar.cantidad} turno(s) esperando el pago` : 'Nada pendiente'} />
          </div>

          {r.cantidad > 0 && (
            <div className="card">
              <p className="text-sm font-medium text-white mb-3">Día por día</p>
              <div className="flex items-end gap-[3px] h-24">
                {r.porDia.map((d) => (
                  <div key={d.fecha} className="flex-1 flex flex-col justify-end items-center gap-[1px] h-full group relative" title={`${fechaCorta(d.fecha)} · ingresos ${pesos(d.ingresos)} · gastos ${pesos(d.gastos)}`}>
                    <div className="w-full rounded-t-sm" style={{ height: `${(d.ingresos / maxDia) * 100}%`, background: '#34d399', minHeight: d.ingresos ? 2 : 0 }} />
                    <div className="w-full rounded-b-sm" style={{ height: `${(d.gastos / maxDia) * 100}%`, background: '#f87171', minHeight: d.gastos ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-1"><span>1</span><span>{r.porDia.length}</span></div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <Barras titulo="Ingresos por método de pago" datos={r.porMetodo} color="#34d399" formato={(k) => METODOS[k] || k} />
            <Barras titulo="Gastos por categoría" datos={r.categoriasGasto} color="#f87171" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setModal({ inicial: { tipo: 'ingreso' } })}><Plus size={14} /> Ingreso</button>
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setModal({ inicial: { tipo: 'gasto' } })}><Plus size={14} /> Gasto</button>
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setImportando(true)}><Upload size={14} /> Importar planilla</button>
            <div className="relative">
              <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setMenuExp((v) => !v)}><Download size={14} /> Exportar <ChevronDown size={12} /></button>
              {menuExp && (
                <div className="absolute z-20 mt-1 w-52 rounded-lg border border-white/10 bg-[#0b1017] shadow-xl overflow-hidden" onMouseLeave={() => setMenuExp(false)}>
                  {[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV (para Excel)'], ['pdf', 'PDF: resumen del mes']].map(([f, txt]) => (
                    <button key={f} className="w-full text-left text-sm px-3 py-2 text-gray-300 hover:bg-white/5" onClick={() => { setMenuExp(false); bajarArchivo(`/caja/exportar?mes=${mes}&formato=${f}`, `caja-${mes}.${f}`).catch(() => toast.error('No se pudo exportar')); }}>{txt}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {['todos', 'ingresos', 'gastos'].map((k) => (
                <button key={k} onClick={() => setFiltro(k)} className="text-xs px-3 py-1 rounded-full border capitalize"
                  style={filtro === k ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{k}</button>
              ))}
              <div className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar…" className="w-36 rounded-md bg-black/30 border border-white/10 pl-7 pr-2 py-1.5 text-xs text-white outline-none focus:border-[var(--accent)]/50" />
              </div>
            </div>
          </div>

          {datos.movimientos.length === 0 ? (
            <div className="card text-center py-12">
              <Wallet className="mx-auto text-gray-600 mb-3" size={34} />
              <p className="text-white font-medium">No hay movimientos en {nombreMes(mes)}</p>
              <p className="text-sm text-gray-500 mt-1">Los turnos cobrados aparecen solos. Cargá tus gastos a mano o importalos desde una planilla.</p>
            </div>
          ) : (
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-500 text-left border-b border-white/10">
                  <th className="px-3 py-2 font-medium w-16">Fecha</th><th className="px-3 py-2 font-medium">Detalle</th><th className="px-3 py-2 font-medium w-32">Método</th><th className="px-3 py-2 font-medium w-36 text-right">Monto</th><th className="w-20"></th>
                </tr></thead>
                <tbody>
                  {visibles.map((m) => {
                    const ing = m.tipo === 'ingreso'; const deTurno = m.origen === 'turno';
                    return (
                      <tr key={m._id} className="border-b border-white/5 last:border-0">
                        <td className="px-3 py-2 text-gray-400">{fechaCorta(m.fecha)}</td>
                        <td className="px-3 py-2">
                          <span className="text-white">{m.descripcion || m.categoria}</span>
                          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400">{m.categoria}</span>
                          {deTurno && <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full text-sky-300 bg-sky-500/10 inline-flex items-center gap-1"><CalendarCheck size={10} />Turno cobrado</span>}
                          {m.origen === 'documento' && <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full text-amber-300 bg-amber-500/10">Comprobante</span>}
                          {m.cliente && <span className="ml-2 text-xs text-gray-500">{m.cliente}</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{METODOS[m.metodo] || m.metodo}</td>
                        <td className="px-3 py-2 text-right font-medium" style={{ color: ing ? '#34d399' : '#f87171' }}>{ing ? '+' : '-'} {pesos(m.monto)}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          {!deTurno && (<>
                            <button className="p-1 text-gray-500 hover:text-white" aria-label="Editar" onClick={() => setModal({ id: m._id, inicial: m })}><Pencil size={14} /></button>
                            <button className="p-1 text-gray-500 hover:text-red-400" aria-label="Borrar" onClick={() => borrar(m)}><Trash2 size={14} /></button>
                          </>)}
                        </td>
                      </tr>
                    );
                  })}
                  {visibles.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500 text-sm">Nada coincide con el filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>)}
      </div>

      {modal && datos && <MovimientoModal id={modal.id} inicial={modal.inicial} categorias={datos.categorias} onClose={() => setModal(null)} onGuardado={cargar} />}
      {importando && <ImportarAsistente tipoInicial="movimientos" tipos={['movimientos']} onClose={() => setImportando(false)} onListo={cargar} />}
    </Layout>
  );
}
