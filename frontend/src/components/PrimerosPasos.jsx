import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, X, ArrowRight, Rocket } from 'lucide-react';
import api from '../services/api';

// Solo en la app de escritorio. Lista de "Primeros pasos" que se tilda sola según lo que ya está
// configurado de verdad (no es un texto fijo): clave de Groq, datos del negocio, WhatsApp, celular de avisos,
// una prueba y el respaldo. Se puede ocultar y no vuelve a molestar.
const OCULTO = 'akira_primeros_pasos_oculto';
const PROBADO = 'akira_primeros_pasos_probado';
const leer = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const guardar = (k) => { try { localStorage.setItem(k, '1'); } catch { /* sin almacenamiento: se muestra igual */ } };

export default function PrimerosPasos({ botConectado }) {
  const [oculto, setOculto] = useState(() => leer(OCULTO));
  const [probado, setProbado] = useState(() => leer(PROBADO));
  const [datos, setDatos] = useState(null);

  const cargar = useCallback(async () => {
    const [c, r] = await Promise.allSettled([api.get('/config'), api.get('/app/respaldo')]);
    const cfg = c.status === 'fulfilled' ? c.value.data : null;
    const resp = r.status === 'fulfilled' ? r.value.data : null;
    setDatos({
      groq: !!cfg?.keys?.groq,
      negocio: !!cfg?.config?.negocio && ((cfg?.config?.serviciosList || []).length > 0 || !!cfg?.config?.servicios),
      celular: String(cfg?.config?.celularNotificaciones || '').replace(/\D/g, '').length >= 10,
      respaldo: !!resp?.activo && !!resp?.tieneClave,
    });
  }, []);
  useEffect(() => { if (!oculto) cargar(); }, [oculto, cargar]);

  if (oculto || !datos) return null;

  const pasos = [
    { id: 'groq', hecho: datos.groq, titulo: 'Cargá tu clave de Groq (gratis)', detalle: 'Es la inteligencia artificial que usa el bot. Creás la cuenta en groq.com y pegás la clave.', ir: '/config', cta: 'Ir a Config' },
    { id: 'negocio', hecho: datos.negocio, titulo: 'Contale a Akira de tu negocio', detalle: 'Nombre, servicios, precios y horarios: con eso responde y agenda.', ir: '/config', cta: 'Completar' },
    { id: 'wa', hecho: !!botConectado, titulo: 'Conectá tu WhatsApp', detalle: 'Tocá "Iniciar bot" en esta pantalla y escaneá el QR desde WhatsApp → Dispositivos vinculados.', ir: null },
    { id: 'celular', hecho: datos.celular, titulo: 'Cargá tu celular para los avisos', detalle: 'Ahí te avisa cuando se agenda un turno, y te manda el resumen del día si lo activás.', ir: '/config', cta: 'Cargar celular' },
    { id: 'prueba', hecho: probado, titulo: 'Probalo escribiéndole desde otro celular', detalle: 'Pedí un turno como si fueras un cliente. Cuando lo hayas probado, marcalo.', ir: null, marcar: true },
    { id: 'respaldo', hecho: datos.respaldo, titulo: 'Activá el respaldo automático', detalle: 'Tus datos viven en esta PC: una copia cifrada los protege si algo se rompe.', ir: '/respaldo', cta: 'Configurar respaldo' },
  ];
  const hechos = pasos.filter((p) => p.hecho).length;
  const completo = hechos === pasos.length;
  const proximo = pasos.find((p) => !p.hecho);

  const ocultar = () => { guardar(OCULTO); setOculto(true); };

  return (
    <div className="card animate-fade-up" style={{ border: '1px solid rgba(0,232,123,0.25)', background: 'rgba(0,232,123,0.03)' }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,232,123,0.12)' }}><Rocket size={18} style={{ color: '#00e87b' }} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{completo ? '¡Listo! Tu Akira está lista para trabajar' : 'Primeros pasos'}</p>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>{completo ? 'Completaste todos los pasos. Podés ocultar esta guía.' : `${hechos} de ${pasos.length} completados. Se tildan solos a medida que los configurás.`}</p>
          <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${(hechos / pasos.length) * 100}%`, background: '#00e87b' }} />
          </div>
        </div>
        <button onClick={ocultar} className="text-gray-500 hover:text-white shrink-0" aria-label="Ocultar los primeros pasos" title="Ocultar"><X size={16} /></button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {pasos.map((p) => {
          const esProximo = !completo && p === proximo;
          return (
            <li key={p.id} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2" style={{ background: esProximo ? 'rgba(0,232,123,0.08)' : 'transparent' }}>
              {p.hecho ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" style={{ color: '#00e87b' }} /> : <Circle size={17} className="mt-0.5 shrink-0 text-gray-600" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${p.hecho ? 'text-gray-500 line-through' : 'text-white font-medium'}`}>{p.titulo}</p>
                {!p.hecho && <p className="text-xs text-gray-500 mt-0.5">{p.detalle}</p>}
              </div>
              {!p.hecho && p.ir && <Link to={p.ir} className="btn-secondary text-xs flex items-center gap-1 shrink-0">{p.cta} <ArrowRight size={12} /></Link>}
              {!p.hecho && p.marcar && <button className="btn-secondary text-xs shrink-0" onClick={() => { guardar(PROBADO); setProbado(true); }}>Ya lo probé</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
