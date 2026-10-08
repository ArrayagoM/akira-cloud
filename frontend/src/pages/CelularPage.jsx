import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Activity, BarChart3, Settings, RefreshCw, Bell, LogOut, Share, Plus, Smartphone, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { describirBot, hace, accionesDisponibles, lineasResumen, ETIQUETAS } from '../lib/estadoMovil';
import { activarAvisos, desactivarAvisos, avisosActivos, soportaAvisos, esIPhone, estaInstalada } from '../services/avisosWeb';

// App del celular de Akira, dentro de la web: se instala en la pantalla de inicio (iPhone y Android) y sirve para
// ver si el bot está atendiendo, mirar unos números del negocio, pausarlo / ponerlo en vacaciones y recibir avisos.
// El bot, WhatsApp y los datos de los clientes siguen en la PC: acá solo se monitorea.

const TONO = { ok: '#00e87b', aviso: '#f59e0b', error: '#f43f5e', neutro: '#94a3b8' };

function Marco({ children }) {
  return <div className="min-h-screen" style={{ background: 'var(--bg, #070b10)', color: 'var(--text, #e8f0f8)' }}>{children}</div>;
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
              <button type="button" onClick={() => setVer((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={{ color: 'var(--text2, #9aa8b8)' }}>{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button>
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

function Interruptor({ activo, deshabilitado, onCambio, etiqueta }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={deshabilitado} onClick={() => onCambio(!activo)}
      className="relative shrink-0 rounded-full transition-colors" style={{ width: 52, height: 30, background: activo ? '#00e87b' : '#2a3648', opacity: deshabilitado ? 0.5 : 1 }}>
      <span className="absolute rounded-full bg-white transition-all" style={{ width: 24, height: 24, top: 3, left: activo ? 25 : 3 }} />
    </button>
  );
}

function PC({ pc, alCambiar }) {
  const info = describirBot(pc);
  const color = TONO[info.tono] || TONO.neutro;
  const acc = accionesDisponibles(pc);
  const [trabajando, setTrabajando] = useState(null);
  const [nota, setNota] = useState('');
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const ejecutar = async (tipo) => {
    setNota(''); setTrabajando(tipo);
    try {
      const { data } = await api.post('/mobile/comandos', { deviceId: pc.deviceId, tipo });
      const id = data.comando.id;
      setNota('Enviado. Esperando a tu PC (puede tardar hasta 1 minuto)…');
      for (let i = 0; i < 30 && vivo.current; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const c = await api.get(`/mobile/comandos/${encodeURIComponent(id)}`, { params: { deviceId: pc.deviceId } }).then((r) => r.data).catch(() => null);
        if (c?.estado === 'hecho') { setNota('✅ Listo: ' + ETIQUETAS[tipo].toLowerCase() + '.'); alCambiar(); return; }
        if (c && ['fallo', 'vencido', 'cancelado'].includes(c.estado)) { setNota(c.estado === 'vencido' ? 'La PC no respondió a tiempo, así que no se hizo nada. Probá de nuevo.' : 'No se pudo completar. Probá de nuevo.'); return; }
      }
      if (vivo.current) setNota('Tu PC todavía no respondió. Si sigue sin hacerlo, la orden vence sola en unos minutos.');
    } catch (e) {
      setNota(e.response?.data?.codigo === 'CELULAR_DESACTIVADO' ? 'Primero activalo en Akira (PC) → Inicio → “Controlar desde la app del celular”.' : (e.response?.data?.error || 'No se pudo enviar la orden.'));
    } finally { if (vivo.current) setTrabajando(null); }
  };

  return (
    <div className="card mb-4" style={{ borderColor: color + '55' }}>
      <div className="flex items-center justify-between"><p className="font-bold">{pc.nombre}</p><span className="text-xs" style={{ color: 'var(--muted, #64748b)' }}>{pc.version ? `v${pc.version}` : ''}</span></div>
      <div className="mt-3 mb-2"><span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: color + '22', color }}>{info.titulo.toUpperCase()}</span></div>
      <p className="text-[15px] leading-relaxed">{info.detalle}</p>
      <p className="text-xs mt-2" style={{ color: 'var(--text2, #9aa8b8)' }}>Última señal de la PC: {hace(pc.ultimoHeartbeat)}</p>

      {!pc.controlRemoto && pc.online && <p className="text-xs mt-3" style={{ color: '#f59e0b' }}>Para pausar o reanudar desde acá, activá “Controlar desde la app del celular” en Akira (PC) → Inicio.</p>}
      {pc.controlRemoto && (
        <div className="mt-4 space-y-3">
          {acc.puedePausar && <button className="btn-secondary w-full justify-center" disabled={!!trabajando} onClick={() => ejecutar('bot-pausar')}>{trabajando === 'bot-pausar' ? <Loader2 size={15} className="animate-spin" /> : 'Pausar el bot'}</button>}
          {acc.puedeReanudar && <button className="btn-primary w-full justify-center" disabled={!!trabajando} onClick={() => ejecutar('bot-reanudar')}>{trabajando === 'bot-reanudar' ? <Loader2 size={15} className="animate-spin" /> : 'Reanudar el bot'}</button>}
          {pc.online && (
            <div className="flex items-center justify-between gap-3 pt-3" style={{ borderTop: '1px solid var(--border, #1e2a3a)' }}>
              <span><span className="block text-[15px] font-semibold">Modo vacaciones</span><span className="block text-xs" style={{ color: 'var(--text2, #9aa8b8)' }}>El bot avisa que no toma reservas por ahora.</span></span>
              <Interruptor activo={!!pc.vacaciones} deshabilitado={!!trabajando} etiqueta="Modo vacaciones" onCambio={(v) => ejecutar(v ? 'vacaciones-on' : 'vacaciones-off')} />
            </div>
          )}
        </div>
      )}
      {!!nota && <p className="text-sm mt-3" style={{ color: 'var(--text2, #9aa8b8)' }} role="status">{nota}</p>}
    </div>
  );
}

function PestañaEstado({ estado, cargando, error, recargar, usuario }) {
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
      {pcs.map((pc) => <PC key={pc.deviceId} pc={pc} alCambiar={recargar} />)}
    </div>
  );
}

function PestañaResumen({ estado }) {
  const pcs = estado?.pcs || [];
  const conResumen = pcs.filter((p) => lineasResumen(p.resumen).length > 0);
  return (
    <div>
      <h2 className="text-xl font-bold">Resumen del negocio</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text2, #9aa8b8)' }}>Solo números: nunca se ven ni se envían nombres, chats ni documentos de tus clientes.</p>
      {conResumen.length === 0 && <div className="card"><p className="font-bold">Todavía no hay datos para mostrar</p><p className="text-sm mt-1.5" style={{ color: 'var(--text2, #9aa8b8)' }}>Activá “Ver tu negocio desde el celular” en Akira (PC) → Inicio. Es opcional y lo podés apagar cuando quieras.</p></div>}
      {conResumen.map((pc) => (
        <div key={pc.deviceId} className="mb-5">
          {pcs.length > 1 && <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text2, #9aa8b8)' }}>{pc.nombre}</p>}
          <div className="grid grid-cols-2 gap-3">
            {lineasResumen(pc.resumen).map((l) => <div key={l.clave} className="card"><p className="text-2xl font-extrabold truncate" style={{ color: '#00e87b' }}>{l.valor}</p><p className="text-xs mt-1" style={{ color: 'var(--text2, #9aa8b8)' }}>{l.etiqueta}</p></div>)}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text2, #9aa8b8)' }}>Actualizado {hace(pc.resumenEn)}</p>
        </div>
      ))}
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
        <p className="text-sm mt-1.5" style={{ color: 'var(--text2, #9aa8b8)' }}>Es un control remoto: ves si tu bot está atendiendo, mirás unos números del negocio y podés pausarlo o ponerlo en modo vacaciones. El bot, WhatsApp y los datos de tus clientes están en tu PC y no pasan por el celular.</p>
      </div>

      <button className="btn-secondary w-full justify-center" onClick={alSalir}><LogOut size={15} />Cerrar sesión</button>
      <p className="text-center text-xs" style={{ color: 'var(--text2, #9aa8b8)' }}><Link to="/privacidad" style={{ color: '#00e87b' }}>Privacidad</Link> · <Link to="/terminos" style={{ color: '#00e87b' }}>Términos</Link> · <a href="mailto:soporte@akiracloud.lat" style={{ color: '#00e87b' }}>Soporte</a></p>
    </div>
  );
}

export default function CelularPage() {
  const { user, loading, logout } = useAuth();
  const [pestaña, setPestaña] = useState('estado');
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const recargar = useCallback(async () => {
    setCargando(true);
    try { const r = await api.get('/mobile/estado'); setEstado(r.data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'No hay conexión con el servidor. Revisá tu internet.'); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    recargar();
    const t = setInterval(recargar, 30000); // se actualiza sola mientras la app está abierta
    return () => clearInterval(t);
  }, [user, recargar]);

  if (loading) return <Marco><div className="flex justify-center pt-24"><Loader2 className="animate-spin" style={{ color: '#00e87b' }} /></div></Marco>;
  if (!user) return <Ingreso />;

  const TABS = [{ id: 'estado', texto: 'Estado', Icono: Activity }, { id: 'resumen', texto: 'Resumen', Icono: BarChart3 }, { id: 'ajustes', texto: 'Ajustes', Icono: Settings }];
  return (
    <Marco>
      <header className="sticky top-0 z-10 flex items-center justify-between px-5 py-3" style={{ background: 'rgba(7,11,16,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--border, #1e2a3a)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <span className="font-bold flex items-center gap-2"><Bot size={18} style={{ color: '#00e87b' }} />Akira <span style={{ color: '#00e87b' }}>Cloud</span></span>
        {pestaña !== 'ajustes' && <button onClick={recargar} aria-label="Actualizar" className="p-2 -mr-2" style={{ color: 'var(--text2, #9aa8b8)' }}><RefreshCw size={18} className={cargando ? 'animate-spin' : ''} /></button>}
      </header>
      <main className="max-w-lg mx-auto px-5 pt-5 pb-28">
        {pestaña === 'estado' && <PestañaEstado estado={estado} cargando={cargando} error={error} recargar={recargar} usuario={user} />}
        {pestaña === 'resumen' && <PestañaResumen estado={estado} />}
        {pestaña === 'ajustes' && <PestañaAjustes usuario={user} alSalir={logout} />}
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
