import { Link, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowRight, Bot, Calendar, Clock, ChevronLeft } from 'lucide-react';
import { useSeo } from '../components/VerticalNicho';

// ── DATA: posts del blog ────────────────────────────────────
// Cada post es indexable por separado en /blog/<slug>.
// Pensado para keywords long-tail que la home no cubre.
const POSTS = [
  {
    slug: 'como-automatizar-turnos-whatsapp',
    title: 'Cómo automatizar la agenda de turnos por WhatsApp paso a paso',
    description: 'Guía práctica para comerciantes argentinos: automatizá la agenda de turnos de tu negocio por WhatsApp con IA en 15 minutos.',
    keywords: 'automatizar turnos whatsapp, agenda turnos automatica, bot whatsapp turnos, sistema reservas whatsapp, agenda online whatsapp',
    tag: 'Guías',
    date: '2026-05-08',
    minutos: 6,
    excerpt: 'Si tenés un negocio que toma turnos por WhatsApp, probablemente pasás horas contestando "¿hay turno para el sábado?". Acá te explico cómo automatizar eso 100% con IA en 15 minutos.',
    body: [
      { type: 'p', text: 'Si tenés una peluquería, consultorio, gimnasio o cualquier negocio que toma turnos por WhatsApp, seguramente pasás varias horas al día contestando preguntas repetidas: "¿hay turno para mañana?", "¿cuánto sale?", "¿abren el sábado?". Cada minuto que dedicás a eso es un minuto que no atendés a un cliente presencial.' },
      { type: 'h2', text: '¿Por qué automatizar?' },
      { type: 'p', text: 'Estudios de la industria muestran que un comerciante promedio gasta 2 a 4 horas diarias contestando WhatsApp. A $5.000/hora de tu trabajo, son entre $300.000 y $600.000 al mes. Y mientras tanto, perdés clientes que no esperan respuesta.' },
      { type: 'h2', text: 'Lo que necesitás para empezar' },
      { type: 'list', items: [
        'Un número de WhatsApp Business (gratis).',
        'Una cuenta de Google con Google Calendar (gratis).',
        'Una cuenta de MercadoPago si querés cobrar señas (gratis).',
        'Akira Cloud — desde $15.000 ARS/mes con plan Básico, o trial gratis.',
      ]},
      { type: 'h2', text: 'Paso 1 — Conectar WhatsApp' },
      { type: 'p', text: 'Te registrás en akiracloud.lat, escaneás un QR con tu WhatsApp Business y listo. Tu número sigue funcionando normal — el bot solo responde mensajes nuevos.' },
      { type: 'h2', text: 'Paso 2 — Configurar tus horarios y servicios' },
      { type: 'p', text: 'En el panel definís: días que trabajás, horario por día, servicios que ofrecés (con precio y duración), días bloqueados (vacaciones, feriados). El bot conoce todo esto y lo respeta.' },
      { type: 'h2', text: 'Paso 3 — Conectar Google Calendar y MercadoPago' },
      { type: 'p', text: 'En 2 clics conectás tu Google Calendar (para que el bot lea horarios libres y agende turnos) y tu cuenta de MercadoPago (si querés cobrar la seña automáticamente al confirmar).' },
      { type: 'h2', text: 'Paso 4 — El bot empieza a atender solo' },
      { type: 'p', text: 'Desde el momento que activás el bot, todos los mensajes nuevos los responde la IA (LLaMA 3.3 70B vía Groq). Ofrece horarios libres en tiempo real, cobra la seña, agenda en tu calendario y manda recordatorios. Vos podés intervenir cuando quieras.' },
      { type: 'h2', text: 'Resultado típico al mes 1' },
      { type: 'list', items: [
        '3-4 horas/día recuperadas.',
        '50-70% menos no-show por los recordatorios automáticos.',
        '15-25% más turnos confirmados (porque el bot atiende fuera de horario laboral).',
        'Cero turnos pisados (todo sincronizado con Google Calendar).',
      ]},
      { type: 'cta' },
    ],
  },
  {
    slug: 'cobrar-mercadopago-whatsapp',
    title: 'Cómo cobrar con MercadoPago directamente desde WhatsApp',
    description: 'Aprendé a cobrar señas, cuotas o productos vía WhatsApp con links automáticos de MercadoPago. Cero plataformas, cero comisiones extras.',
    keywords: 'cobrar mercadopago whatsapp, link de pago mercadopago, mercadopago whatsapp business, cobros automaticos whatsapp, sena con mercadopago, link pago whatsapp',
    tag: 'Pagos',
    date: '2026-05-06',
    minutos: 5,
    excerpt: 'MercadoPago + WhatsApp es la combinación que nadie te explica. Te muestro cómo cobrar señas o productos sin que tu cliente salga del chat.',
    body: [
      { type: 'p', text: 'Si tu negocio recibe pedidos por WhatsApp y tenés que cobrar, lo más común es: pedir alias o CBU, esperar que el cliente "te avise cuando paga", y muchas veces no paga nunca. Hay una forma mucho mejor.' },
      { type: 'h2', text: 'El problema con la transferencia tradicional' },
      { type: 'list', items: [
        'No tenés confirmación automática del pago.',
        'El cliente te puede decir que pagó cuando no lo hizo.',
        'Vos perdés tiempo verificando uno por uno en tu home banking.',
        'Sin pago real, no podés bloquear el turno o reservar el producto.',
      ]},
      { type: 'h2', text: 'La solución: links de pago de MercadoPago' },
      { type: 'p', text: 'MercadoPago te permite generar links de pago únicos por transacción. El cliente abre el link, paga con tarjeta/efectivo/saldo MP, y vos recibís una notificación automática (webhook) confirmando el pago.' },
      { type: 'h2', text: '¿Cómo se hace con Akira Cloud?' },
      { type: 'p', text: 'Akira genera el link de pago automáticamente cuando el cliente confirma un turno o un producto. El cliente paga, MercadoPago avisa al bot, y el bot confirma el turno/pedido al cliente sin que vos hagas nada. Todo en menos de 30 segundos.' },
      { type: 'h2', text: 'Ventajas concretas' },
      { type: 'list', items: [
        'Cobro instantáneo — el cliente paga en el momento, no después.',
        'Cero verificación manual — sabés que está pagado porque MercadoPago te avisa.',
        'Reduce los "fantasmas" (clientes que reservan y no van).',
        'Permite cobrar la seña antes de bloquear el turno.',
        'Funciona con tarjetas de crédito, débito, efectivo (Rapipago, Pago Fácil) y saldo MP.',
      ]},
      { type: 'h2', text: 'Costo' },
      { type: 'p', text: 'MercadoPago cobra entre 2.99% y 6.29% por transacción (depende del medio de pago). Akira Cloud no cobra comisión adicional sobre los pagos — usás tu propia cuenta de MercadoPago, el dinero va directo a tu MP.' },
      { type: 'cta' },
    ],
  },
  {
    slug: 'bot-whatsapp-vs-secretaria',
    title: 'Bot de WhatsApp con IA vs secretaria: cuándo conviene cada uno',
    description: 'Comparativa honesta entre tener una secretaria humana y un bot de WhatsApp con IA. Costos, ventajas y cuándo conviene cada uno.',
    keywords: 'bot whatsapp vs secretaria, asistente virtual vs secretaria, automatizar atencion al cliente, ahorrar costos atencion cliente, ia para pymes argentina',
    tag: 'Comparativas',
    date: '2026-05-05',
    minutos: 4,
    excerpt: '¿Conviene contratar una secretaria que cobra $400.000/mes o usar un bot de WhatsApp por $30.000? Te lo respondo sin chamuyo, con números reales.',
    body: [
      { type: 'p', text: 'La pregunta del millón si tenés un negocio que crece: ¿contrato secretaria o uso un bot de WhatsApp con IA? Te lo respondo con datos, no con marketing.' },
      { type: 'h2', text: 'Costos reales (Argentina, mayo 2026)' },
      { type: 'list', items: [
        'Secretaria 8hs/día: $350.000-$500.000/mes (sueldo bruto + cargas + ART + aguinaldo). En blanco son fácil $700k.',
        'Secretaria part-time 4hs: $200.000-$280.000/mes.',
        'Bot Akira Cloud Pro: $35.000/mes (mensajes ilimitados, Calendar, MercadoPago, audio).',
      ]},
      { type: 'h2', text: 'Ventajas de la secretaria humana' },
      { type: 'list', items: [
        'Empatía real — un paciente angustiado, un cliente complicado.',
        'Decisiones complejas que requieren contexto humano.',
        'Tareas múltiples (atender presencial + telefónicas + administrativas).',
        'Sentido común en situaciones imprevistas.',
      ]},
      { type: 'h2', text: 'Ventajas del bot con IA' },
      { type: 'list', items: [
        'Funciona 24/7 — atiende a las 3am, los domingos, los feriados.',
        'Velocidad de respuesta < 5 segundos siempre.',
        'No se enferma, no toma vacaciones, no cobra aguinaldo.',
        'Maneja 100 conversaciones simultáneas sin estresarse.',
        'Cobra automáticamente con MercadoPago.',
        'Manda recordatorios automáticos.',
        'Cuesta 10-15 veces menos.',
      ]},
      { type: 'h2', text: '¿Cuándo conviene cada uno?' },
      { type: 'p', text: 'Bot solo: si tu negocio es transaccional (turnos, reservas, pedidos). Peluquerías, consultorios, gimnasios, alquileres, restaurantes con reservas — el bot resuelve el 95% de los casos solo.' },
      { type: 'p', text: 'Secretaria sola: si tu negocio requiere mucha atención humana sensible (clínica psicológica, abogacía con clientes en conflicto, atención de quejas).' },
      { type: 'p', text: 'Combinación (lo más común): bot atendiendo el 90% (consultas, turnos, pagos) y persona física resolviendo el 10% complejo. Esto te ahorra una secretaria full-time y te queda alguien part-time o vos mismo manejando excepciones.' },
      { type: 'h2', text: 'Recomendación práctica' },
      { type: 'p', text: 'Probá el bot gratis 1 mes (Akira tiene trial sin tarjeta). Si descubrís que el 90% de tus mensajes los puede manejar el bot, ya recuperaste 5x lo que ibas a pagar en secretaria. Si descubrís que necesitás humano para todo, al menos sabés que el bot no es para vos.' },
      { type: 'cta' },
    ],
  },
];

// ── Index del blog (lista de posts) ─────────────────────────
function BlogIndex() {
  useSeo({
    title: 'Blog de Akira Cloud — Guías, comparativas y consejos sobre WhatsApp, IA y automatización',
    description: 'El blog de Akira Cloud: guías prácticas para automatizar tu negocio con WhatsApp e inteligencia artificial. Cómo agendar turnos, cobrar con MercadoPago, comparativas y casos de uso.',
    keywords: 'blog whatsapp ia, blog bot whatsapp, blog automatizacion whatsapp, articulos chatbot, guias whatsapp business, akira cloud blog',
    canonical: 'https://akiracloud.lat/blog',
  });

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      <header className="px-5 md:px-8 py-4 sticky top-0 z-40"
        style={{ background: 'rgba(13,13,13,0.85)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}>
              <Bot size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <span className="font-bold text-base text-white">Akira<span style={{ color: 'var(--accent)' }}> Cloud</span></span>
          </Link>
          <Link to="/register" className="btn-primary text-sm px-4 py-2">Empezar gratis</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 md:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white">
            Blog de <span style={{ color: 'var(--accent)' }}>Akira Cloud</span>
          </h1>
          <p className="mt-4 text-base max-w-2xl mx-auto" style={{ color: 'var(--text2)' }}>
            Guías prácticas, comparativas y consejos para automatizar tu negocio
            con WhatsApp e inteligencia artificial.
          </p>
        </div>

        <div className="space-y-4">
          {POSTS.map((p) => (
            <Link key={p.slug} to={`/blog/${p.slug}`}
              className="block p-6 rounded-2xl transition-all hover:-translate-y-1"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--muted)' }}>
                <span className="px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(0,232,123,0.10)', color: 'var(--accent)' }}>
                  {p.tag}
                </span>
                <span className="flex items-center gap-1"><Calendar size={11} /> {p.date}</span>
                <span className="flex items-center gap-1"><Clock size={11} /> {p.minutos} min</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-white">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
                {p.excerpt}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                Leer artículo <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link to="/" className="btn-secondary text-sm px-5 py-2.5">
            Volver al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}

// ── Post individual ─────────────────────────────────────────
function BlogPost({ post }) {
  const canonical = `https://akiracloud.lat/blog/${post.slug}`;

  // JSON-LD Article
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Person',
      name: 'Juan Martín Arrayago',
      alternateName: 'TinchoDev',
      url: 'https://martinarrayago.lat',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Akira Cloud',
      logo: { '@type': 'ImageObject', url: 'https://akiracloud.lat/favicon.svg' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: 'es-AR',
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://akiracloud.lat/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://akiracloud.lat/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
    ],
  };

  useSeo({
    title: `${post.title} | Akira Cloud`,
    description: post.description,
    keywords: post.keywords,
    canonical,
    faqJsonLd: articleJsonLd,
    breadcrumb,
  });

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      <header className="px-5 md:px-8 py-4 sticky top-0 z-40"
        style={{ background: 'rgba(13,13,13,0.85)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}>
              <Bot size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <span className="font-bold text-base text-white">Akira<span style={{ color: 'var(--accent)' }}> Cloud</span></span>
          </Link>
          <Link to="/blog" className="text-sm flex items-center gap-1 hover:text-white" style={{ color: 'var(--text2)' }}>
            <ChevronLeft size={14} /> Blog
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-8 py-16">
        <article>
          <div className="flex items-center gap-3 text-xs mb-4" style={{ color: 'var(--muted)' }}>
            <span className="px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(0,232,123,0.10)', color: 'var(--accent)' }}>
              {post.tag}
            </span>
            <span>{post.date}</span>
            <span>·</span>
            <span>{post.minutos} min de lectura</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
            {post.title}
          </h1>
          <p className="mt-4 text-base md:text-lg" style={{ color: 'var(--text2)' }}>
            {post.excerpt}
          </p>

          <div className="mt-10 space-y-5 text-base leading-relaxed" style={{ color: 'var(--text)' }}>
            {post.body.map((block, i) => {
              if (block.type === 'h2') {
                return <h2 key={i} className="text-2xl font-bold text-white pt-4">{block.text}</h2>;
              }
              if (block.type === 'p') {
                return <p key={i}>{block.text}</p>;
              }
              if (block.type === 'list') {
                return (
                  <ul key={i} className="space-y-2 pl-2">
                    {block.items.map((it, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <span style={{ color: 'var(--accent)' }} className="mt-1">▸</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                );
              }
              if (block.type === 'cta') {
                return (
                  <div key={i} className="mt-8 p-6 rounded-2xl text-center"
                    style={{
                      background: 'linear-gradient(160deg, rgba(0,232,123,0.10) 0%, var(--surface) 60%)',
                      border: '1px solid rgba(0,232,123,0.30)',
                    }}>
                    <h3 className="text-xl font-bold text-white">¿Querés probarlo?</h3>
                    <p className="mt-2 text-sm" style={{ color: 'var(--text2)' }}>
                      100 mensajes gratis, sin tarjeta, en 5 minutos.
                    </p>
                    <Link to="/register" className="mt-4 inline-flex btn-primary text-sm px-5 py-2.5">
                      Empezar ahora <ArrowRight size={14} />
                    </Link>
                  </div>
                );
              }
              return null;
            })}
          </div>

          <div className="mt-16 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>
              Escrito por <Link to="/#creador" className="font-semibold hover:text-white" style={{ color: 'var(--accent)' }}>Juan Martín Arrayago (TinchoDev)</Link>,
              creador y fundador de Akira Cloud.
            </p>
          </div>
        </article>

        <div className="mt-12">
          <h3 className="text-lg font-bold text-white mb-4">Otros artículos</h3>
          <div className="space-y-3">
            {POSTS.filter((p) => p.slug !== post.slug).slice(0, 3).map((p) => (
              <Link key={p.slug} to={`/blog/${p.slug}`}
                className="block p-4 rounded-xl transition-colors hover:bg-[var(--surface2)]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-sm font-bold text-white">{p.title}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{p.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Router internal: index vs post según param ──────────────
export default function Blog() {
  const { slug } = useParams();
  if (!slug) return <BlogIndex />;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) {
    return (
      <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', padding: '4rem 1rem', textAlign: 'center' }}>
        <h1 className="text-2xl font-bold text-white">Artículo no encontrado</h1>
        <Link to="/blog" className="mt-4 inline-block btn-primary text-sm px-5 py-2.5">Ver todos los artículos</Link>
      </div>
    );
  }
  return <BlogPost post={post} />;
}

// Exportamos POSTS para que el sitemap dinámico (si en el futuro lo hacemos)
// pueda leer la lista. Por ahora el sitemap.xml estático en public/ se mantiene.
export { POSTS };
