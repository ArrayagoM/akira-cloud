import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Bot, Calendar, CreditCard, Mic, Zap, Shield, CheckCircle, ArrowRight,
  MessageSquare, Clock, Star, Github, Linkedin, Facebook, Globe, Code2,
  PauseCircle, BellRing, GitBranch, ChevronRight, Sparkles, TrendingUp, Users, DollarSign } from 'lucide-react';
import { useScrollReveal, useScrollRevealGroup } from '../hooks/useScrollReveal';

// ─────────────────────────────────────────────────────────────
// HORIZONTAL SCROLL SECTION
// Convierte scroll vertical en movimiento horizontal
// ─────────────────────────────────────────────────────────────
function HorizontalScroll({ children, bgColor = '#070c12' }) {
  const trackRef = useRef(null);
  const innerRef = useRef(null);
  const slides   = Array.isArray(children) ? children : [children];
  const count    = slides.length;

  useEffect(() => {
    const onScroll = () => {
      const el = trackRef.current;
      if (!el) return;
      const rect     = el.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -rect.top / (el.offsetHeight - window.innerHeight)));
      if (innerRef.current) {
        innerRef.current.style.transform = `translateX(-${progress * (count - 1) * 100}vw)`;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [count]);

  return (
    <div ref={trackRef} style={{ height: `${count * 100}vh`, background: bgColor }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <div ref={innerRef} className="flex h-full"
          style={{ width: `${count * 100}vw`, willChange: 'transform', transition: 'transform 0.06s linear' }}>
          {slides.map((slide, i) => (
            <div key={i} className="flex-shrink-0 flex items-center justify-center"
              style={{ width: '100vw', height: '100vh' }}>
              {slide}
            </div>
          ))}
        </div>
        {/* Indicador de progreso */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {slides.map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full transition-all duration-300"
              style={{ background: 'rgba(0,232,123,0.4)' }} />
          ))}
        </div>
        {/* Flecha siguiente */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 text-xs font-semibold flex items-center gap-1 animate-bounce-soft"
          style={{ color: 'var(--accent)', opacity: 0.6 }}>
          <ChevronRight size={16} /> scroll
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NAVBAR
// ─────────────────────────────────────────────────────────────
function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(7,12,18,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(30,45,61,0.8)' : 'none',
      }}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}>
            <Bot size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <span className="font-bold text-white">Akira <span style={{ color: 'var(--accent)' }}>Cloud</span></span>
        </div>

        <div className="hidden md:flex items-center gap-7 text-sm" style={{ color: 'var(--text2)' }}>
          {['#como-funciona','#beneficios','#comparativa','#precios'].map((href, i) => (
            <a key={i} href={href} className="link-underline hover:text-white transition-colors duration-150"
              style={{ color: 'var(--text2)' }}>
              {['Cómo funciona','Beneficios','Comparativa','Precios'][i]}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium transition-colors duration-150 hidden sm:block"
            style={{ color: 'var(--text2)' }}>
            Iniciar sesión
          </Link>
          <Link to="/register" className="btn-primary text-sm py-2 px-4">
            Empezar gratis
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────
function HeroSection() {
  const badgeRef = useScrollReveal('is-visible');
  const h1Ref   = useScrollReveal('is-visible');
  const pRef    = useScrollReveal('is-visible');
  const ctaRef  = useScrollReveal('is-visible');
  const mockRef = useScrollReveal('is-visible');

  return (
    <section className="min-h-screen flex items-center pt-16 relative overflow-hidden"
      style={{ background: 'var(--bg)' }}>
      {/* orbs de fondo */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(0,232,123,0.06) 0%, transparent 70%)' }} />
      <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full blur-2xl pointer-events-none"
        style={{ background: 'rgba(59,130,246,0.04)' }} />
      {/* Grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

      <div className="max-w-6xl mx-auto px-6 py-24 w-full relative z-10">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            {/* Badge — social proof, no jargon técnico */}
            <div ref={badgeRef} className="reveal-up inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium mb-8"
              style={{ background: 'rgba(0,232,123,0.08)', border: '1px solid rgba(0,232,123,0.2)', color: 'var(--accent)' }}>
              <Sparkles size={13} /> +200 negocios automatizados · 7 días gratis
            </div>

            <h1 ref={h1Ref} className="reveal-up text-5xl md:text-6xl font-extrabold text-white leading-tight mb-6 reveal-d1">
              Tu negocio funciona<br />
              <span style={{ color: 'var(--accent)' }}>mientras dormís</span>
            </h1>

            <p ref={pRef} className="reveal-up text-lg mb-10 leading-relaxed reveal-d2"
              style={{ color: 'var(--text2)' }}>
              Akira responde a tus clientes, agenda turnos y cobra con MercadoPago
              las 24hs por WhatsApp — <strong className="text-white">sin que muevas un dedo.</strong>
            </p>

            <div ref={ctaRef} className="reveal-up flex flex-col sm:flex-row gap-3 reveal-d3">
              <Link to="/register" className="btn-primary text-base py-3.5 px-8">
                Probarlo gratis — 7 días <ArrowRight size={17} />
              </Link>
              <a href="#como-funciona" className="btn-secondary text-base py-3.5 px-8">
                Ver cómo funciona
              </a>
            </div>

            {/* Social proof */}
            <div className="mt-8 flex flex-wrap items-center gap-4 reveal-up reveal-d4" style={{ color: 'var(--muted)' }}>
              <div className="flex -space-x-2">
                {['#00e87b','#3b82f6','#f59e0b','#a78bfa'].map((c, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                    style={{ background: `${c}22`, borderColor: 'var(--bg)', color: c }}>
                    {['A','M','C','L'][i]}
                  </div>
                ))}
              </div>
              <p className="text-sm"><strong className="text-white">+200</strong> negocios ya lo usan</p>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} size={13} fill="#f59e0b" color="#f59e0b" />
                ))}
                <span className="text-xs ml-1 text-white font-semibold">4.9</span>
              </div>
            </div>
          </div>

          {/* Mockup WhatsApp */}
          <div ref={mockRef} className="reveal-right reveal-d2">
            <div className="relative">
              <div className="rounded-2xl p-5 text-left"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 48px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center gap-3 mb-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,232,123,0.12)' }}>
                    <Bot size={17} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Akira — Peluquería Estilo</p>
                    <p className="text-xs" style={{ color: 'var(--accent)' }}>● en línea</p>
                  </div>
                </div>
                {[
                  { from: 'client', text: 'Hola, ¿tienen turno el martes?', time: '10:02' },
                  { from: 'bot',    text: '¡Hola Lucía! 😊 Sí, el martes tenemos: 10:00, 14:00 y 16:00. ¿Cuál te queda mejor?', time: '10:02' },
                  { from: 'client', text: 'Las 14:00 perfecto', time: '10:03' },
                  { from: 'bot',    text: '🎉 Turno confirmado — martes 14:00.\n\n💳 Pagá aquí:\nhttps://mp.com/tu-turno\n\n⏳ Link válido 30 min.', time: '10:03' },
                ].map((m, i) => (
                  <div key={i} className={`flex mb-3 ${m.from === 'client' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[82%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-line"
                      style={m.from === 'client'
                        ? { background: 'var(--accent)', color: '#020f08', borderTopRightRadius: '4px' }
                        : { background: 'var(--surface3)', color: 'var(--text)', border: '1px solid var(--border)', borderTopLeftRadius: '4px' }}>
                      {m.text}
                      <p className="text-right mt-0.5 text-[10px] opacity-50">{m.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute -right-3 -bottom-3 text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ background: 'var(--accent)', color: '#020f08', boxShadow: '0 4px 12px rgba(0,232,123,0.4)' }}>
                IA 24/7 ✓
              </div>
              {/* Glow bajo la tarjeta */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-8 blur-xl"
                style={{ background: 'rgba(0,232,123,0.15)' }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// PROBLEMA — ¿te identificás con esto?
// ─────────────────────────────────────────────────────────────
const problemas = [
  {
    icon: <MessageSquare size={20} />,
    title: 'Perdés clientes por no responder a tiempo',
    desc: 'Llega un mensaje a las 2AM o el fin de semana. No respondés. El cliente se va con la competencia.',
  },
  {
    icon: <Clock size={20} />,
    title: 'Perdés horas en tareas que se repiten',
    desc: 'Responder "¿cuánto cuesta?", "¿tienen turno?" todos los días te roba tiempo que podrías dedicar a crecer.',
  },
  {
    icon: <Zap size={20} />,
    title: 'Si vos no estás, el negocio para',
    desc: 'Vacaciones, descanso, familia — todo queda en pausa. Tu negocio depende 100% de que vos estés disponible.',
  },
];

function ProblemaSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');

  return (
    <section className="py-24 relative" style={{ background: 'var(--surface)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-14">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: '#f87171' }}>
            El problema
          </span>
          <h2 className="text-4xl font-bold text-white mb-4">¿Te suena familiar?</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>
            La mayoría de los negocios pierde clientes todos los días sin darse cuenta.
          </p>
        </div>

        <div ref={gridRef} className="grid md:grid-cols-3 gap-5">
          {problemas.map((p, i) => (
            <div key={i} className="reveal-up card"
              style={{ borderColor: 'rgba(248,113,113,0.15)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(248,113,113,0.08)', color: '#f87171' }}>
                {p.icon}
              </div>
              <h3 className="font-semibold text-white mb-2">{p.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
            ↓ Así lo resuelve Akira
          </p>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// COMO FUNCIONA — scroll reveal de arriba (pasos)
// ─────────────────────────────────────────────────────────────
const pasos = [
  { num: '01', titulo: 'Creá tu cuenta', desc: 'Registrate en un minuto con Google o email. 7 días de prueba gratis, sin tarjeta.' },
  { num: '02', titulo: 'Configurá tu negocio', desc: 'Cargá tus servicios, precios y horarios por día. Sin conocimientos técnicos.' },
  { num: '03', titulo: 'Conectá WhatsApp', desc: 'Click en "Iniciar bot" y escaneá el QR. En 30 segundos el bot está activo.' },
  { num: '04', titulo: 'Tu negocio trabaja solo', desc: 'Akira agenda, cobra y avisa. Vos controlás todo desde el panel en tiempo real.' },
];

function ComoFuncionaSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');

  return (
    <section id="como-funciona" className="py-28 relative"
      style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>
            Paso a paso
          </span>
          <h2 className="text-4xl font-bold text-white mb-4">En 10 minutos estás operando</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>
            Sin instalar nada. Sin servidores. Sin conocimientos técnicos.
          </p>
        </div>
        <div ref={gridRef} className="grid md:grid-cols-4 gap-6">
          {pasos.map((p, i) => (
            <div key={i} className="reveal-up relative">
              {i < pasos.length - 1 && (
                <div className="hidden md:block absolute top-7 left-full w-full h-px z-0"
                  style={{ background: 'linear-gradient(90deg, rgba(0,232,123,0.3), transparent)' }} />
              )}
              <div className="relative z-10 flex flex-col gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(0,232,123,0.08)', border: '1px solid rgba(0,232,123,0.18)' }}>
                  <span className="font-extrabold text-lg" style={{ color: 'var(--accent)' }}>{p.num}</span>
                </div>
                <h3 className="font-semibold text-white">{p.titulo}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// HORIZONTAL SCROLL — Slides de features (de derecha → izquierda)
// ─────────────────────────────────────────────────────────────
const featureSlides = [
  {
    tag: 'Respuestas automáticas',
    title: 'Respondé clientes sin tocar el celular',
    desc: 'Akira entiende lo que escriben tus clientes y responde de forma natural, con contexto, como si fuera vos. Incluso entiende los mensajes de audio.',
    icon: <Bot size={40} />,
    color: 'var(--accent)',
    bg: 'rgba(0,232,123,0.06)',
    items: ['Entiende el contexto de la conversación', 'Escucha y entiende audios', 'Responde por voz si el cliente lo prefiere', 'Personalizable para tu negocio'],
  },
  {
    tag: 'Agenda inteligente',
    title: 'Nunca más un doble turno',
    desc: 'Akira consulta tu disponibilidad en tiempo real y agenda, reagenda o cancela turnos automáticamente. Sin que vos intervengas.',
    icon: <Calendar size={40} />,
    color: '#60a5fa',
    bg: 'rgba(59,130,246,0.06)',
    items: ['Sincronizado con Google Calendar', 'Horarios configurables por día', 'Bloqueo de fechas y feriados', 'Recordatorios automáticos a tus clientes'],
  },
  {
    tag: 'Cobros automáticos',
    title: 'El turno se confirma cuando pagan',
    desc: 'Genera el link de pago al instante. El turno queda reservado solo cuando el dinero está acreditado. Cero deudores, cero ausentismo.',
    icon: <CreditCard size={40} />,
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.06)',
    items: ['MercadoPago integrado', 'Transferencia / alias / CBU', 'Confirmación automática del turno', 'Te avisa a vos también por WhatsApp'],
  },
  {
    tag: 'Control total',
    title: 'Vos siempre tenés la última palabra',
    desc: 'Pausá el bot en un click, bloqueá fechas, tomá el control de cualquier conversación cuando lo necesitás. Panel desde el celular incluido.',
    icon: <Shield size={40} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.06)',
    items: ['Modo pausa instantáneo', 'Actividad en tiempo real', 'Silenciá conversaciones', 'Panel web y mobile'],
  },
];

function FeatureSlide({ tag, title, desc, icon, color, bg, items }) {
  return (
    <div className="max-w-5xl mx-auto px-6 w-full">
      <div className="grid md:grid-cols-2 gap-12 items-center">
        {/* Ícono + título */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold mb-6"
            style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
            {tag}
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-5">{title}</h2>
          <p className="text-lg leading-relaxed mb-8" style={{ color: 'var(--text2)' }}>{desc}</p>
          <ul className="space-y-3">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}18`, color }}>
                  <CheckCircle size={12} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Visual card */}
        <div className="flex justify-center">
          <div className="w-64 h-64 md:w-80 md:h-80 rounded-3xl flex items-center justify-center relative"
            style={{ background: bg, border: `1px solid ${color}25`, boxShadow: `0 0 60px ${color}18` }}>
            <span style={{ color, filter: `drop-shadow(0 0 20px ${color})`, opacity: 0.9 }}>{icon}</span>
            {/* Anillos decorativos */}
            <div className="absolute inset-4 rounded-2xl border opacity-20" style={{ borderColor: color }} />
            <div className="absolute inset-8 rounded-xl border opacity-10" style={{ borderColor: color }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BENEFICIOS GRID — reveal desde la izquierda
// ─────────────────────────────────────────────────────────────
const beneficiosGrid = [
  { icon: <Mic size={20} />,         title: 'Entiende audios',            desc: 'Tus clientes mandan audio y Akira lo escucha, lo entiende y responde.' },
  { icon: <Clock size={20} />,       title: 'Disponible las 24 horas',    desc: 'A las 3AM o el domingo, siempre hay alguien respondiendo por vos.' },
  { icon: <BellRing size={20} />,    title: 'Te avisa cada turno',        desc: 'Cada vez que se confirma un turno o pago, te llega un mensaje al celular.' },
  { icon: <PauseCircle size={20} />, title: 'Pausá cuando quieras',       desc: 'Vacaciones, feriado o descanso: pausás el bot en segundos.' },
  { icon: <Shield size={20} />,      title: 'Vos siempre mandás',         desc: 'Silenciás el bot cuando querés tomar una conversación personalmente.' },
  { icon: <GitBranch size={20} />,   title: 'Programa de referidos',      desc: 'Compartí tu código y ganás crédito por cada negocio que traés.' },
];

function BeneficiosSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');

  return (
    <section id="beneficios" className="py-28" style={{ background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto px-6">
        <div ref={titleRef} className="reveal-left text-center mb-14">
          <h2 className="text-4xl font-bold text-white mb-4">Y mucho más incluido</h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text2)' }}>
            No es un bot de respuestas fijas. Es un asistente que piensa, agenda y cobra por vos.
          </p>
        </div>
        <div ref={gridRef} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {beneficiosGrid.map((b, i) => (
            <div key={i} className="reveal-left card card-glow group cursor-default">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-200"
                style={{ background: 'rgba(0,232,123,0.08)', color: 'var(--accent)' }}>
                {b.icon}
              </div>
              <h3 className="font-semibold text-white mb-2">{b.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// RESULTADOS — métricas concretas
// ─────────────────────────────────────────────────────────────
const resultados = [
  { icon: <Users size={28} />,      valor: '+3x',    label: 'más turnos confirmados',       color: 'var(--accent)',  bg: 'rgba(0,232,123,0.06)' },
  { icon: <DollarSign size={28} />, valor: '0',      label: 'clientes perdidos por demora', color: '#a78bfa',        bg: 'rgba(167,139,250,0.06)' },
  { icon: <Clock size={28} />,      valor: '2h',     label: 'menos de trabajo por día',     color: '#60a5fa',        bg: 'rgba(59,130,246,0.06)' },
  { icon: <TrendingUp size={28} />, valor: '24/7',   label: 'atención sin parar',           color: '#f59e0b',        bg: 'rgba(245,158,11,0.06)' },
];

function ResultadosSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');

  return (
    <section className="py-24 relative" style={{ background: 'var(--surface)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-14">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>
            Resultados reales
          </span>
          <h2 className="text-4xl font-bold text-white mb-4">Lo que cambia cuando usás Akira</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>
            Números promedio de negocios que ya lo usan.
          </p>
        </div>

        <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {resultados.map((r, i) => (
            <div key={i} className="reveal-up card text-center py-8"
              style={{ border: `1px solid ${r.color}20` }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: r.bg, color: r.color }}>
                {r.icon}
              </div>
              <p className="text-4xl font-extrabold text-white mb-1">{r.valor}</p>
              <p className="text-sm leading-tight" style={{ color: 'var(--text2)' }}>{r.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// TESTIMONIOS
// ─────────────────────────────────────────────────────────────
const testimonios = [
  {
    texto: 'Antes perdía turnos todos los fines de semana. Ahora Akira los agenda y cobra solo. Me cambió la vida.',
    nombre: 'Valeria M.',
    negocio: 'Centro de estética · Buenos Aires',
    avatar: 'V',
    color: '#a78bfa',
  },
  {
    texto: 'Mis clientes me dicen que parezco siempre disponible. No saben que es un bot — y eso es lo mejor.',
    nombre: 'Carlos R.',
    negocio: 'Barbería · Córdoba',
    avatar: 'C',
    color: '#60a5fa',
  },
  {
    texto: 'En una semana recuperé el costo del plan con un solo cliente que antes se habría ido sin respuesta.',
    nombre: 'Laura T.',
    negocio: 'Consultorio nutricional · Rosario',
    avatar: 'L',
    color: 'var(--accent)',
  },
];

function TestimoniosSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');

  return (
    <section className="py-24" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-14">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>
            Lo que dicen
          </span>
          <h2 className="text-4xl font-bold text-white mb-4">Negocios que ya trabajan menos y ganan más</h2>
        </div>

        <div ref={gridRef} className="grid md:grid-cols-3 gap-5">
          {testimonios.map((t, i) => (
            <div key={i} className="reveal-up card flex flex-col gap-4">
              {/* Stars */}
              <div className="flex gap-1">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} size={14} fill="#f59e0b" color="#f59e0b" />
                ))}
              </div>
              {/* Quote */}
              <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--text2)' }}>
                "{t.texto}"
              </p>
              {/* Author */}
              <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                  style={{ background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}30` }}>
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{t.nombre}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.negocio}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPARATIVA
// ─────────────────────────────────────────────────────────────
const comparativa = [
  ['Responde automáticamente',    '✓ Con contexto y naturalidad',  '❌ Respuestas fijas'],
  ['Agenda de turnos real',       '✓ Google Calendar',              '❌ No incluye'],
  ['Cobros integrados',           '✓ MercadoPago',                  '❌ No incluye'],
  ['Entiende mensajes de audio',  '✓ Transcribe y responde',        '❌ Solo texto'],
  ['Recordatorios automáticos',   '✓ 24h / 4h / 30min antes',       '❌ Manual'],
  ['Cancelar / reagendar',        '✓ Automático',                   '❌ Manual'],
  ['Horarios por día',            '✓ Panel visual',                 '❌ No incluye'],
  ['Te avisa cada venta',         '✓ Por WhatsApp al instante',     '❌ No incluye'],
];

function ComparativaSection() {
  const titleRef = useScrollReveal('is-visible');
  const tableRef = useScrollReveal('is-visible');

  return (
    <section id="comparativa" className="py-28" style={{ background: 'var(--surface)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-14">
          <h2 className="text-4xl font-bold text-white mb-4">Akira vs Bots tradicionales</h2>
          <p className="text-lg" style={{ color: 'var(--text2)' }}>
            No es solo un bot. Es la diferencia entre crecer y quedarse atrás.
          </p>
        </div>
        <div ref={tableRef} className="reveal-up overflow-x-auto rounded-2xl"
          style={{ border: '1px solid var(--border)', boxShadow: '0 4px 32px rgba(0,0,0,0.3)' }}>
          <table className="w-full text-sm" style={{ minWidth: 480 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-6 py-4 font-medium" style={{ color: 'var(--text2)' }}>Característica</th>
                <th className="px-6 py-4 text-center font-bold text-base" style={{ color: 'var(--accent)' }}>Akira Cloud</th>
                <th className="px-6 py-4 text-center font-medium" style={{ color: 'var(--muted)' }}>Bots tradicionales</th>
              </tr>
            </thead>
            <tbody>
              {comparativa.map(([feat, akira, trad], i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(30,45,61,0.5)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.15)' }}>
                  <td className="px-6 py-3.5" style={{ color: 'var(--text)' }}>{feat}</td>
                  <td className="px-6 py-3.5 text-center">
                    <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--accent)' }}>
                      <CheckCircle size={13} /> {akira}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-center" style={{ color: 'var(--muted)' }}>{trad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// PRECIOS
// ─────────────────────────────────────────────────────────────
const planes = [
  {
    planKey: 'basico', nombre: 'Básico', mensual: 15000, anual: 144000,
    desc: 'Para negocios que empiezan',
    features: ['1 número de WhatsApp','Respuestas automáticas con IA','500 mensajes/mes','Horarios configurables','Modo pausa'],
    destacado: false,
  },
  {
    planKey: 'pro', nombre: 'Pro', mensual: 35000, anual: 336000,
    desc: 'El más popular',
    features: ['1 número de WhatsApp','Mensajes ilimitados','Google Calendar + MercadoPago','Entiende mensajes de voz','Notificaciones al dueño'],
    destacado: true,
  },
  {
    planKey: 'agencia', nombre: 'Agencia', mensual: 80000, anual: 768000,
    desc: 'Para agencias y revendedores',
    features: ['Hasta 5 WhatsApp','Todo el plan Pro','Panel multi-cliente','Soporte dedicado','Programa de referidos'],
    destacado: false,
  },
];

function PreciosSection() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState('mensual');
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');
  const fmt = (n) => '$' + n.toLocaleString('es-AR');

  return (
    <section id="precios" className="py-28" style={{ background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto px-6">
        <div ref={titleRef} className="reveal-scale text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">Precios simples, sin sorpresas</h2>
          <p className="text-lg" style={{ color: 'var(--text2)' }}>7 días gratis en todos los planes. Cancelá cuando quieras.</p>
        </div>

        {/* Toggle */}
        <div className="flex justify-center mb-10">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {['mensual','anual'].map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
                style={periodo === p
                  ? { background: 'var(--accent)', color: '#020f08' }
                  : { color: 'var(--text2)' }}>
                {p === 'mensual' ? 'Mensual' : <span className="flex items-center gap-2">Anual <span className="text-xs font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(0,232,123,0.15)', color: 'var(--accent)' }}>−20%</span></span>}
              </button>
            ))}
          </div>
        </div>

        <div ref={gridRef} className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {planes.map((p, i) => (
            <div key={i} className="reveal-up relative rounded-2xl p-6 transition-all duration-200"
              style={{
                background: p.destacado ? 'linear-gradient(135deg, rgba(0,232,123,0.06) 0%, var(--surface) 60%)' : 'var(--surface)',
                border: p.destacado ? '1px solid rgba(0,232,123,0.28)' : '1px solid var(--border)',
                boxShadow: p.destacado ? '0 0 40px rgba(0,232,123,0.08)' : 'none',
              }}>
              {p.destacado && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1"
                  style={{ background: 'var(--accent)', color: '#020f08' }}>
                  <Star size={10} /> Más popular
                </div>
              )}
              <p className="text-sm mb-1 mt-1" style={{ color: 'var(--text2)' }}>{p.nombre}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-extrabold text-white">{fmt(periodo === 'mensual' ? p.mensual : p.anual)}</span>
                <span className="text-sm" style={{ color: 'var(--muted)' }}>{periodo === 'mensual' ? '/mes' : '/año'}</span>
              </div>
              {periodo === 'anual' && <p className="text-xs mb-3" style={{ color: 'var(--accent)' }}>Ahorrás {fmt(p.mensual * 12 - p.anual)}</p>}
              <p className="text-xs mb-5" style={{ color: 'var(--muted)' }}>{p.desc}</p>
              <ul className="space-y-2.5 mb-6">
                {p.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text)' }}>
                    <CheckCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => navigate(localStorage.getItem('akira_token') ? `/planes?plan=${p.planKey}_${periodo}` : `/register?plan=${p.planKey}_${periodo}`)}
                className={p.destacado ? 'btn-primary w-full' : 'btn-secondary w-full'}>
                Empezar gratis
              </button>
            </div>
          ))}
        </div>

        <p className="text-center mt-8 text-sm" style={{ color: 'var(--muted)' }}>
          <CheckCircle size={13} className="inline mr-1.5" style={{ color: 'var(--accent)' }} />
          7 días gratis · Sin tarjeta · Cancelá cuando quieras
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// CTA FINAL
// ─────────────────────────────────────────────────────────────
function CTASection() {
  const ref = useScrollReveal('is-visible');
  return (
    <section className="py-28 relative overflow-hidden" style={{ background: 'var(--surface)' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,232,123,0.06) 0%, transparent 70%)' }} />
      <div ref={ref} className="reveal-scale max-w-3xl mx-auto px-6 text-center relative z-10">
        <p className="text-sm font-semibold mb-4 uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
          Empezá hoy
        </p>
        <h2 className="text-5xl font-extrabold text-white mb-4">
          Menos trabajo.<br />Más clientes.<br />Más ingresos.
        </h2>
        <p className="text-xl mb-10 leading-relaxed" style={{ color: 'var(--text2)' }}>
          Sin tarjeta de crédito. Conectás tu WhatsApp en menos de 2 minutos.
        </p>
        <Link to="/register" className="btn-primary text-base py-4 px-10 inline-flex animate-glow-pulse">
          Crear cuenta gratis <ArrowRight size={18} />
        </Link>
        <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
          7 días gratis · Cancelá cuando quieras · Sin compromisos
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// CREADOR
// ─────────────────────────────────────────────────────────────
function CreadorSection() {
  const ref = useScrollReveal('is-visible');
  const stack = ['React','Node.js','MongoDB','TypeScript','Python','Arduino','IoT','React Native','PostgreSQL','Google Cloud'];

  return (
    <section className="py-28" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14 reveal-up" ref={useScrollReveal('is-visible')}>
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>Quién está detrás</span>
          <h2 className="text-4xl font-bold text-white mb-4">Construido por alguien que entiende tu realidad</h2>
        </div>

        <div ref={ref} className="reveal-up rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex flex-col md:flex-row">
            <div className="md:w-72 p-8 flex flex-col items-center text-center gap-5"
              style={{ background: 'var(--surface2)', borderRight: '1px solid var(--border)' }}>
              <div className="relative">
                <img src="https://avatars.githubusercontent.com/u/100850538?v=4" alt="JMA"
                  className="w-28 h-28 rounded-full object-cover"
                  style={{ border: '2px solid rgba(0,232,123,0.35)' }} />
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--accent)', border: '2px solid var(--surface2)' }}>
                  <Code2 size={13} className="text-black" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Juan Martín Arrayago</h3>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--accent)' }}>TinchoDev</p>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Full Stack · Buenos Aires 🇦🇷</p>
              </div>
              <div className="flex gap-2">
                {[{href:'https://github.com/ArrayagoM',icon:<Github size={15}/>},{href:'https://www.linkedin.com/in/juan-martin-arrayago',icon:<Linkedin size={15}/>},{href:'https://martin-arrayago.com',icon:<Globe size={15}/>}].map((s,i)=>(
                  <a key={i} href={s.href} target="_blank" rel="noreferrer"
                    className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150"
                    style={{ background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex-1 p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-14 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                <blockquote className="text-lg leading-relaxed italic" style={{ color: 'var(--text2)' }}>
                  "Construí Akira porque vi cómo los negocios locales pierden clientes por no responder a tiempo — y supe que podía resolverlo."
                </blockquote>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Stack tecnológico</p>
                <div className="flex flex-wrap gap-2">
                  {stack.map(tech => (
                    <span key={tech} className="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors duration-150"
                      style={{ background: 'var(--surface3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="py-10 px-6" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.2)' }}>
            <Bot size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <span className="font-bold text-white text-sm">Akira Cloud</span>
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>© 2026 Akira Cloud. Todos los derechos reservados.</p>
        <div className="flex gap-5 text-sm" style={{ color: 'var(--muted)' }}>
          <a href="#" className="link-underline transition-colors hover:text-white">Privacidad</a>
          <a href="#" className="link-underline transition-colors hover:text-white">Términos</a>
          <a href="#" className="link-underline transition-colors hover:text-white">Contacto</a>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────
// LANDING — composición final
// ─────────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <div style={{ background: 'var(--bg)' }}>
      <NavBar />

      {/* 1. Hero */}
      <HeroSection />

      {/* 2. Problema — ¿te identificás? */}
      <ProblemaSection />

      {/* 3. Cómo funciona */}
      <ComoFuncionaSection />

      {/* 4. HORIZONTAL SCROLL — 4 feature slides */}
      <HorizontalScroll bgColor="var(--bg)">
        {featureSlides.map((slide, i) => <FeatureSlide key={i} {...slide} />)}
      </HorizontalScroll>

      {/* 5. Beneficios grid */}
      <BeneficiosSection />

      {/* 6. Resultados / métricas */}
      <ResultadosSection />

      {/* 7. Testimonios */}
      <TestimoniosSection />

      {/* 8. Comparativa */}
      <ComparativaSection />

      {/* 9. Precios */}
      <PreciosSection />

      {/* 10. CTA final */}
      <CTASection />

      {/* 11. Creador */}
      <CreadorSection />

      {/* 12. Footer */}
      <Footer />
    </div>
  );
}
