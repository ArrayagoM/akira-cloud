import { useState, useEffect } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import api from '../services/api';

// Ingresos por suscripciones: lo que Mercado Pago cobró de verdad, por mes y por plan, más las suscripciones vigentes.
const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nombreMes = (m) => { const [a, mm] = m.split('-'); return `${MESES[Number(mm) - 1]} ${a.slice(2)}`; };
const fecha = (f) => new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const NOMBRE_PLAN = { basico: 'Básico', pro: 'Pro', agencia: 'Agencia' };

function Dato({ titulo, valor, nota }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-400">{titulo}</p>
      <p className="text-xl font-semibold text-white mt-1">{valor}</p>
      {nota && <p className="text-[11px] text-gray-500 mt-0.5">{nota}</p>}
    </div>
  );
}

export default function AdminIngresos() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/admin/ingresos').then((r) => { setD(r.data); setError(''); }).catch(() => setError('No se pudieron cargar los ingresos')); }, []);
  if (error) return <p className="text-sm text-amber-300">{error}</p>;
  if (!d) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-500" /></div>;
  const max = Math.max(1, ...d.porMes.map((x) => x.monto));
  const { ingresos: i, suscripciones: s } = d;
  const variacion = i.mesAnterior > 0 ? Math.round(((i.mesActual - i.mesAnterior) / i.mesAnterior) * 100) : null;
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-white flex items-center gap-2"><Wallet size={16} className="text-[var(--accent)]" /> Ingresos por suscripciones</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Dato titulo={`Este mes (${nombreMes(d.mesActual)})`} valor={pesos(i.mesActual)} nota={variacion === null ? 'Sin cobros el mes anterior' : `${variacion >= 0 ? '+' : ''}${variacion} % frente al mes anterior (${pesos(i.mesAnterior)})`} />
        <Dato titulo="Total cobrado" valor={pesos(i.acumulado)} nota={`${i.pagos} pago(s)${d.desde ? ` desde el ${fecha(d.desde)}` : ''}`} />
        <Dato titulo="Ingreso mensual recurrente" valor={pesos(s.mrr)} nota={`Proyección anual ${pesos(s.arr)}`} />
        <Dato titulo="Suscriptores activos" valor={s.activas.total} nota={`Básico ${s.activas.basico} · Pro ${s.activas.pro} · Agencia ${s.activas.agencia}`} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="card">
          <p className="text-sm text-white mb-2">Cobrado por mes</p>
          <div className="flex items-end gap-2 h-32">
            {d.porMes.map((x) => (
              <div key={x.mes} className="flex-1 flex flex-col items-center justify-end h-full" title={`${nombreMes(x.mes)}: ${pesos(x.monto)} (${x.pagos} pago/s)`}>
                <span className="text-[10px] text-gray-400 mb-1">{x.monto ? pesos(x.monto) : ''}</span>
                <div className="w-full rounded-t-sm" style={{ height: `${(x.monto / max) * 100}%`, minHeight: 3, background: '#34d399' }} />
                <span className="text-[10px] text-gray-500 mt-1">{nombreMes(x.mes)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <p className="text-sm text-white mb-2">Por plan</p>
          {d.porPlan.length === 0 ? <p className="text-xs text-gray-500">Todavía no hay cobros registrados.</p> : (
            <div className="space-y-1.5">{d.porPlan.map((x) => (
              <div key={`${x.plan}_${x.periodo}`} className="flex justify-between text-xs text-gray-300">
                <span>{x.nombre}</span><span>{x.pagos} pago(s) · {pesos(x.monto)}</span>
              </div>))}
            </div>
          )}
          <p className="text-[11px] text-gray-600 mt-2">Ticket promedio {pesos(i.ticketPromedio)}. El recurrente mensual toma cada plan anual dividido por 12.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="card">
          <p className="text-sm text-white mb-2">Últimos pagos</p>
          {d.ultimosPagos.length === 0 ? <p className="text-xs text-gray-500">Todavía no hay pagos. Se registran desde que se publicó esta pantalla.</p> : (
            <div className="space-y-1.5">{d.ultimosPagos.map((p, k) => (
              <div key={k} className="flex justify-between gap-2 text-xs text-gray-300">
                <span className="truncate">{fecha(p.fecha)} · {p.email || 'sin email'}</span>
                <span className="whitespace-nowrap">{NOMBRE_PLAN[p.plan] || p.plan} {p.periodo} · {pesos(p.monto)}</span>
              </div>))}
            </div>
          )}
        </div>
        <div className="card">
          <p className="text-sm text-white mb-2">Vencen en los próximos 7 días</p>
          {s.vencenEn7Dias.length === 0 ? <p className="text-xs text-gray-500">Ninguna suscripción pagada vence esta semana.</p> : (
            <div className="space-y-1.5">{s.vencenEn7Dias.map((u, k) => (
              <div key={k} className="flex justify-between gap-2 text-xs text-gray-300">
                <span className="truncate">{u.email}</span><span className="whitespace-nowrap">{NOMBRE_PLAN[u.plan] || u.plan} {u.periodo} · {fecha(u.expira)}</span>
              </div>))}
            </div>
          )}
          {s.activadasAMano > 0 && <p className="text-[11px] text-gray-600 mt-2">Además hay {s.activadasAMano} plan(es) activados a mano, sin pago registrado: no suman a los ingresos.</p>}
        </div>
      </div>
      <p className="text-[11px] text-gray-600">Los cobros se registran desde el momento en que se publicó esta pantalla; lo cobrado antes solo figura como líneas en los logs.</p>
    </div>
  );
}
