import { useState, useEffect } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import api from '../services/api';

// Uso de la app de escritorio por pantalla (solo de quienes activaron las estadísticas): qué se usa mucho y qué no usa nadie.
const NOMBRES = { dashboard: 'Dashboard', agenda: 'Agenda', clientes: 'Clientes', chats: 'Chats', vender: 'Vender', catalogo: 'Catálogo', pedidos: 'Pedidos', caja: 'Caja', reportes: 'Reportes', comprobantes: 'Presupuestos y recibos', sucursales: 'Sucursales', profesionales: 'Profesionales', deudores: 'Deudores', proveedores: 'Proveedores', documentos: 'Documentos', conocimiento: 'Conocimiento', analisis: 'Qué preguntan', equipo: 'Equipo', integraciones: 'Integraciones', respaldo: 'Respaldo', config: 'Config', planes: 'Planes' };

export default function AdminUso() {
  const [dias, setDias] = useState(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setD(null); api.get(`/admin/uso?dias=${dias}`).then((r) => { setD(r.data); setError(''); }).catch(() => setError('No se pudo cargar el uso')); }, [dias]);
  const max = d ? Math.max(1, ...d.pantallas.map((p) => p.usuarios)) : 1;
  const maxDia = d ? Math.max(1, ...d.activosPorDia.map((x) => x.usuarios)) : 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-white flex items-center gap-2 flex-1"><BarChart3 size={16} className="text-[var(--accent)]" /> Uso de la app por pantalla</p>
        {[7, 30, 90].map((n) => <button key={n} onClick={() => setDias(n)} className="text-xs px-3 py-1 rounded-full border" style={dias === n ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{n} días</button>)}
      </div>
      {error ? <p className="text-sm text-amber-300">{error}</p> : !d ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-500" /></div> : (<>
        <p className="text-xs text-gray-500">Solo cuentan los usuarios que activaron las estadísticas en la app ({d.usuarios} en este período, de {d.equiposActivos} equipos activos). Son contadores de pantallas: nada de datos de sus clientes.</p>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="card"><p className="text-sm text-white mb-2">Pantallas más usadas</p>
            {d.pantallas.length === 0 ? <p className="text-xs text-gray-500">Todavía no hay datos.</p> : <div className="space-y-2">{d.pantallas.map((p) => (
              <div key={p.pantalla}><div className="flex justify-between text-xs text-gray-300"><span>{NOMBRES[p.pantalla] || p.pantalla}</span><span>{p.usuarios} usuario(s) · {p.aperturas} aperturas</span></div><div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (p.usuarios / max) * 100)}%`, background: '#34d399' }} /></div></div>))}</div>}
          </div>
          <div className="space-y-3">
            <div className="card"><p className="text-sm text-white mb-2">Usuarios activos por día</p>
              {d.activosPorDia.length === 0 ? <p className="text-xs text-gray-500">Sin datos.</p> : <div className="flex items-end gap-1 h-24">{d.activosPorDia.map((x) => <div key={x.dia} className="flex-1 rounded-t-sm" title={`${x.dia}: ${x.usuarios}`} style={{ height: `${(x.usuarios / maxDia) * 100}%`, minHeight: 3, background: '#38bdf8' }} />)}</div>}
            </div>
            <div className="card"><p className="text-sm text-white mb-1">Nadie las usó en este período</p>
              <p className="text-xs text-gray-400">{d.sinUso.length ? d.sinUso.map((k) => NOMBRES[k] || k).join(', ') : 'Todas las pantallas se usaron.'}</p>
              <p className="text-[11px] text-gray-600 mt-1">Candidatas a mejorar, explicar mejor o simplificar.</p></div>
            <div className="card"><p className="text-sm text-white mb-1">Versiones instaladas</p>
              <div className="flex flex-wrap gap-1.5">{Object.entries(d.versiones).sort((a, b) => b[1] - a[1]).map(([v, n]) => <span key={v} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-300">{v} · {n}</span>)}</div></div>
          </div>
        </div>
      </>)}
    </div>
  );
}
