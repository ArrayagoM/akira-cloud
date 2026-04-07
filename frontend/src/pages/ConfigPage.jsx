import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import { Save, Key, Eye, EyeOff, CheckCircle, XCircle, Upload, Trash2, ChevronDown, ChevronUp, Plus, X, Copy, ExternalLink, AlertTriangle, Info, CalendarCheck, Unlink, Clock, BellRing, Ban, PauseCircle, PlayCircle, MapPin, RefreshCw } from 'lucide-react';

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
                  keys[campo === 'idCalendar' ? 'calendar' : campo === 'keyRime' ? 'rime' : campo === 'keyNgrok' ? 'ngrok' : campo === 'credentialsGoogleB64' ? 'credentialsGoogle' : campo.replace('key','').toLowerCase()];

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
  const { on }   = useSocket(user?._id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig]   = useState({});
  const [keys,   setKeys]     = useState({});
  const [form,   setForm]     = useState({
    miNombre: '', negocio: '', servicios: '', precioTurno: '1000',
    horasCancelacion: '24', promptPersonalizado: '', dominioNgrok: '', mpWebhookUrl: '',
    aliasTransferencia: '', cbuTransferencia: '', bancoTransferencia: '',
    serviciosList: [],
    tipoNegocio: 'turnos', checkInHora: '14:00', checkOutHora: '10:00',
    minimaEstadia: '1',
    unidadesAlojamiento: [], direccionPropiedad: '', linkUbicacion: '',
  });
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: '', precio: '', duracion: '60' });
  const [mostrarFormServicio, setMostrarFormServicio] = useState(false);
  const [nuevaUnidad, setNuevaUnidad] = useState({ nombre: '', descripcion: '', capacidad: '2', precioPorNoche: '0', amenidades: '' });
  const [mostrarFormUnidad, setMostrarFormUnidad] = useState(false);
  // ── Catálogo de productos ────────────────────────────────────
  const [catalogo,          setCatalogo]          = useState([]);
  const [nuevoProd,         setNuevoProd]         = useState({ nombre: '', precio: '', categoria: '', descripcion: '', stock: '', imagen: '', disponible: true });
  const [mostrarFormProd,   setMostrarFormProd]   = useState(false);
  const [savingCatalogo,    setSavingCatalogo]    = useState(false);
  const [syncingCatalogo,   setSyncingCatalogo]   = useState(false);
  const [catalogoSyncInfo,  setCatalogoSyncInfo]  = useState(null); // { count, ts }
  const [saving, setSaving]   = useState(false);
  const [desconectandoCalendar, setDesconectandoCalendar] = useState(false);
  const [botStatus, setBotStatus] = useState({ activo: false, conectado: false, cargando: true });

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
        redirect_uri_mismatch: `URI de redirección no registrada en Google Cloud Console.\nAgregá esta URL en "Credenciales → URIs de redirección autorizadas":\n${redirectUri || '(revisá los logs de Render)'}`,
        invalid_client:        'Client ID o Client Secret incorrectos. Verificá las variables GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Render.',
        invalid_grant:         'El código de autorización expiró. Intentá conectar de nuevo.',
        access_denied:         'Permiso denegado por el usuario.',
        token_expired:         'Tu sesión expiró. Volvé a iniciar sesión e intentá de nuevo.',
        access_blocked:        'App bloqueada por Google. Agregá tu cuenta como "Usuario de prueba" en Google Cloud Console → Pantalla de consentimiento OAuth.',
        jwt_error:             'Error de autenticación (JWT inválido). Cerrá sesión, volvé a entrar e intentá de nuevo.',
        encryption_error:      'Error de cifrado en el servidor. Verificá que ENCRYPTION_KEY esté configurada en Render.',
        network_error:         'Error de red en el servidor. Verificá la conexión de Render con los servicios de Google.',
      };

      const base = MENSAJES[reason] || `Error (${reason || 'unknown'}) conectando Google Calendar.`;
      const msg  = debugMsg ? `${base}\n\nDetalle: ${debugMsg}` : base;
      toast.error(msg, { duration: 15000 });
      setSearchParams({});
    }
  }, []);

  const conectarGoogleCalendar = () => {
    const token = localStorage.getItem('akira_token');
    if (!token) return toast.error('Sesión expirada. Volvé a iniciar sesión.');
    // api.defaults.baseURL puede ser '/api' (relativo, dev) o 'https://....onrender.com/api' (prod).
    // Necesitamos la URL absoluta del backend para el redirect de OAuth.
    const base = api.defaults.baseURL || '/api';
    const backendUrl = base.startsWith('http')
      ? base.replace(/\/api\/?$/, '')   // 'https://akira-cloud.onrender.com'
      : window.location.origin;          // fallback mismo origen (dev local)
    window.location.href = `${backendUrl}/api/config/google/connect?token=${encodeURIComponent(token)}`;
  };

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
    // Verificar estado del bot
    api.get('/bot/status')
      .then(r => setBotStatus({ activo: !!r.data.botActivo, conectado: !!r.data.botConectado, cargando: false }))
      .catch(() => setBotStatus({ activo: false, conectado: false, cargando: false }));

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
        dominioNgrok:        c.dominioNgrok || '',
        mpWebhookUrl:        c.mpWebhookUrl || '',
        aliasTransferencia:  c.aliasTransferencia  || '',
        cbuTransferencia:    c.cbuTransferencia    || '',
        bancoTransferencia:  c.bancoTransferencia  || '',
        serviciosList:       Array.isArray(c.serviciosList) ? c.serviciosList : [],
        tipoNegocio:           c.tipoNegocio    || 'turnos',
        checkInHora:           c.checkInHora    || '14:00',
        checkOutHora:          c.checkOutHora   || '10:00',
        minimaEstadia:         String(c.minimaEstadia || 1),
        unidadesAlojamiento:   Array.isArray(c.unidadesAlojamiento) ? c.unidadesAlojamiento : [],
        direccionPropiedad:    c.direccionPropiedad || '',
        linkUbicacion:         c.linkUbicacion  || '',
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
      setCatalogo(Array.isArray(c.catalogo) ? c.catalogo : []);
      if (r.data.keys?.catalogoSincronizadoEn) {
        setCatalogoSyncInfo({ ts: r.data.keys.catalogoSincronizadoEn, count: r.data.keys.catalogoProductos || 0 });
      }
    }).catch(() => toast.error('Error cargando configuración'));

    // Socket: catálogo sincronizado desde WA Business
    const offSynced = on('catalog:synced', ({ count, total }) => {
      setSyncingCatalogo(false);
      setCatalogoSyncInfo({ ts: new Date().toISOString(), count: total ?? count });
      toast.success(`✅ Catálogo sincronizado — ${count} producto(s) desde WA`);
      // Recargar catálogo desde la API
      api.get('/config').then(r => {
        if (Array.isArray(r.data.config?.catalogo)) setCatalogo(r.data.config.catalogo);
      }).catch(() => {});
    });

    // Socket: producto nuevo detectado desde un estado WA
    const offNew = on('catalog:new-product', (prod) => {
      toast.success(`📸 Nuevo producto detectado en estado: "${prod.nombre}"`);
      setCatalogo(c => [...c, { ...prod, disponible: true, fuente: 'status' }]);
    });

    return () => { offSynced(); offNew(); };
  }, [on]);

  const handleForm = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const agregarServicio = () => {
    if (!nuevoServicio.nombre.trim() || !nuevoServicio.precio) return;
    const servicio = {
      nombre:   nuevoServicio.nombre.trim(),
      precio:   parseFloat(nuevoServicio.precio),
      duracion: parseInt(nuevoServicio.duracion) || 60,
    };
    setForm(f => ({ ...f, serviciosList: [...f.serviciosList, servicio] }));
    setNuevoServicio({ nombre: '', precio: '', duracion: '60' });
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

  // ── Catálogo: funciones ──────────────────────────────────────
  // Guarda el catálogo pasado como parámetro y actualiza el estado con la respuesta
  const _guardarCatalogo = async (nuevoCatalogo) => {
    try {
      const r = await api.put('/config/catalogo', { catalogo: nuevoCatalogo });
      if (Array.isArray(r.data.catalogo)) setCatalogo(r.data.catalogo);
    } catch {
      toast.error('Error al guardar el catálogo');
    }
  };

  const agregarProducto = async () => {
    if (!nuevoProd.nombre.trim()) return;
    const prod = {
      nombre:      nuevoProd.nombre.trim(),
      precio:      parseFloat(nuevoProd.precio) || 0,
      categoria:   nuevoProd.categoria.trim(),
      descripcion: nuevoProd.descripcion.trim(),
      stock:       nuevoProd.stock !== '' ? parseInt(nuevoProd.stock) : -1,
      imagen:      nuevoProd.imagen.trim(),
      disponible:  nuevoProd.disponible !== false,
      moneda:      'ARS',
      fuente:      'manual',
    };
    const nuevo = [...catalogo, prod];
    setCatalogo(nuevo);
    setNuevoProd({ nombre: '', precio: '', categoria: '', descripcion: '', stock: '', imagen: '', disponible: true });
    setMostrarFormProd(false);
    setSavingCatalogo(true);
    await _guardarCatalogo(nuevo);
    setSavingCatalogo(false);
    toast.success('Producto guardado');
  };

  const eliminarProducto = async (idx) => {
    const nuevo = catalogo.filter((_, i) => i !== idx);
    setCatalogo(nuevo);
    await _guardarCatalogo(nuevo);
  };

  const toggleDisponible = async (idx) => {
    const nuevo = catalogo.map((p, i) => i === idx ? { ...p, disponible: !p.disponible } : p);
    setCatalogo(nuevo);
    await _guardarCatalogo(nuevo);
  };

  const saveCatalogo = async () => {
    setSavingCatalogo(true);
    try {
      const r = await api.put('/config/catalogo', { catalogo });
      setCatalogo(Array.isArray(r.data.catalogo) ? r.data.catalogo : catalogo);
      toast.success(`Catálogo guardado — ${catalogo.length} producto(s)`);
    } catch {
      toast.error('Error al guardar catálogo');
    } finally {
      setSavingCatalogo(false);
    }
  };

  const syncCatalogo = async () => {
    setSyncingCatalogo(true);
    const toastId = toast.loading('🔄 Contactando WA Business...', { duration: 20000 });
    try {
      await api.post('/config/catalogo/sync');
      setBotStatus(s => ({ ...s, activo: true, conectado: true }));

      // Polling: recargar catálogo cada 3 s hasta que aparezcan productos nuevos (máx 18 s)
      let intentos = 0;
      const prevCount = catalogo.length;
      const poll = setInterval(async () => {
        intentos++;
        try {
          const r = await api.get('/config');
          const nuevos = r.data.config?.catalogo;
          if (Array.isArray(nuevos) && nuevos.length > prevCount) {
            // Llegaron productos nuevos
            setCatalogo(nuevos);
            setCatalogoSyncInfo({ ts: new Date().toISOString(), count: nuevos.filter(p => p.fuente === 'wa_catalog').length });
            toast.success(`✅ ${nuevos.filter(p => p.fuente === 'wa_catalog').length} producto(s) importados desde WA Business`, { id: toastId });
            setSyncingCatalogo(false);
            clearInterval(poll);
          } else if (intentos >= 6) {
            // 6 × 3 s = 18 s sin cambios
            if (Array.isArray(nuevos)) setCatalogo(nuevos);
            const waProds = (nuevos || []).filter(p => p.fuente === 'wa_catalog').length;
            if (waProds > 0) {
              toast.success(`✅ ${waProds} producto(s) encontrados en WA Business`, { id: toastId });
            } else {
              toast('⚠️ Sync completado pero no se encontraron productos en el catálogo de WA Business.\n¿El catálogo está publicado en la cuenta?', { id: toastId, duration: 6000, icon: '⚠️' });
            }
            setSyncingCatalogo(false);
            clearInterval(poll);
          }
        } catch { /* ignorar errores de polling */ }
      }, 3000);

    } catch (err) {
      const data = err.response?.data || {};
      if (data.botConectado) {
        toast('⏳ Bot reconectando… intentá sincronizar en 30 segundos.', { id: toastId, icon: '🔄', duration: 5000 });
      } else {
        toast.error(data.error || 'Error al sincronizar — iniciá el bot desde el Dashboard primero.', { id: toastId });
      }
      setSyncingCatalogo(false);
    }
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
      await api.put('/config/horarios', { horariosAtencion: horarios, celularNotificaciones });
      toast.success('Horarios guardados');
    } catch {
      toast.error('Error al guardar horarios');
    } finally {
      setSavingHorarios(false);
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

                {/* Dirección y ubicación */}
                <div className="space-y-2 border-t border-indigo-800/30 pt-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">📍 Dirección y ubicación</p>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dirección de la propiedad</label>
                    <input name="direccionPropiedad" value={form.direccionPropiedad} onChange={handleForm}
                      className="input-base" placeholder="Ej: Av. Siempreviva 742, Villa Carlos Paz, Córdoba" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Link de Google Maps (opcional)</label>
                    <input name="linkUbicacion" value={form.linkUbicacion} onChange={handleForm}
                      className="input-base" placeholder="https://maps.app.goo.gl/..." />
                    <p className="text-xs text-gray-600 mt-1">El bot comparte este link cuando confirma una reserva.</p>
                    {/* Link válido: botón de apertura */}
                    {form.linkUbicacion && form.linkUbicacion.startsWith('http') && (
                      <a href={form.linkUbicacion} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 mt-1.5 transition-colors">
                        <MapPin size={11} /> Abrir en Google Maps
                      </a>
                    )}
                  </div>
                  {/* Vista previa del mapa desde la dirección ingresada */}
                  {form.direccionPropiedad.trim() && (
                    <div className="rounded-xl overflow-hidden border border-gray-700 mt-1" style={{ height: 180 }}>
                      <iframe
                        title="Vista previa ubicación"
                        width="100%" height="180"
                        frameBorder="0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(form.direccionPropiedad.trim())}&output=embed&z=15`}
                        className="w-full h-full"
                      />
                    </div>
                  )}
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
              <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">🔧 Modo Servicios</p>
                <p className="text-xs text-gray-400">
                  Ideal para <strong className="text-amber-200">lavaderos de autos, mecánicos, veterinarias</strong> y cualquier negocio donde se realiza un trabajo sobre un ítem específico (vehículo, mascota, objeto).
                </p>

                {/* Flujo del bot */}
                <div className="space-y-2 border-t border-amber-800/30 pt-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">🤖 Flujo automático del bot</p>
                  <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                    <li>Pregunta qué <strong className="text-amber-200">servicio</strong> quiere el cliente</li>
                    <li>Pide los datos del ítem <span className="text-gray-500">(patente + modelo, nombre de mascota, etc.)</span></li>
                    <li>Consulta disponibilidad de horarios</li>
                    <li>Cliente elige y confirma</li>
                    <li>El bot agenda y notifica al dueño</li>
                  </ol>
                </div>

                {/* Comando akira listo */}
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 border-t border-amber-800/30">
                  <p className="text-xs font-semibold text-amber-300 mb-1">📲 Comando para avisar que el trabajo está listo</p>
                  <p className="text-xs text-gray-400 mb-2">
                    Cuando termines el trabajo, escribí desde tu WhatsApp:
                  </p>
                  <div className="bg-gray-900/60 rounded-lg px-3 py-2 font-mono text-xs text-green-300">
                    akira listo ABC123
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    El bot busca al cliente con esa patente/ítem y le manda automáticamente: <em>"¡Tu Lavado completo ya está listo! Podés venir a buscarlo 😊"</em>
                  </p>
                </div>

                <p className="text-xs text-gray-500">
                  ↓ Agregá los servicios que ofrecés (nombre, precio, duración) en la sección <strong className="text-gray-400">🛠️ Servicios</strong> de abajo.
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Precio por hora (ARS)</label>
                <input name="precioTurno" type="number" value={form.precioTurno} onChange={handleForm} min="0" className="input-base" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Horas mín. para cancelar</label>
                <input name="horasCancelacion" type="number" value={form.horasCancelacion} onChange={handleForm} min="0" className="input-base" />
              </div>
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
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">URL del Webhook</label>
                  <div className="flex gap-2">
                    <input name="mpWebhookUrl" value={form.mpWebhookUrl} onChange={handleForm} className="input-base" placeholder="https://tu-dominio.com/webhook" />
                    <button onClick={saveNegocio} className="btn-secondary px-4 py-2 text-xs whitespace-nowrap"><Save size={13} /></button>
                  </div>
                </div>
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
                {form.serviciosList.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-sm font-medium text-white truncate">{s.nombre}</span>
                      <span className="text-xs text-green-400 flex-shrink-0">${s.precio.toLocaleString('es-AR')}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">{s.duracion} min</span>
                    </div>
                    <button onClick={() => eliminarServicio(idx)} className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 ml-2">
                      <X size={14} />
                    </button>
                  </div>
                ))}
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
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Duración (minutos)</label>
                    <input
                      type="number"
                      min="1"
                      value={nuevoServicio.duracion}
                      onChange={e => setNuevoServicio(s => ({ ...s, duracion: e.target.value }))}
                      className="input-base"
                      placeholder="60"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={agregarServicio} disabled={!nuevoServicio.nombre.trim() || !nuevoServicio.precio} className="btn-primary text-xs px-4 py-2">
                    <Plus size={13} /> Agregar
                  </button>
                  <button onClick={() => { setMostrarFormServicio(false); setNuevoServicio({ nombre: '', precio: '', duracion: '60' }); }} className="btn-secondary text-xs px-4 py-2">
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
                <p className="text-sm" style={{ color: 'var(--text2)' }}>
                  Conectá tu Google Calendar con un click. El bot podrá ver horarios disponibles y crear turnos automáticamente.
                </p>

                {/* Checklist de requisitos antes de conectar */}
                <div className="rounded-xl p-4 space-y-3 text-xs" style={{ background: 'rgba(0,232,123,0.04)', border: '1px solid rgba(0,232,123,0.15)' }}>
                  <p className="font-semibold" style={{ color: 'var(--accent)' }}>⚙️ Requisitos en Google Cloud Console</p>
                  <div className="space-y-2" style={{ color: 'var(--text2)' }}>
                    <div>
                      <p className="font-medium text-white mb-1">1. Credenciales → URIs de redirección autorizadas</p>
                      <p className="mb-1">Esta URL debe estar registrada exactamente así:</p>
                      <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg font-mono break-all" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: '#7dd3fc', fontSize: 11 }}>
                        <span className="flex-1">
                          {(() => {
                            const base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
                            return base || 'https://akira-cloud.onrender.com';
                          })()}/api/config/google/callback
                        </span>
                        <CopiarTexto texto={`${(import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '') || 'https://akira-cloud.onrender.com'}/api/config/google/callback`} />
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-white">2. Pantalla de consentimiento → Usuarios de prueba</p>
                      <p>Agregá el Gmail que vas a conectar (necesario mientras la app esté en modo Testing).</p>
                    </div>
                    <div>
                      <p className="font-medium text-white">3. Variables en Render</p>
                      <p><code className="px-1 py-0.5 rounded" style={{ background: 'var(--surface3)' }}>GOOGLE_CLIENT_ID</code> y <code className="px-1 py-0.5 rounded" style={{ background: 'var(--surface3)' }}>GOOGLE_CLIENT_SECRET</code> configuradas.</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={conectarGoogleCalendar}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-white hover:bg-gray-100 text-gray-800 font-medium text-sm transition-colors shadow"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Conectar con Google Calendar
                </button>
                <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                  Solo pedimos permiso para ver y editar tu calendario. Podés desconectarlo cuando quieras.
                </p>
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
              <SeccionCollapsible titulo="⚙️ Opción avanzada — Subir credentials.json manualmente">
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

        {/* Ngrok */}
        <SeccionCollapsible titulo="🌐 Ngrok (webhook local)" delay={420}>
          <p className="text-xs text-gray-500 mb-4">Solo necesario si tu servidor es local y no tenés dominio propio.</p>
          <div className="space-y-4">
            <KeyField campo="keyNgrok" label="Ngrok Auth Token" placeholder="de dashboard.ngrok.com" keys={keys} onSave={saveKey} onDelete={deleteKey} />
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Dominio fijo (opcional)</label>
              <div className="flex gap-2">
                <input name="dominioNgrok" value={form.dominioNgrok} onChange={handleForm} className="input-base flex-1" placeholder="tu-nombre.ngrok-free.app" />
                <button onClick={saveNegocio} className="btn-secondary px-4 text-xs"><Save size={13} /></button>
              </div>
            </div>
          </div>
        </SeccionCollapsible>

        {/* ── Catálogo de productos ─────────────────────────── */}
        <SeccionCollapsible titulo={`📦 Catálogo de productos${catalogo.length > 0 ? ` (${catalogo.length})` : ''}`} delay={480}>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              El bot consulta este catálogo cuando un cliente pregunta por productos, precios o stock.
              Si usás <strong>WhatsApp Business</strong> con catálogo, podés sincronizarlo automáticamente. También se detectan productos publicados en tus <strong>estados de WA</strong>.
            </p>

            {/* Estado del bot + botón sync */}
            {!botStatus.cargando && !botStatus.activo && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }}>
                <Ban size={12} />
                <span>
                  {botStatus.conectado
                    ? 'El bot tiene sesión guardada pero no está corriendo. Inicialo desde el Dashboard, esperá que conecte y luego sincronizá.'
                    : 'El bot no está activo. Inicialo desde el Dashboard primero.'}
                </span>
              </div>
            )}

            {/* Botón sync desde WA Business */}
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={syncCatalogo} disabled={syncingCatalogo}
                className="btn-secondary text-xs flex items-center gap-1.5">
                <RefreshCw size={13} className={syncingCatalogo ? 'animate-spin' : ''} />
                {syncingCatalogo ? 'Sincronizando...' : 'Sincronizar desde WA Business'}
              </button>
              {botStatus.activo && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                  <CheckCircle size={11} /> Bot activo
                </span>
              )}
              {catalogoSyncInfo?.ts && (
                <span className="text-xs text-gray-600">
                  Última sync: {new Date(catalogoSyncInfo.ts).toLocaleString('es-AR')} · {catalogoSyncInfo.count} producto(s)
                </span>
              )}
            </div>

            {/* Lista de productos */}
            {catalogo.length > 0 && (
              <div className="space-y-2">
                {catalogo.map((p, idx) => (
                  <div key={idx} className="flex items-start justify-between bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${p.disponible ? 'text-white' : 'text-gray-500 line-through'}`}>{p.nombre}</span>
                        <span className="text-xs font-semibold text-green-400">${parseFloat(p.precio || 0).toLocaleString('es-AR')} ARS</span>
                        {p.categoria && <span className="text-xs text-gray-500 bg-gray-700/50 rounded px-1.5">{p.categoria}</span>}
                        {p.fuente === 'wa_catalog' && <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-1.5">WA</span>}
                        {p.fuente === 'status'     && <span className="text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-1.5">estado</span>}
                        {p.stock >= 0 && <span className="text-xs text-gray-500">stock: {p.stock}</span>}
                      </div>
                      {p.descripcion && <p className="text-xs text-gray-500 mt-0.5 truncate">{p.descripcion}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => toggleDisponible(idx)} title={p.disponible ? 'Deshabilitar' : 'Habilitar'}
                        className={`p-1.5 rounded-lg text-xs transition-colors ${p.disponible ? 'text-green-400 hover:bg-green-500/10' : 'text-gray-600 hover:bg-gray-700'}`}>
                        {p.disponible ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      </button>
                      <button onClick={() => eliminarProducto(idx)} className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario nuevo producto */}
            {mostrarFormProd ? (
              <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Nuevo producto</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                    <input value={nuevoProd.nombre} onChange={e => setNuevoProd(p => ({ ...p, nombre: e.target.value }))}
                      className="input-base" placeholder="Ej: Zapatillas Nike Air Max" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Precio (ARS)</label>
                    <input type="number" min="0" value={nuevoProd.precio} onChange={e => setNuevoProd(p => ({ ...p, precio: e.target.value }))}
                      className="input-base" placeholder="15000" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Categoría</label>
                    <input value={nuevoProd.categoria} onChange={e => setNuevoProd(p => ({ ...p, categoria: e.target.value }))}
                      className="input-base" placeholder="Ropa, Electro, etc." />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Stock (-1 = sin límite)</label>
                    <input type="number" min="-1" value={nuevoProd.stock} onChange={e => setNuevoProd(p => ({ ...p, stock: e.target.value }))}
                      className="input-base" placeholder="-1" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">URL Imagen (opcional)</label>
                    <input value={nuevoProd.imagen} onChange={e => setNuevoProd(p => ({ ...p, imagen: e.target.value }))}
                      className="input-base" placeholder="https://..." />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                    <input value={nuevoProd.descripcion} onChange={e => setNuevoProd(p => ({ ...p, descripcion: e.target.value }))}
                      className="input-base" placeholder="Talles 38-45, colores variados..." />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={agregarProducto} disabled={!nuevoProd.nombre.trim()} className="btn-primary text-xs px-4 py-2">
                    <Plus size={13} /> Agregar
                  </button>
                  <button onClick={() => { setMostrarFormProd(false); setNuevoProd({ nombre: '', precio: '', categoria: '', descripcion: '', stock: '', imagen: '', disponible: true }); }}
                    className="btn-secondary text-xs px-4 py-2">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setMostrarFormProd(true)} className="btn-secondary text-xs flex items-center gap-1.5">
                <Plus size={13} /> Agregar producto manualmente
              </button>
            )}

            {/* Guardar catálogo */}
            {catalogo.length > 0 && (
              <button onClick={saveCatalogo} disabled={savingCatalogo} className="btn-primary text-xs flex items-center gap-1.5 mt-1">
                <Save size={13} className={savingCatalogo ? 'animate-spin' : ''} />
                {savingCatalogo ? 'Guardando...' : `Guardar catálogo (${catalogo.length} producto${catalogo.length !== 1 ? 's' : ''})`}
              </button>
            )}
          </div>
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

            {/* Celular notificaciones */}
            <div className="border-t border-gray-800 pt-4">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                <BellRing size={11} className="inline mr-1" />Número para notificaciones (WhatsApp)
              </label>
              <input
                type="tel"
                value={celularNotificaciones}
                onChange={e => setCelularNotif(e.target.value)}
                className="input-base"
                placeholder="5491112345678 (con código de país, sin +)"
              />
              <p className="text-xs text-gray-600 mt-1">Cada vez que el bot confirme un turno, te manda un aviso a este número.</p>
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
    </Layout>
  );
}
