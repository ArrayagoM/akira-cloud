// components/OnboardingChecklist.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X, ArrowRight, Zap } from 'lucide-react';
import api from '../services/api';

const STORAGE_KEY = 'akira_onboarding_dismissed';

function Paso({ hecho, titulo, descripcion, accion, onClick, opcional = false }) {
  return (
    <div className={`flex items-start gap-3 py-2.5 px-2 rounded-lg transition-all duration-150 ${hecho ? 'opacity-45' : ''}`}
      style={!hecho ? { cursor: 'default' } : {}}
      onMouseEnter={e => { if (!hecho) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={e => e.currentTarget.style.background = ''}>
      <div className="shrink-0 mt-0.5">
        {hecho
          ? <CheckCircle2 size={18} style={{ color: 'var(--accent)' }} />
          : <Circle size={18} className={opcional ? '' : ''} style={{ color: opcional ? 'var(--muted)' : 'var(--accent)', opacity: opcional ? 0.5 : 0.6 }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${hecho ? 'line-through' : 'text-white'}`}
          style={hecho ? { color: 'var(--muted)' } : {}}>
          {titulo}
          {opcional && !hecho && (
            <span className="ml-2 text-xs font-normal" style={{ textDecoration: 'none', color: 'var(--muted)' }}>opcional</span>
          )}
        </p>
        {!hecho && descripcion && (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text2)' }}>{descripcion}</p>
        )}
      </div>
      {!hecho && accion && onClick && (
        <button onClick={onClick}
          className="shrink-0 flex items-center gap-1 text-xs font-semibold transition-colors whitespace-nowrap"
          style={{ color: 'var(--accent)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#34ffb0'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--accent)'}>
          {accion} <ArrowRight size={10} />
        </button>
      )}
    </div>
  );
}

export default function OnboardingChecklist({ user, botStatus }) {
  const navigate  = useNavigate();
  const [keys,    setKeys]    = useState({});
  const [config,  setConfig]  = useState({});
  const [abierto, setAbierto] = useState(true);
  const [oculto,  setOculto]  = useState(
    () => localStorage.getItem(STORAGE_KEY) === '1'
  );

  useEffect(() => {
    api.get('/config')
      .then(r => { setKeys(r.data.keys || {}); setConfig(r.data.config || {}); })
      .catch(() => {});
  }, []);

  const pasos = [
    { id: 'cuenta',   titulo: 'Cuenta creada', descripcion: '', hecho: true },
    {
      id: 'groq',
      titulo: 'Configurar Groq API Key — la IA de tu bot',
      descripcion: 'Sin esto el bot no puede responder. Es gratis en console.groq.com → API Keys.',
      hecho: !!keys.groq,
      accion: 'Configurar ahora',
      onClick: () => navigate('/config'),
    },
    {
      id: 'negocio',
      titulo: 'Completar datos de tu negocio',
      descripcion: 'Nombre del negocio, servicios que ofrecés y precio del turno.',
      hecho: !!(config.miNombre && config.negocio),
      accion: 'Completar',
      onClick: () => navigate('/config'),
    },
    {
      id: 'bot',
      titulo: 'Iniciá el bot por primera vez',
      descripcion: 'Hacé click en "Iniciar bot" arriba a la derecha de esta pantalla.',
      hecho: !!(botStatus?.activo || botStatus?.conectado),
      accion: null,
    },
    {
      id: 'qr',
      titulo: 'Escaneá el QR con tu WhatsApp',
      descripcion: 'En tu celular: WhatsApp → ⋮ Menú → Dispositivos vinculados → Vincular.',
      hecho: !!botStatus?.conectado,
      accion: null,
    },
    {
      id: 'pago',
      titulo: 'Agregá un método de pago para cobrar turnos',
      descripcion: 'MercadoPago o Alias/CBU. El bot envía el link automáticamente.',
      hecho: !!(keys.mp || config.aliasTransferencia),
      accion: 'Configurar',
      onClick: () => navigate('/config'),
      opcional: true,
    },
    {
      id: 'calendar',
      titulo: 'Conectá Google Calendar',
      descripcion: 'El bot verifica disponibilidad real y crea eventos automáticamente.',
      hecho: !!(keys.googleCalendarOAuth || keys.credentialsGoogle),
      accion: 'Conectar',
      onClick: () => navigate('/config'),
      opcional: true,
    },
  ];

  const obligatorios  = pasos.filter(p => !p.opcional);
  const hechos        = pasos.filter(p => p.hecho).length;
  const total         = pasos.length;
  const porcentaje    = Math.round((hechos / total) * 100);
  const obligatorioOk = obligatorios.every(p => p.hecho);

  const cerrar = () => { localStorage.setItem(STORAGE_KEY, '1'); setOculto(true); };

  if (oculto) return null;

  return (
    <div className="rounded-xl p-4 animate-fade-up"
      style={{
        background: 'linear-gradient(135deg, rgba(0,232,123,0.05) 0%, var(--surface) 60%)',
        border: '1px solid rgba(0,232,123,0.15)',
        boxShadow: '0 0 32px rgba(0,232,123,0.05)',
      }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.2)' }}>
            <Zap size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {obligatorioOk ? '🎉 ¡Tu bot está listo para recibir clientes!' : 'Configurá tu bot — seguí estos pasos'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{hechos} de {total} pasos completados</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setAbierto(!abierto)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.background = 'var(--surface3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = ''; }}>
            {abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={cerrar}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.background = 'var(--surface3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = ''; }}
            title="No mostrar más">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface3)' }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${porcentaje}%`,
            background: 'linear-gradient(90deg, var(--accent), #00c4ff)',
            boxShadow: porcentaje > 0 ? '0 0 8px rgba(0,232,123,0.4)' : 'none',
          }}
        />
      </div>
      <p className="text-right text-xs mt-1" style={{ color: 'var(--muted)' }}>{porcentaje}% completado</p>

      {/* Lista */}
      {abierto && (
        <div className="mt-1 space-y-0.5">
          {pasos.map(p => <Paso key={p.id} {...p} />)}
        </div>
      )}

      {abierto && obligatorioOk && (
        <div className="mt-3 pt-3 text-center" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>
            ¡Ya podés recibir clientes por WhatsApp!{' '}
            <button onClick={cerrar} className="font-semibold transition-colors" style={{ color: 'var(--accent)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#34ffb0'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--accent)'}>
              Cerrar esta guía
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
