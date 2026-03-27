import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Save, Key, Eye, EyeOff, CheckCircle, XCircle, Upload, Trash2, ChevronDown, ChevronUp, Plus, X, Copy, ExternalLink, AlertTriangle, Info, CalendarCheck, Unlink, Clock, BellRing, Ban, PauseCircle, PlayCircle } from 'lucide-react';

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
    <div className="rounded-lg border border-indigo-800/50 bg-indigo-950/30 overflow-hidden">
      <button
        onClick={() => setAbierta(!abierta)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-indigo-900/20 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-indigo-300">
          <Info size={14} /> ¿Cómo obtener el credentials.json? — Guía paso a paso
        </span>
        {abierta ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-indigo-400" />}
      </button>

      {abierta && (
        <div className="px-4 pb-5 space-y-4 border-t border-indigo-800/40">
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
      )}
    </div>
  );
}

function SeccionCollapsible({ titulo, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left">
        <span className="font-semibold text-white text-sm">{titulo}</span>
        {open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>
      {open && <div className="mt-5 pt-5 border-t border-gray-800">{children}</div>}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig]   = useState({});
  const [keys,   setKeys]     = useState({});
  const [form,   setForm]     = useState({
    miNombre: '', negocio: '', servicios: '', precioTurno: '1000',
    horasCancelacion: '24', promptPersonalizado: '', dominioNgrok: '', mpWebhookUrl: '',
    aliasTransferencia: '', cbuTransferencia: '', bancoTransferencia: '',
    serviciosList: [],
    tipoNegocio: 'turnos', checkInHora: '14:00', checkOutHora: '10:00',
    minimaEstadia: '1', precioPorNoche: '0',
  });
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: '', precio: '', duracion: '60' });
  const [mostrarFormServicio, setMostrarFormServicio] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [desconectandoCalendar, setDesconectandoCalendar] = useState(false);

  // Horarios de atención
  const DIAS_ORDEN = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  const DIAS_LABEL = { lunes:'Lunes', martes:'Martes', miercoles:'Miércoles', jueves:'Jueves', viernes:'Viernes', sabado:'Sábado', domingo:'Domingo' };
  const HORARIOS_DEFAULT = {
    lunes:     { activo: true,  inicio: '09:00', fin: '18:00' },
    martes:    { activo: true,  inicio: '09:00', fin: '18:00' },
    miercoles: { activo: true,  inicio: '09:00', fin: '18:00' },
    jueves:    { activo: true,  inicio: '09:00', fin: '18:00' },
    viernes:   { activo: true,  inicio: '09:00', fin: '18:00' },
    sabado:    { activo: true,  inicio: '09:00', fin: '13:00' },
    domingo:   { activo: false, inicio: '09:00', fin: '18:00' },
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
      toast.error('No se pudo conectar Google Calendar. Intentá de nuevo.');
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
        tipoNegocio:         c.tipoNegocio    || 'turnos',
        checkInHora:         c.checkInHora    || '14:00',
        checkOutHora:        c.checkOutHora   || '10:00',
        minimaEstadia:       String(c.minimaEstadia  || 1),
        precioPorNoche:      String(c.precioPorNoche || 0),
      });
      if (c.horariosAtencion && Object.keys(c.horariosAtencion).length > 0) {
        setHorarios({ ...HORARIOS_DEFAULT, ...c.horariosAtencion });
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
    };
    setForm(f => ({ ...f, serviciosList: [...f.serviciosList, servicio] }));
    setNuevoServicio({ nombre: '', precio: '', duracion: '60' });
    setMostrarFormServicio(false);
  };

  const eliminarServicio = (idx) => {
    setForm(f => ({ ...f, serviciosList: f.serviciosList.filter((_, i) => i !== idx) }));
  };

  const saveNegocio = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put('/config/negocio', {
        ...form,
        precioTurno:    parseFloat(form.precioTurno),
        horasCancelacion: parseInt(form.horasCancelacion),
        serviciosList:  form.serviciosList,
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
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuración</h1>
          <p className="text-gray-500 text-sm mt-1">Personalizá tu bot y conectá tus servicios.</p>
        </div>

        {/* Datos del negocio */}
        <SeccionCollapsible titulo="🏢 Datos del negocio" defaultOpen>
          <form onSubmit={saveNegocio} className="space-y-4">

            {/* Tipo de negocio */}
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Tipo de negocio</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'turnos',      label: '📅 Turnos / Citas', desc: 'Barbería, médico, uñas, etc.' },
                  { value: 'alojamiento', label: '🏠 Alojamiento',    desc: 'Cabañas, departamentos, hospedajes' },
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
              <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Configuración de alojamiento</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Check-in</label>
                    <input type="time" name="checkInHora" value={form.checkInHora} onChange={handleForm} className="input-base" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Check-out</label>
                    <input type="time" name="checkOutHora" value={form.checkOutHora} onChange={handleForm} className="input-base" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Estadía mínima (noches)</label>
                    <input type="number" name="minimaEstadia" value={form.minimaEstadia} onChange={handleForm} min="1" className="input-base" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Precio por noche (ARS)</label>
                    <input type="number" name="precioPorNoche" value={form.precioPorNoche} onChange={handleForm} min="0" className="input-base" />
                  </div>
                </div>
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
        <SeccionCollapsible titulo="🤖 Groq API (IA) — REQUERIDO" defaultOpen={!keys.groq}>
          <p className="text-xs text-gray-500 mb-4">
            Conseguí tu API Key gratis en <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">console.groq.com</a> → API Keys.
          </p>
          <KeyField campo="keyGroq" label="Groq API Key" placeholder="gsk_..." keys={keys} onSave={saveKey} onDelete={deleteKey} />
        </SeccionCollapsible>

        {/* MercadoPago */}
        <SeccionCollapsible titulo="💳 Pagos (MercadoPago o Transferencia)">
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

        {/* Servicios */}
        <SeccionCollapsible titulo="🛠️ Servicios">
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
        </SeccionCollapsible>

        {/* Google Calendar */}
        <SeccionCollapsible titulo="📅 Google Calendar (agenda)">
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
              <div className="space-y-3">
                <p className="text-sm text-gray-300">
                  Conectá tu Google Calendar con un click. El bot podrá ver horarios disponibles y crear turnos automáticamente.
                </p>
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
                <p className="text-xs text-gray-500 text-center">
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
        <SeccionCollapsible titulo="🔊 RIME AI (respuestas por audio)">
          <p className="text-xs text-gray-500 mb-4">
            Permite que Akira responda con voz. Conseguí tu key en <a href="https://rime.ai" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">rime.ai</a>.
          </p>
          <KeyField campo="keyRime" label="RIME API Key" placeholder="rime_..." keys={keys} onSave={saveKey} onDelete={deleteKey} />
        </SeccionCollapsible>

        {/* Ngrok */}
        <SeccionCollapsible titulo="🌐 Ngrok (webhook local)">
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

        {/* Horarios de atención — solo para modo turnos */}
        {form.tipoNegocio !== 'alojamiento' && <SeccionCollapsible titulo="⏰ Horarios de atención">
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Configurá en qué días y horarios recibís clientes. El bot solo ofrecerá turnos en los horarios activos.</p>
            <div className="space-y-2">
              {DIAS_ORDEN.map(dia => (
                <div key={dia} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setHorarios(h => ({ ...h, [dia]: { ...h[dia], activo: !h[dia].activo } }))}
                    className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${horarios[dia]?.activo ? 'bg-indigo-600' : 'bg-gray-700'}`}
                  >
                    <span className={`block w-4 h-4 rounded-full bg-white mx-0.5 transition-transform ${horarios[dia]?.activo ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <span className={`text-sm w-20 flex-shrink-0 ${horarios[dia]?.activo ? 'text-white' : 'text-gray-600'}`}>{DIAS_LABEL[dia]}</span>
                  {horarios[dia]?.activo ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="time"
                        value={horarios[dia]?.inicio || '09:00'}
                        onChange={e => setHorarios(h => ({ ...h, [dia]: { ...h[dia], inicio: e.target.value } }))}
                        className="input-base py-1 text-xs w-28"
                      />
                      <span className="text-gray-600 text-xs">a</span>
                      <input
                        type="time"
                        value={horarios[dia]?.fin || '18:00'}
                        onChange={e => setHorarios(h => ({ ...h, [dia]: { ...h[dia], fin: e.target.value } }))}
                        className="input-base py-1 text-xs w-28"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-600 italic">Cerrado</span>
                  )}
                </div>
              ))}
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
        <SeccionCollapsible titulo="⏸️ Disponibilidad">
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
