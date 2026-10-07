import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { BarChart3, Loader2, Trash2, HelpCircle, MessageCircleQuestion, Repeat2 } from 'lucide-react';

// Qué preguntan tus clientes y en qué momentos el bot no supo responder, para que mejores tu Conocimiento.
// Todo se calcula en esta PC y las preguntas se guardan sin teléfonos ni mails (90 días).
const cuando = (iso) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };

export default function AnalisisPage() {
  const [dias, setDias] = useState(30);
  const [r, setR] = useState(null);
  const cargar = useCallback(async () => { setR(null); try { setR((await api.get(`/app/analitica?dias=${dias}`)).data); } catch { toast.error('No se pudo cargar el análisis'); } }, [dias]);
  useEffect(() => { cargar(); }, [cargar]);

  const borrar = async () => {
    if (!window.confirm('¿Borrar todo el historial del análisis? Es solo el registro de preguntas; tus clientes y chats no se tocan.')) return;
    try { await api.delete('/app/analitica'); toast.success('Historial borrado'); cargar(); } catch { toast.error('No se pudo borrar'); }
  };
  const max = r?.temas?.[0]?.n || 1;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-page-in">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2"><BarChart3 size={22} className="text-[var(--accent)]" /> Qué preguntan</h1>
            <p className="text-sm text-gray-500">Lo que más consultan tus clientes y lo que el bot no supo responder.</p>
          </div>
          <select value={dias} onChange={(e) => setDias(parseInt(e.target.value, 10))} className="rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm text-white" aria-label="Período">
            <option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option>
          </select>
        </div>

        {!r ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div> : r.total === 0 ? (
          <div className="card text-center py-14"><MessageCircleQuestion className="mx-auto text-gray-600 mb-3" size={36} /><p className="text-white font-medium">Todavía no hay consultas para analizar</p><p className="text-sm text-gray-500 mt-1">A medida que tus clientes le escriban al bot, acá vas a ver qué preguntan más.</p></div>
        ) : (<>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="card py-3"><p className="text-2xl font-bold text-white">{r.total}</p><p className="text-[11px] text-gray-500">Consultas</p></div>
            <div className="card py-3"><p className="text-2xl font-bold" style={{ color: r.porcentajeResuelto >= 85 ? '#00e87b' : '#fbbf24' }}>{r.porcentajeResuelto}%</p><p className="text-[11px] text-gray-500">Resueltas por el bot</p></div>
            <div className="card py-3"><p className="text-2xl font-bold" style={{ color: r.sinRespuesta ? '#fbbf24' : '#9ca3af' }}>{r.sinRespuesta}</p><p className="text-[11px] text-gray-500">Sin respuesta</p></div>
          </div>

          <div className="card">
            <p className="text-sm font-semibold text-white mb-3">De qué hablan</p>
            <ul className="space-y-2.5">
              {r.temas.map((t) => (
                <li key={t.tema}>
                  <div className="flex justify-between text-sm"><span className="text-gray-200">{t.tema}</span><span className="text-gray-500">{t.n} · {t.porcentaje}%</span></div>
                  <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(4, (t.n / max) * 100)}%`, background: '#00e87b' }} /></div>
                  {t.ejemplos.length > 0 && <p className="text-[11px] text-gray-600 mt-1 truncate">Ej: {t.ejemplos.map((e) => `“${e}”`).join(' · ')}</p>}
                </li>
              ))}
            </ul>
          </div>

          {r.sinResponder.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(251,191,36,0.3)' }}>
              <p className="text-sm font-semibold text-white flex items-center gap-1.5"><HelpCircle size={15} style={{ color: '#fbbf24' }} /> Preguntas que el bot no supo responder</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">Sumá la respuesta a tu <Link to="/conocimiento" className="underline text-[var(--accent)]">Conocimiento</Link> (o al Catálogo) y la próxima vez la contesta sola.</p>
              <ul className="divide-y divide-white/5">
                {r.sinResponder.map((p) => (
                  <li key={p.pregunta} className="flex items-center justify-between gap-3 py-2"><span className="text-sm text-white">“{p.pregunta}”</span><span className="text-[11px] text-gray-500 shrink-0">{p.veces > 1 ? `${p.veces} veces · ` : ''}{cuando(p.ultima)}</span></li>
                ))}
              </ul>
            </div>
          )}

          {r.masPreguntadas.length > 0 && (
            <div className="card">
              <p className="text-sm font-semibold text-white flex items-center gap-1.5 mb-2"><Repeat2 size={15} /> Lo que más se repite</p>
              <ul className="divide-y divide-white/5">{r.masPreguntadas.map((p) => <li key={p.pregunta} className="flex justify-between gap-3 py-2 text-sm"><span className="text-gray-200">“{p.pregunta}”</span><span className="text-gray-500 shrink-0">{p.veces} veces</span></li>)}</ul>
              <p className="text-[11px] text-gray-500 mt-2">Si una pregunta se repite mucho, conviene dejar la respuesta clara en tu Conocimiento o en tu mensaje de bienvenida.</p>
            </div>
          )}
        </>)}

        <div className="flex items-center justify-between gap-3 text-[11px] text-gray-600">
          <p>Se guardan solo las preguntas, sin teléfonos, mails ni números largos, durante 90 días y únicamente en esta PC.</p>
          <button onClick={borrar} className="flex items-center gap-1 text-gray-500 hover:text-red-400 shrink-0"><Trash2 size={12} /> Borrar historial</button>
        </div>
      </div>
    </Layout>
  );
}
