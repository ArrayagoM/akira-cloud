import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { bajarArchivo, pesos } from '../utils/archivos';
import { Loader2, Download, ChevronDown, CalendarCheck, UserX, Users, Scissors, TrendingUp } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Reportes: qué se pide más, quiénes vienen más, a qué hora se llena, quién falta y cómo viene mes a mes.
// Se calcula en esta PC con tus turnos y tu Caja.
// ─────────────────────────────────────────────────────────────

const PERIODOS = [['mes', 'Este mes'], ['3m', '3 meses'], ['6m', '6 meses'], ['12m', '12 meses']];
const nombreMes = (mes) => { const [y, m] = mes.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' }); return `${t.charAt(0).toUpperCase()}${t.slice(1)} ${String(y).slice(2)}`; };
const fechaCorta = (f) => (f ? f.split('-').reverse().join('/') : '');

function Kpi({ icono: I, titulo, valor, color = '#34d399', detalle }) {
  return (
    <div className="card py-3">
      <div className="flex items-center gap-2 text-xs text-gray-500"><I size={14} style={{ color }} />{titulo}</div>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{valor}</p>
      {detalle && <p className="text-[11px] text-gray-500 mt-0.5">{detalle}</p>}
    </div>
  );
}

function Vacio({ children }) { return <p className="text-xs text-gray-500 py-4 text-center">{children}</p>; }

export default function ReportesPage() {
  const [periodo, setPeriodo] = useState('mes');
  const [r, setR] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [menuExp, setMenuExp] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setR((await api.get(`/app/reportes?periodo=${periodo}`)).data); }
    catch { toast.error('No se pudieron cargar los reportes'); }
    finally { setCargando(false); }
  }, [periodo]);
  useEffect(() => { cargar(); }, [cargar]);

  const maxServ = r ? Math.max(1, ...r.servicios.map((s) => s.cantidad)) : 1;
  const maxEvo = r ? Math.max(1, ...r.evolucion.map((e) => Math.max(e.ingresos, e.gastos))) : 1;
  const maxCelda = r ? Math.max(1, ...r.horasPico.matriz.flat()) : 1;
  const hayDatos = r && r.resumen.turnos > 0;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-4 animate-page-in">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-2xl font-bold text-white">Reportes</h1>
            <p className="text-sm text-gray-500">Cómo viene tu negocio: qué se pide más, quién viene, a qué hora se llena y cuánto entra cada mes.</p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 p-1">
            {PERIODOS.map(([k, t]) => (
              <button key={k} onClick={() => setPeriodo(k)} className="text-xs px-3 py-1 rounded-full"
                style={periodo === k ? { color: 'var(--accent)', background: 'rgba(0,232,123,0.1)' } : { color: '#9ca3af' }}>{t}</button>
            ))}
          </div>
          <div className="relative">
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setMenuExp((v) => !v)}><Download size={14} /> Exportar <ChevronDown size={12} /></button>
            {menuExp && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-white/10 bg-[#0b1017] shadow-xl overflow-hidden" onMouseLeave={() => setMenuExp(false)}>
                {[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV (para Excel)']].map(([f, t]) => (
                  <button key={f} className="w-full text-left text-sm px-3 py-2 text-gray-300 hover:bg-white/5" onClick={() => { setMenuExp(false); bajarArchivo(`/app/reportes/exportar?periodo=${periodo}&formato=${f}`, `reportes.${f}`).catch(() => toast.error('No se pudo exportar')); }}>{t}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {cargando || !r ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-500" /></div> : (<>
          <p className="text-xs text-gray-500">Del {fechaCorta(r.desde)} al {fechaCorta(r.hasta)}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icono={CalendarCheck} titulo="Turnos" valor={r.resumen.turnos} detalle={r.resumen.cancelados ? `${r.resumen.cancelados} cancelado(s)` : 'Ninguno cancelado'} />
            <Kpi icono={Users} titulo="Clientes distintos" valor={r.resumen.clientesDistintos} color="#38bdf8" detalle={`${r.resumen.atendidos} atendidos`} />
            <Kpi icono={UserX} titulo="Ausencias" valor={`${r.ausencias.porcentaje}%`} color={r.ausencias.cantidad ? '#fbbf24' : '#34d399'} detalle={r.ausencias.cantidad ? `${r.ausencias.cantidad} no vinieron · ${pesos(r.ausencias.perdido)}` : 'Nadie faltó'} />
            <Kpi icono={Scissors} titulo="Lo más pedido" valor={r.servicios[0]?.nombre || '—'} color="#a78bfa" detalle={r.servicios[0] ? `${r.servicios[0].cantidad} veces` : 'Sin turnos'} />
          </div>

          <div className="card">
            <p className="text-sm font-medium text-white mb-3 flex items-center gap-2"><TrendingUp size={15} className="text-[var(--accent)]" /> Mes a mes</p>
            <div className="flex items-end gap-2 h-36">
              {r.evolucion.map((e) => (
                <div key={e.mes} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${nombreMes(e.mes)} · ingresos ${pesos(e.ingresos)} · gastos ${pesos(e.gastos)} · ${e.turnos} turnos`}>
                  <div className="flex items-end gap-[3px] h-28 w-full justify-center">
                    <div className="w-1/3 max-w-[18px] rounded-t-sm" style={{ height: `${(e.ingresos / maxEvo) * 100}%`, background: '#34d399', minHeight: e.ingresos ? 3 : 0 }} />
                    <div className="w-1/3 max-w-[18px] rounded-t-sm" style={{ height: `${(e.gastos / maxEvo) * 100}%`, background: '#f87171', minHeight: e.gastos ? 3 : 0 }} />
                  </div>
                  <span className="text-[10px] text-gray-500 truncate">{nombreMes(e.mes)}</span>
                  <span className="text-[10px]" style={{ color: e.resultado >= 0 ? '#34d399' : '#f87171' }}>{e.resultado < 0 ? '-' : ''}{pesos(Math.abs(e.resultado))}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-[11px] text-gray-500 mt-2"><span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#34d399' }} />Ingresos</span><span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#f87171' }} />Gastos</span><span>Debajo de cada mes: el resultado</span></div>
          </div>

          {!hayDatos ? (
            <div className="card text-center py-10"><CalendarCheck className="mx-auto text-gray-600 mb-2" size={30} /><p className="text-white font-medium">Todavía no hay turnos en este período</p><p className="text-sm text-gray-500 mt-1">Cuando el bot agende turnos vas a ver acá qué se pide más y a qué hora.</p></div>
          ) : (<>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="card">
                <p className="text-sm font-medium text-white mb-2">Servicios más pedidos</p>
                <div className="space-y-2">
                  {r.servicios.map((s) => (
                    <div key={s.nombre}>
                      <div className="flex justify-between text-xs text-gray-300"><span className="truncate pr-2">{s.nombre}</span><span>{s.cantidad} · {pesos(s.ingresos)}</span></div>
                      <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (s.cantidad / maxServ) * 100)}%`, background: '#a78bfa' }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <p className="text-sm font-medium text-white mb-2">Clientes que más vienen</p>
                {r.clientes.length === 0 ? <Vacio>Todavía no hay visitas completadas.</Vacio> : (
                  <table className="w-full text-xs">
                    <thead><tr className="text-gray-500 text-left"><th className="font-medium pb-1">Cliente</th><th className="font-medium pb-1 text-right">Visitas</th><th className="font-medium pb-1 text-right">Gastó</th></tr></thead>
                    <tbody>{r.clientes.map((c) => (<tr key={`${c.telefono}${c.nombre}`} className="border-t border-white/5"><td className="py-1.5 text-gray-200 truncate max-w-[160px]">{c.nombre}</td><td className="py-1.5 text-right text-white">{c.visitas}</td><td className="py-1.5 text-right text-gray-300">{pesos(c.gastado)}</td></tr>))}</tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="card overflow-x-auto">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-medium text-white">Horas pico</p>
                {r.horasPico.horas.length > 0 && <p className="text-xs text-gray-400">Lo más pedido: {r.horasPico.horas.map((h) => `${h.hora} hs (${h.cantidad})`).join(' · ')}{r.horasPico.diaTop ? ` · día fuerte: ${r.horasPico.diaTop.dia}` : ''}</p>}
              </div>
              <table className="text-[10px] text-gray-500 border-separate" style={{ borderSpacing: 2 }}>
                <thead><tr><th></th>{r.horasPico.matriz[0].map((_, h) => <th key={h} className="font-normal w-7 text-center">{r.horasPico.horaMin + h}</th>)}</tr></thead>
                <tbody>
                  {r.horasPico.dias7.map((d, i) => (
                    <tr key={d}><td className="pr-2 text-right text-gray-400">{d.slice(0, 3)}</td>
                      {r.horasPico.matriz[i].map((n, h) => (
                        <td key={h} className="w-7 h-6 rounded text-center text-[10px]" title={`${d} ${r.horasPico.horaMin + h} hs: ${n} turno(s)`}
                          style={{ background: n ? `rgba(0,232,123,${0.12 + 0.75 * (n / maxCelda)})` : 'rgba(255,255,255,0.03)', color: n ? '#fff' : 'transparent' }}>{n || ''}</td>
                      ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>

            {r.ausencias.cantidad > 0 && (
              <div className="card">
                <p className="text-sm font-medium text-white mb-1">Quién falta sin avisar</p>
                <p className="text-xs text-gray-500 mb-2">{r.ausencias.cantidad} turno(s) sin venir ({r.ausencias.porcentaje}% de los turnos que ya pasaron). Los marcás con “No vino” en la ficha del cliente; a quien falta seguido el bot le pide seña.</p>
                <div className="flex flex-wrap gap-2">{r.ausencias.clientes.map((c) => <span key={`${c.telefono}${c.nombre}`} className="text-xs rounded-full px-3 py-1" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>{c.nombre} · {c.faltas} {c.faltas === 1 ? 'falta' : 'faltas'}</span>)}</div>
              </div>
            )}
          </>)}
        </>)}
      </div>
    </Layout>
  );
}
