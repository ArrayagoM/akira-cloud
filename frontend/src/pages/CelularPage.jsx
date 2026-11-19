import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Activity, BarChart3, Settings, RefreshCw, Bell, LogOut, Share, Plus, Smartphone, Loader2, Eye, EyeOff, Camera } from 'lucide-react';
import ElegirResumen from '../components/ElegirResumen';
import CargarProducto from '../components/celular/CargarProducto';
import DialogoConfirmar from '../components/celular/DialogoConfirmar';
import useSondeo from '../components/celular/useSondeo';
import { CLAVE_BORRADOR } from '../lib/productoCelular';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { describirBot, hace, accionesDisponibles, lineasResumen, vigenciaResumen, avisoResumen, ordenesRecientes, ordenesPendientes, estadoEfectivoOrden, mensajeOrden, leerOrdenGuardada, instantaneaOffline, CLAVE_ULTIMO_ESTADO, VENCE_ORDEN_MS, AVISO_ORDEN_LENTA_MS } from '../lib/estadoMovil';
import { activarAvisos, desactivarAvisos, avisosActivos, soportaAvisos, esIPhone, estaInstalada } from '../services/avisosWeb';

// App del celular de Akira, dentro de la web: se instala en la pantalla de inicio (iPhone y Android) y sirve para
// ver si el bot está atendiendo, mirar unos números del negocio, pausarlo / ponerlo en vacaciones y recibir avisos.
// El bot, WhatsApp y los datos de los clientes siguen en la PC: acá solo se monitorea.

const TONO = { ok: '#00e87b', aviso: '#f59e0b', error: '#f43f5e', neutro: '#94a3b8' };

function Marco({ children }) {
  return <div className="min-h-screen min-h-dvh" style={{ background: 'var(--bg, #070b10)', color: 'var(--text, #e8f0f8)' }}>{children}</div>;
}

function Ingreso() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const entrar = async (e) => {
    e.preventDefault(); setError(''); setCargando(true);
    try { await login(email.trim(), clave); }
    catch (err) { setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'No se pudo iniciar sesión. Revisá tus datos.'); }
    finally { setCargando(false); }
  };
  return (
    <Marco>
      <div className="max-w-sm mx-auto px-5 pt-16 pb-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.3)' }}><Bot size={30} style={{ color: '#00e87b' }} /></div>
          <h1 className="text-2xl font-bold">Akira <span style={{ color: '#00e87b' }}>Cloud</span></h1>
          <p className="text-sm mt-1 text-center" style={{ color: 'var(--text2, #9aa8b8)' }}>Mirá desde el celular cómo está tu bot.</p>
        </div>
        <form onSubmit={entrar} className="card space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--text2, #9aa8b8)' }}>Email</label>
            <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-base" placeholder="tu@email.com" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--text2, #9aa8b8)' }}>Contraseña</label>
            <div className="relative">
              <input type={ver ? 'text' : 'password'} autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} className="input-base pr-10" placeholder="••••••••" />
              <button type="button" onClick={() => setVer((v) => !v)} className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center" aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={{ color: 'var(--text2, #9aa8b8)' }}>{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </div>
          {error && <p className="text-sm" style={{ color: '#f43f5e' }} role="alert">{error}</p>}
          <button type="submit" disabled={cargando} className="btn-primary w-full justify-center">{cargando ? <Loader2 size={16} className="animate-spin" /> : 'Entrar'}</button>
          <p className="text-xs text-center" style={{ color: 'var(--text2, #9aa8b8)' }}>Es la misma cuenta que usás en Akira para Windows. <Link to="/forgot-password" style={{ color: '#00e87b' }}>¿Olvidaste tu contraseña?</Link></p>
        </form>
      </div>
    </Marco>
  );
}

// El interruptor se ve de 52x30, pero el botón que se toca mide 52x44 (mínimo cómodo para el dedo).
function Interruptor({ activo, deshabilitado, onCambio, etiqueta }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={deshabilitado} onClick={() => onCambio(!activo)}
      className="relative shrink-0 rounded-full" style={{ width: 52, height: 44, background: 'transparent', opacity: deshabilitado ? 0.5 : 1 }}>
      <span className="absolute rounded-full transition-colors" style={{ left: 0, top: 7, width: 52, height: 30, background: activo ? '#00e87b' : '#2a3648' }} />
      <span className="absolute rounded-full bg-white transition-all" style={{ width: 24, height: 24, top: 10, left: activo ? 25 : 3 }} />
    </button>
  );
}

// La orden en curso se recuerda en esta pestaña (sessionStorage) para seguirla si se recarga la página.
const claveOrden = (deviceId) => `akira.celular.orden.${deviceId}`;
const leerOrden = (deviceId) => { try { return leerOrdenGuardada(sessionStorage.getItem(claveOrden(deviceId))); } catch { return null; } };
const guardarOrden = (deviceId, o) => { try { if (o) sessionStorage.setItem(claveOrden(deviceId), JSON.stringify(o)); else sessionStorage.removeItem(claveOrden(deviceId)); } catch { /* sin almacenamiento: la orden se sigue igual mientras no se recargue */ } };
const TONO_NOTA = { ok: '#00e87b', error: '#f87171', info: undefined };
// Pide confirmación solo lo que apaga el bot o cambia lo que le dice a los clientes. Reanudar y desactivar vacaciones van directo.
const CONFIRMAN = ['bot-pausar', 'vacaciones-on'];

function PC({ pc, ahora, alCambiar, alOrden }) {
  const info = describirBot(pc);
  const color = TONO[info.tono] || TONO.neutro;
  const acc = accionesDisponibles(pc);
  const [orden, setOrden] = useState(() => leerOrden(pc.deviceId)); // { id, tipo, en } de la orden que esperamos
  const [trabajando, setTrabajando] = useState(() => { const o = leerOrden(pc.deviceId); return o && Date.now() - o.en < AVISO_ORDEN_LENTA_MS ? o.tipo : null; });
  const [nota, setNota] = useState({ texto: '', tipo: 'info' });
  const [confirmar, setConfirmar] = useState(null);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  // Le avisa a la pantalla que hay una orden esperando (para consultar más seguido mientras tanto).
  useEffect(() => { alOrden(pc.deviceId, orden ? orden.en : null); return () => alOrden(pc.deviceId, null); }, [orden]); // eslint-disable-line react-hooks/exhaustive-deps

  const terminar = (estado, edad) => {
    guardarOrden(pc.deviceId, null); setOrden(null); setTrabajando(null);
    setNota(mensajeOrden(orden.tipo, estado, edad));
    if (estado === 'hecho') alCambiar();
  };
  // Sigue la orden: cada vez que llega un estado nuevo del servidor mira cómo quedó. Si el servidor ya no la lista (pasaron más de 5 órdenes), la consulta puntual.
  useEffect(() => {
    if (!orden) return undefined;
    const edad = Date.now() - orden.en;
    const resolver = (estadoServidor) => {
      if (!vivo.current) return;
      const estado = estadoServidor === 'pendiente' && edad > VENCE_ORDEN_MS + 5000 ? 'vencido' : estadoServidor; // la PC tuvo 10 min y no la retiró
      if (estado !== 'pendiente') { terminar(estado, edad); return; }
      if (edad >= AVISO_ORDEN_LENTA_MS) setTrabajando(null); // los botones se liberan, pero la orden se sigue mirando
      setNota(mensajeOrden(orden.tipo, 'pendiente', edad));
    };
    const c = (pc.comandos || []).find((x) => x.id === orden.id);
    if (c) { resolver(estadoEfectivoOrden(c, ahora)); return undefined; }
    let activo = true;
    api.get(`/mobile/comandos/${encodeURIComponent(orden.id)}`, { params: { deviceId: pc.deviceId } })
      .then((r) => { if (activo) resolver(estadoEfectivoOrden({ estado: r.data && r.data.estado }, ahora)); })
      .catch((e) => { if (activo && vivo.current && e.response?.status === 404) terminar('desconocido', edad); /* otro error (sin conexión): se reintenta en la próxima consulta */ });
    return () => { activo = false; };
  }, [pc.comandos, orden]); // eslint-disable-line react-hooks/exhaustive-deps

  const ejecutar = async (tipo) => {
    setNota({ texto: '', tipo: 'info' }); setTrabajando(tipo);
    try {
      const { data } = await api.post('/mobile/comandos', { deviceId: pc.deviceId, tipo });
      const nueva = { id: data.comando.id, tipo, en: Date.now() };
      guardarOrden(pc.deviceId, nueva); alOrden(pc.deviceId, nueva.en);
      if (vivo.current) { setOrden(nueva); setNota(mensajeOrden(tipo, 'pendiente', 0)); }
      alCambiar(); // trae la orden a la lista y acelera las consultas
    } catch (e) {
      if (vivo.current) { setTrabajando(null); setNota({ texto: e.response?.data?.codigo === 'CELULAR_DESACTIVADO' ? 'Primero activalo en Akira (PC) → Inicio → “Controlar desde la app del celular”.' : (e.response?.data?.error || 'No se pudo enviar la orden. Revisá tu internet y probá de nuevo.'), tipo: 'error' }); }
    }
  };
  const pedir = (tipo) => { if (CONFIRMAN.includes(tipo)) setConfirmar(tipo); else ejecutar(tipo); };
  const ordenes = ordenesRecientes(pc, ahora);
  const sub = { color: 'var(--text2, #9aa8b8)' };

  return (
    <div className="card mb-4" style={{ borderColor: color + '55' }}>
      <div className="flex items-center justify-between"><p className="font-bold">{pc.nombre}</p><span className="text-xs" style={{ color: 'var(--muted, #64748b)' }}>{pc.version ? `v${pc.version}` : ''}</span></div>
      <div className="mt-3 mb-2"><span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: color + '22', color }}>{info.titulo.toUpperCase()}</span></div>
      <p className="text-[15px] leading-relaxed">{info.detalle}</p>
      <p className="text-xs mt-2" style={sub}>Última señal de la PC: {hace(pc.ultimoHeartbeat)}</p>

      {!pc.controlRemoto && pc.online && <p className="text-xs mt-3" style={{ color: '#f59e0b' }}>Para apagar, reanudar o cargar productos desde acá, activá “Controlar desde la app del celular” en Akira (PC) → Inicio.</p>}
      {pc.controlRemoto && (
        <div className="mt-4 space-y-3">
          {acc.puedePausar && <button className="btn-secondary w-full justify-center" style={{ minHeight: 44 }} disabled={!!trabajando} onClick={() => pedir('bot-pausar')}>{trabajando === 'bot-pausar' ? <Loader2 size={15} className="animate-spin" /> : 'Apagar el bot'}</button>}
          {acc.puedeReanudar && <button className="btn-primary w-full justify-center" style={{ minHeight: 44 }} disabled={!!trabajando} onClick={() => pedir('bot-reanudar')}>{trabajando === 'bot-reanudar' ? <Loader2 size={15} className="animate-spin" /> : 'Reanudar el bot'}</button>}
          {pc.online && (
            <div className="flex items-center justify-between gap-3 pt-3" style={{ borderTop: '1px solid var(--border, #1e2a3a)' }}>
              <span><span className="block text-[15px] font-semibold">Modo vacaciones</span><span className="block text-xs" style={sub}>El bot avisa que no toma reservas por ahora.</span></span>
              <Interruptor activo={!!pc.vacaciones} deshabilitado={!!trabajando} etiqueta="Modo vacaciones" onCambio={(v) => pedir(v ? 'vacaciones-on' : 'vacaciones-off')} />
            </div>
          )}
        </div>
      )}
      {!!nota.texto && <p className="text-sm mt-3" style={{ color: TONO_NOTA[nota.tipo] || sub.color, fontWeight: nota.tipo === 'error' ? 600 : undefined }} role={nota.tipo === 'error' ? 'alert' : 'status'}>{nota.texto}</p>}

      {ordenes.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border, #1e2a3a)' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={sub}>Últimas órdenes</p>
          <ul className="space-y-2">
            {ordenes.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0"><span className="block text-sm truncate">{o.texto}</span>{!!o.hora && <span className="block text-xs" style={sub}>{o.hora}</span>}</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: (TONO[o.tono] || TONO.neutro) + '22', color: TONO[o.tono] || TONO.neutro }}>{o.etiqueta}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmar === 'bot-pausar' && (
        <DialogoConfirmar titulo="¿Apagar el bot?" textoConfirmar="Apagar el bot" peligro alCancelar={() => setConfirmar(null)} alConfirmar={() => { setConfirmar(null); ejecutar('bot-pausar'); }}>
          <p>El bot deja de contestar a <b>todos tus clientes</b> hasta que lo reanudes. Mientras esté apagado, los mensajes que lleguen no se responden.</p>
          <p className="mt-2">Para que vuelva a atender, tocá “Reanudar el bot”: se puede hacer desde acá.</p>
        </DialogoConfirmar>
      )}
      {confirmar === 'vacaciones-on' && (
        <DialogoConfirmar titulo="¿Activar el modo vacaciones?" textoConfirmar="Activar vacaciones" alCancelar={() => setConfirmar(null)} alConfirmar={() => { setConfirmar(null); ejecutar('vacaciones-on'); }}>
          <p>El bot sigue conectado, pero le avisa a los clientes que por ahora no toma reservas. Lo desactivás cuando quieras con este mismo interruptor.</p>
        </DialogoConfirmar>
      )}
    </div>
  );
}

function PestañaEstado({ estado, cargando, error, recargar, usuario, alOrden }) {
  const pcs = estado?.pcs || [];
  return (
    <div>
      <h2 className="text-xl font-bold">Hola{usuario?.nombre ? `, ${usuario.nombre.split(' ')[0]}` : ''} 👋</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text2, #9aa8b8)' }}>Así está tu negocio ahora.</p>
      {!!error && <div className="card mb-4" style={{ borderColor: 'rgba(244,63,94,0.4)' }}><p style={{ color: '#f43f5e' }} role="alert">{error}</p></div>}
      {!estado && cargando && !error && <div className="flex justify-center mt-10"><Loader2 className="animate-spin" style={{ color: '#00e87b' }} /></div>}
      {!error && !cargando && estado && pcs.length === 0 && (
        <div className="card"><p className="font-bold">Todavía no hay ninguna PC</p><p className="text-sm mt-1.5" style={{ color: 'var(--text2, #9aa8b8)' }}>Instalá Akira en tu computadora con Windows (<Link to="/descargar" style={{ color: '#00e87b' }}>akiracloud.lat/descargar</Link>) e iniciá sesión con esta misma cuenta. Después vas a verla acá.</p></div>
      )}
      {pcs.map((pc) => <PC key={pc.deviceId} pc={pc} ahora={new Date((estado && estado.ahora) || Date.now())} alCambiar={recargar} alOrden={alOrden} />)}
    </div>
  );
}

function PestañaResumen({ estado, recargar }) {
  const pcs = estado?.pcs || [];
  const conResumen = pcs.filter((p) => lineasResumen(p.resumen).length > 0);
  return (
    <div>
      <h2 className="text-xl font-bold">Resumen del negocio</h2>
      <p className="text-sm mb-3" style={{ color: 'var(--text2, #9aa8b8)' }}>Solo números: nunca se ven ni se envían nombres, chats ni documentos de tus clientes.</p>
      <ElegirResumen alCambiar={recargar} />
      {conResumen.length === 0 && <div className="card"><p className="font-bold">Todavía no hay datos para mostrar</p><p className="text-sm mt-1.5" style={{ color: 'var(--text2, #9aa8b8)' }}>Activá “Ver tu negocio desde el celular” en Akira (PC) → Inicio. Es opcional y lo podés apagar cuando quieras.</p></div>}
      {conResumen.map((pc) => {
        const vig = vigenciaResumen(pc.resumen, pc.resumenEn, new Date(estado?.ahora || Date.now()));
        const aviso = avisoResumen(vig, pc.resumenEn, new Date(estado?.ahora || Date.now()));
        return (
        <div key={pc.deviceId} className="mb-5">
          {pcs.length > 1 && <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text2, #9aa8b8)' }}>{pc.nombre}</p>}
          <div className="grid grid-cols-2 gap-3">
            {lineasResumen(pc.resumen, vig).map((l) => <div key={l.clave} className="card"><p className="text-2xl font-extrabold truncate" style={{ color: '#00e87b' }}>{l.valor}</p><p className="text-xs mt-1" style={{ color: 'var(--text2, #9aa8b8)' }}>{l.etiqueta}</p></div>)}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text2, #9aa8b8)' }}>Actualizado {hace(pc.resumenEn)}</p>
          {aviso && <p className="text-xs mt-2 font-semibold" style={{ color: '#fbbf24' }}>{aviso}</p>}
        </div>
        );
      })}
    </div>
  );
}

function PestañaAjustes({ usuario, alSalir }) {
  const [activos, setActivos] = useState(null);
  const [msg, setMsg] = useState('');
  const [trabajando, setTrabajando] = useState('');
  const [instalador, setInstalador] = useState(null);
  const instalada = estaInstalada();
  const iphone = esIPhone();

  useEffect(() => { avisosActivos().then(setActivos).catch(() => setActivos(false)); }, []);
  useEffect(() => {
    const capturar = (e) => { e.preventDefault(); setInstalador(e); };
    window.addEventListener('beforeinstallprompt', capturar);
    return () => window.removeEventListener('beforeinstallprompt', capturar);
  }, []);

  const activar = async () => { setTrabajando('activar'); setMsg(''); const r = await activarAvisos(api); if (r.ok) { setActivos(true); setMsg('✅ Este celular ya recibe los avisos de tu bot.'); } else setMsg(r.motivo); setTrabajando(''); };
  const apagar = async () => { setTrabajando('apagar'); await desactivarAvisos(api); setActivos(false); setMsg('Avisos apagados en este celular.'); setTrabajando(''); };
  const probar = async () => {
    setTrabajando('probar'); setMsg('');
    try { const r = await api.post('/mobile/prueba', {}); setMsg(r.data.ok ? 'Te mandamos una notificación de prueba.' : 'Todavía no hay ningún celular activado para recibir avisos. Tocá “Activar avisos”.'); }
    catch (e) { setMsg(e.response?.data?.error || 'No se pudo enviar la prueba.'); } finally { setTrabajando(''); }
  };
  const instalar = async () => { if (!instalador) return; instalador.prompt(); await instalador.userChoice.catch(() => {}); setInstalador(null); };

  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold">Ajustes</h2><p className="text-sm" style={{ color: 'var(--text2, #9aa8b8)' }}>{usuario?.email || ''}</p></div>

      {!instalada && (
        <div className="card">
          <p className="font-bold flex items-center gap-2"><Smartphone size={16} style={{ color: '#00e87b' }} />Instalá Akira en tu celular</p>
          {iphone ? (
            <ol className="text-sm mt-2 space-y-1.5 list-decimal pl-5" style={{ color: 'var(--text2, #9aa8b8)' }}>
              <li>Abrí esta página en <b>Safari</b>.</li>
              <li>Tocá el botón <b>Compartir</b> <Share size={13} className="inline -mt-0.5" /> (el cuadrado con la flecha).</li>
              <li>Elegí <b>“Agregar a inicio”</b> <Plus size={13} className="inline -mt-0.5" /> y confirmá.</li>
              <li>Abrí Akira desde el ícono nuevo: ahí podés activar los avisos.</li>
            </ol>
          ) : instalador ? (
            <><p className="text-sm mt-2" style={{ color: 'var(--text2, #9aa8b8)' }}>Queda como una app más en tu pantalla de inicio.</p><button className="btn-primary mt-3 w-full justify-center" onClick={instalar}>Instalar Akira</button></>
          ) : (
            <p className="text-sm mt-2" style={{ color: 'var(--text2, #9aa8b8)' }}>En Chrome: menú (⋮) → <b>Instalar app</b> o <b>Agregar a la pantalla de inicio</b>.</p>
          )}
        </div>
      )}

      <div className="card">
        <p className="font-bold flex items-center gap-2"><Bell size={16} style={{ color: '#00e87b' }} />Avisos en este celular</p>
        <p className="text-sm mt-1.5 mb-3" style={{ color: 'var(--text2, #9aa8b8)' }}>Si tu bot se cae o vuelve, te llega una notificación. No puede avisarte por WhatsApp si lo que falló es WhatsApp.</p>
        {activos
          ? <button className="btn-secondary w-full justify-center" disabled={!!trabajando} onClick={apagar}>Apagar avisos en este celular</button>
          : <button className="btn-primary w-full justify-center" disabled={!!trabajando} onClick={activar}>{trabajando === 'activar' ? <Loader2 size={15} className="animate-spin" /> : 'Activar avisos'}</button>}
        {!soportaAvisos() && !iphone && <p className="text-xs mt-2" style={{ color: '#f59e0b' }}>Este navegador no soporta avisos. Probá con Chrome.</p>}
        <button className="btn-secondary w-full justify-center mt-3" disabled={!!trabajando} onClick={probar}>{trabajando === 'probar' ? <Loader2 size={15} className="animate-spin" /> : 'Enviarme una notificación de prueba'}</button>
        {!!msg && <p className="text-sm mt-3" style={{ color: 'var(--text2, #9aa8b8)' }} role="status">{msg}</p>}
      </div>

      <div className="card">
        <p className="font-bold">Qué hace y qué no hace esta app</p>
        <p className="text-sm mt-1.5" style={{ color: 'var(--text2, #9aa8b8)' }}>Es un control remoto: ves si tu bot está atendiendo, mirás unos números del negocio, podés pausarlo o ponerlo en modo vacaciones y cargar productos con la cámara. El bot, WhatsApp y los datos de tus clientes están en tu PC y no pasan por el celular. Lo único que sí pasa por la nube, unos minutos, es el producto que cargás con la cámara (la foto se borra apenas tu PC la recibe).</p>
      </div>

      <button className="btn-secondary w-full justify-center" onClick={alSalir}><LogOut size={15} />Cerrar sesión</button>
      <p className="text-center text-xs" style={{ color: 'var(--text2, #9aa8b8)' }}><Link to="/privacidad" style={{ color: '#00e87b' }}>Privacidad</Link> · <Link to="/terminos" style={{ color: '#00e87b' }}>Términos</Link> · <a href="mailto:soporte@akiracloud.lat" style={{ color: '#00e87b' }}>Soporte</a></p>
    </div>
  );
}

const MIRANDO_MS = 60 * 1000; // sin tocar la pantalla por más de esto se considera "en reposo" y se consulta más despacio
// Al cerrar sesión se borra lo guardado en este celular (último estado conocido y borrador de producto): no tiene que verlo quien entre después.
const limpiarLocal = () => { try { localStorage.removeItem(CLAVE_ULTIMO_ESTADO); localStorage.removeItem(CLAVE_BORRADOR); } catch { /* sin almacenamiento */ } };

export default function CelularPage() {
  const { user, loading, logout } = useAuth();
  const [pestaña, setPestaña] = useState('estado');
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const estadoRef = useRef(null);
  const ordenesLocales = useRef(new Map()); // deviceId -> cuándo se mandó la orden que se está esperando
  const ultimaActividad = useRef(Date.now());

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get('/mobile/estado'); estadoRef.current = r.data; setEstado(r.data); setError('');
      try { localStorage.setItem(CLAVE_ULTIMO_ESTADO, JSON.stringify(instantaneaOffline(r.data))); } catch { /* sin almacenamiento: solo se pierde el estado sin conexión */ }
      return true;
    } catch (e) { setError(e.response?.data?.error || 'No hay conexión con el servidor. Revisá tu internet.'); return false; }
    finally { setCargando(false); }
  }, []);

  // Cuántas consultas y cada cuánto (ver intervaloSondeo): rápido con una orden esperando o si estás tocando la pantalla, lento en reposo,
  // más lento tras cada error y quieto con la app en segundo plano. Al volver a verla consulta de inmediato.
  const refrescar = useSondeo(recargar, {
    activo: !!user,
    opciones: () => {
      const ahora = new Date((estadoRef.current && estadoRef.current.ahora) || Date.now());
      const edades = [...ordenesPendientes(estadoRef.current && estadoRef.current.pcs, ahora).map((o) => o.edadMs), ...Array.from(ordenesLocales.current.values()).map((en) => Date.now() - en)];
      return { pendiente: edades.length > 0, edadPendienteMs: edades.length ? Math.min(...edades) : 0, mirando: Date.now() - ultimaActividad.current < MIRANDO_MS };
    },
  });
  const alOrden = useCallback((deviceId, en) => { if (en) ordenesLocales.current.set(deviceId, en); else ordenesLocales.current.delete(deviceId); }, []);

  useEffect(() => {
    if (!user) return undefined;
    const tocar = () => { ultimaActividad.current = Date.now(); };
    const alVolver = () => { if (document.visibilityState === 'visible') tocar(); };
    const eventos = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    eventos.forEach((e) => window.addEventListener(e, tocar, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', alVolver);
    return () => { eventos.forEach((e) => window.removeEventListener(e, tocar, { capture: true })); document.removeEventListener('visibilitychange', alVolver); };
  }, [user]);

  const salir = useCallback(() => { limpiarLocal(); return logout(); }, [logout]);

  if (loading) return <Marco><div className="flex justify-center pt-24"><Loader2 className="animate-spin" style={{ color: '#00e87b' }} /></div></Marco>;
  if (!user) return <Ingreso />;

  const TABS = [{ id: 'estado', texto: 'Estado', Icono: Activity }, { id: 'resumen', texto: 'Resumen', Icono: BarChart3 }, { id: 'productos', texto: 'Productos', Icono: Camera }, { id: 'ajustes', texto: 'Ajustes', Icono: Settings }];
  return (
    <Marco>
      <header className="sticky top-0 z-10 flex items-center justify-between px-5 py-3" style={{ background: 'rgba(7,11,16,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--border, #1e2a3a)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <span className="font-bold flex items-center gap-2"><Bot size={18} style={{ color: '#00e87b' }} />Akira <span style={{ color: '#00e87b' }}>Cloud</span></span>
        {pestaña !== 'ajustes' && <button onClick={refrescar} aria-label="Actualizar" className="w-11 h-11 -mr-3 flex items-center justify-center" style={{ color: 'var(--text2, #9aa8b8)' }}><RefreshCw size={18} className={cargando ? 'animate-spin' : ''} /></button>}
      </header>
      <main className="max-w-lg mx-auto px-5 pt-5 pb-28">
        {pestaña === 'estado' && <PestañaEstado estado={estado} cargando={cargando} error={error} recargar={refrescar} usuario={user} alOrden={alOrden} />}
        {pestaña === 'resumen' && <PestañaResumen estado={estado} recargar={refrescar} />}
        {pestaña === 'productos' && <CargarProducto estado={estado} />}
        {pestaña === 'ajustes' && <PestañaAjustes usuario={user} alSalir={salir} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 flex" style={{ background: 'rgba(7,11,16,0.96)', borderTop: '1px solid var(--border, #1e2a3a)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map(({ id, texto, Icono }) => (
          <button key={id} onClick={() => setPestaña(id)} className="flex-1 flex flex-col items-center gap-1 py-3 text-xs" style={{ color: pestaña === id ? '#00e87b' : 'var(--text2, #9aa8b8)' }} aria-current={pestaña === id ? 'page' : undefined}>
            <Icono size={20} />{texto}
          </button>
        ))}
      </nav>
    </Marco>
  );
}
