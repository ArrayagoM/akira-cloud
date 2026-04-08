import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { LAUNCH_DATE } from './PreLanzamiento';
import {
  Bot, Calendar, CreditCard, Mic, Zap, Shield, CheckCircle, ArrowRight,
  MessageSquare, Clock, Star, Github, Linkedin, Globe, Code2,
  PauseCircle, BellRing, GitBranch, ChevronRight, Sparkles,
  TrendingUp, Users, DollarSign, Send, Scissors, Stethoscope,
  ShoppingBag, Building2, Award, BarChart2, ThumbsUp, Quote,
} from 'lucide-react';
import { useScrollReveal, useScrollRevealGroup } from '../hooks/useScrollReveal';

// ─────────────────────────────────────────────────────────────
// HOOK: count-up animado al entrar al viewport
// ─────────────────────────────────────────────────────────────
function useCountUp(target, duration = 2200) {
  const [count, setCount]     = useState(0);
  const [started, setStarted] = useState(false);
  const ref                   = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const startTime = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min((Date.now() - startTime) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.floor(eased * target));
      if (progress >= 1) { setCount(target); clearInterval(timer); }
    }, 16);
    return () => clearInterval(timer);
  }, [started, target, duration]);

  return [count, ref];
}

// ─────────────────────────────────────────────────────────────
// DATOS SIMULADOS — listos para reemplazar por API real
// ─────────────────────────────────────────────────────────────
const actividadReciente = [
  { nombre: 'Valentina G.', ciudad: 'Buenos Aires', plan: 'Pro',     avatar: 'https://i.pravatar.cc/40?img=1',  color: '#a78bfa' },
  { nombre: 'Carlos M.',    ciudad: 'Córdoba',       plan: 'Básico',  avatar: 'https://i.pravatar.cc/40?img=12', color: '#60a5fa' },
  { nombre: 'Lucía F.',     ciudad: 'Rosario',       plan: 'Pro',     avatar: 'https://i.pravatar.cc/40?img=5',  color: '#00e87b' },
  { nombre: 'Martín R.',    ciudad: 'Mendoza',       plan: 'Agencia', avatar: 'https://i.pravatar.cc/40?img=13', color: '#f59e0b' },
  { nombre: 'Sofía P.',     ciudad: 'Tucumán',       plan: 'Pro',     avatar: 'https://i.pravatar.cc/40?img=9',  color: '#f87171' },
  { nombre: 'Diego H.',     ciudad: 'Mar del Plata', plan: 'Básico',  avatar: 'https://i.pravatar.cc/40?img=15', color: '#34d399' },
  { nombre: 'Ana K.',       ciudad: 'Salta',         plan: 'Pro',     avatar: 'https://i.pravatar.cc/40?img=20', color: '#fb923c' },
  { nombre: 'Roberto L.',   ciudad: 'Neuquén',       plan: 'Agencia', avatar: 'https://i.pravatar.cc/40?img=18', color: '#e879f9' },
  { nombre: 'Camila V.',    ciudad: 'La Plata',      plan: 'Pro',     avatar: 'https://i.pravatar.cc/40?img=25', color: '#2dd4bf' },
  { nombre: 'Facundo B.',   ciudad: 'Bahía Blanca',  plan: 'Básico',  avatar: 'https://i.pravatar.cc/40?img=22', color: '#60a5fa' },
  { nombre: 'Natalia O.',   ciudad: 'Posadas',       plan: 'Pro',     avatar: 'https://i.pravatar.cc/40?img=47', color: '#a78bfa' },
  { nombre: 'Pablo S.',     ciudad: 'San Luis',      plan: 'Pro',     avatar: 'https://i.pravatar.cc/40?img=33', color: '#00e87b' },
];

const crecimientoData = [
  { mes: 'Ago',  val: 12  },
  { mes: 'Sep',  val: 31  },
  { mes: 'Oct',  val: 58  },
  { mes: 'Nov',  val: 97  },
  { mes: 'Dic',  val: 143 },
  { mes: 'Ene',  val: 196 },
  { mes: 'Feb',  val: 248 },
  { mes: 'Hoy',  val: 267 },
];
const maxVal = Math.max(...crecimientoData.map(d => d.val));

// Reseñas iniciales (fake — listas para reemplazar con BD real)
const resenasIniciales = [
  {
    id: 'r1',
    nombre: 'Valeria M.',
    negocio: 'Centro de estética · Buenos Aires',
    rating: 5,
    texto: 'Antes perdía turnos todos los fines de semana. Ahora Akira los agenda y cobra solo. Me cambió la vida.',
    avatar: 'https://i.pravatar.cc/48?img=5',
    likes: 24,
  },
  {
    id: 'r2',
    nombre: 'Carlos R.',
    negocio: 'Barbería · Córdoba',
    rating: 5,
    texto: 'Mis clientes me dicen que parezco siempre disponible. No saben que es un bot — y eso es lo mejor.',
    avatar: 'https://i.pravatar.cc/48?img=12',
    likes: 18,
  },
  {
    id: 'r3',
    nombre: 'Laura T.',
    negocio: 'Consultorio nutricional · Rosario',
    rating: 5,
    texto: 'En una semana recuperé el costo del plan con un solo cliente que antes se habría ido sin respuesta.',
    avatar: 'https://i.pravatar.cc/48?img=9',
    likes: 31,
  },
  {
    id: 'r4',
    nombre: 'Marcos D.',
    negocio: 'Inmobiliaria · Mendoza',
    rating: 5,
    texto: 'Recibo consultas a las 11PM. Antes las perdía todas. Ahora Akira las responde y agenda reuniones. Increíble.',
    avatar: 'https://i.pravatar.cc/48?img=15',
    likes: 14,
  },
  {
    id: 'r5',
    nombre: 'Romina P.',
    negocio: 'Psicóloga independiente · CABA',
    rating: 5,
    texto: 'Configurar todo me llevó 20 minutos. Y desde entonces no perdí ni un turno. Vale cada peso.',
    avatar: 'https://i.pravatar.cc/48?img=20',
    likes: 27,
  },
  {
    id: 'r6',
    nombre: 'Federico A.',
    negocio: 'Estudio contable · Tucumán',
    rating: 4,
    texto: 'Akira responde las consultas básicas y yo me concentro en el trabajo que realmente importa. Excelente.',
    avatar: 'https://i.pravatar.cc/48?img=33',
    likes: 11,
  },
];

// ─────────────────────────────────────────────────────────────
// URGENCY BAR — countdown pre-lanzamiento
// ─────────────────────────────────────────────────────────────
const CUPOS_TOMADOS_LANDING = 47;
const CUPOS_TOTALES_LANDING = 100;

function UrgencyBar() {
  const msRestante = Math.max(0, LAUNCH_DATE.getTime() - Date.now());
  const [diff, setDiff] = useState(msRestante);

  useEffect(() => {
    if (diff === 0) return;
    const iv = setInterval(() => setDiff(Math.max(0, LAUNCH_DATE.getTime() - Date.now())), 1000);
    return () => clearInterval(iv);
  }, []);

  // Si ya lanzó, no mostrar la barra
  if (diff === 0) return null;

  const dias  = Math.floor(diff / 86_400_000);
  const horas = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins  = Math.floor((diff % 3_600_000) / 60_000);
  const segs  = Math.floor((diff % 60_000) / 1_000);

  const fmt = (n) => String(n).padStart(2, '0');
  const cuposLibres = CUPOS_TOTALES_LANDING - CUPOS_TOMADOS_LANDING;

  return (
    <div style={{
      background: 'linear-gradient(90deg, #020f08 0%, #041a0d 100%)',
      borderBottom: '1px solid rgba(0,232,123,0.2)',
      color: 'var(--text)', textAlign: 'center',
      padding: '10px 16px', fontSize: 13, fontWeight: 600,
      position: 'relative', zIndex: 200, lineHeight: 1.6,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexWrap: 'wrap', gap: '12px',
    }}>
      <span style={{ color: '#f59e0b', fontWeight: '700' }}>🚀 Preventa Exclusiva</span>
      <span style={{ color: 'var(--muted)' }}>·</span>
      <span>
        Faltan{' '}
        <span style={{ fontVariantNumeric: 'tabular-nums', color: '#00e87b', fontWeight: '800', fontFamily: 'monospace' }}>
          {dias}d {fmt(horas)}h {fmt(mins)}m {fmt(segs)}s
        </span>
        {' '}para el lanzamiento
      </span>
      <span style={{ color: 'var(--muted)' }}>·</span>
      <span style={{ color: '#f59e0b' }}>Solo quedan <strong>{cuposLibres} cupos</strong> con 20% OFF</span>
      <span style={{ color: 'var(--muted)' }}>·</span>
      <Link to="/register" style={{ color: '#00e87b', fontWeight: '800', textDecoration: 'underline' }}>
        Reservar mi lugar →
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LIVE ACTIVITY TOAST — notificaciones de nuevos usuarios
// ─────────────────────────────────────────────────────────────
function LiveActivityToast() {
  const [visible, setVisible] = useState(false);
  const [idx, setIdx]         = useState(0);

  // Primer disparo a los 4 segundos
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(t);
  }, []);

  // Cada 9 segundos cambia al siguiente y muestra
  useEffect(() => {
    const iv = setInterval(() => {
      setIdx(i => (i + 1) % actividadReciente.length);
      setVisible(true);
    }, 9000);
    return () => clearInterval(iv);
  }, []);

  // Oculta después de 5 segundos de estar visible
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [visible, idx]);

  const item = actividadReciente[idx];

  return (
    <div
      className="fixed bottom-6 left-6 z-40"
      style={{
        transition: 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease',
        transform:  visible ? 'translateY(0) scale(1)' : 'translateY(120%) scale(0.9)',
        opacity:    visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
        style={{
          background: 'var(--surface)',
          border:     '1px solid var(--border)',
          maxWidth:   288,
          boxShadow:  '0 8px 32px rgba(0,0,0,0.5)',
        }}>
        <img src={item.avatar} alt={item.nombre}
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          style={{ border: `2px solid ${item.color}40` }}
          onError={e => { e.target.style.display='none'; }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white truncate">{item.nombre} · {item.ciudad}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Activó el plan <span className="font-semibold" style={{ color: 'var(--accent)' }}>{item.plan}</span> ✓
          </p>
        </div>
        <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: 'var(--accent)' }} />
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
        background:    scrolled ? 'rgba(7,12,18,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom:   scrolled ? '1px solid rgba(30,45,61,0.8)' : 'none',
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
          {['#como-funciona','#beneficios','#reseñas','#precios'].map((href, i) => (
            <a key={i} href={href} className="link-underline hover:text-white transition-colors duration-150"
              style={{ color: 'var(--text2)' }}>
              {['Cómo funciona','Beneficios','Reseñas','Precios'][i]}
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
  const [liveUsers, setLiveUsers] = useState(267);
  const [chatStep, setChatStep]   = useState(0);
  const [showPago, setShowPago]   = useState(false);

  // usuarios crecen cada ~25s
  useEffect(() => {
    const iv = setInterval(() => setLiveUsers(n => n + 1), 25000 + Math.random() * 10000);
    return () => clearInterval(iv);
  }, []);

  // Chat animado paso a paso
  const chatMsgs = [
    { from: 'client', text: '¿Tienen turno mañana a la tarde?', time: '14:31' },
    { from: 'bot',    text: '¡Hola Lucía! 😊 Tengo disponible:\n• 15:00 — $3.500\n• 16:30 — $3.500\n¿Cuál preferís?', time: '14:31' },
    { from: 'client', text: '16:30 perfecto 🙌', time: '14:32' },
    { from: 'bot',    text: '✅ Turno confirmado — mañana 16:30\n\n💳 Pagá ahora:\nmp.com/akira/turno-lucia\n\n⏳ Link válido 30 min', time: '14:32' },
  ];

  useEffect(() => {
    if (chatStep >= chatMsgs.length) {
      setTimeout(() => setShowPago(true), 800);
      return;
    }
    const delay = chatStep === 0 ? 1200 : chatStep === 1 ? 900 : 700;
    const t = setTimeout(() => setChatStep(s => s + 1), delay);
    return () => clearTimeout(t);
  }, [chatStep]);

  const casos = [
    { emoji: '💈', negocio: 'Peluquería Estilo', resultado: '+$240k/mes', detalle: 'automatiznado turnos y cobros' },
    { emoji: '🏡', negocio: 'Cabañas del Sol',   resultado: '0 reservas perdidas', detalle: 'responde a cualquier hora' },
    { emoji: '🦷', negocio: 'Consultorio Ramírez', resultado: 'Agenda llena', detalle: 'en 2 semanas con IA' },
  ];

  return (
    <section className="relative overflow-hidden" style={{ background: 'var(--bg)', paddingTop: 72 }}>
      {/* Fondo */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.012) 1px,transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(0,232,123,0.07) 0%, transparent 68%)' }} />

      <div className="max-w-6xl mx-auto px-5 py-16 md:py-24 relative z-10">
        <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">

          {/* ── LEFT ── */}
          <div>
            {/* Live badge */}
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6 text-sm font-semibold"
              style={{ background: 'rgba(0,232,123,0.09)', border: '1px solid rgba(0,232,123,0.22)', color: 'var(--accent)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)', flexShrink: 0 }} />
              <span><strong className="text-white">{liveUsers}</strong> negocios activos ahora mismo</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-[56px] font-extrabold text-white leading-[1.1] mb-5" style={{ letterSpacing: '-0.02em' }}>
              Tu WhatsApp vende<br />
              <span style={{ color: 'var(--accent)' }}>mientras dormís.</span>
            </h1>

            {/* Sub */}
            <p className="text-base md:text-lg mb-8 leading-relaxed" style={{ color: 'var(--text2)', maxWidth: 480 }}>
              Akira atiende clientes, agenda turnos y cobra con MercadoPago — <strong className="text-white">automático, 24hs, sin que vos estés</strong>. En menos de 10 minutos tu negocio funciona solo.
            </p>

            {/* ── Oferta preventa ── */}
            {Date.now() < LAUNCH_DATE.getTime() && (
              <div style={{
                background: 'rgba(245,158,11,0.07)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: '14px',
                padding: '14px 18px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: '20px' }}>🎁</span>
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#f59e0b', margin: 0 }}>
                    Preventa: 20% OFF en tu primer mes
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>
                    Solo primeros {CUPOS_TOTALES_LANDING} usuarios · Ya se reservaron {CUPOS_TOMADOS_LANDING} cupos
                  </p>
                </div>
                <Link to="/register" style={{
                  fontSize: '12px', fontWeight: '700', color: '#f59e0b',
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '8px', padding: '6px 14px', textDecoration: 'none', whiteSpace: 'nowrap',
                }}>
                  Reservar →
                </Link>
              </div>
            )}

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <Link to="/register"
                className="btn-primary text-base font-bold"
                style={{ padding: '14px 28px', fontSize: 16, boxShadow: '0 0 32px rgba(0,232,123,0.3)' }}>
                {Date.now() < LAUNCH_DATE.getTime() ? 'Reservar mi cupo con 20% OFF' : 'Empezar gratis — 7 días'} <ArrowRight size={18} />
              </Link>
              <a href="#como-funciona" className="btn-secondary text-base" style={{ padding: '14px 24px' }}>
                Ver demo en 2 min
              </a>
            </div>

            {/* Social proof avatars */}
            <div className="flex flex-wrap items-center gap-4 mb-10">
              <div className="flex -space-x-2.5">
                {[1,5,9,12,20].map((img, i) => (
                  <img key={i} src={`https://i.pravatar.cc/34?img=${img}`} alt=""
                    className="w-9 h-9 rounded-full object-cover"
                    style={{ border: '2px solid var(--bg)' }}
                    onError={e => { e.target.style.display='none'; }} />
                ))}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">+{liveUsers} negocios ya lo usan</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {[1,2,3,4,5].map(i => <Star key={i} size={12} fill="#f59e0b" color="#f59e0b" />)}
                  <span className="text-xs font-bold text-white ml-1">4.9</span>
                  <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>reseñas verificadas</span>
                </div>
              </div>
            </div>

            {/* Mini casos de éxito */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Casos reales de clientes</p>
              <div className="flex flex-col gap-2">
                {casos.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 22 }}>{c.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{c.negocio}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{c.detalle}</p>
                    </div>
                    <span className="ml-auto text-sm font-extrabold flex-shrink-0" style={{ color: 'var(--accent)' }}>{c.resultado}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT — chat animado ── */}
          <div className="relative flex justify-center">
            <div style={{ width: '100%', maxWidth: 380, position: 'relative' }}>

              {/* Card chat */}
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,232,123,0.12)' }}>
                    <Bot size={17} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">Akira IA — Peluquería Estilo</p>
                    <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>● Respondiendo en este momento</p>
                  </div>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0" style={{ background: 'rgba(0,232,123,0.12)', color: 'var(--accent)' }}>24/7</span>
                </div>

                {/* Messages */}
                <div className="p-4 flex flex-col gap-2.5" style={{ minHeight: 240 }}>
                  {chatMsgs.slice(0, chatStep).map((msg, i) => (
                    <div key={i} className={`flex ${msg.from === 'client' ? 'justify-end' : 'justify-start'}`}
                      style={{ animation: 'fadeSlideUp 0.3s ease' }}>
                      <div className="max-w-[84%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-line"
                        style={msg.from === 'client'
                          ? { background: 'var(--accent)', color: '#020f08', borderTopRightRadius: 4 }
                          : { background: 'var(--surface3)', color: 'var(--text)', border: '1px solid var(--border)', borderTopLeftRadius: 4 }}>
                        {msg.text}
                        <p className="text-right mt-1 opacity-50" style={{ fontSize: 10 }}>{msg.time}</p>
                      </div>
                    </div>
                  ))}
                  {/* Typing indicator */}
                  {chatStep < chatMsgs.length && chatStep % 2 === 1 && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface3)', border: '1px solid var(--border)', borderTopLeftRadius: 4 }}>
                        <div className="flex gap-1 items-center">
                          {[0,1,2].map(d => (
                            <span key={d} className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--muted)', animation: `bounce 1s ${d*0.18}s infinite` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pago recibido notification */}
                {showPago && (
                  <div className="mx-4 mb-4 rounded-xl p-3 flex items-center gap-3"
                    style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.3)', animation: 'fadeSlideUp 0.4s ease' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,232,123,0.2)' }}>
                      <DollarSign size={15} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <p className="text-xs font-bold" style={{ color: 'var(--accent)' }}>💸 ¡Pago recibido!</p>
                      <p className="text-xs font-semibold text-white">$3.500 — Turno Lucía 16:30</p>
                    </div>
                    <span className="ml-auto text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent)' }}>✓</span>
                  </div>
                )}
              </div>

              {/* Floating badges */}
              <div className="absolute -left-4 top-8 rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-2 shadow-xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                <Clock size={13} /> Resp. en 2 seg
              </div>
              <div className="absolute -right-4 bottom-20 rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-2 shadow-xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: '#f59e0b' }}>
                <Star size={13} fill="#f59e0b" color="#f59e0b" /> 4.9 promedio
              </div>

              {/* Glow */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-10 blur-2xl" style={{ background: 'rgba(0,232,123,0.18)' }} />
            </div>
          </div>

        </div>
      </div>

      {/* CSS para animaciones del chat */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%            { transform: translateY(-4px); }
        }
      `}</style>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// STATS — contadores animados
// ─────────────────────────────────────────────────────────────
function StatsSection() {
  const [u, uRef] = useCountUp(267);
  const [m, mRef] = useCountUp(18400);
  const [t, tRef] = useCountUp(3200);
  const [r, rRef] = useCountUp(2400000);

  const stats = [
    { ref: uRef, value: u,       suffix: '+',  label: 'Negocios activos',           color: '#00e87b', icon: <Users size={22} />,       format: v => v.toLocaleString('es-AR') },
    { ref: mRef, value: m,       suffix: '+',  label: 'Mensajes este mes',          color: '#60a5fa', icon: <MessageSquare size={22} />, format: v => v.toLocaleString('es-AR') },
    { ref: tRef, value: t,       suffix: '+',  label: 'Turnos agendados',           color: '#a78bfa', icon: <Calendar size={22} />,     format: v => v.toLocaleString('es-AR') },
    { ref: rRef, value: r,       suffix: '',   label: 'Cobrado automáticamente',    color: '#f59e0b', icon: <DollarSign size={22} />,   format: v => `$${(v/1000000).toFixed(1)}M` },
  ];

  return (
    <section className="py-16 relative" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <div key={i} ref={s.ref} className="text-center py-6 px-4 rounded-2xl"
              style={{ background: 'var(--surface2)', border: `1px solid ${s.color}18` }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ background: `${s.color}10`, color: s.color }}>
                {s.icon}
              </div>
              <p className="text-3xl md:text-4xl font-extrabold text-white tabular-nums">
                {s.format(s.value)}{s.suffix}
              </p>
              <p className="text-xs mt-1.5 leading-tight" style={{ color: 'var(--muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// PROBLEMA
// ─────────────────────────────────────────────────────────────
const problemas = [
  { icon: <MessageSquare size={20} />, title: 'Perdés clientes por no responder a tiempo',    desc: 'Llega un mensaje a las 2AM o el fin de semana. No respondés. El cliente se va con la competencia.' },
  { icon: <Clock size={20} />,         title: 'Perdés horas en tareas que se repiten',        desc: 'Responder "¿cuánto cuesta?", "¿tienen turno?" todos los días te roba tiempo que podrías dedicar a crecer.' },
  { icon: <Zap size={20} />,           title: 'Si vos no estás, el negocio para',             desc: 'Vacaciones, descanso, familia — todo queda en pausa. Tu negocio depende 100% de que vos estés disponible.' },
];

function ProblemaSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');
  return (
    <section className="py-24 relative" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-14">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: '#f87171' }}>El problema</span>
          <h2 className="text-4xl font-bold text-white mb-4">¿Te suena familiar?</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>
            La mayoría de los negocios pierde clientes todos los días sin darse cuenta.
          </p>
        </div>
        <div ref={gridRef} className="grid md:grid-cols-3 gap-5">
          {problemas.map((p, i) => (
            <div key={i} className="reveal-up card" style={{ borderColor: 'rgba(248,113,113,0.15)' }}>
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
          <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>↓ Así lo resuelve Akira</p>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// COMO FUNCIONA
// ─────────────────────────────────────────────────────────────
const pasos = [
  { num: '01', titulo: 'Creá tu cuenta',          desc: 'Registrate en un minuto con Google o email. 7 días de prueba gratis, sin tarjeta.' },
  { num: '02', titulo: 'Configurá tu negocio',    desc: 'Cargá tus servicios, precios y horarios por día. Sin conocimientos técnicos.' },
  { num: '03', titulo: 'Conectá WhatsApp',         desc: 'Click en "Iniciar bot" y escaneá el QR. En 30 segundos el bot está activo.' },
  { num: '04', titulo: 'Tu negocio trabaja solo', desc: 'Akira agenda, cobra y avisa. Vos controlás todo desde el panel en tiempo real.' },
];

function ComoFuncionaSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');
  return (
    <section id="como-funciona" className="py-28" style={{ background: 'var(--surface)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>Paso a paso</span>
          <h2 className="text-4xl font-bold text-white mb-4">En 10 minutos estás operando</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>Sin instalar nada. Sin servidores. Sin conocimientos técnicos.</p>
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
// HORIZONTAL SCROLL — Features
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
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {slides.map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full" style={{ background: 'rgba(0,232,123,0.4)' }} />
          ))}
        </div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 text-xs font-semibold flex items-center gap-1 animate-bounce-soft"
          style={{ color: 'var(--accent)', opacity: 0.6 }}>
          <ChevronRight size={16} /> scroll
        </div>
      </div>
    </div>
  );
}

const featureSlides = [
  {
    tag: 'Respuestas automáticas',
    title: 'Respondé clientes sin tocar el celular',
    desc: 'Akira entiende lo que escriben tus clientes y responde de forma natural, con contexto. Incluso entiende los mensajes de audio.',
    icon: <Bot size={40} />,
    color: 'var(--accent)',
    bg: 'rgba(0,232,123,0.06)',
    items: ['Entiende el contexto de la conversación','Escucha y entiende audios','Responde por voz si el cliente lo prefiere','Personalizable para tu negocio'],
  },
  {
    tag: 'Agenda inteligente',
    title: 'Nunca más un doble turno',
    desc: 'Akira consulta tu disponibilidad en tiempo real y agenda, reagenda o cancela turnos automáticamente. Sin que vos intervengas.',
    icon: <Calendar size={40} />,
    color: '#60a5fa',
    bg: 'rgba(59,130,246,0.06)',
    items: ['Agenda propia en tiempo real','Horarios configurables por día','Bloqueo de fechas y feriados','Recordatorios automáticos'],
  },
  {
    tag: 'Cobros automáticos',
    title: 'El turno se confirma cuando pagan',
    desc: 'Genera el link de pago al instante. El turno queda reservado solo cuando el dinero está acreditado. Cero deudores.',
    icon: <CreditCard size={40} />,
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.06)',
    items: ['MercadoPago integrado','Transferencia / alias / CBU','Confirmación automática del turno','Te avisa a vos también'],
  },
  {
    tag: 'Control total',
    title: 'Vos siempre tenés la última palabra',
    desc: 'Pausá el bot en un click, bloqueá fechas, tomá el control de cualquier conversación cuando lo necesitás.',
    icon: <Shield size={40} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.06)',
    items: ['Modo pausa instantáneo','Actividad en tiempo real','Silenciá conversaciones','Panel web y mobile'],
  },
];

function FeatureSlide({ tag, title, desc, icon, color, bg, items }) {
  return (
    <div className="max-w-5xl mx-auto px-6 w-full">
      <div className="grid md:grid-cols-2 gap-12 items-center">
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
        <div className="flex justify-center">
          <div className="w-64 h-64 md:w-80 md:h-80 rounded-3xl flex items-center justify-center relative"
            style={{ background: bg, border: `1px solid ${color}25`, boxShadow: `0 0 60px ${color}18` }}>
            <span style={{ color, filter: `drop-shadow(0 0 20px ${color})`, opacity: 0.9 }}>{icon}</span>
            <div className="absolute inset-4 rounded-2xl border opacity-20" style={{ borderColor: color }} />
            <div className="absolute inset-8 rounded-xl border opacity-10" style={{ borderColor: color }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INDUSTRIAS — para quién es Akira
// ─────────────────────────────────────────────────────────────
const industrias = [
  {
    icon: <Scissors size={22} />,
    rubro: 'Peluquerías y Estéticas',
    beneficio: 'Llená tu agenda automáticamente',
    desc: 'Akira agenda turnos, cobra la seña y manda recordatorios — vos solo aparecés a trabajar.',
    color: '#f87171',
    bg: 'rgba(248,113,113,0.06)',
    ejemplos: ['Turnos sin llamadas','Cobro de seña automático','Recordatorio 1h antes'],
  },
  {
    icon: <Stethoscope size={22} />,
    rubro: 'Profesionales de la salud',
    beneficio: 'Más consultas, menos administración',
    desc: 'Médicos, psicólogos y nutricionistas usan Akira para gestionar consultas sin secretaria.',
    color: '#60a5fa',
    bg: 'rgba(59,130,246,0.06)',
    ejemplos: ['Agenda integrada','Confirmación de turno','Sin secretaria'],
  },
  {
    icon: <Building2 size={22} />,
    rubro: 'Inmobiliarias',
    beneficio: 'Ninguna consulta sin respuesta',
    desc: 'Cada lead que llega por WhatsApp recibe respuesta inmediata con info del inmueble y agenda visita.',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.06)',
    ejemplos: ['Respuesta 24/7','Agenda visitas','Captura de leads'],
  },
  {
    icon: <ShoppingBag size={22} />,
    rubro: 'Comercios y tiendas',
    beneficio: 'Vendé más sin más personal',
    desc: 'Consultas de stock, precios y pedidos atendidos automáticamente. Tu catálogo siempre disponible.',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.06)',
    ejemplos: ['Catálogo de productos','Pedidos por WA','Stock en tiempo real'],
  },
  {
    icon: <Award size={22} />,
    rubro: 'Abogados y Contadores',
    beneficio: 'Captá clientes mientras dormís',
    desc: 'Primera consulta atendida automáticamente. El cliente ya viene calificado a la reunión.',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.06)',
    ejemplos: ['Consulta inicial IA','Agenda reuniones','Califica leads'],
  },
  {
    icon: <BarChart2 size={22} />,
    rubro: 'Agencias y freelancers',
    beneficio: 'Escala tu servicio sin escalar el equipo',
    desc: 'Ofrecé Akira a tus clientes bajo tu marca. El plan Agencia gestiona múltiples números desde un panel.',
    color: '#e879f9',
    bg: 'rgba(232,121,249,0.06)',
    ejemplos: ['Multi-cliente','White label','Reventa posible'],
  },
];

function IndustriasSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');
  return (
    <section id="beneficios" className="py-28" style={{ background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>Para quién es</span>
          <h2 className="text-4xl font-bold text-white mb-4">Funciona para cualquier negocio</h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text2)' }}>
            Si atendés clientes por WhatsApp, Akira trabaja por vos.
          </p>
        </div>
        <div ref={gridRef} className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {industrias.map((ind, i) => (
            <div key={i} className="reveal-up card group cursor-default"
              style={{ borderColor: `${ind.color}15` }}>
              <div className="flex items-start gap-4 mb-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: ind.bg, color: ind.color }}>
                  {ind.icon}
                </div>
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: ind.color }}>{ind.rubro}</p>
                  <h3 className="font-semibold text-white text-sm leading-tight">{ind.beneficio}</h3>
                </div>
              </div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text2)' }}>{ind.desc}</p>
              <div className="flex flex-wrap gap-2">
                {ind.ejemplos.map((e, j) => (
                  <span key={j} className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ background: `${ind.color}10`, color: ind.color, border: `1px solid ${ind.color}20` }}>
                    ✓ {e}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// BENEFICIOS GRID
// ─────────────────────────────────────────────────────────────
const beneficiosGrid = [
  { icon: <Mic size={20} />,         title: 'Entiende audios',         desc: 'Tus clientes mandan audio y Akira lo escucha, lo entiende y responde.' },
  { icon: <Clock size={20} />,       title: 'Disponible las 24 horas', desc: 'A las 3AM o el domingo, siempre hay alguien respondiendo por vos.' },
  { icon: <BellRing size={20} />,    title: 'Te avisa cada turno',     desc: 'Cada vez que se confirma un turno o pago, te llega un mensaje al celular.' },
  { icon: <PauseCircle size={20} />, title: 'Pausá cuando quieras',    desc: 'Vacaciones, feriado o descanso: pausás el bot en segundos.' },
  { icon: <Shield size={20} />,      title: 'Vos siempre mandás',      desc: 'Silenciás el bot cuando querés tomar una conversación personalmente.' },
  { icon: <GitBranch size={20} />,   title: 'Programa de referidos',   desc: 'Compartí tu código y ganás crédito por cada negocio que traés.' },
];

function BeneficiosSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');
  return (
    <section className="py-28" style={{ background: 'var(--surface)' }}>
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
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
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
  { icon: <Users size={28} />,      valor: '+3x',  label: 'más turnos confirmados',       color: '#00e87b', bg: 'rgba(0,232,123,0.06)' },
  { icon: <DollarSign size={28} />, valor: '0',    label: 'clientes perdidos por demora', color: '#a78bfa', bg: 'rgba(167,139,250,0.06)' },
  { icon: <Clock size={28} />,      valor: '2h',   label: 'menos de trabajo por día',     color: '#60a5fa', bg: 'rgba(59,130,246,0.06)' },
  { icon: <TrendingUp size={28} />, valor: '24/7', label: 'atención sin parar',           color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' },
];

function ResultadosSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');
  return (
    <section className="py-24 relative" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-14">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>Resultados reales</span>
          <h2 className="text-4xl font-bold text-white mb-4">Lo que cambia cuando usás Akira</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>Números promedio de negocios que ya lo usan.</p>
        </div>
        <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {resultados.map((r, i) => (
            <div key={i} className="reveal-up card text-center py-8" style={{ border: `1px solid ${r.color}20` }}>
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
// CRECIMIENTO — gráfico de barras animado
// ─────────────────────────────────────────────────────────────
function CrecimientoSection() {
  const titleRef  = useScrollReveal('is-visible');
  const chartRef  = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-28" style={{ background: 'var(--surface)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>Crecimiento</span>
          <h2 className="text-4xl font-bold text-white mb-4">Crecimiento exponencial desde el día 1</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>
            Cada mes más negocios eligen automatizar con Akira.
          </p>
        </div>

        <div ref={chartRef} className="rounded-2xl p-6 md:p-10"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {/* Valores del eje Y */}
          <div className="flex items-end gap-3 md:gap-5 h-56">
            {crecimientoData.map((d, i) => {
              const pct = (d.val / maxVal) * 100;
              const isLast = i === crecimientoData.length - 1;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  {/* Valor encima */}
                  <span className="text-xs font-bold transition-all duration-700"
                    style={{
                      color: isLast ? 'var(--accent)' : 'var(--muted)',
                      opacity: visible ? 1 : 0,
                      transitionDelay: `${i * 80 + 400}ms`,
                    }}>
                    {d.val}
                  </span>
                  {/* Barra */}
                  <div className="w-full rounded-t-lg relative overflow-hidden"
                    style={{
                      height: visible ? `${pct}%` : '0%',
                      minHeight: visible ? 4 : 0,
                      transition: `height 0.8s cubic-bezier(0.34,1.56,0.64,1)`,
                      transitionDelay: `${i * 80}ms`,
                      background: isLast
                        ? 'linear-gradient(to top, rgba(0,232,123,0.9), rgba(0,232,123,0.4))'
                        : 'linear-gradient(to top, rgba(0,232,123,0.25), rgba(0,232,123,0.08))',
                      border: isLast ? '1px solid rgba(0,232,123,0.5)' : '1px solid rgba(0,232,123,0.12)',
                    }} />
                  {/* Mes */}
                  <span className="text-xs font-medium" style={{ color: isLast ? 'var(--accent)' : 'var(--muted)' }}>
                    {d.mes}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Métricas bajo el gráfico */}
          <div className="grid grid-cols-3 gap-4 mt-8 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
            {[
              { label: 'Crecimiento mensual promedio', val: '+27%', color: 'var(--accent)' },
              { label: 'Retención de usuarios',        val: '94%',  color: '#60a5fa' },
              { label: 'NPS (recomendación)',          val: '72',   color: '#a78bfa' },
            ].map((m, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl font-extrabold" style={{ color: m.color }}>{m.val}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// RESEÑAS + FORMULARIO para dejar comentario
// ─────────────────────────────────────────────────────────────
function StarRating({ rating, onRate, readOnly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(s => (
        <button
          key={s}
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onRate && onRate(s)}
          onMouseEnter={() => !readOnly && setHover(s)}
          onMouseLeave={() => !readOnly && setHover(0)}
          style={{ background: 'none', border: 'none', cursor: readOnly ? 'default' : 'pointer', padding: 0 }}>
          <Star
            size={readOnly ? 13 : 20}
            fill={(hover || rating) >= s ? '#f59e0b' : 'transparent'}
            color={(hover || rating) >= s ? '#f59e0b' : 'var(--border)'}
            style={{ transition: 'fill 0.15s, color 0.15s' }}
          />
        </button>
      ))}
    </div>
  );
}

function ResenasSection() {
  const titleRef = useScrollReveal('is-visible');

  // Cargar reseñas de localStorage + las iniciales
  const [resenasUsuarios, setResenasUsuarios] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('akira_resenas') || '[]');
    } catch (e) { return []; }
  });

  const [likedIds, setLikedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('akira_liked') || '[]'); } catch (e) { return []; }
  });

  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [enviado, setEnviado]           = useState(false);

  // Form state
  const [form, setForm] = useState({ nombre: '', negocio: '', rating: 5, texto: '' });
  const [sending, setSending] = useState(false);

  const todasLasResenas = [...resenasUsuarios, ...resenasIniciales];
  const visibles        = mostrarTodas ? todasLasResenas : todasLasResenas.slice(0, 6);

  const handleLike = (id) => {
    const nuevos = likedIds.includes(id)
      ? likedIds.filter(l => l !== id)
      : [...likedIds, id];
    setLikedIds(nuevos);
    localStorage.setItem('akira_liked', JSON.stringify(nuevos));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.texto.trim() || !form.rating) return;
    setSending(true);
    setTimeout(() => {
      const nueva = {
        id:       `u_${Date.now()}`,
        nombre:   form.nombre.trim(),
        negocio:  form.negocio.trim() || 'Usuario verificado',
        rating:   form.rating,
        texto:    form.texto.trim(),
        avatar:   `https://ui-avatars.com/api/?name=${encodeURIComponent(form.nombre)}&background=00e87b&color=000&bold=true&size=48`,
        likes:    0,
        esUsuario: true,
      };
      const nuevas = [nueva, ...resenasUsuarios];
      setResenasUsuarios(nuevas);
      localStorage.setItem('akira_resenas', JSON.stringify(nuevas));
      setForm({ nombre: '', negocio: '', rating: 5, texto: '' });
      setSending(false);
      setEnviado(true);
      setTimeout(() => setEnviado(false), 4000);
    }, 800);
  };

  return (
    <section id="reseñas" className="py-28" style={{ background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto px-6">

        {/* Título */}
        <div ref={titleRef} className="reveal-up text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>
            Reseñas verificadas
          </span>
          <h2 className="text-4xl font-bold text-white mb-4">
            Lo que dicen {todasLasResenas.length}+ negocios
          </h2>
          <div className="flex items-center justify-center gap-2">
            {[1,2,3,4,5].map(s => <Star key={s} size={18} fill="#f59e0b" color="#f59e0b" />)}
            <span className="text-xl font-extrabold text-white ml-1">4.9</span>
            <span className="text-sm" style={{ color: 'var(--muted)' }}>/ 5.0 promedio</span>
          </div>
        </div>

        {/* Grid de reseñas */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          {visibles.map((r) => (
            <div key={r.id}
              className="rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 hover:border-opacity-40"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

              {/* Stars */}
              <StarRating rating={r.rating} readOnly />

              {/* Quote */}
              <div className="relative flex-1">
                <Quote size={16} className="absolute -top-1 -left-1 opacity-20" style={{ color: 'var(--accent)' }} />
                <p className="text-sm leading-relaxed pl-4" style={{ color: 'var(--text2)' }}>
                  "{r.texto}"
                </p>
              </div>

              {/* Author + like */}
              <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <img src={r.avatar} alt={r.nombre}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    style={{ border: '1px solid var(--border)' }}
                    onError={e => { e.target.style.display='none'; }} />
                  <div>
                    <p className="text-xs font-semibold text-white">{r.nombre}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{r.negocio}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleLike(r.id)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all duration-150"
                  style={{
                    color:      likedIds.includes(r.id) ? 'var(--accent)' : 'var(--muted)',
                    background: likedIds.includes(r.id) ? 'rgba(0,232,123,0.08)' : 'transparent',
                    border:     '1px solid transparent',
                  }}>
                  <ThumbsUp size={12} />
                  {(r.likes || 0) + (likedIds.includes(r.id) ? 1 : 0)}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Ver más */}
        {todasLasResenas.length > 6 && (
          <div className="text-center mb-14">
            <button
              type="button"
              onClick={() => setMostrarTodas(v => !v)}
              className="btn-secondary text-sm py-2.5 px-6">
              {mostrarTodas ? 'Mostrar menos' : `Ver las ${todasLasResenas.length - 6} reseñas restantes`}
            </button>
          </div>
        )}

        {/* ── FORMULARIO ── */}
        <div className="max-w-2xl mx-auto mt-6">
          <div className="rounded-2xl p-6 md:p-8"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-xl font-bold text-white mb-1">¿Ya lo usás? Dejá tu opinión</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
              Tu experiencia ayuda a otros negocios a tomar la decisión.
            </p>

            {enviado ? (
              <div className="flex items-center gap-3 py-6 justify-center text-center rounded-xl"
                style={{ background: 'rgba(0,232,123,0.06)', border: '1px solid rgba(0,232,123,0.2)' }}>
                <CheckCircle size={22} style={{ color: 'var(--accent)' }} />
                <div>
                  <p className="font-semibold text-white">¡Gracias por tu reseña!</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Ya aparece arriba 👆</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text2)' }}>Tu nombre *</label>
                    <input
                      required
                      value={form.nombre}
                      onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="Ej: María García"
                      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-150 text-white"
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text2)' }}>Tipo de negocio</label>
                    <input
                      value={form.negocio}
                      onChange={e => setForm(f => ({ ...f, negocio: e.target.value }))}
                      placeholder="Ej: Peluquería · Buenos Aires"
                      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-150 text-white"
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text2)' }}>Tu calificación *</label>
                  <StarRating rating={form.rating} onRate={r => setForm(f => ({ ...f, rating: r }))} />
                </div>

                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text2)' }}>Tu comentario *</label>
                  <textarea
                    required
                    rows={3}
                    value={form.texto}
                    onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
                    placeholder="¿Cómo te ayudó Akira? ¿Qué fue lo que más te gustó?"
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-150 text-white resize-none"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending || !form.nombre || !form.texto}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed">
                  {sending ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      Enviando...
                    </span>
                  ) : (
                    <><Send size={15} /> Publicar reseña</>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPARATIVA CON MARCAS FAMOSAS — la gran analogía
// ─────────────────────────────────────────────────────────────
const marcasComparativa = [
  {
    emoji:    '🗓️',
    marca:    'Calendly',
    color:    '#006BFF',
    bg:       'rgba(0,107,255,0.07)',
    border:   'rgba(0,107,255,0.18)',
    akira:    'Akira es como Calendly',
    pero:     'pero dentro de WhatsApp, donde ya están tus clientes — sin links, sin formularios, sin fricción.',
    detalle:  'Calendly requiere que el cliente abra un link y complete un formulario. Akira agenda directo en la conversación de WhatsApp en la que el cliente ya está escribiendo.',
  },
  {
    emoji:    '💳',
    marca:    'MercadoPago',
    color:    '#00b1ea',
    bg:       'rgba(0,177,234,0.07)',
    border:   'rgba(0,177,234,0.18)',
    akira:    'Akira usa MercadoPago',
    pero:     'pero genera el link de pago solo y confirma el turno automáticamente cuando el dinero entra — sin que vos muevas un dedo.',
    detalle:  'Hoy mandás el link vos a mano. Con Akira, el bot genera el link, lo envía y cuando el pago se acredita confirma el turno. Vos te enterás por notificación.',
  },
  {
    emoji:    '🤖',
    marca:    'ChatGPT',
    color:    '#10a37f',
    bg:       'rgba(16,163,127,0.07)',
    border:   'rgba(16,163,127,0.18)',
    akira:    'Akira es como ChatGPT',
    pero:     'pero entrenado en tu negocio: tus precios, tus horarios, tus servicios — responde como si fuera vos.',
    detalle:  'ChatGPT sabe todo pero no sabe nada de tu negocio. Akira sabe que el martes cerrás a las 18, que el corte de cabello vale $4.500 y que el turno de las 16hs ya está ocupado.',
  },
  {
    emoji:    '📞',
    marca:    'Call center',
    color:    '#f59e0b',
    bg:       'rgba(245,158,11,0.07)',
    border:   'rgba(245,158,11,0.18)',
    akira:    'Akira es como un call center 24/7',
    pero:     'sin pagar 10 sueldos, sin horarios, sin días libres — disponible las 24 horas por menos de lo que cuesta un almuerzo por día.',
    detalle:  'Un empleado para atender WhatsApp cuesta $400.000+/mes, trabaja 8 horas y tiene días libres. Akira trabaja 24/7, responde en 2 segundos y cuesta una fracción.',
  },
  {
    emoji:    '🏪',
    marca:    'Shopify',
    color:    '#96bf48',
    bg:       'rgba(150,191,72,0.07)',
    border:   'rgba(150,191,72,0.18)',
    akira:    'Como Shopify automatizó las tiendas online',
    pero:     'Akira automatiza tu WhatsApp — el canal donde el 90% de tus clientes argentinos ya te escribe todos los días.',
    detalle:  'Shopify puso una tienda online en manos de cualquier negocio sin necesitar programadores. Akira hace lo mismo con la atención por WhatsApp: profesional, automática y sin saber código.',
  },
  {
    emoji:    '✈️',
    marca:    'Airbnb',
    color:    '#ff5a5f',
    bg:       'rgba(255,90,95,0.07)',
    border:   'rgba(255,90,95,0.18)',
    akira:    'Para alojamientos, Akira es como Airbnb',
    pero:     'pero con tu propio WhatsApp, sin pagar comisiones del 15% y con tus clientes directos — no los de la plataforma.',
    detalle:  'Airbnb cobra comisión por cada reserva y te hace depender de su plataforma. Akira gestiona disponibilidad, reservas y pagos directamente en tu WhatsApp propio, sin intermediarios.',
  },
];

function ComparativaMarcasSection() {
  const titleRef = useScrollReveal('is-visible');
  const gridRef  = useScrollRevealGroup('is-visible');
  const [abierto, setAbierto] = useState(null);

  return (
    <section className="py-28 relative" style={{ background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto px-6">
        <div ref={titleRef} className="reveal-up text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--accent)' }}>
            ¿Qué es Akira exactamente?
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-5 leading-tight">
            Lo entendés al instante<br />
            <span style={{ color: 'var(--accent)' }}>si lo comparamos con lo que ya conocés</span>
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text2)' }}>
            Akira combina lo mejor de varias herramientas que ya existen — pero integradas en el WhatsApp de tu negocio, sin que tengas que usar ninguna por separado.
          </p>
        </div>

        <div ref={gridRef} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {marcasComparativa.map((m, i) => (
            <div
              key={i}
              className="reveal-up rounded-2xl p-5 cursor-pointer transition-all duration-200"
              style={{
                background:   abierto === i ? m.bg : 'var(--surface)',
                border:       abierto === i ? `1px solid ${m.border}` : '1px solid var(--border)',
                boxShadow:    abierto === i ? `0 0 32px ${m.bg}` : 'none',
              }}
              onClick={() => setAbierto(abierto === i ? null : i)}
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: m.bg, border: `1px solid ${m.border}` }}>
                  {m.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: m.color }}>
                    Como {m.marca}
                  </p>
                  <p className="text-sm font-semibold text-white leading-snug">{m.akira}</p>
                </div>
              </div>

              {/* Pero diferente */}
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
                <span className="font-bold" style={{ color: m.color }}>pero</span> {m.pero}
              </p>

              {/* Detalle expandible */}
              <div style={{
                display: 'grid',
                gridTemplateRows: abierto === i ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.3s ease',
              }}>
                <div style={{ overflow: 'hidden' }}>
                  <p className="text-xs leading-relaxed mt-3 pt-3" style={{
                    color: 'var(--muted)',
                    borderTop: `1px solid ${m.border}`,
                  }}>
                    {m.detalle}
                  </p>
                </div>
              </div>

              <p className="text-xs mt-3 font-medium" style={{ color: m.color, opacity: 0.7 }}>
                {abierto === i ? '▲ Menos detalle' : '▼ Ver diferencia exacta'}
              </p>
            </div>
          ))}
        </div>

        {/* CTA abajo */}
        <div className="text-center mt-14">
          <p className="text-base mb-5" style={{ color: 'var(--text2)' }}>
            Todo esto junto, en un solo lugar, conectado a tu WhatsApp.
          </p>
          <Link to="/register" className="btn-primary inline-flex items-center gap-2 text-base py-3.5 px-8">
            Probarlo gratis 7 días <ArrowRight size={17} />
          </Link>
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
    features: ['1 número de WhatsApp','Mensajes ilimitados','Agenda inteligente + MercadoPago','Entiende mensajes de voz','Notificaciones al dueño'],
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
        <div className="flex justify-center mb-10">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {['mensual','anual'].map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
                style={periodo === p ? { background: 'var(--accent)', color: '#020f08' } : { color: 'var(--text2)' }}>
                {p === 'mensual' ? 'Mensual' : <span className="flex items-center gap-2">Anual <span className="text-xs font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(0,232,123,0.15)', color: 'var(--accent)' }}>−20%</span></span>}
              </button>
            ))}
          </div>
        </div>
        <div ref={gridRef} className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {planes.map((p, i) => (
            <div key={i} className="reveal-up relative rounded-2xl p-6"
              style={{
                background: p.destacado ? 'linear-gradient(135deg, rgba(0,232,123,0.06) 0%, var(--surface) 60%)' : 'var(--surface)',
                border:     p.destacado ? '1px solid rgba(0,232,123,0.28)' : '1px solid var(--border)',
                boxShadow:  p.destacado ? '0 0 40px rgba(0,232,123,0.08)' : 'none',
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
              <button
                onClick={() => navigate(localStorage.getItem('akira_token') ? `/planes?plan=${p.planKey}_${periodo}` : `/register?plan=${p.planKey}_${periodo}`)}
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
        <p className="text-sm font-semibold mb-4 uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Empezá hoy</p>
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
  const ref   = useScrollReveal('is-visible');
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
                {[
                  { href:'https://github.com/ArrayagoM',                           icon:<Github size={15}/>   },
                  { href:'https://www.linkedin.com/in/juan-martin-arrayago',       icon:<Linkedin size={15}/> },
                  { href:'https://martin-arrayago.com',                            icon:<Globe size={15}/>    },
                ].map((s,i)=>(
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
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Stack tecnológico</p>
              <div className="flex flex-wrap gap-2">
                {stack.map(tech => (
                  <span key={tech} className="px-2.5 py-1 text-xs font-medium rounded-lg"
                    style={{ background: 'var(--surface3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                    {tech}
                  </span>
                ))}
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
      <UrgencyBar />
      <NavBar />
      <LiveActivityToast />

      {/* 1. Hero */}
      <HeroSection />

      {/* 2. Stats animados */}
      <StatsSection />

      {/* 3. Comparativa con marcas famosas — "¿qué es Akira?" */}
      <ComparativaMarcasSection />

      {/* 4. Problema — por qué lo necesitás */}
      <ProblemaSection />

      {/* 5. Cómo funciona — 4 pasos */}
      <ComoFuncionaSection />

      {/* 6. Features en detalle — scroll horizontal */}
      <HorizontalScroll bgColor="var(--bg)">
        {featureSlides.map((slide, i) => <FeatureSlide key={i} {...slide} />)}
      </HorizontalScroll>

      {/* 7. Para qué industrias */}
      <IndustriasSection />

      {/* 8. Resultados concretos */}
      <ResultadosSection />

      {/* 9. Reseñas + formulario */}
      <ResenasSection />

      {/* 10. Precios */}
      <PreciosSection />

      {/* 11. CTA final */}
      <CTASection />

      {/* 12. Creador */}
      <CreadorSection />

      {/* 13. Footer */}
      <Footer />
    </div>
  );
}
