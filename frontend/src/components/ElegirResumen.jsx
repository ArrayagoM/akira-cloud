import { useEffect, useState } from 'react';
import { SlidersHorizontal, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { alternarGrupo, resumenDeEleccion } from '../lib/resumenVer';

// "Elegir qué ver": cada usuario decide cuáles números del resumen del negocio se le muestran (web, celular y .apk).
// Solo cambia lo que se MUESTRA: lo que la PC envía se maneja desde la app de la PC. Se guarda al tocar cada opción.
export default function ElegirResumen({ alCambiar }) {
  const [datos, setDatos] = useState(null); // { grupos, disponibles }
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get('/auth/resumen-ver').then((r) => { if (vivo) setDatos(r.data); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  if (!datos) return null;

  const tocar = async (id) => {
    if (guardando) return;
    const nuevos = alternarGrupo(datos.grupos, id, datos.disponibles);
    if (nuevos === null) { toast('Tiene que verse al menos un dato.'); return; }
    const antes = datos;
    setDatos({ ...datos, grupos: nuevos }); setGuardando(true);
    try {
      const r = await api.put('/auth/resumen-ver', { grupos: nuevos });
      setDatos(r.data); if (alCambiar) alCambiar();
    } catch (e) {
      setDatos(antes); toast.error(e.response?.data?.error || 'No se pudo guardar tu elección');
    } finally { setGuardando(false); }
  };

  return (
    <div className="mb-3">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}
        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-white/10" style={{ color: 'var(--text2, #9aa8b8)' }}>
        <SlidersHorizontal size={13} /> Elegir qué ver · {resumenDeEleccion(datos.grupos, datos.disponibles)}
      </button>
      {abierto && (
        <div className="rounded-lg border border-white/10 p-2.5 mt-2" role="group" aria-label="Datos del resumen que querés ver">
          {datos.disponibles.map((d) => {
            const on = datos.grupos.includes(d.id);
            return (
              <button key={d.id} type="button" onClick={() => tocar(d.id)} aria-pressed={on} disabled={guardando}
                className="flex items-center gap-2.5 w-full text-left text-sm py-1.5 disabled:opacity-60" style={{ color: 'var(--text, #e5e7eb)' }}>
                <span className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0" style={{ borderColor: on ? '#00e87b' : 'rgba(255,255,255,0.25)', background: on ? '#00e87b' : 'transparent' }}>
                  {on && <Check size={13} color="#000" strokeWidth={3} />}
                </span>
                {d.etiqueta}
              </button>
            );
          })}
          <p className="text-[11px] mt-2" style={{ color: 'var(--muted, #6b7280)' }}>Es solo lo que ves vos. Lo que tu PC comparte se maneja desde la app de la PC.</p>
        </div>
      )}
    </div>
  );
}
