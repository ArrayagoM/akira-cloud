import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, X, ArrowRight, Rocket } from 'lucide-react';
import api from '../services/api';
import PlantillasRubro from './PlantillasRubro';
import { CLAVE_OCULTO, CLAVE_PROBADO, estaOculta, datosDeConfig, armarPasos, resumenPasos } from '../lib/primerosPasos';

// Guía ÚNICA de primeros pasos (antes había dos a la vez: OnboardingChecklist y esta). En la app de escritorio se tilda sola según lo
// que ya está configurado de verdad: clave de IA, datos del negocio, WhatsApp vinculado, una prueba y el celular de avisos. En la web
// (navegador) el bot no corre: el primer paso es instalar Akira en la PC, con el enlace de descarga. Se puede ocultar y no vuelve a
// molestar; también se respeta la ocultación guardada por la guía anterior (ver lib/primerosPasos.js).
const ESCRITORIO = !!import.meta.env.VITE_DESKTOP;
const leer = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const guardar = (k) => { try { localStorage.setItem(k, '1'); } catch { /* sin almacenamiento: se muestra igual */ } };

export default function PrimerosPasos({ botConectado }) {
  const [oculto, setOculto] = useState(() => estaOculta(leer));
  const [probado, setProbado] = useState(() => leer(CLAVE_PROBADO));
  const [datos, setDatos] = useState(null);
  const [plantillas, setPlantillas] = useState(false);

  const cargar = useCallback(async () => {
    const [c] = await Promise.allSettled([api.get('/config')]);
    setDatos(datosDeConfig(c.status === 'fulfilled' ? c.value.data : null));
  }, []);
  useEffect(() => { if (ESCRITORIO && !oculto) cargar(); }, [oculto, cargar]);

  if (oculto || (ESCRITORIO && !datos)) return null;

  const pasos = armarPasos({ escritorio: ESCRITORIO, datos: datos || {}, botConectado, probado });
  const { hechos, total, completo, proximo } = resumenPasos(pasos);
  const ocultar = () => { guardar(CLAVE_OCULTO); setOculto(true); };

  return (
    <section className="card animate-fade-up" aria-label="Primeros pasos" style={{ border: '1px solid rgba(0,232,123,0.25)', background: 'rgba(0,232,123,0.03)' }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,232,123,0.12)' }}><Rocket size={18} style={{ color: '#00e87b' }} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{completo ? 'Listo: tu Akira está lista para trabajar' : 'Primeros pasos'}</p>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>
            {completo
              ? 'Completaste todos los pasos. Podés ocultar esta guía.'
              : `${hechos} de ${total} pasos hechos.${ESCRITORIO ? ' Se tildan solos a medida que los configurás.' : ''}`}
          </p>
          <div className="h-1.5 rounded-full mt-2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechos} aria-label="Avance de los primeros pasos" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${(hechos / total) * 100}%`, background: '#00e87b' }} />
          </div>
        </div>
        <button onClick={ocultar} className="shrink-0 p-1 rounded" style={{ color: 'var(--muted)' }} aria-label="Ocultar los primeros pasos" title="Ocultar"><X size={16} /></button>
      </div>

      <ol className="mt-3 space-y-1.5">
        {pasos.map((p) => {
          const esProximo = !completo && proximo && p.id === proximo.id;
          // El estado se dice con palabras y forma de ícono, no solo con color.
          const estado = p.hecho ? 'Hecho' : esProximo ? 'Siguiente' : p.opcional ? 'Opcional' : 'Pendiente';
          return (
            <li key={p.id} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2" style={{ background: esProximo ? 'rgba(0,232,123,0.08)' : 'transparent' }}>
              {p.hecho
                ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" style={{ color: '#00e87b' }} aria-hidden="true" />
                : <Circle size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={p.hecho ? { color: 'var(--text2)', textDecoration: 'line-through' } : { color: '#fff', fontWeight: 500 }}>
                  {p.titulo}
                  <span className="ml-2 text-[11px] font-normal" style={{ color: p.hecho ? '#00e87b' : esProximo ? '#fff' : 'var(--text2)', textDecoration: 'none', display: 'inline-block' }}>({estado})</span>
                </p>
                {!p.hecho && p.detalle && <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{p.detalle}</p>}
              </div>
              {!p.hecho && p.extra === 'plantilla' && <button className="btn-secondary text-xs shrink-0" onClick={() => setPlantillas(true)}>Usar plantilla</button>}
              {!p.hecho && p.ir && <Link to={p.ir} className="btn-secondary text-xs flex items-center gap-1 shrink-0">{p.cta} <ArrowRight size={12} /></Link>}
              {!p.hecho && p.marcar && <button className="btn-secondary text-xs shrink-0" onClick={() => { guardar(CLAVE_PROBADO); setProbado(true); }}>Ya lo probé</button>}
            </li>
          );
        })}
      </ol>
      {plantillas && <PlantillasRubro onClose={() => setPlantillas(false)} onAplicada={cargar} />}
    </section>
  );
}
