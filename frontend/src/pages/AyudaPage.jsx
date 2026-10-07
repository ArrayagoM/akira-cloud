import { useState, useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { LifeBuoy, Search, ChevronDown, Lightbulb, Mail, BookOpen } from 'lucide-react';
import { ARTICULOS, CATEGORIAS, buscar } from '../data/ayuda';

// Centro de ayuda: respuestas cortas con pasos, con buscador. Para la guía larga está "Documentación".
export default function AyudaPage() {
  const { hash } = useLocation();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [abierto, setAbierto] = useState(() => (hash ? hash.slice(1) : ''));
  useEffect(() => { if (hash) { setAbierto(hash.slice(1)); setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); } }, [hash]);

  const resultados = useMemo(() => buscar(q).filter((a) => !cat || a.cat === cat), [q, cat]);
  const grupos = useMemo(() => CATEGORIAS.map((c) => [c, resultados.filter((a) => a.cat === c)]).filter(([, l]) => l.length), [resultados]);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><LifeBuoy size={22} className="text-[var(--accent)]" /> Ayuda</h1>
          <p className="text-sm text-gray-500">Buscá lo que necesitás hacer. Cada respuesta te dice dónde tocar, paso a paso.</p>
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: cobrar seña, importar clientes, el bot no responde…" autoFocus
            className="w-full rounded-xl bg-black/30 border border-white/10 pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['', ...CATEGORIAS].map((c) => (
            <button key={c || 'todas'} onClick={() => setCat(c)} className="text-xs px-3 py-1 rounded-full border"
              style={cat === c ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{c || 'Todas'}</button>
          ))}
        </div>

        {resultados.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-white font-medium">No encontré nada para “{q}”</p>
            <p className="text-sm text-gray-500 mt-1">Probá con otras palabras o escribinos y te ayudamos.</p>
            <a href="mailto:soporte@akiracloud.lat" className="btn-primary text-sm inline-flex items-center gap-2 mt-4"><Mail size={14} /> soporte@akiracloud.lat</a>
          </div>
        ) : grupos.map(([c, lista]) => (
          <section key={c} className="space-y-2">
            <h2 className="text-xs uppercase tracking-widest text-gray-500 pt-2">{c}</h2>
            {lista.map((a) => {
              const on = abierto === a.id;
              return (
                <div key={a.id} id={a.id} className="card py-0 overflow-hidden">
                  <button className="w-full flex items-center gap-3 py-3 text-left" onClick={() => setAbierto(on ? '' : a.id)} aria-expanded={on}>
                    <span className="flex-1 text-sm font-medium text-white">{a.titulo}</span>
                    <ChevronDown size={16} className={`text-gray-500 transition ${on ? 'rotate-180' : ''}`} />
                  </button>
                  {on && (
                    <div className="pb-4 space-y-3">
                      <ol className="space-y-1.5">
                        {a.pasos.map((p, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-gray-300"><span className="w-5 h-5 rounded-full bg-white/10 text-[11px] text-gray-300 flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span><span>{p}</span></li>
                        ))}
                      </ol>
                      {a.consejo && <p className="text-xs rounded-lg px-3 py-2 flex gap-2" style={{ background: 'rgba(0,232,123,0.06)', color: '#a7f3d0' }}><Lightbulb size={14} className="flex-shrink-0 mt-0.5" /> {a.consejo}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}

        <div className="card flex flex-wrap items-center gap-3 text-sm">
          <BookOpen size={18} className="text-gray-500" />
          <div className="flex-1 min-w-[200px]"><p className="text-white">¿Querés la guía completa?</p><p className="text-xs text-gray-500">La documentación explica todo con más detalle.</p></div>
          <Link to="/documentacion" className="btn-secondary text-xs">Abrir la documentación</Link>
          <a href="mailto:soporte@akiracloud.lat" className="btn-secondary text-xs flex items-center gap-1.5"><Mail size={12} /> Escribirnos</a>
        </div>
      </div>
    </Layout>
  );
}
