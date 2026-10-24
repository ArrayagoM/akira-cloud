import { useState, useEffect } from 'react';
import { Loader2, Download } from 'lucide-react';
import api from '../services/api';

// Descargas del instalador y el embudo: registrados → descargaron → instalaron e iniciaron sesión.
const fecha = (f) => new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const ORIGENES = { web: 'La web (página /descargar)', directo: 'Enlace directo, sin marca', email: 'Email', tiktok: 'TikTok' };
const nombreOrigen = (o) => ORIGENES[o] || o;

function Dato({ titulo, valor, nota }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-400">{titulo}</p>
      <p className="text-xl font-semibold text-white mt-1">{valor}</p>
      {nota && <p className="text-[11px] text-gray-500 mt-0.5">{nota}</p>}
    </div>
  );
}

export default function AdminDescargas() {
  const [dias, setDias] = useState(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setD(null); api.get(`/admin/descargas?dias=${dias}`).then((r) => { setD(r.data); setError(''); }).catch(() => setError('No se pudieron cargar las descargas')); }, [dias]);
  const max = d ? Math.max(1, ...d.porDia.map((x) => x.descargas)) : 1;
  const e = d?.embudo;
  const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '—');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-white flex items-center gap-2 flex-1"><Download size={16} className="text-[var(--accent)]" /> Descargas del programa</p>
        {[7, 30, 90].map((n) => <button key={n} onClick={() => setDias(n)} className="text-xs px-3 py-1 rounded-full border" style={dias === n ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{n} días</button>)}
      </div>
      {error ? <p className="text-sm text-amber-300">{error}</p> : !d ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-500" /></div> : (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Dato titulo={`Descargas (${d.dias} días)`} valor={d.total} nota={`${d.unicas} de personas distintas`} />
          <Dato titulo="Hoy" valor={d.hoy} />
          <Dato titulo="Desde que se cuenta" valor={d.historico} nota={d.primera ? `Primera: ${fecha(d.primera)}` : 'Todavía no hay descargas contadas'} />
          <Dato titulo="Windows" valor={d.porPlataforma.find((p) => p.plataforma === 'windows')?.total ?? 0} nota="el instalador principal" />
        </div>

        <div className="card">
          <p className="text-sm text-white mb-3">Del registro a la instalación</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-2xl font-semibold text-white">{e.usuarios}</p><p className="text-xs text-gray-400">cuentas registradas</p></div>
            <div><p className="text-2xl font-semibold text-white">{e.descargasWindows}</p><p className="text-xs text-gray-400">descargaron para Windows ({d.dias} días)</p><p className="text-[11px] text-gray-600">{pct(e.descargasWindows, e.usuarios)} de las cuentas</p></div>
            <div><p className="text-2xl font-semibold text-white">{e.usuariosConEquipo}</p><p className="text-xs text-gray-400">instalaron e iniciaron sesión</p><p className="text-[11px] text-gray-600">{pct(e.usuariosConEquipo, e.usuarios)} de las cuentas · {e.equipos} equipo(s)</p></div>
          </div>
          <p className="text-[11px] text-gray-600 mt-3">Una descarga no es una instalación: si el segundo número es alto y el tercero bajo, la gente se frena al instalar (por ejemplo, por el aviso de Windows) o al iniciar sesión. Las descargas solo se cuentan desde que se publicó esta pantalla.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="card">
            <p className="text-sm text-white mb-2">Descargas por día</p>
            <div className="flex items-end gap-px h-24">{d.porDia.map((x) => <div key={x.dia} className="flex-1 rounded-t-sm" title={`${x.dia}: ${x.descargas}`} style={{ height: `${(x.descargas / max) * 100}%`, minHeight: 2, background: x.descargas ? '#34d399' : 'rgba(255,255,255,0.08)' }} />)}</div>
          </div>
          <div className="card">
            <p className="text-sm text-white mb-2">Por plataforma</p>
            <div className="space-y-1.5">{d.porPlataforma.map((p) => (
              <div key={p.plataforma} className="flex justify-between text-xs text-gray-300"><span>{p.nombre}</span><span>{p.total} · {p.unicos} distinta(s)</span></div>))}
            </div>
            <p className="text-sm text-white mt-4 mb-2">De dónde vienen</p>
            {d.porOrigen.length === 0 ? <p className="text-xs text-gray-500">Sin datos.</p> : <div className="space-y-1.5">{d.porOrigen.map((o) => (
              <div key={o.origen} className="flex justify-between text-xs text-gray-300"><span>{nombreOrigen(o.origen)}</span><span>{o.total}</span></div>))}</div>}
            <p className="text-[11px] text-gray-600 mt-2">Para medir una campaña, agregale <span className="font-mono">?r=nombre</span> al enlace de descarga (por ejemplo <span className="font-mono">akiracloud.lat/api/desktop/download?r=tiktok</span>).</p>
          </div>
        </div>
      </>)}
    </div>
  );
}
