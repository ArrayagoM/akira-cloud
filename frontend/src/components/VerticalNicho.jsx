// VerticalNicho.jsx
// Página vertical reusable optimizada para SEO por nicho.
// Cada nicho (peluquerías, consultorios, gimnasios, etc.) renderiza una
// instancia con sus propios keywords, copy, FAQ y JSON-LD.
//
// Cómo se usa: ver pages/Peluquerias.jsx, pages/Consultorios.jsx, etc.

import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import {
  ArrowRight, CheckCircle, MessageSquare, Calendar, CreditCard,
  Bell, Bot, Sparkles, Shield, Star, Quote, Users,
} from 'lucide-react';

// ── Hook: setear title + meta description + canonical + JSON-LD por página ──
export function useSeo({ title, description, canonical, keywords, faqJsonLd, breadcrumb }) {
  useEffect(() => {
    if (title) document.title = title;

    const setMeta = (name, content, attr = 'name') => {
      if (!content) return;
      let tag = document.querySelector(`meta[${attr}="${name}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    setMeta('description', description);
    setMeta('keywords', keywords);
    setMeta('og:title', title, 'property');
    setMeta('og:description', description, 'property');
    if (canonical) setMeta('og:url', canonical, 'property');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);

    // canonical
    let link = document.querySelector('link[rel="canonical"]');
    if (link && canonical) link.setAttribute('href', canonical);

    // JSON-LD dinámico (FAQ + Breadcrumb)
    const existing = document.querySelectorAll('script[data-page-jsonld="true"]');
    existing.forEach((s) => s.remove());

    const blocks = [];
    if (faqJsonLd) blocks.push(faqJsonLd);
    if (breadcrumb) blocks.push(breadcrumb);
    blocks.forEach((b) => {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.dataset.pageJsonld = 'true';
      s.textContent = JSON.stringify(b);
      document.head.appendChild(s);
    });

    return () => {
      // Cleanup al desmontar — saca los JSON-LD añadidos
      document.querySelectorAll('script[data-page-jsonld="true"]').forEach((s) => s.remove());
    };
  }, [title, description, canonical, keywords, faqJsonLd, breadcrumb]);
}

// ── Componente principal ──
export default function VerticalNicho({
  // Identidad del nicho
  nicho,             // ej: "peluquerías"
  nichoUpper,        // ej: "Peluquerías"
  nichoSingular,     // ej: "peluquería"
  emoji,             // ej: "💇"
  slug,              // ej: "peluquerias"

  // SEO
  title,
  description,
  keywords,

  // Contenido
  hero,              // { eyebrow, h1, sub }
  beneficios,        // [{ Icon, titulo, desc }]
  casosDeUso,        // [string]
  faq,               // [{ q, a }]
  testimonio,        // { texto, autor, rol }
}) {
  const canonical = `https://akiracloud.lat/${slug}`;

  // FAQ JSON-LD
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://akiracloud.lat/' },
      { '@type': 'ListItem', position: 2, name: nichoUpper, item: canonical },
    ],
  };

  useSeo({ title, description, keywords, canonical, faqJsonLd, breadcrumb });

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      {/* ═══ Header simple ═══ */}
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
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm hover:text-white" style={{ color: 'var(--text2)' }}>Iniciar sesión</Link>
            <Link to="/register" className="btn-primary text-sm px-4 py-2">Empezar gratis</Link>
          </div>
        </div>
      </header>

      <main>
        {/* ═══ HERO ═══ */}
        <section className="px-5 md:px-8 pt-16 pb-20">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{
                background: 'rgba(0,232,123,0.10)',
                border: '1px solid rgba(0,232,123,0.25)',
                color: 'var(--accent)',
              }}>
              <span>{emoji}</span> {hero.eyebrow}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight leading-[1.05]">
              {hero.h1}
            </h1>
            <p className="mt-6 text-base md:text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text2)' }}>
              {hero.sub}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register" className="btn-primary text-base px-6 py-3">
                Probar gratis con mi {nichoSingular} <ArrowRight size={16} />
              </Link>
              <Link to="/#demo" className="btn-secondary text-base px-6 py-3">
                Ver demo en vivo
              </Link>
            </div>
            <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
              Sin tarjeta · 100 mensajes gratis · 5 minutos para configurar
            </p>
          </div>
        </section>

        {/* ═══ BENEFICIOS ═══ */}
        <section className="px-5 md:px-8 py-16" style={{ background: 'var(--surface)' }}>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white">
                ¿Qué hace Akira por tu {nichoSingular}?
              </h2>
              <p className="mt-3 text-base max-w-2xl mx-auto" style={{ color: 'var(--text2)' }}>
                Automatiza la atención y gestión de tus clientes mientras vos te
                concentrás en lo que sabés hacer.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {beneficios.map(({ Icon, titulo, desc }) => (
                <div key={titulo}
                  className="p-6 rounded-2xl transition-all hover:-translate-y-1"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: 'rgba(0,232,123,0.10)', border: '1px solid rgba(0,232,123,0.20)' }}>
                    <Icon size={20} style={{ color: 'var(--accent)' }} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">{titulo}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ CASOS DE USO ═══ */}
        <section className="px-5 md:px-8 py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-8">
              Lo que tus clientes pueden hacer solos
            </h2>
            <ul className="space-y-3">
              {casosDeUso.map((caso, i) => (
                <li key={i} className="flex items-start gap-3 p-4 rounded-xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <CheckCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm md:text-base" style={{ color: 'var(--text)' }}>{caso}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ═══ TESTIMONIO ═══ */}
        {testimonio && (
          <section className="px-5 md:px-8 py-16" style={{ background: 'var(--surface)' }}>
            <div className="max-w-3xl mx-auto text-center">
              <Quote size={28} className="mx-auto mb-4" style={{ color: 'var(--accent)' }} />
              <p className="text-lg md:text-xl italic leading-relaxed" style={{ color: 'var(--text)' }}>
                "{testimonio.texto}"
              </p>
              <div className="mt-6">
                <p className="font-bold text-white">{testimonio.autor}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{testimonio.rol}</p>
              </div>
              <div className="mt-3 flex justify-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} size={14} fill="var(--accent)" stroke="var(--accent)" />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ FAQ (también va al JSON-LD para Google) ═══ */}
        <section className="px-5 md:px-8 py-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-8">
              Preguntas frecuentes — {nichoUpper}
            </h2>
            <div className="space-y-3">
              {faq.map(({ q, a }, i) => (
                <details key={i}
                  className="p-5 rounded-xl group"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <summary className="cursor-pointer text-sm md:text-base font-semibold text-white list-none flex justify-between items-center">
                    <span>{q}</span>
                    <span className="transition-transform group-open:rotate-180" style={{ color: 'var(--accent)' }}>▼</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
                    {a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ CTA FINAL ═══ */}
        <section className="px-5 md:px-8 py-20">
          <div className="max-w-3xl mx-auto text-center p-10 rounded-3xl"
            style={{
              background: 'linear-gradient(160deg, rgba(0,232,123,0.10) 0%, var(--surface) 60%)',
              border: '1px solid rgba(0,232,123,0.30)',
            }}>
            <Sparkles size={28} className="mx-auto mb-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Empezá hoy con tu {nichoSingular}
            </h2>
            <p className="mt-3 text-base max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>
              Configurá tu bot en 5 minutos. Sin tarjeta. Si no te sirve, lo borrás y listo.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register" className="btn-primary text-base px-6 py-3">
                Crear mi cuenta gratis <ArrowRight size={16} />
              </Link>
              <Link to="/" className="btn-secondary text-base px-6 py-3">
                Volver al inicio
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer mínimo */}
      <footer className="px-5 md:px-8 py-8 text-center"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          © {new Date().getFullYear()} Akira Cloud — creado por <Link to="/#creador" className="hover:text-white">Juan M. Arrayago</Link>
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs">
          <Link to="/" style={{ color: 'var(--text2)' }} className="hover:text-white">Inicio</Link>
          <Link to="/peluquerias" style={{ color: 'var(--text2)' }} className="hover:text-white">Peluquerías</Link>
          <Link to="/consultorios" style={{ color: 'var(--text2)' }} className="hover:text-white">Consultorios</Link>
          <Link to="/gimnasios" style={{ color: 'var(--text2)' }} className="hover:text-white">Gimnasios</Link>
          <Link to="/alquileres" style={{ color: 'var(--text2)' }} className="hover:text-white">Alquileres</Link>
          <Link to="/restaurantes" style={{ color: 'var(--text2)' }} className="hover:text-white">Restaurantes</Link>
          <Link to="/blog" style={{ color: 'var(--text2)' }} className="hover:text-white">Blog</Link>
          <Link to="/privacidad" style={{ color: 'var(--text2)' }} className="hover:text-white">Privacidad</Link>
          <Link to="/terminos" style={{ color: 'var(--text2)' }} className="hover:text-white">Términos</Link>
        </div>
      </footer>
    </div>
  );
}
