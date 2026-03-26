// components/AkiraSupport.jsx
// Widget flotante de soporte técnico con Akira IA
import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Trash2, Loader2, Bot, ChevronDown } from 'lucide-react';
import api from '../services/api';

const MENSAJE_BIENVENIDA = {
  role: 'assistant',
  content: '¡Hola! 👋 Soy **Akira**, tu asistente de soporte técnico. Estoy acá para ayudarte con cualquier duda sobre la plataforma.\n\n¿En qué te puedo ayudar hoy?',
  timestamp: new Date().toISOString(),
};

function renderMensaje(texto) {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-700 px-1 rounded text-xs">$1</code>')
    .replace(/\n/g, '<br/>');
}

export default function AkiraSupport() {
  const [abierto, setAbierto]         = useState(false);
  const [mensajes, setMensajes]       = useState([MENSAJE_BIENVENIDA]);
  const [input, setInput]             = useState('');
  const [cargando, setCargando]       = useState(false);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [notif, setNotif]             = useState(false);
  const bottomRef                     = useRef(null);
  const inputRef                      = useRef(null);

  // ── Cargar historial al abrir ────────────────────────────────
  useEffect(() => {
    if (!abierto) return;
    const cargar = async () => {
      setCargandoHist(true);
      try {
        const { data } = await api.get('/support/history');
        if (data.messages?.length > 0) {
          setMensajes([MENSAJE_BIENVENIDA, ...data.messages]);
        }
      } catch {
        // Si falla, mostramos solo el mensaje de bienvenida
      } finally {
        setCargandoHist(false);
      }
    };
    cargar();
  }, [abierto]);

  // ── Scroll al fondo cuando llegan mensajes ───────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, cargando]);

  // ── Focus al input al abrir ──────────────────────────────────
  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 100);
  }, [abierto]);

  // ── Enviar mensaje ───────────────────────────────────────────
  const enviar = useCallback(async () => {
    const texto = input.trim();
    if (!texto || cargando) return;

    setInput('');
    setMensajes(prev => [...prev, { role: 'user', content: texto, timestamp: new Date().toISOString() }]);
    setCargando(true);

    try {
      const { data } = await api.post('/support/chat', { mensaje: texto });
      setMensajes(prev => [...prev, {
        role: 'assistant',
        content: data.respuesta,
        timestamp: data.timestamp,
      }]);
    } catch (err) {
      const msg = err.response?.data?.error || 'No pude conectarme. Intentá de nuevo.';
      setMensajes(prev => [...prev, {
        role: 'assistant',
        content: `❌ ${msg}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setCargando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, cargando]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  };

  // ── Limpiar historial ────────────────────────────────────────
  const limpiar = async () => {
    try {
      await api.delete('/support/history');
      setMensajes([MENSAJE_BIENVENIDA]);
    } catch {}
  };

  // ── Abrir/cerrar ─────────────────────────────────────────────
  const toggleAbierto = () => {
    setAbierto(v => !v);
    setNotif(false);
  };

  return (
    <>
      {/* ── Widget flotante ─────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">

        {/* Burbuja de ayuda */}
        {!abierto && (
          <div className="bg-gray-800 text-white text-sm px-3 py-1.5 rounded-full shadow-lg animate-bounce-slow border border-purple-500/30">
            ¿Necesitás ayuda? 💬
          </div>
        )}

        {/* Botón principal */}
        <button
          onClick={toggleAbierto}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg shadow-purple-500/30 flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Soporte Akira"
        >
          {abierto
            ? <ChevronDown className="w-6 h-6 text-white" />
            : <MessageCircle className="w-6 h-6 text-white" />
          }
          {notif && !abierto && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-gray-900" />
          )}
        </button>
      </div>

      {/* ── Ventana de chat ──────────────────────────────────── */}
      {abierto && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-24px)] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
          style={{ height: '520px' }}
        >

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-700 to-indigo-700">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">Akira — Soporte</p>
              <p className="text-purple-200 text-xs">Asistente técnico IA · Siempre disponible</p>
            </div>
            <button onClick={limpiar} title="Limpiar conversación"
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-purple-200" />
            </button>
            <button onClick={toggleAbierto}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-700">
            {cargandoHist && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              </div>
            )}

            {mensajes.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700'
                }`}>
                  <p dangerouslySetInnerHTML={{ __html: renderMensaje(msg.content) }} />
                </div>
              </div>
            ))}

            {/* Indicador de escritura */}
            {cargando && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-gray-800 border border-gray-700 px-4 py-3 rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-700 bg-gray-900">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribí tu consulta..."
                rows={1}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-purple-500 transition-colors"
                style={{ maxHeight: '100px', overflowY: 'auto' }}
                disabled={cargando}
              />
              <button
                onClick={enviar}
                disabled={!input.trim() || cargando}
                className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1.5 text-center">Enter para enviar · Shift+Enter nueva línea</p>
          </div>
        </div>
      )}
    </>
  );
}
