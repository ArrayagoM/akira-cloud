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
    .replace(/`(.+?)`/g, '<code style="background:rgba(0,232,123,0.1);padding:1px 5px;border-radius:4px;font-size:0.75rem;color:#00e87b;">$1</code>')
    .replace(/\n/g, '<br/>');
}

export default function AkiraSupport() {
  const [abierto, setAbierto]           = useState(false);
  const [mensajes, setMensajes]         = useState([MENSAJE_BIENVENIDA]);
  const [input, setInput]               = useState('');
  const [cargando, setCargando]         = useState(false);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [notif, setNotif]               = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const cargar = async () => {
      setCargandoHist(true);
      try {
        const { data } = await api.get('/support/history');
        if (data.messages?.length > 0) setMensajes([MENSAJE_BIENVENIDA, ...data.messages]);
      } catch {} finally { setCargandoHist(false); }
    };
    cargar();
  }, [abierto]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, cargando]);

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 100);
  }, [abierto]);

  const enviar = useCallback(async () => {
    const texto = input.trim();
    if (!texto || cargando) return;
    setInput('');
    setMensajes(prev => [...prev, { role: 'user', content: texto, timestamp: new Date().toISOString() }]);
    setCargando(true);
    try {
      const { data } = await api.post('/support/chat', { mensaje: texto });
      setMensajes(prev => [...prev, { role: 'assistant', content: data.respuesta, timestamp: data.timestamp }]);
    } catch (err) {
      const msg = err.response?.data?.error || 'No pude conectarme. Intentá de nuevo.';
      setMensajes(prev => [...prev, { role: 'assistant', content: `❌ ${msg}`, timestamp: new Date().toISOString() }]);
    } finally {
      setCargando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, cargando]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  };

  const limpiar = async () => {
    try { await api.delete('/support/history'); setMensajes([MENSAJE_BIENVENIDA]); } catch {}
  };

  const toggleAbierto = () => { setAbierto(v => !v); setNotif(false); };

  return (
    <>
      {/* Botón flotante + burbuja */}
      <div className="fixed z-50 flex flex-col items-end gap-2"
        style={{ bottom: '5rem', right: '1rem' }}
        /* en md+ bajamos al lugar habitual */
      >
        <style>{`
          @media (min-width: 768px) {
            .support-wrap { bottom: 1.5rem !important; right: 1.5rem !important; }
          }
        `}</style>
        <div className="support-wrap fixed z-50 flex flex-col items-end gap-2" style={{ bottom: '5rem', right: '1rem' }}>

          {/* Burbuja de ayuda */}
          {!abierto && (
            <div className="text-sm px-3 py-1.5 rounded-full shadow-lg animate-bounce-soft"
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              }}>
              ¿Necesitás ayuda? 💬
            </div>
          )}

          {/* Botón principal */}
          <button
            onClick={toggleAbierto}
            className="relative w-13 h-13 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              width: '52px', height: '52px',
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
            }}
            aria-label="Soporte Akira"
          >
            {abierto
              ? <ChevronDown size={22} color="white" />
              : <MessageCircle size={22} color="white" />}
            {notif && !abierto && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full"
                style={{ background: '#f43f5e', border: '2px solid var(--bg)' }} />
            )}
          </button>
        </div>
      </div>

      {/* Ventana de chat */}
      {abierto && (
        <div className="fixed z-50 flex flex-col overflow-hidden animate-scale-in"
          style={{
            bottom: 'calc(5rem + 64px)',
            right: '1rem',
            width: 'min(360px, calc(100vw - 24px))',
            height: '500px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '18px',
            boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
          }}>
          <style>{`
            @media (min-width: 768px) {
              .chat-window { bottom: calc(1.5rem + 64px) !important; right: 1.5rem !important; }
            }
          `}</style>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #5b21b6, #4338ca)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
              <Bot size={16} color="white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">Akira — Soporte</p>
              <p className="text-xs" style={{ color: 'rgba(196,181,253,0.85)' }}>Asistente técnico IA · Siempre disponible</p>
            </div>
            <button onClick={limpiar} title="Limpiar conversación"
              className="p-1.5 rounded-lg transition-colors hover:bg-white/10">
              <Trash2 size={14} color="rgba(196,181,253,0.85)" />
            </button>
            <button onClick={toggleAbierto}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/10">
              <X size={14} color="white" />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {cargandoHist && (
              <div className="flex justify-center py-4">
                <Loader2 size={18} className="animate-spin" style={{ color: '#7c3aed' }} />
              </div>
            )}
            {mensajes.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                    <Bot size={13} color="white" />
                  </div>
                )}
                <div className="max-w-[82%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
                  style={msg.role === 'user'
                    ? { background: 'linear-gradient(135deg, #5b21b6, #4338ca)', color: 'white', borderTopRightRadius: '4px' }
                    : { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderTopLeftRadius: '4px' }}>
                  <p dangerouslySetInnerHTML={{ __html: renderMensaje(msg.content) }} />
                </div>
              </div>
            ))}

            {cargando && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                  <Bot size={13} color="white" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="flex gap-1 items-center">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ background: '#7c3aed', animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribí tu consulta..."
                rows={1}
                className="flex-1 rounded-xl px-3 py-2.5 text-sm resize-none outline-none transition-all duration-200"
                style={{
                  background: 'var(--surface3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  maxHeight: '90px',
                  overflowY: 'auto',
                }}
                onFocus={e => e.target.style.borderColor = '#7c3aed'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
                disabled={cargando}
              />
              <button
                onClick={enviar}
                disabled={!input.trim() || cargando}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', opacity: !input.trim() || cargando ? 0.4 : 1 }}>
                <Send size={15} color="white" />
              </button>
            </div>
            <p className="text-xs text-center mt-1.5" style={{ color: 'var(--muted)' }}>
              Enter para enviar · Shift+Enter nueva línea
            </p>
          </div>
        </div>
      )}
    </>
  );
}
