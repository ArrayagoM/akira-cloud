import { useEffect, useState } from 'react';
import { Laptop } from 'lucide-react';
import api from '../services/api';
import { equiposDeRespuesta, tiempoRelativo, fechaLarga, etiquetaCanal, etiquetaEstadoBot, textoErrorLicencia } from '../lib/equiposAdmin';

// Sección "Equipos" del detalle de un usuario en el panel admin. SOLO LECTURA: no hay acciones.
// Si el endpoint no existe todavía (backend sin publicar → 404) o falla, no se muestra ningún error: se avisa que el dato no está disponible.
export default function AdminEquipos({ userId }) {
  const [equipos, setEquipos] = useState(undefined); // undefined = cargando, null = no disponible, [] = sin equipos

  useEffect(() => {
    let vivo = true;
    setEquipos(undefined);
    api.get(`/admin/users/${userId}/devices`)
      .then((r) => { if (vivo) setEquipos(equiposDeRespuesta(r.data)); })
      .catch(() => { if (vivo) setEquipos(null); });
    return () => { vivo = false; };
  }, [userId]);

  const ahora = Date.now();
  return (
    <div className="space-y-2 border-t pt-4 mb-5" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs font-medium uppercase flex items-center gap-1" style={{ color: 'var(--text2)' }}><Laptop size={11} /> Equipos</p>
      {equipos === undefined && <p className="text-xs" style={{ color: 'var(--text2)' }}>Cargando…</p>}
      {equipos === null && <p className="text-xs" style={{ color: 'var(--text2)' }}>Dato no disponible todavía.</p>}
      {Array.isArray(equipos) && equipos.length === 0 && <p className="text-xs" style={{ color: 'var(--text2)' }}>Este usuario no activó ningún equipo.</p>}
      {Array.isArray(equipos) && equipos.map((d, i) => {
        const err = textoErrorLicencia(d.ultimoErrorLicencia, ahora);
        return (
          <div key={d.id || i} className="rounded-lg p-3 text-xs space-y-1" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-white truncate">{d.nombre || 'PC sin nombre'}</span>
              <span className="flex-shrink-0 font-medium" style={{ color: d.revocado ? '#f87171' : 'var(--text2)' }}>{d.revocado ? 'Revocado' : 'Activo'}</span>
            </div>
            <Fila k="Versión" v={d.version ? `v${String(d.version).replace(/^v/i, '')}` : 'Sin dato'} />
            <Fila k="Canal" v={etiquetaCanal(d.canal)} />
            <Fila k="Último latido" v={`${tiempoRelativo(d.ultimoHeartbeat, ahora)} (${fechaLarga(d.ultimoHeartbeat)})`} />
            <Fila k="Bot" v={etiquetaEstadoBot(d.estadoBot)} />
            <Fila k="Activado" v={fechaLarga(d.activadoEn)} />
            <Fila k="Último error de licencia" v={err || 'Ninguno'} vc={err ? '#fbbf24' : undefined} />
          </div>
        );
      })}
    </div>
  );
}

function Fila({ k, v, vc }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="flex-shrink-0" style={{ color: 'var(--text2)' }}>{k}</span>
      <span className="text-right break-words min-w-0" style={{ color: vc || 'var(--text)' }}>{v}</span>
    </div>
  );
}
