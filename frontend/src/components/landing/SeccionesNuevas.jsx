import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, Megaphone, Store, Hourglass, Plug, ShieldCheck, ExternalLink } from 'lucide-react';

// Secciones de la landing que muestran el programa real: capturas de pantalla (con datos de ejemplo de un negocio ficticio,
// "Aurora Estudio") y las novedades: Marketing con IA, venta por mayor, prueba gratis por uso y conexión con asistentes de IA.
// Las capturas salen de la propia app con `desktop/scripts/capturas-demo.js` (ver ese archivo).

function Seccion({ id, children }) {
  return <section id={id} className="relative py-20 md:py-28 px-5 md:px-8">{children}</section>;
}
function Etiqueta({ children, color = 'var(--accent)' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full" style={{ background: `${color}1a`, border: `1px solid ${color}33`, color }}>
      {children}
    </span>
  );
}

// ── "El programa por dentro": capturas reales, una pantalla por pestaña ──
const PANTALLAS = [
  { id: 'agenda', titulo: 'Agenda', archivo: 'akira-agenda', w: 1280, h: 889, bajada: 'Tus turnos del mes en un vistazo: los confirmados, los que esperan seña y lo que ya se cobró.', alt: 'Pantalla Agenda de Akira Cloud: calendario del mes con turnos confirmados, pendientes y por cobrar' },
  { id: 'caja', titulo: 'Caja', archivo: 'akira-caja', w: 1280, h: 1111, bajada: 'Lo que entra, lo que sale y lo que te deben. Los turnos cobrados suman solos.', alt: 'Pantalla Caja de Akira Cloud: ingresos, gastos, resultado del mes, gráfico día por día y desglose por método de pago' },
  { id: 'reportes', titulo: 'Reportes', archivo: 'akira-reportes', w: 1280, h: 1111, bajada: 'Servicios más pedidos, clientes que más vienen, horas pico y evolución mes a mes.', alt: 'Pantalla Reportes de Akira Cloud: evolución mensual, servicios más pedidos y clientes frecuentes' },
  { id: 'catalogo', titulo: 'Catálogo', archivo: 'akira-catalogo', w: 1280, h: 676, bajada: 'Productos y servicios con precio, stock y código de barras. Se importan desde Excel, PDF o una foto.', alt: 'Pantalla Catálogo de Akira Cloud: lista de productos con precio, stock, código de barras y categoría' },
  { id: 'pedidos', titulo: 'Pedidos', archivo: 'akira-pedidos', w: 1280, h: 693, bajada: 'Tus clientes arman el pedido por WhatsApp; vos ves cuáles faltan cobrar y cuáles ya se entregaron.', alt: 'Pantalla Pedidos de Akira Cloud: pedidos hechos por WhatsApp con estado de pago y entrega' },
  { id: 'marketing', titulo: 'Marketing con IA', archivo: 'akira-marketing-borrador', w: 1280, h: 1333, bajada: 'Pedís una publicación y la IA te escribe dos opciones con los precios reales de tu negocio.', alt: 'Pantalla Marketing de Akira Cloud: borrador de publicación para Instagram generado con los datos reales del negocio' },
  { id: 'integraciones', titulo: 'Integraciones', archivo: 'akira-integraciones', w: 1280, h: 1422, bajada: 'Planillas al día, avisos a Zapier o Make y conexión opcional con tu asistente de IA, todo bajo tu control.', alt: 'Pantalla Integraciones de Akira Cloud: planillas en una carpeta, webhooks y conexión de asistentes de IA de solo lectura' },
];

export function ProgramaPorDentro() {
  const [activa, setActiva] = useState(PANTALLAS[0].id);
  const p = PANTALLAS.find((x) => x.id === activa) || PANTALLAS[0];
  return (
    <Seccion id="programa">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Etiqueta color="#7dd3fc">El programa por dentro</Etiqueta>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            Así se ve <span className="text-[var(--accent)]">Akira</span> funcionando
          </h2>
          <p className="mt-3 text-base" style={{ color: 'var(--text2)' }}>
            Capturas reales del programa para Windows. Los datos son de un negocio de ejemplo.
          </p>
        </div>

        <div role="tablist" aria-label="Pantallas de Akira" className="flex flex-wrap justify-center gap-2 mb-8">
          {PANTALLAS.map((x) => {
            const on = x.id === activa;
            return (
              <button key={x.id} role="tab" aria-selected={on} onClick={() => setActiva(x.id)} className="text-sm font-medium px-4 py-2 rounded-full border transition-colors"
                style={on ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: 'var(--text2)', borderColor: 'rgba(255,255,255,0.12)' }}>
                {x.titulo}
              </button>
            );
          })}
        </div>

        <figure className="max-w-5xl mx-auto">
          <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#0a0a0a', boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(0,232,123,0.06)' }}>
            <div className="flex items-center gap-1.5 px-4 py-2.5" style={{ background: '#111', borderBottom: '1px solid rgba(255,255,255,0.08)' }} aria-hidden="true">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} /><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} /><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
              <span className="ml-3 text-[11px]" style={{ color: 'var(--text2)' }}>Akira Cloud — {p.titulo}</span>
            </div>
            <div className="relative overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
              <img key={p.id} src={`/capturas/${p.archivo}.webp`} width={p.w} height={p.h} alt={p.alt} loading="lazy" decoding="async" className="w-full h-full object-cover object-top" />
            </div>
          </div>
          <figcaption className="mt-4 text-center">
            <p className="text-sm" style={{ color: 'var(--text)' }}>{p.bajada}</p>
            <a href={`/capturas/${p.archivo}.webp`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-xs hover:underline" style={{ color: 'var(--accent)' }}>
              Ver la pantalla completa <ExternalLink size={12} />
            </a>
          </figcaption>
        </figure>
      </div>
    </Seccion>
  );
}

// ── Novedades: Marketing con IA, venta por mayor, prueba por uso y asistentes de IA ──
const ESPECIALISTAS = ['Redactor de publicaciones', 'Armador de promociones', 'Respuestas a reseñas', 'Planificador semanal', 'Mensajes para tus clientes', 'Consultor de crecimiento'];
const MAYORISTAS = ['Presentación para mayoristas', 'Prospección de clientes nuevos', 'Seguimiento comercial y cobranzas'];

export function NovedadesIA() {
  return (
    <Seccion id="marketing-ia">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Etiqueta color="#f0abfc">Novedad</Etiqueta>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            Un <span className="text-[var(--accent)]">equipo de marketing con IA</span> que escribe por vos
          </h2>
          <p className="mt-3 text-base" style={{ color: 'var(--text2)' }}>
            Publicaciones, promociones, respuestas a reseñas y planes semanales, escritos con los precios y datos reales de tu negocio. Vos revisás y publicás: nada sale solo.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {ESPECIALISTAS.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
                  <CheckCircle size={15} className="mt-0.5 flex-shrink-0 text-[var(--accent)]" />{t}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-xl p-4" style={{ background: 'rgba(0,232,123,0.05)', border: '1px solid rgba(0,232,123,0.18)' }}>
              <p className="flex items-center gap-2 text-sm font-semibold text-white"><Store size={15} className="text-[var(--accent)]" /> Si vendés por mayor</p>
              <p className="text-xs mt-1.5 mb-2" style={{ color: 'var(--text2)' }}>Contale a Akira cómo vendés y cargá tus condiciones (pedido mínimo, entrega, pagos). Se suman:</p>
              <ul className="space-y-1.5">
                {MAYORISTAS.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}><CheckCircle size={14} className="mt-0.5 flex-shrink-0 text-[var(--accent)]" />{t}</li>
                ))}
              </ul>
              <p className="text-xs mt-2" style={{ color: 'var(--text2)' }}>El consultor también mira tus ventas, qué tanto dependés de pocos clientes y lo que tenés por cobrar.</p>
            </div>
            <p className="mt-5 text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
              Usa tu propia clave de Groq (gratis), así que tus textos no pasan por un servidor nuestro. La IA no inventa precios ni descuentos: lo que le falta lo deja entre [corchetes] para que lo completes.
            </p>
          </div>
          <figure>
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#0a0a0a', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
              <img src="/capturas/akira-marketing-equipo.webp" width={1280} height={1022} alt="Pantalla Marketing de Akira Cloud: los especialistas de IA para publicaciones, promociones, reseñas, plan semanal, mensajes a clientes y consultor, y los de venta por mayor" loading="lazy" decoding="async" className="w-full h-auto" />
            </div>
            <figcaption className="mt-2 text-center text-xs" style={{ color: 'var(--text2)' }}>Capturas del programa con datos de un negocio de ejemplo.</figcaption>
          </figure>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-14">
          <div className="card flex flex-col gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}><Hourglass size={18} style={{ color: '#fbbf24' }} /></div>
            <h3 className="text-base font-semibold text-white">Una prueba gratis que cuenta cuando la usás</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
              Los 7 días de prueba son <strong className="text-white">días de uso</strong>: solo se gastan los días en que el bot atiende mensajes. Si te registrás y la probás recién dentro de unas semanas, no se te vence. Sin tarjeta, con 100 mensajes incluidos.
            </p>
            <Link to="/register" className="inline-flex items-center gap-1.5 text-sm font-medium mt-auto hover:underline" style={{ color: 'var(--accent)' }}>Crear mi cuenta gratis <ArrowRight size={14} /></Link>
          </div>
          <div className="card flex flex-col gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(125,211,252,0.1)', border: '1px solid rgba(125,211,252,0.25)' }}><Plug size={18} style={{ color: '#7dd3fc' }} /></div>
            <h3 className="text-base font-semibold text-white">Conectalo con tu asistente de IA (opcional)</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
              Si usás un asistente como Claude, podés dejar que consulte tu negocio: <em>“¿cuánto vendí este mes?”</em>, <em>“¿quién me debe?”</em>. Es <strong className="text-white">solo lectura</strong>, funciona únicamente en tu computadora, con una llave que vos creás y revocás, y está apagado hasta que lo actives.
            </p>
            <p className="flex items-center gap-1.5 text-xs mt-auto" style={{ color: 'var(--text2)' }}><ShieldCheck size={13} className="text-[var(--accent)]" /> Los teléfonos salen enmascarados y nunca se comparten claves ni el texto de los chats.</p>
          </div>
        </div>
      </div>
    </Seccion>
  );
}
