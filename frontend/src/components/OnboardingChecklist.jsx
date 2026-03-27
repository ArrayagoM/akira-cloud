// components/OnboardingChecklist.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X, ArrowRight, Zap } from 'lucide-react';
import api from '../services/api';

const STORAGE_KEY = 'akira_onboarding_dismissed';

function Paso({ hecho, titulo, descripcion, accion, onClick, opcional = false }) {
  return (
    <div className={`flex items-start gap-3 py-3 px-1 rounded-lg transition-colors ${hecho ? 'opacity-50' : 'hover:bg-gray-800/40'}`}>
      <div className="shrink-0 mt-0.5">
        {hecho
          ? <CheckCircle2 size={20} className="text-green-400" />
          : <Circle size={20} className={opcional ? 'text-gray-600' : 'text-indigo-400'} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${hecho ? 'text-gray-500 line-through' : 'text-white'}`}>
          {titulo}
          {opcional && !hecho && (
            <span className="ml-2 text-xs text-gray-600 font-normal" style={{ textDecoration: 'none' }}>
              opcional
            </span>
          )}
        </p>
        {!hecho && descripcion && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{descripcion}</p>
        )}
      </div>
      {!hecho && accion && onClick && (
        <button
          onClick={onClick}
          className="shrink-0 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors whitespace-nowrap"
        >
          {accion} <ArrowRight size={11} />
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
    {
      id: 'cuenta',
      titulo: 'Cuenta creada',
      descripcion: '',
      hecho: true,
    },
    {
      id: 'groq',
      titulo: 'Configurar Groq API Key — la IA de tu bot',
      descripcion: 'Sin esto el bot no puede responder. Es gratis en console.groq.com → API Keys.',
      hecho: !!keys.groq,
      accion: 'Configurar ahora',
      onClick: () => navigate('/configuracion'),
    },
    {
      id: 'negocio',
      titulo: 'Completar datos de tu negocio',
      descripcion: 'Nombre del negocio, servicios que ofrecés y precio del turno.',
      hecho: !!(config.miNombre && config.negocio),
      accion: 'Completar',
      onClick: () => navigate('/configuracion'),
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
      descripcion: 'En tu celular: WhatsApp → ⋮ Menú → Dispositivos vinculados → Vincular dispositivo.',
      hecho: !!botStatus?.conectado,
      accion: null,
    },
    {
      id: 'pago',
      titulo: 'Agregá un método de pago para cobrar turnos',
      descripcion: 'MercadoPago o Alias/CBU. El bot envía el link de cobro automáticamente.',
      hecho: !!(keys.mp || config.aliasTransferencia),
      accion: 'Configurar',
      onClick: () => navigate('/configuracion'),
      opcional: true,
    },
    {
      id: 'calendar',
      titulo: 'Conectá Google Calendar',
      descripcion: 'El bot verifica disponibilidad real y crea eventos automáticamente.',
      hecho: !!(keys.googleCalendarOAuth || keys.credentialsGoogle),
      accion: 'Conectar',
      onClick: () => navigate('/configuracion'),
      opcional: true,
    },
  ];

  const obligatorios  = pasos.filter(p => !p.opcional);
  const hechos        = pasos.filter(p => p.hecho).length;
  const total         = pasos.length;
  const porcentaje    = Math.round((hechos / total) * 100);
  const obligatorioOk = obligatorios.every(p => p.hecho);

  const cerrar = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setOculto(true);
  };

  if (oculto) return null;

  return (
    <div className="card border border-indigo-800/40 bg-gradient-to-br from-indigo-950/30 to-gray-900/80">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <Zap size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {obligatorioOk
                ? '🎉 ¡Tu bot está listo para recibir clientes!'
                : 'Configurá tu bot — seguí estos pasos'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{hechos} de {total} pasos completados</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setAbierto(!abierto)} className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors rounded">
            {abierto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button onClick={cerrar} className="p-1.5 text-gray-600 hover:text-gray-400 transition-colors rounded" title="No mostrar más">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-green-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <p className="text-right text-xs text-gray-600 mt-1">{porcentaje}% completado</p>

      {/* Lista */}
      {abierto && (
        <div className="mt-2 divide-y divide-gray-800/40">
          {pasos.map(p => <Paso key={p.id} {...p} />)}
        </div>
      )}

      {/* Footer cuando todo listo */}
      {abierto && obligatorioOk && (
        <div className="mt-3 pt-3 border-t border-gray-800 text-center">
          <p className="text-xs text-gray-500">
            ¡Ya podés recibir clientes por WhatsApp!{' '}
            <button onClick={cerrar} className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Cerrar esta guía
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
