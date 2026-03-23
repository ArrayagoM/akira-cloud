import { Link } from 'react-router-dom';
import {
  Bot,
  Calendar,
  CreditCard,
  Mic,
  Zap,
  Shield,
  BarChart3,
  CheckCircle,
  XCircle,
  ArrowRight,
  MessageSquare,
  Clock,
  Star,
  Github,
  Linkedin,
  Facebook,
  Globe,
  Code2,
} from 'lucide-react';

// ── Componentes auxiliares ───────────────────────────────────
function NavBar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="text-green-400" size={24} />
          <span className="font-bold text-lg text-white">
            Akira <span className="text-green-400">Cloud</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
          <a href="#beneficios" className="hover:text-white transition-colors">
            Beneficios
          </a>
          <a href="#comparativa" className="hover:text-white transition-colors">
            Comparativa
          </a>
          <a href="#precios" className="hover:text-white transition-colors">
            Precios
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm text-gray-400 hover:text-white transition-colors px-4 py-2"
          >
            Iniciar sesión
          </Link>
          <Link to="/register" className="btn-primary text-sm py-2 px-5">
            Empezar gratis
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="min-h-screen flex items-center pt-16 bg-black relative overflow-hidden">
      {/* Glow de fondo */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-green-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-green-500/3 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 py-24 text-center relative z-10">
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 text-green-400 text-sm font-medium mb-8">
          <Zap size={14} /> Impulsado por LLaMA 3.3 70B — el modelo más potente
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold text-white leading-tight mb-6">
          Tu negocio funciona
          <br />
          <span className="text-green-400">mientras dormís</span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Akira es la asistente de WhatsApp con IA que agenda turnos, cobra con MercadoPago y
          atiende a tus clientes las 24 horas. Sin código, sin servidores, sin complicaciones.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link to="/register" className="btn-primary text-base py-3.5 px-8">
            Empezar gratis — 7 días <ArrowRight size={18} />
          </Link>
          <a href="#como-funciona" className="btn-secondary text-base py-3.5 px-8">
            Ver cómo funciona
          </a>
        </div>

        {/* Mockup WhatsApp */}
        <div className="relative max-w-sm mx-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 text-left shadow-2xl">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-800">
              <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center">
                <Bot size={18} className="text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Akira — Peluquería Estilo</p>
                <p className="text-xs text-green-400">● en línea</p>
              </div>
            </div>
            {[
              { from: 'client', text: 'Hola, ¿tienen turno el martes?', time: '10:02' },
              {
                from: 'bot',
                text: '¡Hola Lucía! 😊 Sí, el martes tenemos disponible: 10:00, 14:00 y 16:00. ¿Cuál te queda mejor?',
                time: '10:02',
              },
              { from: 'client', text: 'Las 14:00 perfecto', time: '10:03' },
              {
                from: 'bot',
                text: '¡Genial! 🎉 Tu turno del martes a las 14:00 quedó confirmado.\n\n💳 Pagá aquí para reservarlo:\nhttps://mp.com/tu-turno\n\n⏳ El link vence en 30 min.',
                time: '10:03',
              },
            ].map((m, i) => (
              <div
                key={i}
                className={`flex mb-3 ${m.from === 'client' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-line ${m.from === 'client' ? 'bg-green-600 text-white rounded-tr-sm' : 'bg-gray-800 text-gray-200 rounded-tl-sm'}`}
                >
                  {m.text}
                  <p
                    className={`text-right mt-1 opacity-60 text-[10px] ${m.from === 'client' ? 'text-green-200' : 'text-gray-500'}`}
                  >
                    {m.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {/* Badge flotante */}
          <div className="absolute -right-4 -bottom-4 bg-green-500 text-black text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
            IA 24/7 ✓
          </div>
        </div>
      </div>
    </section>
  );
}

const beneficios = [
  {
    icon: <Bot size={22} />,
    title: 'IA con LLaMA 3.3 70B',
    desc: 'El modelo de lenguaje más potente disponible. Entiende contexto, tono y responde como una persona real.',
  },
  {
    icon: <Calendar size={22} />,
    title: 'Agenda en tiempo real',
    desc: 'Se conecta a tu Google Calendar. Consulta disponibilidad, agenda y reagenda sin que vos intervengas.',
  },
  {
    icon: <CreditCard size={22} />,
    title: 'Cobros con MercadoPago',
    desc: 'Genera links de pago automáticamente. El turno se confirma solo cuando el cliente paga.',
  },
  {
    icon: <Mic size={22} />,
    title: 'Responde audios',
    desc: 'Transcribe mensajes de voz con Whisper y puede responder también con voz usando RIME AI.',
  },
  {
    icon: <Clock size={22} />,
    title: 'Recordatorios automáticos',
    desc: 'Envía recordatorios 24 hs, 4 hs y 30 min antes del turno. Reducís ausencias sin hacer nada.',
  },
  {
    icon: <Shield size={22} />,
    title: 'Control total',
    desc: 'Silenciás el bot cuando querés tomar el control de una conversación. Vos siempre tenés la última palabra.',
  },
];

function BeneficiosSection() {
  return (
    <section id="beneficios" className="py-24 bg-black">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Todo lo que necesitás, integrado</h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            No es un bot de respuestas automáticas. Es un asistente que piensa, agenda y cobra por
            vos.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {beneficios.map((b, i) => (
            <div key={i} className="card hover:border-green-500/30 transition-colors group">
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center text-green-400 mb-4 group-hover:bg-green-500/20 transition-colors">
                {b.icon}
              </div>
              <h3 className="font-semibold text-white mb-2">{b.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const comparativa = [
  { feature: 'Modelo de IA', akira: 'LLaMA 3.3 70B', trad: 'Respuestas fijas' },
  { feature: 'Agenda real', akira: 'Google Calendar', trad: '❌ No incluye' },
  { feature: 'Cobros integrados', akira: 'MercadoPago', trad: '❌ No incluye' },
  { feature: 'Responde audios', akira: '✓ Whisper + RIME', trad: '❌ Solo texto' },
  { feature: 'Recordatorios', akira: '24h / 4h / 30min', trad: '❌ Manual' },
  { feature: 'Contexto de conversación', akira: '✓ Multi-turno', trad: 'Limitado' },
  { feature: 'Cancelar / reagendar', akira: '✓ Automático', trad: '❌ Manual' },
  { feature: 'Control del dueño', akira: '✓ Silenciar/activar', trad: 'Básico' },
  { feature: 'Multi-negocio', akira: '✓ Un número x cliente', trad: 'Varía' },
];

function ComparativaSection() {
  return (
    <section id="comparativa" className="py-24 bg-gray-950">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Akira vs Bots tradicionales</h2>
          <p className="text-gray-400 text-lg">
            No es solo un bot. Es la diferencia entre un negocio que crece y uno que se queda atrás.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900">
                <th className="text-left px-6 py-4 text-gray-400 font-medium">Característica</th>
                <th className="px-6 py-4 text-center">
                  <span className="text-green-400 font-bold text-base">Akira Cloud</span>
                </th>
                <th className="px-6 py-4 text-center text-gray-500 font-medium">
                  Bots tradicionales
                </th>
              </tr>
            </thead>
            <tbody>
              {comparativa.map((row, i) => (
                <tr
                  key={i}
                  className={`border-t border-gray-800 ${i % 2 === 0 ? 'bg-black' : 'bg-gray-950'}`}
                >
                  <td className="px-6 py-3.5 text-gray-300">{row.feature}</td>
                  <td className="px-6 py-3.5 text-center">
                    <span className="inline-flex items-center gap-1.5 text-green-400 font-medium">
                      <CheckCircle size={14} /> {row.akira}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-center text-gray-500">{row.trad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const planes = [
  {
    nombre: 'Básico',
    precio: '$15',
    periodo: '/mes',
    desc: 'Para negocios que empiezan',
    features: [
      '1 número de WhatsApp',
      'IA con LLaMA 3.3 70B',
      'Hasta 500 mensajes/mes',
      'Recordatorios automáticos',
      'Soporte por email',
    ],
    cta: 'Empezar gratis',
    destacado: false,
  },
  {
    nombre: 'Pro',
    precio: '$35',
    periodo: '/mes',
    desc: 'El más popular',
    features: [
      '1 número de WhatsApp',
      'IA + Google Calendar',
      'MercadoPago integrado',
      'Mensajes ilimitados',
      'Respuesta por audio (TTS)',
      'Soporte prioritario',
    ],
    cta: 'Empezar gratis',
    destacado: true,
  },
  {
    nombre: 'Agencia',
    precio: '$80',
    periodo: '/mes',
    desc: 'Para agencias y revendedores',
    features: [
      'Hasta 5 números de WhatsApp',
      'Todo el plan Pro',
      'Panel multi-cliente',
      'Marca blanca disponible',
      'Soporte dedicado',
      'API access',
    ],
    cta: 'Contactar ventas',
    destacado: false,
  },
];

function PreciosSection() {
  return (
    <section id="precios" className="py-24 bg-black">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Precios simples, sin sorpresas</h2>
          <p className="text-gray-400 text-lg">
            7 días gratis en todos los planes. Cancelá cuando quieras.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {planes.map((p, i) => (
            <div
              key={i}
              className={`relative rounded-2xl p-6 border transition-all ${p.destacado ? 'bg-green-500/5 border-green-500/40 shadow-lg shadow-green-500/10' : 'bg-gray-900 border-gray-800'}`}
            >
              {p.destacado && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-black text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                  <Star size={11} /> Más popular
                </div>
              )}
              <div className="mb-6">
                <p className="text-gray-400 text-sm mb-1">{p.nombre}</p>
                <div className="flex items-baseline gap-1">
                  <span
                    className={`text-4xl font-extrabold ${p.destacado ? 'text-green-400' : 'text-white'}`}
                  >
                    {p.precio}
                  </span>
                  <span className="text-gray-500 text-sm">{p.periodo}</span>
                </div>
                <p className="text-gray-500 text-xs mt-1">{p.desc}</p>
              </div>
              <ul className="space-y-3 mb-8">
                {p.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <CheckCircle size={15} className="text-green-400 mt-0.5 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`block text-center py-2.5 rounded-lg text-sm font-semibold transition-colors ${p.destacado ? 'bg-green-500 hover:bg-green-400 text-black' : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'}`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-24 bg-gray-950 border-t border-gray-800">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-4xl font-bold text-white mb-4">Empezá hoy. Es gratis por 7 días.</h2>
        <p className="text-gray-400 text-lg mb-10">
          Sin tarjeta de crédito. Sin instalaciones. Conectás tu WhatsApp en menos de 2 minutos.
        </p>
        <Link to="/register" className="btn-primary text-base py-4 px-10 inline-flex">
          Crear cuenta gratis <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}

function CreadorSection() {
  const stack = [
    'React',
    'Node.js',
    'MongoDB',
    'TypeScript',
    'Python',
    'Arduino',
    'IoT',
    'React Native',
    'PostgreSQL',
    'Google Cloud',
    'C++',
    'Linux',
  ];

  return (
    <section className="py-24 bg-black border-t border-gray-900">
      <div className="max-w-5xl mx-auto px-6">
        {/* Título */}
        <div className="text-center mb-16">
          <span className="text-green-400 text-sm font-semibold uppercase tracking-widest">
            Quién está detrás
          </span>
          <h2 className="text-4xl font-bold text-white mt-3 mb-4">
            Construido por alguien que entiende tu realidad
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Akira Cloud no nació en una oficina de Silicon Valley. Nació en Argentina, entendiendo
            cómo trabajan los negocios reales de acá.
          </p>
        </div>

        {/* Card principal */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* Columna izquierda — foto y datos */}
            <div className="md:w-72 bg-gray-950 border-b md:border-b-0 md:border-r border-gray-800 p-8 flex flex-col items-center text-center gap-5">
              {/* Avatar con foto de GitHub */}
              <div className="relative">
                <img
                  src="https://avatars.githubusercontent.com/u/100850538?v=4"
                  alt="Juan Martín Arrayago"
                  className="w-28 h-28 rounded-full border-2 border-green-500/40 object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="w-28 h-28 rounded-full bg-green-500/10 border-2 border-green-500/40 items-center justify-center text-green-400 font-bold text-3xl hidden">
                  JA
                </div>
                {/* Badge verde */}
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-500 rounded-full border-2 border-gray-950 flex items-center justify-center">
                  <Code2 size={13} className="text-black" />
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white">Juan Martín Arrayago</h3>
                <p className="text-green-400 text-sm font-medium mt-0.5">TinchoDev</p>
                <p className="text-gray-500 text-xs mt-1">
                  Full Stack Developer · Buenos Aires, AR 🇦🇷
                </p>
              </div>

              {/* Redes sociales */}
              <div className="flex gap-3">
                <a
                  href="https://github.com/ArrayagoM"
                  target="_blank"
                  rel="noreferrer"
                  className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                  title="GitHub"
                >
                  <Github size={16} />
                </a>
                <a
                  href="https://www.linkedin.com/in/juan-martin-arrayago"
                  target="_blank"
                  rel="noreferrer"
                  className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-blue-400 transition-all"
                  title="LinkedIn"
                >
                  <Linkedin size={16} />
                </a>
                <a
                  href="https://www.facebook.com/juan.arrayago"
                  target="_blank"
                  rel="noreferrer"
                  className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-all"
                  title="Facebook"
                >
                  <Facebook size={16} />
                </a>
                <a
                  href="https://new-protfolio-xi.vercel.app/"
                  target="_blank"
                  rel="noreferrer"
                  className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-green-400 transition-all"
                  title="Portfolio"
                >
                  <Globe size={16} />
                </a>
              </div>

              {/* Stats GitHub */}
              <div className="w-full grid grid-cols-2 gap-2 pt-2 border-t border-gray-800">
                <div className="text-center">
                  <p className="text-white font-bold text-lg">43</p>
                  <p className="text-gray-600 text-xs">Repos</p>
                </div>
                <div className="text-center">
                  <p className="text-white font-bold text-lg">5+</p>
                  <p className="text-gray-600 text-xs">Años exp.</p>
                </div>
              </div>
            </div>

            {/* Columna derecha — historia y stack */}
            <div className="flex-1 p-8 flex flex-col justify-between gap-7">
              {/* Historia */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-14 bg-green-500 rounded-full flex-shrink-0" />
                  <blockquote className="text-gray-300 text-lg leading-relaxed italic">
                    "Vengo de una familia humilde. Me recibí en programación, robótica,
                    automatización e impresión 3D por esfuerzo propio. Construí Akira Cloud porque
                    vi cómo los negocios locales pierden clientes por no responder a tiempo — y supe
                    que podía resolverlo."
                  </blockquote>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                  {[
                    {
                      icon: '🤖',
                      titulo: 'Full Stack Dev',
                      desc: 'React, Node.js, MongoDB y más de 15 tecnologías dominadas.',
                    },
                    {
                      icon: '⚡',
                      titulo: 'IoT & Robótica',
                      desc: 'Arduino, ESP32, C++. Desde software hasta hardware.',
                    },
                    {
                      icon: '🇦🇷',
                      titulo: 'Hecho en Argentina',
                      desc: 'Pensado para pymes locales, precios y pagos argentinos.',
                    },
                  ].map((item, i) => (
                    <div key={i} className="bg-black/40 border border-gray-800 rounded-xl p-4">
                      <div className="text-2xl mb-2">{item.icon}</div>
                      <p className="text-white font-semibold text-sm mb-1">{item.titulo}</p>
                      <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stack de tecnologías */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  Stack tecnológico
                </p>
                <div className="flex flex-wrap gap-2">
                  {stack.map((tech) => (
                    <span
                      key={tech}
                      className="px-2.5 py-1 text-xs font-medium bg-gray-800 text-gray-300 border border-gray-700 rounded-lg hover:border-green-500/40 hover:text-green-400 transition-colors"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Frase final */}
        <p className="text-center text-gray-600 text-sm mt-8">
          ¿Tenés un proyecto? →{' '}
          <a
            href="https://new-protfolio-xi.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="text-green-400 hover:text-green-300 transition-colors"
          >
            martin-arrayago.com
          </a>
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-black border-t border-gray-900 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-green-400" />
          <span className="font-bold text-white">Akira Cloud</span>
        </div>
        <p className="text-gray-600 text-sm">© 2024 Akira Cloud. Todos los derechos reservados.</p>
        <div className="flex gap-6 text-sm text-gray-600">
          <a href="#" className="hover:text-gray-400 transition-colors">
            Privacidad
          </a>
          <a href="#" className="hover:text-gray-400 transition-colors">
            Términos
          </a>
          <a href="#" className="hover:text-gray-400 transition-colors">
            Contacto
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="bg-black min-h-screen">
      <NavBar />
      <HeroSection />
      <BeneficiosSection />
      <ComparativaSection />
      <PreciosSection />
      <CTASection />
      <CreadorSection />
      <Footer />
    </div>
  );
}
