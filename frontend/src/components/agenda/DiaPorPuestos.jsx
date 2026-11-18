import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { agruparPorPuesto, solapados, nombreDePuesto } from '../../lib/turnoManual';

// Vista del día cuando hay turnos en más de un puesto: una columna por puesto (en pantalla ancha) o secciones una debajo de otra (en el
// celular). Los turnos que se hacen a la vez con otro quedan marcados con un aviso de texto (no solo con color).
// `renderTurno(turno)` dibuja la tarjeta de cada turno (la misma de siempre).
export default function DiaPorPuestos({ eventos, renderTurno }) {
  const grupos = useMemo(() => agruparPorPuesto(eventos), [eventos]);
  const cruces = useMemo(() => solapados(eventos), [eventos]);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
      {grupos.map((g) => {
        const idTitulo = `puesto-${(g.puesto || 'general').replace(/\W+/g, '-')}`;
        return (
          <section key={g.puesto || 'general'} aria-labelledby={idTitulo} className="min-w-0">
            <h4 id={idTitulo} className="mb-2 flex items-center justify-between gap-2 border-b border-white/10 pb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-300">
              <span className="truncate">Puesto: {g.nombre}</span>
              <span className="shrink-0 font-normal normal-case text-gray-500">{g.turnos.length} {g.turnos.length === 1 ? 'turno' : 'turnos'}</span>
            </h4>
            <div className="space-y-2">
              {g.turnos.map((r, i) => {
                const con = cruces[r._id] || [];
                return (
                  <div key={r._id || i} className={con.length ? 'rounded-xl border-l-4 border-amber-400/70 pl-2' : ''}>
                    {con.length > 0 && (
                      <p className="mb-1 flex items-start gap-1.5 text-[11px] text-amber-300">
                        <Layers size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span>A la vez con {con.slice(0, 2).map((c) => `${c.titulo || c.nombre} (${nombreDePuesto(c.puesto)}, ${c.hora})`).join(' y ')}{con.length > 2 ? ` y ${con.length - 2} más` : ''}</span>
                      </p>
                    )}
                    {renderTurno(r)}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
