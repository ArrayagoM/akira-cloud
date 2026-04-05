import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Lightbulb, Send, Clock, CheckCircle2, Zap, XCircle, ChevronUp, Loader2 } from 'lucide-react';

const ESTADO_CONFIG = {
  analizando:   { label: 'Analizando…',   color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',   icon: <Loader2 size={11} className="animate-spin" /> },
  analizada:    { label: 'Recibida',       color: 'text-gray-400',   bg: 'bg-gray-500/10 border-gray-500/20',   icon: <Clock size={11} /> },
  en_progreso:  { label: 'En desarrollo',  color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: <Zap size={11} /> },
  implementada: { label: '¡Implementada!', color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',  icon: <CheckCircle2 size={11} /> },
  descartada:   { label: 'No aplicable',   color: 'text-gray-600',   bg: 'bg-gray-800/40 border-gray-700',       icon: <XCircle size={11} /> },
};

const SCORE_COLOR = (p) =>
  !p ? 'text-gray-600' :
  p >= 8 ? 'text-green-400' :
  p >= 5 ? 'text-yellow-400' : 'text-gray-500';

export default function SugerenciasPage() {
  const [texto,       setTexto]       = useState('');
  const [enviando,    setEnviando]    = useState(false);
  const [sugerencias, setSugerencias] = useState([]);
  const [loading,     setLoading]     = useState(true);

  const cargar = async () => {
    try {
      const r = await api.get('/suggestions/mias');
      setSugerencias(r.data.sugerencias || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const enviar = async (e) => {
    e.preventDefault();
    if (texto.trim().length < 20) { toast.error('Escribí al menos 20 caracteres'); return; }
    setEnviando(true);
    try {
      await api.post('/suggestions', { texto: texto.trim() });
      toast.success('¡Sugerencia enviada! La IA la está analizando.');
      setTexto('');
      setTimeout(cargar, 2000); // recargar después de 2s
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar');
    } finally { setEnviando(false); }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6 pb-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Lightbulb size={22} className="text-yellow-400" />
            Ideas y sugerencias
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Compartí ideas para mejorar Akira Cloud. Las mejores se implementan.
          </p>
        </div>

        {/* Form */}
        <div className="card">
          <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Send size={14} className="text-yellow-400" />
            Nueva sugerencia
          </p>
          <form onSubmit={enviar} className="space-y-3">
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={4}
              maxLength={2000}
              className="input-base resize-none w-full"
              placeholder="Ej: Me gustaría que el bot pueda enviar fotos de los productos del catálogo cuando el cliente pregunta por un ítem específico..."
            />
            <div className="flex items-center justify-between">
              <span className={`text-xs ${texto.length > 1800 ? 'text-yellow-400' : 'text-gray-600'}`}>
                {texto.length}/2000
              </span>
              <button type="submit" disabled={enviando || texto.trim().length < 20} className="btn-primary text-sm px-5 py-2">
                {enviando
                  ? <><Loader2 size={13} className="animate-spin" />Enviando...</>
                  : <><Send size={13} />Enviar idea</>}
              </button>
            </div>
          </form>
        </div>

        {/* Mis sugerencias */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Clock size={14} className="text-gray-500" />
            Mis sugerencias
            {sugerencias.length > 0 && <span className="text-xs text-gray-600 ml-auto">{sugerencias.length} enviadas</span>}
          </h2>

          {loading ? (
            <div className="card text-center py-8"><Loader2 size={20} className="animate-spin text-gray-600 mx-auto" /></div>
          ) : sugerencias.length === 0 ? (
            <div className="card text-center py-10 border-dashed border-gray-800 bg-transparent">
              <Lightbulb size={28} className="text-gray-700 mx-auto mb-2" />
              <p className="text-gray-600 text-sm">Todavía no enviaste ninguna sugerencia</p>
              <p className="text-gray-700 text-xs mt-1">¡Las mejores ideas se implementan!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sugerencias.map(s => {
                const cfg = ESTADO_CONFIG[s.estado] || ESTADO_CONFIG.analizada;
                return (
                  <div key={s._id} className="card space-y-2.5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-gray-300 leading-relaxed flex-1">{s.texto}</p>
                      <span className={`text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                    {/* Análisis IA */}
                    {s.analisisIA?.resumen && s.estado !== 'analizando' && (
                      <div className="bg-gray-900/60 rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-gray-500">Análisis IA:</span>
                          {s.puntuacion && (
                            <span className={`text-xs font-bold ${SCORE_COLOR(s.puntuacion)}`}>
                              ★ {s.puntuacion}/10
                            </span>
                          )}
                          {s.analisisIA.categoria && (
                            <span className="text-xs text-gray-500 bg-gray-800 rounded px-1.5 py-0.5">
                              {s.analisisIA.categoria}
                            </span>
                          )}
                          {s.analisisIA.prioridad && (
                            <span className={`text-xs ${s.analisisIA.prioridad === 'crítica' || s.analisisIA.prioridad === 'alta' ? 'text-orange-400' : 'text-gray-500'}`}>
                              Prioridad: {s.analisisIA.prioridad}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">{s.analisisIA.resumen}</p>
                        {s.analisisIA.valor && (
                          <p className="text-xs text-gray-500 italic">{s.analisisIA.valor}</p>
                        )}
                      </div>
                    )}
                    {/* Nota del admin */}
                    {s.notaAdmin && (
                      <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2">
                        <p className="text-xs text-green-400 font-medium mb-0.5">💬 Respuesta del equipo:</p>
                        <p className="text-xs text-gray-300">{s.notaAdmin}</p>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-700">
                      {new Date(s.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
