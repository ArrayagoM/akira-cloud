import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import PlantillasRubro from '../components/PlantillasRubro';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Save, Key, Eye, EyeOff, CheckCircle, XCircle, Upload, Trash2, ChevronDown, ChevronUp, Plus, X, Copy, ExternalLink, AlertTriangle, Info, CalendarCheck, Unlink, Clock, BellRing, Ban, PauseCircle, PlayCircle, MapPin } from 'lucide-react';

function CopiarTexto({ texto }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };
  return (
    <button onClick={copiar} className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 ml-2">
      <Copy size={11} />{copiado ? '¡Copiado!' : 'Copiar'}
    </button>
  );
}

const AVISOS_MP_URL = 'https://akira-licencias.vercel.app';

// URL de webhook auto-generada por usuario — solo lectura, con botón copiar
function WebhookUrlField() {
  const { user } = useAuth();
  const [copiado, setCopiado] = useState(false);

  // Mercado Pago avisa al servidor de Akira (única dirección pública); la app retira esos avisos cada pocos segundos y
  // vuelve a verificar cada pago contra Mercado Pago. Por eso no hace falta ngrok ni un servidor propio.
  const webhookUrl = user?._id
    ? `${AVISOS_MP_URL}/api/bot/webhook-mp/${user._id}`
    : '';

  const copiar = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
        URL del Webhook
      </label>
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{ background: 'var(--surface3)', border: '1px solid var(--border)' }}
      >
        <span className="flex-1 font-mono text-xs text-green-300 break-all select-all">
          {webhookUrl || 'Cargando...'}
        </span>
        <button
          onClick={copiar}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all"
          style={copiado
            ? { background: 'rgba(0,232,123,0.15)', color: 'var(--accent)', border: '1px solid rgba(0,232,123,0.3)' }
            : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
        >
          <Copy size={11} />
          {copiado ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mt-1.5">
        Esta URL es única para tu cuenta. Pegala en Mercado Pago en <strong className="text-gray-400">Tu negocio → Configuración → Notificaciones Webhooks</strong> (evento: Pagos).
        Cada vez que un cliente pague, Mercado Pago avisa a Akira y tu bot lo confirma solo. Funciona con la PC prendida y la app abierta; no necesitás ngrok ni ningún servidor propio.
      </p>
    </div>
  );
}

function PasoGuia({ numero, titulo, children }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{numero}</div>
      <div className="flex-1">
        <p className="text-sm font-medium text-white mb-1">{titulo}</p>
        <div className="text-xs text-gray-400 space-y-1">{children}</div>
      </div>
    </div>
  );
}

function GuiaGoogleCalendar() {
  const [abierta, setAbierta] = useState(false);
  return (
    <div style={{
      borderRadius: 10,
      border: '1px solid rgba(0,232,123,0.15)',
      background: 'rgba(0,232,123,0.03)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setAbierta(a => !a)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
        style={{ color: 'var(--accent)' }}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Info size={14} /> ¿Cómo obtener el credentials.json? — Guía paso a paso
        </span>
        <ChevronDown size={14} style={{
          color: 'var(--accent)',
          transform: abierta ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.3s ease',
        }} />
      </button>

      <div style={{
        display: 'grid',
        gridTemplateRows: abierta ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.38s cubic-bezier(0.4,0,0.2,1)',
      }}>
      <div style={{ overflow: 'hidden' }}>
        <div className="px-4 pb-5 space-y-4" style={{ borderTop: '1px solid rgba(0,232,123,0.12)', paddingTop: 16 }}>
          <p className="text-xs text-gray-400 pt-3">
            Google Calendar necesita un archivo de credenciales para que el bot pueda ver y crear turnos. Seguí estos pasos — no hace falta saber programar.
          </p>

          <PasoGuia numero="1" titulo='Entrá a Google Cloud Console'>
            <p>Abrí este link en tu navegador:</p>
            <div className="flex items-center gap-2 mt-1 p-2 bg-gray-900 rounded border border-gray-700">
              <span className="text-indigo-300 font-mono">console.cloud.google.com</span>
              <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 ml-auto">
                <ExternalLink size={11} /> Abrir
              </a>
            </div>
            <p className="mt-1">Iniciá sesión con la cuenta de Google que usás para tu negocio.</p>
          </PasoGuia>

          <PasoGuia numero="2" titulo='Creá un proyecto nuevo'>
            <p>En la barra superior verás un selector de proyectos. Hacé click ahí y luego en <strong className="text-white">"Proyecto nuevo"</strong>.</p>
            <p>Ponele cualquier nombre, por ejemplo: <span className="text-white font-mono">mi-negocio-bot</span></p>
            <p>Hacé click en <strong className="text-white">"Crear"</strong> y esperá unos segundos.</p>
          </PasoGuia>

          <PasoGuia numero="3" titulo='Habilitá la API de Google Calendar'>
            <p>En el menú de la izquierda buscá <strong className="text-white">"APIs y servicios"</strong> → <strong className="text-white">"Biblioteca"</strong>.</p>
            <p>En el buscador escribí: <span className="text-white font-mono">Google Calendar API</span></p>
            <p>Hacé click en el resultado y luego en el botón azul <strong className="text-white">"Habilitar"</strong>.</p>
          </PasoGuia>

          <PasoGuia numero="4" titulo='Creá una Cuenta de Servicio'>
            <p>Andá a <strong className="text-white">"APIs y servicios"</strong> → <strong className="text-white">"Credenciales"</strong>.</p>
            <p>Hacé click en <strong className="text-white">"+ Crear credencial"</strong> → <strong className="text-white">"Cuenta de servicio"</strong>.</p>
            <p>En el campo nombre escribí algo como: <span className="text-white font-mono">akira-bot</span></p>
            <p>Hacé click en <strong className="text-white">"Crear y continuar"</strong> → <strong className="text-white">"Listo"</strong> (los pasos 2 y 3 son opcionales).</p>
          </PasoGuia>

          <PasoGuia numero="5" titulo='Descargá el archivo JSON de credenciales'>
            <p>En la pantalla de Credenciales vas a ver tu nueva cuenta de servicio. Hacé click en el <strong className="text-white">email</strong> de esa cuenta.</p>
            <p>Andá a la pestaña <strong className="text-white">"Claves"</strong>.</p>
            <p>Hacé click en <strong className="text-white">"Agregar clave"</strong> → <strong className="text-white">"Crear clave nueva"</strong> → elegí <strong className="text-white">JSON</strong>.</p>
            <p>Se va a descargar un archivo <span className="text-white font-mono">.json</span> a tu computadora. Ese es el archivo que necesitás subir acá.</p>
          </PasoGuia>

          <PasoGuia numero="6" titulo='Compartí tu calendario con la cuenta de servicio'>
            <div className="p-2 bg-yellow-900/30 border border-yellow-700/50 rounded mt-1 mb-2">
              <span className="flex items-center gap-1.5 text-yellow-400 font-medium"><AlertTriangle size={11} /> Este paso es el más importante — sin hacerlo, nada va a funcionar</span>
            </div>
            <p>Abrí <strong className="text-white">Google Calendar</strong> en tu navegador (<span className="font-mono text-indigo-300">calendar.google.com</span>).</p>
            <p>A la izquierda vas a ver tu calendario. Hacé click en los <strong className="text-white">3 puntitos</strong> que aparecen al pasar el mouse → <strong className="text-white">"Configuración y uso compartido"</strong>.</p>
            <p>Bajá hasta la sección <strong className="text-white">"Compartir con personas específicas"</strong> → <strong className="text-white">"+ Agregar personas"</strong>.</p>
            <p>Pegá el email de tu cuenta de servicio. Lo encontrás en Google Cloud en la pantalla de credenciales, tiene este formato:</p>
            <div className="p-2 bg-gray-900 rounded border border-gray-700 font-mono text-gray-300 mt-1">
              akira-bot@tu-proyecto.iam.gserviceaccount.com
            </div>
            <p className="mt-1">En permisos seleccioná <strong className="text-white">"Hacer cambios en eventos"</strong> → <strong className="text-white">"Enviar"</strong>.</p>
          </PasoGuia>

          <div className="p-3 bg-green-900/20 border border-green-700/40 rounded-lg">
            <p className="text-xs text-green-400 font-medium flex items-center gap-1.5">
              <CheckCircle size={12} /> ¡Listo! Ya podés subir el archivo JSON y tu Calendar ID abajo.
            </p>
            <p className="text-xs text-gray-500 mt-1">El bot va a poder ver los horarios ocupados y crear eventos automáticamente cuando un cliente confirme un turno.</p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function SeccionCollapsible({ titulo, children, defaultOpen = false, delay = 0 }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card config-section" style={{ overflow: 'hidden', animationDelay: `${delay}ms` }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-left"
        style={{ padding: '2px 0' }}
      >
        <span className="font-semibold text-white text-sm">{titulo}</span>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
            flexShrink: 0,
          }}
        />
      </button>

      {/* CSS-grid trick: animates height without knowing exact px value */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.38s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div
            className="pt-5 mt-5"
            style={{
              borderTop: '1px solid var(--border)',
              opacity: open ? 1 : 0,
              transform: open ? 'translateY(0)' : 'translateY(-6px)',
              transition: 'opacity 0.3s ease 0.05s, transform 0.3s ease 0.05s',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyField({ campo, label, placeholder, keys, onSave, onDelete }) {
  const [valor, setValor]     = useState('');
  const [show, setShow]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const cargada = keys[campo.replace('key','').replace('id','').replace('Key','').toLowerCase()] ||
                  keys[campo === 'idCalendar' ? 'calendar' : campo === 'keyRime' ? 'rime' : campo === 'credentialsGoogleB64' ? 'credentialsGoogle' : campo.replace('key','').toLowerCase()];

  const save = async () => {
    if (!valor.trim()) return;
    setSaving(true);
    try {
      await onSave(campo, valor.trim());
      setValor('');
      toast.success(`${label} guardada`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Key size={11} /> {label}
        </label>
        {cargada
          ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle size={11} /> Configurada</span>
          : <span className="flex items-center gap-1 text-xs text-gray-600"><XCircle size={11} /> No configurada</span>}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={valor}
            onChange={e => setValor(e.target.value)}
            placeholder={cargada ? '••••••••••••••• (no se muestra por seguridad)' : placeholder}
            className="input-base pr-10"
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <button onClick={save} disabled={!valor.trim() || saving} className="btn-primary px-4 py-2 text-xs">
          {saving ? <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Save size={13} />}
        </button>
        {cargada && (
          <button onClick={() => onDelete(campo)} className="btn-danger px-3 py-2 text-xs">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  // Llegar desde "Primeros pasos" con #avisos-celular: bajar directo a esa sección.
  useEffect(() => {
    if (location.hash !== '#avisos-celular') return;
    const t = setTimeout(() => document.getElementById('avisos-celular')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500);
    return () => clearTimeout(t);
  }, [location.hash]);
  const [config, setConfig]   = useState({});
  const [plantillasAbiertas, setPlantillasAbiertas] = useState(false);
  const plantillaAplicada = useRef(false);
  const [keys,   setKeys]     = useState({});
  const [form,   setForm]     = useState({
    miNombre: '', negocio: '', servicios: '', precioTurno: '1000',
    horasCancelacion: '24', promptPersonalizado: '',
    aliasTransferencia: '', cbuTransferencia: '', bancoTransferencia: '', titularTransferencia: '', cuilTransferencia: '',
    serviciosList: [],
    tipoNegocio: 'turnos', checkInHora: '14:00', checkOutHora: '10:00',
    minimaEstadia: '1',
    unidadesAlojamiento: [], direccionPropiedad: '', linkUbicacion: '',
    telefonoNegocio: '', instagramNegocio: '', webNegocio: '', comoLlegar: '',
  });
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: '', precio: '', duracion: '60', intervaloRecordatorioDias: '0', mensajeRecordatorio: '' });
  const [mostrarFormServicio, setMostrarFormServicio] = useState(false);
  const [nuevaUnidad, setNuevaUnidad] = useState({ nombre: '', descripcion: '', capacidad: '2', precioPorNoche: '0', amenidades: '' });
  const [mostrarFormUnidad, setMostrarFormUnidad] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [desconectandoCalendar, setDesconectandoCalendar] = useState(false);

  // Horarios de atención
  const DIAS_ORDEN = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  const DIAS_LABEL = { lunes:'Lunes', martes:'Martes', miercoles:'Miércoles', jueves:'Jueves', viernes:'Viernes', sabado:'Sábado', domingo:'Domingo' };
  const HORARIOS_DEFAULT = {
    lunes:     { activo: true,  franjas: [{ inicio: '09:00', fin: '18:00' }] },
    martes:    { activo: true,  franjas: [{ inicio: '09:00', fin: '18:00' }] },
    miercoles: { activo: true,  franjas: [{ inicio: '09:00', fin: '18:00' }] },
    jueves:    { activo: true,  franjas: [{ inicio: '09:00', fin: '18:00' }] },
    viernes:   { activo: true,  franjas: [{ inicio: '09:00', fin: '18:00' }] },
    sabado:    { activo: true,  franjas: [{ inicio: '09:00', fin: '13:00' }] },
    domingo:   { activo: false, franjas: [{ inicio: '09:00', fin: '18:00' }] },
  };
  const [horarios, setHorarios]                     = useState(HORARIOS_DEFAULT);
  const [celularNotificaciones, setCelularNotif]    = useState('');
  const [savingHorarios, setSavingHorarios]         = useState(false);
  const [savingCelular, setSavingCelular]           = useState(false);
  const [modoPausa, setModoPausa]                   = useState(false);
  const [savingPausa, setSavingPausa]               = useState(false);
  const [diasBloqueados, setDiasBloqueados]         = useState([]);
  const [nuevaFecha, setNuevaFecha]                 = useState('');
  const [savingDia, setSavingDia]                   = useState(false);

  // Manejar retorno de OAuth de Google Calendar
  useEffect(() => {
    if (searchParams.get('calendar') === 'ok') {
      toast.success('¡Google Calendar conectado! El bot ya puede ver y crear turnos.');
      setSearchParams({});
    }
    if (searchParams.get('calendar') === 'error') {
      const reason      = searchParams.get('reason') || '';
      const redirectUri = searchParams.get('redirect_uri') || '';
      const debugMsg    = searchParams.get('debug') || '';

      const MENSAJES = {
        redirect_uri_mismatch: `URI de redirección no registrada en Google Cloud Console.\nAgregá esta URL en "Credenciales → URIs de redirección autorizadas":\n${redirectUri || '(la muestra el detalle de abajo)'}`,
        invalid_client:        'Client ID o Client Secret incorrectos. Volvé a subir tu credentials.json.',
        invalid_grant:         'El código de autorización expiró. Intentá conectar de nuevo.',
        access_denied:         'Permiso denegado por el usuario.',
        token_expired:         'Tu sesión expiró. Volvé a iniciar sesión e intentá de nuevo.',
        access_blocked:        'App bloqueada por Google. Agregá tu cuenta como "Usuario de prueba" en Google Cloud Console → Pantalla de consentimiento OAuth.',
        jwt_error:             'Error de autenticación (JWT inválido). Cerrá sesión, volvé a entrar e intentá de nuevo.',
        encryption_error:      'Error de cifrado en el servidor de Akira. Probá de nuevo en unos minutos; si sigue, escribinos desde Ayuda.',
        network_error:         'El servidor de Akira no pudo comunicarse con Google. Probá de nuevo en unos minutos.',
      };

      const base = MENSAJES[reason] || `Error (${reason || 'unknown'}) conectando Google Calendar.`;
      const msg  = debugMsg ? `${base}\n\nDetalle: ${debugMsg}` : base;
      toast.error(msg, { duration: 15000 });
      setSearchParams({});
    }
  }, []);

  const desconectarGoogleCalendar = async () => {
    setDesconectandoCalendar(true);
    try {
      await api.delete('/config/google/disconnect');
      setKeys(k => ({ ...k, googleCalendarOAuth: false }));
      setConfig(c => ({ ...c, googleEmail: '' }));
      toast.success('Google Calendar desconectado');
    } catch {
      toast.error('Error al desconectar');
    } finally {
      setDesconectandoCalendar(false);
    }
  };

  useEffect(() => {
    api.get('/config').then(r => {
      setConfig(r.data.config);
      setKeys(r.data.keys);
      const c = r.data.config;
      setForm({
        miNombre:            c.miNombre || '',
        negocio:             c.negocio  || '',
        servicios:           c.servicios || 'turnos y reservas',
        precioTurno:         String(c.precioTurno || 1000),
        horasCancelacion:    String(c.horasCancelacion || 24),
        promptPersonalizado: c.promptPersonalizado || '',
        aliasTransferencia:  c.aliasTransferencia  || '',
        cbuTransferencia:    c.cbuTransferencia    || '',
        bancoTransferencia:  c.bancoTransferencia  || '',
        titularTransferencia: c.titularTransferencia || '',
        cuilTransferencia:   c.cuilTransferencia   || '',
        serviciosList:       Array.isArray(c.serviciosList) ? c.serviciosList : [],
        tipoNegocio:           c.tipoNegocio    || 'turnos',
        checkInHora:           c.checkInHora    || '14:00',
        checkOutHora:          c.checkOutHora   || '10:00',
        minimaEstadia:         String(c.minimaEstadia || 1),
        unidadesAlojamiento:   Array.isArray(c.unidadesAlojamiento) ? c.unidadesAlojamiento : [],
        direccionPropiedad:    c.direccionPropiedad || '',
        linkUbicacion:         c.linkUbicacion  || '',
        telefonoNegocio:       c.telefonoNegocio || '',
        instagramNegocio:      c.instagramNegocio || '',
        webNegocio:            c.webNegocio || '',
        comoLlegar:            c.comoLlegar || '',
      });
      if (c.horariosAtencion && Object.keys(c.horariosAtencion).length > 0) {
        // Normalizar: migrar formato legado { inicio, fin } → { franjas: [...] }
        const normalized = { ...HORARIOS_DEFAULT };
        for (const [dia, conf] of Object.entries(c.horariosAtencion)) {
          if (!conf) continue;
          const base = { activo: conf.activo ?? true };
          if (Array.isArray(conf.franjas) && conf.franjas.length > 0) {
            base.franjas = conf.franjas;
          } else if (conf.inicio) {
            base.franjas = [{ inicio: conf.inicio, fin: conf.fin || '18:00' }];
          } else {
            base.franjas = [{ inicio: '09:00', fin: '18:00' }];
          }
          normalized[dia] = base;
        }
        setHorarios(normalized);
      }
      setCelularNotif(c.celularNotificaciones || '');
      setModoPausa(!!c.modoPausa);
      setDiasBloqueados(Array.isArray(c.diasBloqueados) ? c.diasBloqueados : []);
    }).catch(() => toast.error('Error cargando configuración'));
  }, []);

  const handleForm = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const agregarServicio = () => {
    if (!nuevoServicio.nombre.trim() || !nuevoServicio.precio) return;
    const servicio = {
      nombre:   nuevoServicio.nombre.trim(),
      precio:   parseFloat(nuevoServicio.precio),
      duracion: parseInt(nuevoServicio.duracion) || 60,
      intervaloRecordatorioDias: Math.max(0, parseInt(nuevoServicio.intervaloRecordatorioDias) || 0),
      mensajeRecordatorio: (nuevoServicio.mensajeRecordatorio || '').trim(),
    };
    setForm(f => ({ ...f, serviciosList: [...f.serviciosList, servicio] }));
    setNuevoServicio({ nombre: '', precio: '', duracion: '60', intervaloRecordatorioDias: '0', mensajeRecordatorio: '' });
    setMostrarFormServicio(false);
  };

  const eliminarServicio = (idx) => {
    setForm(f => ({ ...f, serviciosList: f.serviciosList.filter((_, i) => i !== idx) }));
  };

  const agregarUnidad = () => {
    if (!nuevaUnidad.nombre.trim()) return;
    const unidad = {
      nombre:         nuevaUnidad.nombre.trim(),
      descripcion:    nuevaUnidad.descripcion.trim(),
      capacidad:      parseInt(nuevaUnidad.capacidad) || 2,
      precioPorNoche: parseFloat(nuevaUnidad.precioPorNoche) || 0,
      amenidades:     nuevaUnidad.amenidades.trim(),
    };
    setForm(f => ({ ...f, unidadesAlojamiento: [...f.unidadesAlojamiento, unidad] }));
    setNuevaUnidad({ nombre: '', descripcion: '', capacidad: '2', precioPorNoche: '0', amenidades: '' });
    setMostrarFormUnidad(false);
  };

  const eliminarUnidad = (idx) => {
    setForm(f => ({ ...f, unidadesAlojamiento: f.unidadesAlojamiento.filter((_, i) => i !== idx) }));
  };

  const saveNegocio = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put('/config/negocio', {
        ...form,
        precioTurno:      parseFloat(form.precioTurno),
        horasCancelacion: parseInt(form.horasCancelacion),
        minimaEstadia:    parseInt(form.minimaEstadia) || 1,
        serviciosList:    form.serviciosList,
        unidadesAlojamiento: form.unidadesAlojamiento,
      });
      setConfig(r.data.config);
      toast.success('Configuración guardada');
    } catch (err) {
      toast.error(err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveKey = async (campo, valor) => {
    const r = await api.put('/config/keys', { campo, valor });
    setKeys(r.data.keys);
  };

  const deleteKey = async (campo) => {
    if (!confirm('¿Seguro que querés eliminar esta key?')) return;
    const r = await api.delete(`/config/keys/${campo}`);
    setKeys(r.data.keys);
    toast.success('Key eliminada');
  };

  const saveHorarios = async () => {
    setSavingHorarios(true);
    try {
      await api.put('/config/horarios', { horariosAtencion: horarios });
      toast.success('Horarios guardados');
    } catch {
      toast.error('Error al guardar horarios');
    } finally {
      setSavingHorarios(false);
    }
  };

  // El bot necesita el número completo con código de país y sin "+": 5491112345678.
  // Si escriben los 10 dígitos de un celular argentino (código de área + número), se completa con 549.
  const normalizarCelular = (txt) => {
    const d = String(txt || '').replace(/\D/g, '');
    if (d.length === 10) return '549' + d;
    if (d.length === 11 && d.startsWith('0')) return '549' + d.slice(1);
    return d;
  };

  const saveCelular = async () => {
    const limpio = normalizarCelular(celularNotificaciones);
    if (limpio && limpio.length < 11) { toast.error('Escribí el número completo, con código de área (ej: 2241497226)'); return; }
    setSavingCelular(true);
    try {
      await api.put('/config/horarios', { celularNotificaciones: limpio });
      setCelularNotif(limpio);
      toast.success(limpio ? 'Celular guardado' : 'Celular quitado');
    } catch {
      toast.error('No se pudo guardar el celular');
    } finally {
      setSavingCelular(false);
    }
  };

  const togglePausa = async () => {
    setSavingPausa(true);
    const nuevoEstado = !modoPausa;
    try {
      await api.put('/config/pausa', { modoPausa: nuevoEstado });
      setModoPausa(nuevoEstado);
      toast.success(nuevoEstado ? '⏸️ Modo pausa activado' : '▶️ Bot disponible nuevamente');
    } catch {
      toast.error('Error al cambiar el modo pausa');
    } finally {
      setSavingPausa(false);
    }
  };

  const agregarDia = async () => {
    if (!nuevaFecha) return;
    if (diasBloqueados.includes(nuevaFecha)) return toast.error('Esa fecha ya está bloqueada');
    setSavingDia(true);
    try {
      const r = await api.put('/config/dias-bloqueados', { fecha: nuevaFecha, accion: 'agregar' });
      setDiasBloqueados(r.data.diasBloqueados);
      setNuevaFecha('');
      toast.success('Día bloqueado');
    } catch {
      toast.error('Error al bloquear el día');
    } finally {
      setSavingDia(false);
    }
  };

  const quitarDia = async (fecha) => {
    try {
      const r = await api.put('/config/dias-bloqueados', { fecha, accion: 'quitar' });
      setDiasBloqueados(r.data.diasBloqueados);
    } catch {
      toast.error('Error al desbloquear el día');
    }
  };

  const uploadCredentials = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text); // validar que es JSON válido
      await saveKey('credentialsGoogleB64', text);
      toast.success('credentials.json importado correctamente');
    } catch {
      toast.error('El archivo no es un JSON válido');
    }
    e.target.value = '';
  };

  return (
    <Layout>
      <style>{`
        @keyframes cfadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .config-section {
          animation: cfadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both;
        }
      `}</style>

      <div className="max-w-2xl mx-auto space-y-5">
        <div className="config-section" style={{ animationDelay: '0ms' }}>
          <h1 className="text-2xl font-bold text-white">Configuración</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Personalizá tu bot y conectá tus servicios.</p>
          <button className="btn-secondary text-xs mt-2.5" onClick={() => setPlantillasAbiertas(true)}>✨ Empezar con una plantilla de mi rubro</button>
        </div>

        {/* Datos del negocio */}
        <SeccionCollapsible titulo="🏢 Datos del negocio" defaultOpen delay={60}>
          <form onSubmit={saveNegocio} className="space-y-4">

            {/* Tipo de negocio */}
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Tipo de negocio</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'turnos',      label: '📅 Turnos / Citas', desc: 'Barbería, médico, uñas, etc.' },
                  { value: 'alojamiento', label: '🏠 Alojamiento',    desc: 'Cabañas, departamentos, hospedajes' },
                  { value: 'servicios',   label: '🔧 Servicios',      desc: 'Lavadero, mecánico, veterinaria…' },
                ].map(op => (
                  <button
                    key={op.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tipoNegocio: op.value }))}
                    className={`p-3 rounded-xl border text-left transition-colors ${form.tipoNegocio === op.value ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'}`}
                  >
                    <p className="text-sm font-semibold text-white">{op.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{op.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Configuración de alojamiento */}
            {form.tipoNegocio === 'alojamiento' && (
              <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Configuración de alojamiento</p>

                {/* Check-in / Check-out / Estadía mínima */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Check-in</label>
                    <input type="time" name="checkInHora" value={form.checkInHora} onChange={handleForm} className="input-base" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Check-out</label>
                    <input type="time" name="checkOutHora" value={form.checkOutHora} onChange={handleForm} className="input-base" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Estadía mínima</label>
                    <input type="number" name="minimaEstadia" value={form.minimaEstadia} onChange={handleForm} min="1" className="input-base" placeholder="1" />
                  </div>
                </div>

                {/* Unidades de alojamiento */}
                <div className="space-y-3 border-t border-indigo-800/30 pt-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">🏠 Unidades (cabañas / departamentos / habitaciones)</p>
                  <p className="text-xs text-gray-600">Cada unidad tiene su propio precio y disponibilidad independiente en el calendario.</p>

                  {form.unidadesAlojamiento.length > 0 ? (
                    <div className="space-y-2">
                      {form.unidadesAlojamiento.map((u, idx) => (
                        <div key={idx} className="flex items-start justify-between bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5 gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white">{u.nombre}</span>
                              <span className="text-xs text-gray-500">{u.capacidad} pers.</span>
                              <span className="text-xs text-green-400">${(u.precioPorNoche || 0).toLocaleString('es-AR')}/noche</span>
                            </div>
                            {u.amenidades && <p className="text-xs text-gray-500 mt-0.5 truncate">{u.amenidades}</p>}
                            {u.descripcion && <p className="text-xs text-gray-600 mt-0.5 truncate">{u.descripcion}</p>}
                          </div>
                          <button onClick={() => eliminarUnidad(idx)} className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-5 border border-dashed border-indigo-800/50 rounded-lg">
                      <p className="text-gray-600 text-sm">Sin unidades — el bot gestionará la propiedad completa como una sola reserva</p>
                    </div>
                  )}

                  {mostrarFormUnidad ? (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
                      <p className="text-xs font-semibold text-gray-300">Nueva unidad</p>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Nombre *</label>
                        <input value={nuevaUnidad.nombre} onChange={e => setNuevaUnidad(u => ({ ...u, nombre: e.target.value }))}
                          className="input-base" placeholder="Ej: Cabaña 1, Dpto A, Habitación Doble" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Descripción (opcional)</label>
                        <input value={nuevaUnidad.descripcion} onChange={e => setNuevaUnidad(u => ({ ...u, descripcion: e.target.value }))}
                          className="input-base" placeholder="Ej: Con vista al lago, 2 habitaciones" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Capacidad (personas) *</label>
                          <input type="number" min="1" value={nuevaUnidad.capacidad} onChange={e => setNuevaUnidad(u => ({ ...u, capacidad: e.target.value }))}
                            className="input-base" placeholder="2" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Precio por noche (ARS) *</label>
                          <input type="number" min="0" value={nuevaUnidad.precioPorNoche} onChange={e => setNuevaUnidad(u => ({ ...u, precioPorNoche: e.target.value }))}
                            className="input-base" placeholder="15000" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Amenidades (opcional)</label>
                        <input value={nuevaUnidad.amenidades} onChange={e => setNuevaUnidad(u => ({ ...u, amenidades: e.target.value }))}
                          className="input-base" placeholder="Ej: WiFi, parrilla, TV, jacuzzi, cochera" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={agregarUnidad} disabled={!nuevaUnidad.nombre.trim()} className="btn-primary text-xs px-4 py-2">
                          <Plus size={13} /> Agregar
                        </button>
                        <button onClick={() => { setMostrarFormUnidad(false); setNuevaUnidad({ nombre: '', descripcion: '', capacidad: '2', precioPorNoche: '0', amenidades: '' }); }} className="btn-secondary text-xs px-4 py-2">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setMostrarFormUnidad(true)} className="btn-secondary text-xs flex items-center gap-1.5">
                      <Plus size={13} /> Agregar unidad
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Configuración de servicios */}
            {form.tipoNegocio === 'servicios' && (
              <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">🔧 Modo Servicios</p>

                {/* Qué hace el bot — simple */}
                <p className="text-sm text-gray-300 leading-relaxed">
                  El cliente escribe por WhatsApp, el bot le pregunta qué necesita, anota los datos
                  del <strong className="text-amber-200">auto / mascota / objeto</strong> y agenda el turno automáticamente.
                  Vos recibís el aviso en tu celular.
                </p>

                {/* Comando akira listo — lo más importante */}
                <div className="bg-gray-900/60 border border-amber-700/30 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-300">
                    📲 Cuando terminés el trabajo, avisale al cliente así:
                  </p>
                  <div className="font-mono text-sm text-green-300 bg-black/30 rounded px-3 py-2 tracking-wide">
                    akira listo ABC123
                  </div>
                  <p className="text-xs text-gray-500">
                    Reemplazá <strong className="text-gray-400">ABC123</strong> por la patente, nombre de la mascota o el identificador del trabajo.
                    El bot busca al dueño y le manda el aviso automáticamente. 🎉
                  </p>
                </div>

                <p className="text-xs text-gray-500 pt-1">
                  👇 Cargá tus servicios con nombre, precio y duración en la sección <strong className="text-gray-400">🛠️ Lista de servicios</strong> de abajo.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Tu nombre *</label>
                <input name="miNombre" value={form.miNombre} onChange={handleForm} required className="input-base" placeholder="Martín" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Negocio *</label>
                <input name="negocio" value={form.negocio} onChange={handleForm} required className="input-base" placeholder="Peluquería Estilo" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Servicios</label>
              <input name="servicios" value={form.servicios} onChange={handleForm} className="input-base" placeholder="cortes, coloración, depilación" />
            </div>
            <div className={form.tipoNegocio === 'turnos' ? 'grid grid-cols-2 gap-4' : ''}>
              {form.tipoNegocio === 'turnos' && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Precio por hora (ARS)</label>
                  <input name="precioTurno" type="number" value={form.precioTurno} onChange={handleForm} min="0" className="input-base" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Horas mín. para cancelar</label>
                <input name="horasCancelacion" type="number" value={form.horasCancelacion} onChange={handleForm} min="0" className="input-base" />
              </div>
            </div>
            <div className="space-y-3 border-t border-gray-800 pt-4">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">📍 Dónde estás y cómo contactarte</p>
                <p className="text-xs text-gray-500 mt-1">Es lo que el bot les dice a tus clientes cuando preguntan "¿dónde están?" o "¿cómo los contacto?". Si algo no está cargado, el bot no lo inventa: te avisa a vos.</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Dirección</label>
                <input name="direccionPropiedad" value={form.direccionPropiedad} onChange={handleForm} maxLength={160}
                  className="input-base" placeholder="Ej: Av. San Martín 1234, Ranchos, Buenos Aires" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Link de Google Maps (opcional)</label>
                <input name="linkUbicacion" value={form.linkUbicacion} onChange={handleForm}
                  className="input-base" placeholder="https://maps.app.goo.gl/..." />
                {form.linkUbicacion && !/^https?:\/\//i.test(form.linkUbicacion) && (
                  <p className="text-xs text-amber-400 mt-1">El link tiene que empezar con http:// o https:// para que el bot lo use.</p>
                )}
                {form.linkUbicacion && /^https?:\/\//i.test(form.linkUbicacion) && (
                  <a href={form.linkUbicacion} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 mt-1.5 transition-colors">
                    <MapPin size={11} /> Abrir en Google Maps
                  </a>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cómo llegar / estacionamiento (opcional)</label>
                <input name="comoLlegar" value={form.comoLlegar} onChange={handleForm} maxLength={300}
                  className="input-base" placeholder="Ej: A una cuadra de la plaza. Hay estacionamiento sobre la calle." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Teléfono de contacto</label>
                  <input name="telefonoNegocio" value={form.telefonoNegocio} onChange={handleForm} maxLength={40}
                    className="input-base" placeholder="+54 9 11 5555-1234" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Instagram</label>
                  <input name="instagramNegocio" value={form.instagramNegocio} onChange={handleForm} maxLength={60}
                    className="input-base" placeholder="@minegocio" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Sitio web</label>
                  <input name="webNegocio" value={form.webNegocio} onChange={handleForm}
                    className="input-base" placeholder="https://minegocio.com.ar" />
                </div>
              </div>
              {form.direccionPropiedad.trim() && (
                <div className="rounded-xl overflow-hidden border border-gray-700" style={{ height: 160 }}>
                  <iframe
                    title="Vista previa ubicación"
                    width="100%" height="160"
                    frameBorder="0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(form.direccionPropiedad.trim())}&output=embed&z=15`}
                    className="w-full h-full"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Instrucciones extra para la IA</label>
              <textarea name="promptPersonalizado" value={form.promptPersonalizado} onChange={handleForm} rows={3}
                className="input-base resize-none" placeholder="Ej: No atender los domingos. El precio incluye IVA. Solo para mayores de 18 años." />
              <p className="text-xs text-gray-600 mt-1">{form.promptPersonalizado.length}/2000 caracteres</p>
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Guardando...</> : <><Save size={15} />Guardar</>}
            </button>
          </form>
        </SeccionCollapsible>

        {/* Avisos al celular — para cualquier rubro (antes estaba escondido dentro de Horarios) */}
        <div id="avisos-celular" style={{ scrollMarginTop: 80 }}>
          <SeccionCollapsible titulo="🔔 Avisos al celular" defaultOpen delay={90}>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              <BellRing size={11} className="inline mr-1" />Tu número de WhatsApp para los avisos
            </label>
            <input
              type="tel"
              value={celularNotificaciones}
              onChange={e => setCelularNotif(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCelular(); }}
              className="input-base"
              placeholder="Ej: 2241497226 (código de área + número, sin 0 ni 15)"
            />
            <p className="text-xs text-gray-600 mt-1.5">
              Ahí te avisa cuando se agenda un turno y te manda el resumen del día si lo activás.
            </p>
            <button onClick={saveCelular} disabled={savingCelular} className="btn-primary mt-3">
              {savingCelular
                ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Guardando...</>
                : <><Save size={15} />Guardar celular</>}
            </button>
          </SeccionCollapsible>
        </div>

        {/* Groq */}
        <SeccionCollapsible titulo="🤖 Groq API (IA) — REQUERIDO" defaultOpen={!keys.groq} delay={120}>
          <p className="text-xs text-gray-500 mb-4">
            Conseguí tu API Key gratis en <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">console.groq.com</a> → API Keys.
          </p>
          <KeyField campo="keyGroq" label="Groq API Key" placeholder="gsk_..." keys={keys} onSave={saveKey} onDelete={deleteKey} />
        </SeccionCollapsible>

        {/* MercadoPago */}
        <SeccionCollapsible titulo="💳 Pagos (MercadoPago o Transferencia)" delay={180}>
          <div className="space-y-5">
            {/* MercadoPago */}
            <div>
              <p className="text-xs font-semibold text-gray-300 mb-1">Opción A — MercadoPago (link automático)</p>
              <p className="text-xs text-gray-500 mb-3">El bot genera links de pago automáticos. Si configurás esto, tiene prioridad sobre la transferencia.</p>
              <div className="space-y-3">
                <KeyField campo="keyMP" label="Access Token" placeholder="APP_USR-..." keys={keys} onSave={saveKey} onDelete={deleteKey} />
                <WebhookUrlField />
              </div>
            </div>

            <div className="border-t border-gray-800 pt-4">
              <p className="text-xs font-semibold text-gray-300 mb-1">Opción B — Transferencia bancaria (alias / CBU / CVU)</p>
              <p className="text-xs text-gray-500 mb-3">Si no usás MercadoPago, el bot usará estos datos cuando un cliente pida pagar por transferencia.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Alias de transferencia</label>
                  <div className="flex gap-2">
                    <input name="aliasTransferencia" value={form.aliasTransferencia} onChange={handleForm} className="input-base" placeholder="ejemplo: mi.alias.mp" />
                    <button onClick={saveNegocio} className="btn-secondary px-3 py-2 text-xs"><Save size={13} /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">CBU / CVU</label>
                  <div className="flex gap-2">
                    <input name="cbuTransferencia" value={form.cbuTransferencia} onChange={handleForm} className="input-base" placeholder="0000000000000000000000" />
                    <button onClick={saveNegocio} className="btn-secondary px-3 py-2 text-xs"><Save size={13} /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Banco (opcional)</label>
                  <div className="flex gap-2">
                    <input name="bancoTransferencia" value={form.bancoTransferencia} onChange={handleForm} className="input-base" placeholder="Ej: Banco Galicia, Mercado Pago, etc." />
                    <button onClick={saveNegocio} className="btn-secondary px-3 py-2 text-xs"><Save size={13} /></button>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 p-3 space-y-3">
                  <p className="text-xs text-gray-400">Para <strong className="text-gray-200">verificar comprobantes</strong>: cuando un cliente manda la captura o el PDF de su transferencia, Akira lee el monto, la fecha y la operación y comprueba que el destino sea tu cuenta. Cargá cómo figurás vos en el comprobante.</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Titular de la cuenta</label>
                    <div className="flex gap-2">
                      <input name="titularTransferencia" value={form.titularTransferencia} onChange={handleForm} className="input-base" placeholder="Nombre completo o razón social, como aparece en el comprobante" />
                      <button onClick={saveNegocio} className="btn-secondary px-3 py-2 text-xs"><Save size={13} /></button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">CUIT / CUIL del titular (opcional)</label>
                    <div className="flex gap-2">
                      <input name="cuilTransferencia" value={form.cuilTransferencia} onChange={handleForm} className="input-base" placeholder="20-12345678-3" inputMode="numeric" />
                      <button onClick={saveNegocio} className="btn-secondary px-3 py-2 text-xs"><Save size={13} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SeccionCollapsible>

        {/* Servicios — solo visible en modo servicios */}
        {form.tipoNegocio === 'servicios' && <SeccionCollapsible titulo="🛠️ Lista de servicios" delay={240}>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Agregá los servicios que ofrecés. El bot los usará para informar precios y duraciones.</p>

            {/* Lista de servicios */}
            {form.serviciosList.length > 0 ? (
              <div className="space-y-2">
                {form.serviciosList.map((s, idx) => {
                  const mins = s.duracion || 60;
                  const h = Math.floor(mins / 60);
                  const m = mins % 60;
                  const durLabel = h === 0 ? `${mins} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
                  const recordar = s.intervaloRecordatorioDias > 0;
                  return (
                  <div key={idx} className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-4 min-w-0 flex-wrap">
                        <span className="text-sm font-medium text-white truncate">{s.nombre}</span>
                        <span className="text-xs text-green-400 flex-shrink-0">${s.precio.toLocaleString('es-AR')}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">⏱ {durLabel}</span>
                        {recordar && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1"
                            style={{ background: 'rgba(56,189,248,0.10)', color: '#7dd3fc', border: '1px solid rgba(56,189,248,0.22)' }}>
                            🔔 cada {s.intervaloRecordatorioDias} d
                          </span>
                        )}
                      </div>
                      <button onClick={() => eliminarServicio(idx)} className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 ml-2">
                        <X size={14} />
                      </button>
                    </div>
                    {recordar && s.mensajeRecordatorio && (
                      <p className="text-[11px] text-gray-500 mt-1.5 italic truncate">"{s.mensajeRecordatorio}"</p>
                    )}
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-gray-700 rounded-lg">
                <p className="text-gray-600 text-sm">No hay servicios cargados</p>
              </div>
            )}

            {/* Formulario inline para nuevo servicio */}
            {mostrarFormServicio ? (
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-300">Nuevo servicio</p>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Nombre *</label>
                  <input
                    value={nuevoServicio.nombre}
                    onChange={e => setNuevoServicio(s => ({ ...s, nombre: e.target.value }))}
                    className="input-base"
                    placeholder="Ej: Corte de cabello"
                    onKeyDown={e => e.key === 'Enter' && agregarServicio()}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Precio (ARS) *</label>
                    <input
                      type="number"
                      min="0"
                      value={nuevoServicio.precio}
                      onChange={e => setNuevoServicio(s => ({ ...s, precio: e.target.value }))}
                      className="input-base"
                      placeholder="1500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Duración del trabajo</label>
                    <select
                      value={nuevoServicio.duracion}
                      onChange={e => setNuevoServicio(s => ({ ...s, duracion: e.target.value }))}
                      className="input-base"
                    >
                      <option value="30">30 minutos</option>
                      <option value="45">45 minutos</option>
                      <option value="60">1 hora</option>
                      <option value="90">1 hora 30 min</option>
                      <option value="120">2 horas</option>
                      <option value="150">2 horas 30 min</option>
                      <option value="180">3 horas</option>
                      <option value="240">4 horas</option>
                      <option value="300">5 horas</option>
                      <option value="360">6 horas</option>
                      <option value="480">8 horas</option>
                    </select>
                  </div>
                </div>

                {/* ── Recordatorios automáticos ─────────────────────────── */}
                <div className="border-t border-gray-700/50 pt-3 mt-1">
                  <p className="text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                    🔔 Recordatorio automático
                    <span className="text-[10px] text-gray-500 font-normal">(opcional)</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mb-3">
                    El bot le enviará un WhatsApp al cliente cuando pase este tiempo desde su último turno de este servicio.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Cada cuántos días</label>
                      <select
                        value={nuevoServicio.intervaloRecordatorioDias}
                        onChange={e => setNuevoServicio(s => ({ ...s, intervaloRecordatorioDias: e.target.value }))}
                        className="input-base"
                      >
                        <option value="0">Sin recordatorio</option>
                        <option value="7">7 días (semanal)</option>
                        <option value="14">14 días</option>
                        <option value="21">21 días (3 semanas)</option>
                        <option value="30">30 días (mensual)</option>
                        <option value="45">45 días</option>
                        <option value="60">60 días (bimestral)</option>
                        <option value="90">90 días (trimestral)</option>
                        <option value="180">180 días (semestral)</option>
                      </select>
                    </div>
                  </div>
                  {nuevoServicio.intervaloRecordatorioDias !== '0' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                        Mensaje del recordatorio <span className="text-gray-500 normal-case font-normal">(usa <code className="text-[var(--accent)]">{'{nombre}'}</code>, <code className="text-[var(--accent)]">{'{servicio}'}</code>, <code className="text-[var(--accent)]">{'{dias}'}</code>, <code className="text-[var(--accent)]">{'{negocio}'}</code>)</span>
                      </label>
                      <textarea
                        value={nuevoServicio.mensajeRecordatorio}
                        onChange={e => setNuevoServicio(s => ({ ...s, mensajeRecordatorio: e.target.value }))}
                        rows={3}
                        maxLength={500}
                        className="input-base w-full resize-none text-sm"
                        placeholder="Ej: ¡Hola {nombre}! 👋 Pasaron {dias} días desde tu último {servicio}. ¿Reservamos?"
                      />
                      <p className="text-[10px] text-gray-600 mt-1 text-right">
                        {(nuevoServicio.mensajeRecordatorio || '').length}/500 — si lo dejás vacío, el bot arma uno automáticamente.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={agregarServicio} disabled={!nuevoServicio.nombre.trim() || !nuevoServicio.precio} className="btn-primary text-xs px-4 py-2">
                    <Plus size={13} /> Agregar
                  </button>
                  <button onClick={() => { setMostrarFormServicio(false); setNuevoServicio({ nombre: '', precio: '', duracion: '60', intervaloRecordatorioDias: '0', mensajeRecordatorio: '' }); }} className="btn-secondary text-xs px-4 py-2">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setMostrarFormServicio(true)} className="btn-secondary text-xs flex items-center gap-1.5">
                <Plus size={13} /> Agregar servicio
              </button>
            )}

            {/* Guardar servicios */}
            {form.serviciosList.length > 0 && (
              <button onClick={saveNegocio} disabled={saving} className="btn-primary text-xs">
                {saving ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Guardando...</> : <><Save size={13} />Guardar servicios</>}
              </button>
            )}
          </div>
        </SeccionCollapsible>}

        {/* Google Calendar */}
        <SeccionCollapsible titulo="📅 Google Calendar (agenda)" delay={300}>
          <div className="space-y-5">

            {/* Conectado via OAuth */}
            {keys.googleCalendarOAuth ? (
              <div className="p-4 rounded-xl bg-green-900/20 border border-green-700/40 space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarCheck size={18} className="text-green-400" />
                  <div>
                    <p className="text-sm font-semibold text-green-400">Google Calendar conectado</p>
                    {config.googleEmail && <p className="text-xs text-gray-400 mt-0.5">{config.googleEmail}</p>}
                  </div>
                </div>
                <p className="text-xs text-gray-400">El bot puede ver y crear turnos en tu Google Calendar automáticamente.</p>
                <button
                  onClick={desconectarGoogleCalendar}
                  disabled={desconectandoCalendar}
                  className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  <Unlink size={12} />
                  {desconectandoCalendar ? 'Desconectando...' : 'Desconectar Google Calendar'}
                </button>
              </div>
            ) : (
              /* Botón principal: conectar con Google */
              <div className="space-y-4">
                <div className="rounded-xl p-4 text-xs space-y-1.5" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <p className="font-semibold text-amber-300">Conexión con un click: todavía no disponible en la app de escritorio</p>
                  <p style={{ color: 'var(--text2)' }}>
                    Si ya lo tenías conectado en Akira Cloud, se importó con tu configuración y figura arriba como conectado. Para conectarlo ahora,
                    usá la opción de abajo: subís el archivo <code className="px-1 py-0.5 rounded" style={{ background: 'var(--surface3)' }}>credentials.json</code> de tu proyecto de Google y el correo del calendario.
                  </p>
                </div>
              </div>
            )}

            {/* Calendar ID (siempre visible cuando está conectado) */}
            {keys.googleCalendarOAuth && (
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Calendar ID (opcional)</label>
                <input name="idCalendar" placeholder="tu-email@gmail.com" className="input-base w-full"
                  defaultValue={config.idCalendar || ''}
                  onBlur={e => e.target.value && saveKey('idCalendar', e.target.value)} />
                <p className="text-xs text-gray-500 mt-1">
                  Dejalo vacío para usar tu calendario principal. Completalo si querés usar un calendario específico.
                </p>
              </div>
            )}

            {/* Opción avanzada: subir JSON manualmente */}
            {!keys.googleCalendarOAuth && (
              <SeccionCollapsible titulo="⚙️ Conectar subiendo credentials.json" defaultOpen>
                <div className="space-y-4 pt-1">
                  <GuiaGoogleCalendar />
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">credentials.json</label>
                      {keys.credentialsGoogle
                        ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle size={11} /> Subido</span>
                        : <span className="flex items-center gap-1 text-xs text-gray-600"><XCircle size={11} /> Pendiente</span>}
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer btn-secondary w-full justify-center py-3">
                      <Upload size={15} /> {keys.credentialsGoogle ? 'Reemplazar credentials.json' : 'Subir credentials.json'}
                      <input type="file" accept=".json" onChange={uploadCredentials} className="hidden" />
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Calendar ID</label>
                    <input name="idCalendar" placeholder="tu-email@gmail.com" className="input-base w-full"
                      defaultValue={config.idCalendar || ''}
                      onBlur={e => e.target.value && saveKey('idCalendar', e.target.value)} />
                    <p className="text-xs text-gray-500 mt-1">Tu email de Gmail o el ID del calendario.</p>
                  </div>
                </div>
              </SeccionCollapsible>
            )}

          </div>
        </SeccionCollapsible>

        {/* RIME TTS */}
        <SeccionCollapsible titulo="🔊 RIME AI (respuestas por audio)" delay={360}>
          <p className="text-xs text-gray-500 mb-4">
            Permite que Akira responda con voz. Conseguí tu key en <a href="https://rime.ai" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">rime.ai</a>.
          </p>
          <KeyField campo="keyRime" label="RIME API Key" placeholder="rime_..." keys={keys} onSave={saveKey} onDelete={deleteKey} />
        </SeccionCollapsible>

        {/* Horarios de atención — solo para modo turnos */}
        {form.tipoNegocio !== 'alojamiento' && <SeccionCollapsible titulo="⏰ Horarios de atención" delay={540}>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Configurá en qué días y horarios recibís clientes. El bot solo ofrecerá turnos en los horarios activos.</p>
            <div className="space-y-3">
              {DIAS_ORDEN.map(dia => {
                const diaConf = horarios[dia] || { activo: false, franjas: [{ inicio: '09:00', fin: '18:00' }] };
                const franjas = diaConf.franjas?.length > 0
                  ? diaConf.franjas
                  : [{ inicio: diaConf.inicio || '09:00', fin: diaConf.fin || '18:00' }];

                const toggleDia = () => setHorarios(h => ({
                  ...h, [dia]: { ...h[dia], activo: !h[dia]?.activo }
                }));
                const addFranja = () => setHorarios(h => ({
                  ...h, [dia]: { ...h[dia], franjas: [...franjas, { inicio: '17:00', fin: '21:00' }] }
                }));
                const removeFranja = (fi) => setHorarios(h => ({
                  ...h, [dia]: { ...h[dia], franjas: franjas.filter((_, i) => i !== fi) }
                }));
                const updateFranja = (fi, campo, val) => setHorarios(h => {
                  const nf = franjas.map((f, i) => i === fi ? { ...f, [campo]: val } : f);
                  return { ...h, [dia]: { ...h[dia], franjas: nf } };
                });

                return (
                  <div key={dia} className="space-y-1.5">
                    {/* Fila principal: toggle + nombre del día */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={toggleDia}
                        className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${diaConf.activo ? 'bg-indigo-600' : 'bg-gray-700'}`}
                      >
                        <span className={`block w-4 h-4 rounded-full bg-white mx-0.5 transition-transform ${diaConf.activo ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                      <span className={`text-sm w-20 flex-shrink-0 font-medium ${diaConf.activo ? 'text-white' : 'text-gray-600'}`}>
                        {DIAS_LABEL[dia]}
                      </span>
                      {!diaConf.activo && <span className="text-xs text-gray-600 italic">Cerrado</span>}
                    </div>

                    {/* Franjas horarias (solo si el día está activo) */}
                    {diaConf.activo && (
                      <div className="ml-13 pl-[3.25rem] space-y-1.5">
                        {franjas.map((franja, fi) => (
                          <div key={fi} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={franja.inicio}
                              onChange={e => updateFranja(fi, 'inicio', e.target.value)}
                              className="input-base py-1 text-xs w-28"
                            />
                            <span className="text-gray-600 text-xs">a</span>
                            <input
                              type="time"
                              value={franja.fin}
                              onChange={e => updateFranja(fi, 'fin', e.target.value)}
                              className="input-base py-1 text-xs w-28"
                            />
                            {fi > 0 && (
                              <button
                                type="button"
                                onClick={() => removeFranja(fi)}
                                className="text-gray-600 hover:text-red-400 transition-colors ml-1"
                                title="Eliminar este horario"
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                        {/* Botón para agregar corte/descanso — máx 3 franjas */}
                        {franjas.length < 3 && (
                          <button
                            type="button"
                            onClick={addFranja}
                            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            <Plus size={11} />
                            Agregar horario cortado
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={saveHorarios} disabled={savingHorarios} className="btn-primary">
              {savingHorarios
                ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Guardando...</>
                : <><Save size={15} />Guardar horarios</>}
            </button>
          </div>
        </SeccionCollapsible>}

        {/* Disponibilidad */}
        <SeccionCollapsible titulo="⏸️ Disponibilidad" delay={600}>
          <div className="space-y-5">

            {/* Modo pausa */}
            <div className={`flex items-center justify-between p-4 rounded-xl border ${modoPausa ? 'bg-red-950/30 border-red-800/50' : 'bg-gray-800/40 border-gray-700'}`}>
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  {modoPausa ? <PauseCircle size={16} className="text-red-400" /> : <PlayCircle size={16} className="text-green-400" />}
                  {modoPausa ? 'Bot en pausa — no acepta nuevos turnos' : 'Bot activo — aceptando turnos normalmente'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {modoPausa
                    ? 'Los clientes verán un mensaje de no disponibilidad.'
                    : 'Activá la pausa si te tomás vacaciones o días libres.'}
                </p>
              </div>
              <button
                onClick={togglePausa}
                disabled={savingPausa}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${modoPausa ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-700 hover:bg-red-600 text-white'}`}
              >
                {savingPausa
                  ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  : modoPausa ? 'Reactivar' : 'Pausar'}
              </button>
            </div>

            {/* Días bloqueados */}
            <div>
              <p className="text-xs font-semibold text-gray-300 mb-2 flex items-center gap-1.5"><Ban size={12} /> Días sin atención</p>
              <p className="text-xs text-gray-500 mb-3">Bloqueá fechas puntuales (feriados, vacaciones). El bot no ofrecerá turnos esos días.</p>

              <div className="flex gap-2 mb-3">
                <input
                  type="date"
                  value={nuevaFecha}
                  onChange={e => setNuevaFecha(e.target.value)}
                  className="input-base flex-1"
                  min={new Date().toISOString().split('T')[0]}
                />
                <button
                  onClick={agregarDia}
                  disabled={!nuevaFecha || savingDia}
                  className="btn-primary px-4 text-xs"
                >
                  {savingDia ? <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Plus size={13} />}
                </button>
              </div>

              {diasBloqueados.length > 0 ? (
                <div className="space-y-1.5">
                  {[...diasBloqueados].sort().map(fecha => (
                    <div key={fecha} className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
                      <span className="text-sm text-white">{new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      <button onClick={() => quitarDia(fecha)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-600 italic text-center py-3">No hay días bloqueados</p>
              )}
            </div>
          </div>
        </SeccionCollapsible>
      </div>
      {plantillasAbiertas && <PlantillasRubro onClose={() => { setPlantillasAbiertas(false); if (plantillaAplicada.current) window.location.reload(); }} onAplicada={() => { plantillaAplicada.current = true; }} />}
    </Layout>
  );
}
