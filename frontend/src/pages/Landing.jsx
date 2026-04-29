import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { LAUNCH_DATE } from './PreLanzamiento';
import {
  Bot, Calendar, CreditCard, Mic, Zap, Shield, CheckCircle, ArrowRight,
  MessageSquare, Clock, Star, ChevronRight, Sparkles, Users, Bell,
  Hourglass, Tag, TrendingUp, Quote, Github, Linkedin, Globe, ChevronDown,
  PauseCircle, BellRing, MoreVertical, Check, CheckCheck,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   AKIRA CLOUD — LANDING
   Estructura optimizada para que en <3s se entienda la propuesta:
     1. Hero (split: copy + chat demo en vivo)
     2. Cómo funciona (3 pasos)
     3. Demo animada de conversación real
     4. Grid de features (incluye CRM + recordatorios + lista de espera)
     5. Pricing
     6. Testimonios
     7. FAQ
     8. CTA final + footer
   ═══════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────
// HOOK: scroll reveal (IntersectionObserver one-shot)
// ─────────────────────────────────────────────────────────────
function useReveal(threshold = 0.18) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current || shown) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [shown, threshold]);
  return [ref, shown];
}

// ─────────────────────────────────────────────────────────────
// HOOK: countdown al lanzamiento
// ─────────────────────────────────────────────────────────────
function useCountdown(target) {
  const [t, setT] = useState(() => Math.max(0, target.getTime() - Date.now()));
  useEffect(() => {
    const i = setInterval(() => setT(Math.max(0, target.getTime() - Date.now())), 1000);
    return () => clearInterval(i);
  }, [target]);
  const d = Math.floor(t / 86400000);
  const h = Math.floor((t % 86400000) / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  return { d, h, m, llegado: t === 0 };
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: Chat de WhatsApp con animación de mensajes
// ─────────────────────────────────────────────────────────────
const CONVERSACION = [
  { from: 'cli', text: 'Hola, querría reservar un corte para el sábado' },
  { from: 'bot', text: '¡Hola Sofi! 👋 Tengo turnos a las 11:00, 14:30 y 17:00 el sábado. ¿Cuál te queda mejor?' },
  { from: 'cli', text: '14:30 me viene bárbaro' },
  { from: 'bot', text: 'Listo. Te dejo el link de pago para confirmar:\nhttps://mp.la/akira-2847', extra: 'pago' },
  { from: 'cli', text: '✅ pagado' },
  { from: 'bot', text: '¡Perfecto Sofi! 🎉 Turno confirmado: *Sábado 14:30 — Corte*. Te recordamos 4 hs antes.', extra: 'turno' },
];

function ChatDemo({ compact = false }) {
  const [visibles, setVisibles] = useState(0);
  const [typing, setTyping]     = useState(false);
  const containerRef            = useRef(null);

  useEffect(() => {
    let cancel = false;
    let i = 0;
    const tick = () => {
      if (cancel) return;
      if (i >= CONVERSACION.length) {
        // Reiniciar después de un rato
        setTimeout(() => { if (!cancel) { setVisibles(0); i = 0; tick(); } }, 4500);
        return;
      }
      const msg = CONVERSACION[i];
      if (msg.from === 'bot') {
        setTyping(true);
        setTimeout(() => {
          if (cancel) return;
          setTyping(false);
          setVisibles(v => v + 1);
          i++;
          setTimeout(tick, 1200);
        }, 1100);
      } else {
        setVisibles(v => v + 1);
        i++;
        setTimeout(tick, 900);
      }
    };
    setTimeout(tick, 600);
    return () => { cancel = true; };
  }, []);

  // Auto-scroll al fondo
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibles, typing]);

  return (
    <div className="relative">
      {/* Glow detrás del teléfono */}
      <div className="absolute -inset-8 -z-10 opacity-60"
        style={{
          background: 'radial-gradient(60% 60% at 50% 50%, rgba(0,232,123,0.18), transparent 70%)',
          filter: 'blur(30px)',
        }} />

      {/* Marco de teléfono */}
      <div className="relative mx-auto rounded-[36px] p-2 shadow-2xl"
        style={{
          width: compact ? 280 : 340,
          background: 'linear-gradient(160deg, #1a2638 0%, #0e1520 100%)',
          border: '1px solid rgba(0,232,123,0.20)',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}>
        {/* Notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 rounded-full bg-black z-10" />

        <div className="rounded-[28px] overflow-hidden" style={{ background: '#0b141a' }}>
          {/* Header WhatsApp */}
          <div className="flex items-center gap-3 px-4 pt-7 pb-3"
            style={{ background: '#202c33', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-black"
              style={{ background: 'linear-gradient(135deg, #00e87b, #20ffaa)' }}>
              AK
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">Akira Bot</p>
              <p className="text-[10px] text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                en línea
              </p>
            </div>
            <MoreVertical size={16} className="text-gray-500" />
          </div>

          {/* Conversación */}
          <div ref={containerRef}
            className="px-3 py-3 space-y-2 overflow-y-auto"
            style={{
              height: compact ? 360 : 460,
              background: 'linear-gradient(180deg, #0b141a 0%, #0d1a22 100%)',
              backgroundImage: `radial-gradient(rgba(255,255,255,0.018) 1px, transparent 1px)`,
              backgroundSize: '12px 12px',
            }}>
            {CONVERSACION.slice(0, visibles).map((m, i) => (
              <div key={i}
                className={`flex ${m.from === 'cli' ? 'justify-end' : 'justify-start'}`}
                style={{ animation: 'msgIn 0.3s ease-out both' }}>
                <div className="max-w-[78%] rounded-xl px-3 py-2 shadow-sm relative"
                  style={{
                    background: m.from === 'cli' ? '#005c4b' : '#202c33',
                    color: '#e9edef',
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}>
                  <p className="whitespace-pre-line">{m.text}</p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="text-[9px] text-gray-400">14:2{i}</span>
                    {m.from === 'cli' && <CheckCheck size={11} className="text-sky-400" />}
                  </div>
                  {m.extra === 'pago' && (
                    <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}>
                      <CreditCard size={11} className="text-[#00e87b]" />
                      <span className="text-[10px] text-[#7df3b6]">MercadoPago · $3.500</span>
                    </div>
                  )}
                  {m.extra === 'turno' && (
                    <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)' }}>
                      <Calendar size={11} className="text-indigo-400" />
                      <span className="text-[10px] text-indigo-300">Agregado a Google Calendar</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex justify-start" style={{ animation: 'msgIn 0.2s ease-out' }}>
                <div className="rounded-xl px-3 py-2.5 flex items-center gap-1"
                  style={{ background: '#202c33' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* Input fake */}
          <div className="flex items-center gap-2 px-3 py-2"
            style={{ background: '#1f2c33', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex-1 px-3 py-1.5 rounded-full text-xs text-gray-500"
              style={{ background: '#2a3942' }}>
              Escribe un mensaje
            </div>
            <div className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: '#00a884' }}>
              <Mic size={13} className="text-white" />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: Sección reusable con reveal
// ─────────────────────────────────────────────────────────────
function Section({ id, children, className = '' }) {
  const [ref, shown] = useReveal();
  return (
    <section id={id} ref={ref}
      className={`relative py-20 md:py-28 px-5 md:px-8 ${className}`}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.7s ease-out, transform 0.7s ease-out',
      }}>
      {children}
    </section>
  );
}

function Eyebrow({ children, color = 'var(--accent)' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full"
      style={{
        background: `${color}1a`,
        border: `1px solid ${color}33`,
        color,
      }}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// URGENCY BAR — countdown + cupos pre-lanzamiento (sticky top)
// ─────────────────────────────────────────────────────────────
function UrgencyBar() {
  const cd = useCountdown(LAUNCH_DATE);
  const [segs, setSegs] = useState(0);
  useEffect(() => {
    const i = setInterval(() => {
      setSegs(Math.floor((Math.max(0, LAUNCH_DATE.getTime() - Date.now()) % 60000) / 1000));
    }, 1000);
    return () => clearInterval(i);
  }, []);
  if (cd.llegado) return null;

  const fmt = (n) => String(n).padStart(2, '0');
  const cuposLibres = CUPOS_TOTALES_LANDING - CUPOS_TOMADOS_LANDING;

  return (
    <div className="relative z-[200]"
      style={{
        background: 'linear-gradient(90deg, #020f08 0%, #041a0d 50%, #020f08 100%)',
        borderBottom: '1px solid rgba(0,232,123,0.22)',
        color: 'var(--text)',
      }}>
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-center flex-wrap gap-x-3 gap-y-1 text-[12px] md:text-[13px] font-semibold leading-tight">
        <span style={{ color: '#f59e0b', fontWeight: 700 }}>🚀 Preventa Exclusiva</span>
        <span style={{ color: 'var(--muted)' }}>·</span>
        <span style={{ color: 'var(--text2)' }}>
          Faltan{' '}
          <span style={{
            fontVariantNumeric: 'tabular-nums',
            color: '#00e87b',
            fontWeight: 800,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>
            {cd.d}d {fmt(cd.h)}h {fmt(cd.m)}m {fmt(segs)}s
          </span>
          {' '}para el lanzamiento
        </span>
        <span className="hidden sm:inline" style={{ color: 'var(--muted)' }}>·</span>
        <span className="hidden sm:inline" style={{ color: '#f59e0b' }}>
          Solo quedan <strong>{cuposLibres} cupos</strong> con 20% OFF
        </span>
        <span style={{ color: 'var(--muted)' }}>·</span>
        <Link to="/register" style={{ color: '#00e87b', fontWeight: 800, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Reservar mi lugar →
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav className="sticky top-0 inset-x-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(7,12,18,0.85)' : 'rgba(7,12,18,0.55)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        borderBottom: scrolled ? '1px solid rgba(30,45,61,0.6)' : '1px solid transparent',
      }}>
      <div className="max-w-6xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}>
            <Bot size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <span className="font-bold text-base text-white">Akira<span style={{ color: 'var(--accent)' }}> Cloud</span></span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm font-medium" style={{ color: 'var(--text2)' }}>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#crm"      className="hover:text-white transition-colors">CRM</a>
          <a href="#precios"  className="hover:text-white transition-colors">Precios</a>
          <a href="#faq"      className="hover:text-white transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm font-medium px-3 py-1.5 hidden sm:inline" style={{ color: 'var(--text2)' }}>
            Iniciar sesión
          </Link>
          <Link to="/register" className="btn-primary text-sm">
            Probar gratis <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────
function Hero() {
  const cd = useCountdown(LAUNCH_DATE);
  return (
    <header className="relative pt-32 pb-20 md:pt-40 md:pb-28 px-5 md:px-8 overflow-hidden">
      {/* Background: orbs + grid */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(0,232,123,0.16) 0%, transparent 70%)',
            filter: 'blur(20px)',
            animation: 'orbFloat1 14s ease-in-out infinite',
          }} />
        <div className="absolute -bottom-40 right-0 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)',
            filter: 'blur(20px)',
            animation: 'orbFloat2 18s ease-in-out infinite',
          }} />
        <div className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 30%, black, transparent)',
          }} />
      </div>

      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-20 items-center">
        {/* Copy */}
        <div className="text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5 animate-fade-up"
            style={{ background: 'rgba(0,232,123,0.08)', border: '1px solid rgba(0,232,123,0.22)' }}>
            <Sparkles size={11} className="text-[var(--accent)]" />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#7df3b6' }}>
              {cd.llegado ? 'Disponible ahora' : `Lanzamiento en ${cd.d}d ${cd.h}h ${cd.m}m`}
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-white animate-fade-up"
            style={{ animationDelay: '80ms' }}>
            Tu bot de WhatsApp{' '}
            <span style={{
              background: 'linear-gradient(120deg, #00e87b 0%, #20ffaa 50%, #7df3b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              atiende, agenda y cobra solo.
            </span>
          </h1>

          <p className="mt-5 text-lg md:text-xl leading-relaxed max-w-xl mx-auto lg:mx-0 animate-fade-up"
            style={{ color: 'var(--text2)', animationDelay: '160ms' }}>
            Akira responde como una persona, agenda en tu Google Calendar, te cobra por MercadoPago
            y te recuerda los clientes que están por irse. <strong className="text-white">Listo en 5 minutos.</strong>
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3 animate-fade-up"
            style={{ animationDelay: '240ms' }}>
            <Link to="/register" className="btn-primary text-base px-6 py-3">
              Empezar gratis <ArrowRight size={16} />
            </Link>
            <a href="#demo" className="btn-secondary text-base px-6 py-3">
              Ver demo en vivo
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs animate-fade-up"
            style={{ color: 'var(--muted)', animationDelay: '320ms' }}>
            <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-[var(--accent)]" /> Sin tarjeta</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-[var(--accent)]" /> 100 mensajes gratis</span>
            <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-[var(--accent)]" /> Cancelás cuando quieras</span>
          </div>
        </div>

        {/* Visual: WhatsApp demo */}
        <div className="flex justify-center animate-fade-up" style={{ animationDelay: '200ms' }}>
          <ChatDemo />
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// CÓMO FUNCIONA — 3 pasos
// ─────────────────────────────────────────────────────────────
const PASOS = [
  {
    n: '01',
    icon: Zap,
    title: 'Conectás tu WhatsApp',
    desc: 'Escaneás un QR como en WhatsApp Web. Tarda 30 segundos.',
  },
  {
    n: '02',
    icon: Bot,
    title: 'Cargás tu negocio',
    desc: 'Servicios, precios, horarios y duración. Akira aprende a venderlos.',
  },
  {
    n: '03',
    icon: Sparkles,
    title: 'Listo. Akira atiende sola.',
    desc: 'Responde, agenda, cobra y te avisa cada vez que confirma un turno.',
  },
];

function ComoFunciona() {
  return (
    <Section id="como-funciona">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Eyebrow>Cómo funciona</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            De cero a vendiendo en <span className="text-[var(--accent)]">5 minutos</span>
          </h2>
          <p className="mt-3 text-base" style={{ color: 'var(--text2)' }}>
            Sin código, sin instalación. Funciona en tu mismo número de WhatsApp Business.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {PASOS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={p.n} className="card card-glow group relative overflow-hidden"
                style={{ animation: `fadeUp 0.6s ease-out ${i * 80}ms both` }}>
                <div className="absolute top-0 right-0 text-7xl font-black opacity-[0.04] select-none leading-none p-4"
                  style={{ color: 'var(--accent)' }}>
                  {p.n}
                </div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                  style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}>
                  <Icon size={20} className="text-[var(--accent)]" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1.5">{p.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN CRM — destaca las 3 features nuevas
// ─────────────────────────────────────────────────────────────
function CrmSection() {
  return (
    <Section id="crm">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Eyebrow color="#a5b4fc">Nuevo · CRM integrado</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            Cada cliente es{' '}
            <span style={{
              background: 'linear-gradient(120deg, #a5b4fc 0%, #c4b5fd 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              una oportunidad de venta
            </span>
          </h2>
          <p className="mt-3 text-base" style={{ color: 'var(--text2)' }}>
            Akira conoce a cada uno de tus clientes y los hace volver, sin que muevas un dedo.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* CARD 1: CRM */}
          <CrmCard
            icon={Users}
            color="#a5b4fc"
            title="Perfil completo de cada cliente"
            desc="Notas privadas, etiquetas (VIP, Frecuente, Alergia), historial de turnos, total gastado y conversaciones recientes en un solo lugar."
            visual={<MockClienteCard />}
          />

          {/* CARD 2: Recordatorios por servicio */}
          <CrmCard
            icon={Bell}
            color="#7dd3fc"
            title="Recordatorios automáticos por servicio"
            desc="Configurá cada cuántos días recordarle a tus clientes que vuelvan. Akira los contacta con un mensaje natural y les ofrece turno."
            visual={<MockRecordatorio />}
          />

          {/* CARD 3: Lista de espera */}
          <CrmCard
            icon={Hourglass}
            color="#fbbf24"
            title="Lista de espera inteligente"
            desc="Si alguien cancela, Akira le ofrece el slot al primero de la lista por WhatsApp. Si no responde en 15 min, pasa al siguiente."
            visual={<MockWaitlist />}
          />
        </div>
      </div>
    </Section>
  );
}

function CrmCard({ icon: Icon, color, title, desc, visual }) {
  return (
    <div className="card card-glow p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}1a`, border: `1px solid ${color}40` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <h3 className="text-lg font-semibold text-white leading-tight">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text2)' }}>{desc}</p>
      <div className="mt-auto">
        {visual}
      </div>
    </div>
  );
}

// ─── Mocks visuales para la sección CRM ─────────────────────
function MockClienteCard() {
  return (
    <div className="rounded-xl p-3"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
          SP
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Sofía P.</p>
          <p className="text-[10px] text-gray-500">+54 9 11 5687 4421</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-2.5">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,232,123,0.12)', color: '#7df3b6', border: '1px solid rgba(0,232,123,0.22)' }}>VIP</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,232,123,0.12)', color: '#7df3b6', border: '1px solid rgba(0,232,123,0.22)' }}>Frecuente</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.10)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.22)' }}>Alergia tinte</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-800/60">
        <div className="text-center"><p className="text-sm font-bold text-white">12</p><p className="text-[9px] text-gray-500">turnos</p></div>
        <div className="text-center"><p className="text-sm font-bold text-green-400">$48k</p><p className="text-[9px] text-gray-500">gastado</p></div>
        <div className="text-center"><p className="text-sm font-bold text-cyan-400">5d</p><p className="text-[9px] text-gray-500">último</p></div>
      </div>
    </div>
  );
}

function MockRecordatorio() {
  return (
    <div className="rounded-xl p-3"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)' }}>
          <Bell size={11} className="text-cyan-400" />
        </div>
        <p className="text-xs font-semibold text-white">Corte de cabello</p>
        <span className="text-[10px] ml-auto text-cyan-400">cada 30 d</span>
      </div>
      <div className="rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed"
        style={{ background: '#005c4b', color: '#e9edef' }}>
        ¡Hola Carlos! 👋 Pasaron <strong>30 días</strong> desde tu último corte. ¿Reservamos?
      </div>
      <p className="text-[9px] text-gray-600 mt-2 italic">Auto-enviado por Akira a las 10:00 AM</p>
    </div>
  );
}

function MockWaitlist() {
  const items = [
    { n: 'Lucía F.', tel: '+54 11 4567', oferta: true },
    { n: 'Diego H.', tel: '+54 9 351 22', oferta: false },
    { n: 'Camila V.', tel: '+54 9 221 78', oferta: false },
  ];
  return (
    <div className="rounded-xl p-3"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-2">Sábado 14:30 — 3 esperando</p>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
            style={{
              background: it.oferta ? 'rgba(245,158,11,0.07)' : 'transparent',
              border: `1px solid ${it.oferta ? 'rgba(245,158,11,0.22)' : 'var(--border)'}`,
            }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
              {it.n[0]}
            </div>
            <p className="text-xs text-white flex-1">{it.n}</p>
            {it.oferta && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                <Bell size={8} /> oferta
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FEATURES GRID
// ─────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: MessageSquare, color: '#00e87b', title: 'IA que entiende contexto',  desc: 'LLaMA 3.3 70B. Responde como una persona — entiende ironía, sarcasmo y mensajes confusos.' },
  { icon: Calendar,      color: '#a5b4fc', title: 'Google Calendar integrado', desc: 'Consulta disponibilidad real, crea y cancela turnos automáticamente. Sin choque de horarios.' },
  { icon: CreditCard,    color: '#7dd3fc', title: 'Cobros con MercadoPago',    desc: 'Genera link de pago, espera la confirmación y recién ahí confirma el turno. Anti no-show.' },
  { icon: Mic,           color: '#f9a8d4', title: 'Audios → Whisper + Rime',   desc: 'Transcribe los audios que mandan tus clientes y responde con voz natural. Como un humano.' },
  { icon: BellRing,      color: '#fbbf24', title: 'Recordatorios automáticos', desc: '24 h, 4 h y 30 min antes del turno. Reduce no-shows hasta un 70%.' },
  { icon: Shield,        color: '#34d399', title: 'Tus datos cifrados',        desc: 'AES-256-GCM en reposo. Tus API keys y conversaciones nunca viajan en plano.' },
];

function Features() {
  return (
    <Section id="features">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Eyebrow>Features</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            Todo lo que tu negocio necesita
          </h2>
          <p className="mt-3 text-base" style={{ color: 'var(--text2)' }}>
            Pensado para barberías, consultorios, peluquerías, estética, alojamientos y agencias.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="card card-glow flex flex-col gap-3"
                style={{ animation: `fadeUp 0.5s ease-out ${i * 60}ms both` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${f.color}1a`, border: `1px solid ${f.color}40` }}>
                  <Icon size={18} style={{ color: f.color }} />
                </div>
                <h3 className="text-base font-semibold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// PRICING
// ─────────────────────────────────────────────────────────────
const PLANES = [
  {
    nombre: 'Básico',
    mensual: 15000,
    anual:   144000,
    sub: 'Para negocios que empiezan',
    features: [
      '1 número de WhatsApp',
      'Respuestas automáticas con IA',
      '500 mensajes/mes',
      'Horarios configurables',
      'Modo pausa',
    ],
    cta: 'Empezar',
    highlight: false,
  },
  {
    nombre: 'Pro',
    mensual: 35000,
    anual:   336000,
    sub: 'El más popular',
    features: [
      '1 número de WhatsApp',
      'Mensajes ilimitados',
      'Agenda inteligente + MercadoPago',
      'CRM de clientes + recordatorios',
      'Lista de espera automática',
      'Entiende mensajes de voz',
      'Notificaciones al dueño',
    ],
    cta: 'Empezar',
    highlight: true,
    badge: 'Más elegido',
  },
  {
    nombre: 'Agencia',
    mensual: 80000,
    anual:   768000,
    sub: 'Para agencias y revendedores',
    features: [
      'Hasta 5 WhatsApp',
      'Todo el plan Pro',
      'Panel multi-cliente',
      'Soporte dedicado',
      'Programa de referidos',
    ],
    cta: 'Empezar',
    highlight: false,
  },
];

const CUPOS_TOMADOS_LANDING = 47;
const CUPOS_TOTALES_LANDING = 100;

function Pricing() {
  const [anual, setAnual] = useState(false);
  return (
    <Section id="precios">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Eyebrow>Precios</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            Simple. Sin sorpresas.
          </h2>
          <p className="mt-3 text-base" style={{ color: 'var(--text2)' }}>
            Cancelás cuando quieras. Sin permanencia, sin letra chica.
          </p>
        </div>

        {/* Toggle mensual / anual */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <button onClick={() => setAnual(false)}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-all"
            style={!anual
              ? { background: 'rgba(0,232,123,0.12)', color: 'var(--accent)', border: '1px solid rgba(0,232,123,0.25)' }
              : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            Mensual
          </button>
          <button onClick={() => setAnual(true)}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-all flex items-center gap-2"
            style={anual
              ? { background: 'rgba(0,232,123,0.12)', color: 'var(--accent)', border: '1px solid rgba(0,232,123,0.25)' }
              : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            Anual
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b40' }}>
              -20%
            </span>
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {PLANES.map((p, i) => {
            const precio = anual ? Math.round(p.anual / 12) : p.mensual;
            return (
              <div key={p.nombre}
                className="relative rounded-2xl p-6 flex flex-col"
                style={{
                  background: p.highlight
                    ? 'linear-gradient(165deg, rgba(0,232,123,0.06) 0%, var(--surface) 60%)'
                    : 'var(--surface)',
                  border: p.highlight ? '1px solid rgba(0,232,123,0.35)' : '1px solid var(--border)',
                  boxShadow: p.highlight
                    ? '0 8px 40px -8px rgba(0,232,123,0.18), inset 0 1px 0 rgba(0,232,123,0.06)'
                    : '0 2px 16px rgba(0,0,0,0.3)',
                  transform: p.highlight ? 'translateY(-6px)' : 'translateY(0)',
                  animation: `fadeUp 0.6s ease-out ${i * 80}ms both`,
                }}>
                {p.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: 'var(--accent)', color: '#020f08', boxShadow: '0 4px 16px rgba(0,232,123,0.4)' }}>
                    {p.badge}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold" style={{ color: p.highlight ? 'var(--accent)' : 'var(--text2)' }}>
                    {p.nombre}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{p.sub}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-xs text-gray-500">$</span>
                    <span className="text-4xl font-bold text-white">{precio.toLocaleString('es-AR')}</span>
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>
                      /mes{anual && ' (anual)'}
                    </span>
                  </div>
                  {anual && (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                      Total: ${p.anual.toLocaleString('es-AR')}/año
                    </p>
                  )}
                </div>
                <ul className="mt-6 space-y-2.5 flex-1">
                  {p.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
                      <Check size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/register" className={p.highlight ? 'btn-primary mt-6' : 'btn-secondary mt-6'}>
                  {p.cta}
                  <ArrowRight size={14} />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// TESTIMONIOS
// ─────────────────────────────────────────────────────────────
const TESTIMONIOS = [
  { nombre: 'Valeria M.', negocio: 'Centro de estética · Buenos Aires',  texto: 'Antes perdía turnos todos los fines de semana. Ahora Akira los agenda y cobra solo. Me cambió la vida.', avatar: 'https://i.pravatar.cc/64?img=5' },
  { nombre: 'Carlos R.',  negocio: 'Barbería · Córdoba',                  texto: 'Mis clientes me dicen que parezco siempre disponible. No saben que es un bot — y eso es lo mejor.',     avatar: 'https://i.pravatar.cc/64?img=12' },
  { nombre: 'Laura T.',   negocio: 'Consultorio nutricional · Rosario',   texto: 'En una semana recuperé el costo del plan con un solo cliente que antes se habría ido sin respuesta.', avatar: 'https://i.pravatar.cc/64?img=9' },
  { nombre: 'Marcos D.',  negocio: 'Inmobiliaria · Mendoza',              texto: 'Recibo consultas a las 11PM. Antes las perdía todas. Ahora Akira las responde y agenda reuniones.',  avatar: 'https://i.pravatar.cc/64?img=15' },
  { nombre: 'Romina P.',  negocio: 'Psicóloga independiente · CABA',      texto: 'Configurar todo me llevó 20 minutos. Y desde entonces no perdí ni un turno. Vale cada peso.',         avatar: 'https://i.pravatar.cc/64?img=20' },
  { nombre: 'Sebastián L.', negocio: 'Cabaña · Bariloche',                texto: 'Reservas a la madrugada cuando estoy durmiendo. Akira responde, cobra la seña y me notifica.',         avatar: 'https://i.pravatar.cc/64?img=33' },
];

function Testimonios() {
  return (
    <Section id="testimonios">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Eyebrow>Testimonios</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            Negocios reales, resultados reales
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TESTIMONIOS.map((t, i) => (
            <div key={i} className="card flex flex-col"
              style={{ animation: `fadeUp 0.5s ease-out ${i * 60}ms both` }}>
              <Quote size={20} className="text-[var(--accent)] opacity-50 mb-2" />
              <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--text)' }}>
                "{t.texto}"
              </p>
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-800/60">
                <img src={t.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{t.nombre}</p>
                  <p className="text-[10px] text-gray-500 truncate">{t.negocio}</p>
                </div>
                <div className="ml-auto flex items-center gap-0.5">
                  {[1,2,3,4,5].map(s => <Star key={s} size={10} className="text-yellow-400 fill-yellow-400" />)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────────────────────
const FAQS = [
  { q: '¿Akira reemplaza mi WhatsApp Business?', a: 'No. Akira se conecta a tu mismo número de WhatsApp Business (vía QR como WhatsApp Web). Vos podés intervenir cualquier chat cuando quieras y el bot deja de responder ese chat puntual.' },
  { q: '¿Mis clientes se dan cuenta que es un bot?', a: 'En general no. Akira usa LLaMA 3.3 (uno de los modelos más avanzados del mundo), responde en tono natural, entiende contexto y se adapta a tu forma de hablar.' },
  { q: '¿Cómo cobra los turnos?', a: 'Generamos un link de MercadoPago automáticamente. El turno se confirma SOLO cuando el cliente paga. Esto reduce no-shows drásticamente. También podés usar transferencia (alias/CBU).' },
  { q: '¿Qué pasa con los días que no atiendo?', a: 'Configurás horarios día a día. Activás "modo pausa" para feriados o vacaciones. Bloqueás fechas puntuales desde el panel.' },
  { q: '¿Puedo cancelar cuando quiera?', a: 'Sí. Sin permanencia, sin letra chica, sin penalización. Cancelás desde el panel y listo.' },
  { q: '¿Mis datos están seguros?', a: 'Sí. Todas tus API keys están cifradas con AES-256-GCM. Tu información nunca se comparte. Hosteado en infraestructura cloud con cifrado en tránsito y en reposo.' },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden transition-colors"
      style={{
        background: open ? 'var(--surface)' : 'var(--surface2)',
        border: `1px solid ${open ? 'rgba(0,232,123,0.25)' : 'var(--border)'}`,
      }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span className="text-sm font-medium text-white">{q}</span>
        <ChevronDown size={16}
          className="flex-shrink-0 transition-transform"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            color: open ? 'var(--accent)' : 'var(--muted)',
          }} />
      </button>
      <div className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? 200 : 0 }}>
        <p className="px-4 pb-4 text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
          {a}
        </p>
      </div>
    </div>
  );
}

function Faq() {
  return (
    <Section id="faq">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <Eyebrow>Preguntas frecuentes</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            ¿Tenés dudas?
          </h2>
        </div>
        <div className="space-y-2.5">
          {FAQS.map((f, i) => <FaqItem key={i} {...f} />)}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// CTA FINAL
// ─────────────────────────────────────────────────────────────
function CtaFinal() {
  return (
    <Section className="!pt-12 !pb-32">
      <div className="max-w-4xl mx-auto">
        <div className="relative rounded-3xl p-10 md:p-16 text-center overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, rgba(0,232,123,0.10) 0%, var(--surface) 60%)',
            border: '1px solid rgba(0,232,123,0.30)',
            boxShadow: '0 20px 60px -20px rgba(0,232,123,0.25), inset 0 1px 0 rgba(0,232,123,0.08)',
          }}>
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(0,232,123,0.20), transparent 70%)', filter: 'blur(20px)' }} />

          <Sparkles size={28} className="text-[var(--accent)] mx-auto mb-4 animate-float" />
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight max-w-2xl mx-auto">
            Empezá hoy. Tu próximo cliente ya te está escribiendo.
          </h2>
          <p className="mt-4 text-base max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>
            Probalo gratis. Sin tarjeta. Si no te sirve, lo borrás y listo.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="btn-primary text-base px-6 py-3">
              Crear mi cuenta gratis <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="btn-secondary text-base px-6 py-3">
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="px-5 md:px-8 pt-12 pb-10"
      style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-10">
          <div>
            <Link to="/" className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}>
                <Bot size={16} style={{ color: 'var(--accent)' }} />
              </div>
              <span className="font-bold text-base text-white">Akira<span style={{ color: 'var(--accent)' }}> Cloud</span></span>
            </Link>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              Tu bot de WhatsApp con IA. Atiende, agenda y cobra solo.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white mb-3">Producto</p>
            <ul className="space-y-2 text-xs" style={{ color: 'var(--text2)' }}>
              <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              <li><a href="#crm"      className="hover:text-white transition-colors">CRM</a></li>
              <li><a href="#precios"  className="hover:text-white transition-colors">Precios</a></li>
              <li><a href="#faq"      className="hover:text-white transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white mb-3">Empresa</p>
            <ul className="space-y-2 text-xs" style={{ color: 'var(--text2)' }}>
              <li><Link to="/terminos"   className="hover:text-white transition-colors">Términos</Link></li>
              <li><Link to="/privacidad" className="hover:text-white transition-colors">Privacidad</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white mb-3">Conectate</p>
            <div className="flex items-center gap-2">
              <a href="#" className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--surface3)]"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <Github size={14} style={{ color: 'var(--text2)' }} />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--surface3)]"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <Linkedin size={14} style={{ color: 'var(--text2)' }} />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--surface3)]"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <Globe size={14} style={{ color: 'var(--text2)' }} />
              </a>
            </div>
          </div>
        </div>
        <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-3"
          style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            © {new Date().getFullYear()} Akira Cloud. Todos los derechos reservados.
          </p>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Hecho con <span className="text-[var(--accent)]">●</span> en Argentina
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────
// PÁGINA
// ─────────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', overflow: 'hidden' }}>
      <UrgencyBar />
      <Nav />
      <main>
        <Hero />
        <ComoFunciona />
        {/* Demo en vivo destacado */}
        <Section id="demo" className="!py-16">
          <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Eyebrow color="#7dd3fc">Demo en vivo</Eyebrow>
              <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight">
                Mirá una conversación real.
              </h2>
              <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--text2)' }}>
                Akira no solo "responde". Entiende el pedido, ofrece horarios disponibles
                en tiempo real, genera el link de pago, espera la confirmación y agenda en tu calendario.
                Todo en menos de un minuto.
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  'Conversación natural — no parece un bot',
                  'Slots de tu calendario real, sin choques',
                  'Cobro y confirmación automática',
                  'Vos te enterás cuando ya está agendado',
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
                    <CheckCircle size={15} className="mt-0.5 flex-shrink-0 text-[var(--accent)]" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-center">
              <ChatDemo />
            </div>
          </div>
        </Section>
        <CrmSection />
        <Features />
        <Pricing />
        <Testimonios />
        <Faq />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  );
}
