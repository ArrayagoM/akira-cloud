import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Rocket, Settings, Plug, Bot, LayoutDashboard, Users2,
  CreditCard, ShieldCheck, HelpCircle, Mail, Menu, X,
  AlertTriangle, Lightbulb, Calendar, Clock, Repeat, Brain,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   ESTRUCTURA DEL ÍNDICE — cada categoría agrupa subsecciones con
   anchor links (#id) hacia el contenido de más abajo.
   ═══════════════════════════════════════════════════════════════ */
const INDICE = [
  {
    id: 'empezar',
    label: 'Primeros pasos',
    icon: Rocket,
    items: [
      { id: 'crear-cuenta', label: 'Crear tu cuenta' },
      { id: 'elegir-plan', label: 'Elegir tu plan' },
      { id: 'conectar-whatsapp', label: 'Conectar tu WhatsApp' },
    ],
  },
  {
    id: 'configurar',
    label: 'Configurar tu negocio',
    icon: Settings,
    items: [
      { id: 'datos-negocio', label: 'Datos del negocio' },
      { id: 'horarios', label: 'Horarios y notificaciones' },
      { id: 'servicios-catalogo', label: 'Servicios, precios y catálogo' },
      { id: 'personalizar-bot', label: 'Personalizar el estilo del bot' },
    ],
  },
  {
    id: 'integraciones',
    label: 'Integraciones',
    icon: Plug,
    items: [
      { id: 'int-groq', label: 'IA con Groq (obligatoria)' },
      { id: 'int-calendar', label: 'Google Calendar' },
      { id: 'int-mp', label: 'MercadoPago' },
      { id: 'int-audio', label: 'Respuestas por audio' },
    ],
  },
  {
    id: 'como-funciona',
    label: 'Cómo funciona el bot',
    icon: Bot,
    items: [
      { id: 'func-conversacion', label: 'Conversación con IA' },
      { id: 'func-agenda', label: 'Agenda sin choques' },
      { id: 'func-cobros', label: 'Cobros automáticos' },
      { id: 'func-recordatorios', label: 'Recordatorios' },
      { id: 'func-memoria', label: 'Memoria de clientes' },
    ],
  },
  {
    id: 'panel',
    label: 'Panel de control',
    icon: LayoutDashboard,
    items: [
      { id: 'panel-dashboard', label: 'Dashboard' },
      { id: 'panel-agenda', label: 'Agenda' },
      { id: 'panel-clientes', label: 'Clientes' },
      { id: 'panel-chats', label: 'Chats' },
    ],
  },
  {
    id: 'agencia',
    label: 'Plan Agencia',
    icon: Users2,
    items: [
      { id: 'agencia-multi', label: 'Varios números de WhatsApp' },
    ],
  },
  {
    id: 'planes',
    label: 'Planes y facturación',
    icon: CreditCard,
    items: [
      { id: 'planes-comparativa', label: 'Comparativa de planes' },
      { id: 'planes-cambiar', label: 'Cambiar de plan' },
      { id: 'planes-referidos', label: 'Programa de referidos' },
    ],
  },
  {
    id: 'seguridad',
    label: 'Seguridad y privacidad',
    icon: ShieldCheck,
    items: [
      { id: 'seguridad-datos', label: 'Cómo protegemos tus datos' },
    ],
  },
  {
    id: 'faq',
    label: 'Preguntas frecuentes',
    icon: HelpCircle,
    items: [
      { id: 'faq-no-responde', label: 'El bot no responde' },
      { id: 'faq-qr', label: 'No me llega el código QR' },
      { id: 'faq-cobros', label: 'Problemas con los cobros' },
      { id: 'faq-detecta-bot', label: '¿Mis clientes saben que es un bot?' },
    ],
  },
  {
    id: 'soporte',
    label: 'Soporte',
    icon: Mail,
    items: [
      { id: 'soporte-contacto', label: 'Cómo contactarnos' },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════
   SUBCOMPONENTES DE CONTENIDO
   ═══════════════════════════════════════════════════════════════ */
function Cat({ id, children }) {
  return (
    <h2 id={id} style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginTop: 56, marginBottom: 4, scrollMarginTop: 96 }}>
      {children}
    </h2>
  );
}

function Sub({ id, children }) {
  return (
    <h3 id={id} style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 32, marginBottom: 12, scrollMarginTop: 96 }}>
      {children}
    </h3>
  );
}

function P({ children }) {
  return <p style={{ marginBottom: 14 }}>{children}</p>;
}

function Steps({ children }) {
  return <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, paddingLeft: 0, listStyle: 'none', counterReset: 'step' }}>{children}</ol>;
}

function Step({ children }) {
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start', counterIncrement: 'step' }}>
      <span
        className="step-num"
        style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: 999,
          background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.3)',
          color: 'var(--accent)', fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
        }}
      />
      <span style={{ paddingTop: 2 }}>{children}</span>
    </li>
  );
}

function Callout({ tipo = 'tip', children }) {
  const cfg = {
    tip:  { Icon: Lightbulb,      color: '#00e87b', bg: 'rgba(0,232,123,0.06)',  border: 'rgba(0,232,123,0.2)' },
    warn: { Icon: AlertTriangle,  color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
  }[tipo];
  const { Icon, color, bg, border } = cfg;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: bg, border: `1px solid ${border}`, marginBottom: 18 }}>
      <Icon size={16} style={{ color, flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text2)' }}>{children}</div>
    </div>
  );
}

function Field({ nombre, desc }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{nombre}</span>
      <span style={{ fontSize: 13.5, color: 'var(--text2)' }}>{desc}</span>
    </div>
  );
}

function Faq({ q, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6, fontSize: 15 }}>{q}</p>
      <div style={{ color: 'var(--text2)', fontSize: 14.5, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PÁGINA
   ═══════════════════════════════════════════════════════════════ */
export default function Documentacion() {
  const [activeId, setActiveId] = useState('crear-cuenta');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Scrollspy simple: resalta en el índice la subsección visible
  useEffect(() => {
    const allIds = INDICE.flatMap((cat) => cat.items.map((it) => it.id));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-100px 0px -70% 0px' }
    );
    allIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const bodyStyle = { color: 'var(--text2)', fontSize: 15, lineHeight: 1.75 };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="lg-hidden"
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}
            aria-label="Abrir índice"
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', textDecoration: 'none', fontSize: 14 }}>
            <ArrowLeft size={16} />
            Volver
          </Link>
          <span style={{ color: 'var(--border)' }}>·</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={14} style={{ color: '#00e87b' }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Akira Cloud</span>
          </div>
        </div>
        <a href="mailto:soporte@akiracloud.lat" className="btn-secondary" style={{ fontSize: 13, padding: '7px 14px' }}>
          <Mail size={13} /> Contactar soporte
        </a>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 40 }}>
        {/* ── Sidebar ── */}
        <aside
          className={sidebarOpen ? 'docs-sidebar open' : 'docs-sidebar'}
          style={{ width: 260, flexShrink: 0 }}
        >
          <div style={{ position: 'sticky', top: 88, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', paddingBottom: 40, paddingTop: 32 }}>
            {INDICE.map((cat) => {
              const CatIcon = cat.icon;
              return (
                <div key={cat.id} style={{ marginBottom: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CatIcon size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{cat.label}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
                    {cat.items.map((it) => (
                      <a
                        key={it.id}
                        href={`#${it.id}`}
                        onClick={() => setSidebarOpen(false)}
                        style={{
                          fontSize: 13.5,
                          padding: '5px 10px',
                          borderRadius: 7,
                          textDecoration: 'none',
                          color: activeId === it.id ? 'var(--accent)' : 'var(--text2)',
                          background: activeId === it.id ? 'rgba(0,232,123,0.08)' : 'transparent',
                          borderLeft: activeId === it.id ? '2px solid var(--accent)' : '2px solid transparent',
                        }}
                      >
                        {it.label}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Contenido ── */}
        <main ref={contentRef} style={{ flex: 1, minWidth: 0, maxWidth: 760, padding: '40px 0 100px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Documentación</p>
          <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>Guía completa de Akira Cloud</h1>
          <p style={{ fontSize: 16, color: 'var(--text2)', marginBottom: 44, lineHeight: 1.7 }}>
            Todo lo que necesitás para poner tu bot de WhatsApp a funcionar de punta a punta: desde crear tu cuenta hasta entender
            exactamente qué hace la IA en cada conversación. Si algo no está acá, escribinos a{' '}
            <a href="mailto:soporte@akiracloud.lat" style={{ color: 'var(--accent)' }}>soporte@akiracloud.lat</a>.
          </p>

          {/* ═══ 1. PRIMEROS PASOS ═══ */}
          <Cat id="empezar">🚀 Primeros pasos</Cat>
          <div style={bodyStyle}>

            <Sub id="crear-cuenta">Crear tu cuenta</Sub>
            <P>
              Te registrás con tu email y contraseña, o directamente con tu cuenta de Google. No hace falta tarjeta de crédito
              para empezar: apenas te registrás arrancás en el <strong style={{ color: 'var(--text)' }}>plan Trial</strong>,
              gratis por 7 días, con 100 mensajes incluidos — suficiente para probar el bot con clientes reales antes de decidir
              si te sirve.
            </P>
            <Callout tipo="tip">
              Si alguien te compartió un código de referido, pegalo al registrarte: la persona que te invitó gana crédito y vos
              arrancás con un descuento en tu primer plan pago.
            </Callout>

            <Sub id="elegir-plan">Elegir tu plan</Sub>
            <P>
              Podés seguir usando el trial hasta que se venza, o pasarte a un plan pago en cualquier momento desde{' '}
              <strong style={{ color: 'var(--text)' }}>Planes</strong> en el menú lateral. Hay tres planes — Básico, Pro y
              Agencia — con precios mensuales o anuales (20% de descuento pagando el año completo). Más detalle en la sección{' '}
              <a href="#planes-comparativa" style={{ color: 'var(--accent)' }}>Planes y facturación</a>.
            </P>

            <Sub id="conectar-whatsapp">Conectar tu WhatsApp</Sub>
            <P>
              Esto es lo primero que tenés que hacer para que el bot arranque a responder. Desde el{' '}
              <strong style={{ color: 'var(--text)' }}>Dashboard</strong>:
            </P>
            <Steps>
              <Step>Entrá a <strong style={{ color: 'var(--text)' }}>Dashboard</strong> y buscá la tarjeta "Conexión WhatsApp".</Step>
              <Step>Hacé clic en <strong style={{ color: 'var(--text)' }}>Conectar</strong> — va a aparecer un código QR en pantalla.</Step>
              <Step>Abrí WhatsApp en tu celular (el número que vas a usar para el bot) → <strong style={{ color: 'var(--text)' }}>Configuración → Dispositivos vinculados → Vincular un dispositivo</strong>.</Step>
              <Step>Escaneá el QR con la cámara de WhatsApp. En unos segundos el panel va a mostrar "Bot activo y conectado".</Step>
            </Steps>
            <Callout tipo="warn">
              El código QR expira a los 60 segundos. Si no llegaste a escanearlo, simplemente generá uno nuevo desde el
              dashboard — no pasa nada, no se "gasta" ningún intento.
            </Callout>
            <P>
              Usá un número de WhatsApp dedicado para el bot, no el que usás para hablar con amigos o familia — así evitás que
              el bot procese mensajes personales, y evitás desconexiones por usar la misma sesión en dos lugares a la vez
              (WhatsApp solo permite una sesión "activa" de verdad por vez, aunque tengas la app abierta en el celu).
            </P>
          </div>

          {/* ═══ 2. CONFIGURAR TU NEGOCIO ═══ */}
          <Cat id="configurar">⚙️ Configurar tu negocio</Cat>
          <div style={bodyStyle}>
            <P>
              Toda la configuración vive en <strong style={{ color: 'var(--text)' }}>Config</strong>, en el menú lateral. Está
              organizada en secciones plegables — no hace falta llenarlas todas de una, podés ir volviendo a medida que activás
              cada función.
            </P>

            <Sub id="datos-negocio">Datos del negocio</Sub>
            <P>Lo primero que configurás: cómo se llama tu negocio, qué tipo de negocio sos y cómo se va a presentar el bot.</P>
            <Field nombre="Nombre del negocio" desc="Como quiere que el bot te presente a tus clientes." />
            <Field nombre="Tipo de negocio" desc="Turnos (peluquerías, consultorios), Servicios (mecánicos, veterinarias, lavaderos) o Alojamiento (cabañas, departamentos). Esto cambia qué preguntas hace el bot y qué datos pide antes de confirmar." />
            <Field nombre="Nombre del asistente" desc="El nombre con el que el bot se presenta en la conversación (ej: 'Hola, soy Martina, la asistente de...')." />

            <Sub id="horarios">Horarios y notificaciones</Sub>
            <P>
              Configurá los días y horarios en los que tu negocio atiende — el bot va a ofrecer turnos únicamente dentro de esa
              ventana, y puede tener horarios distintos (o cortados, con un recreo al mediodía) para cada día de la semana.
              También podés bloquear días puntuales (feriados, vacaciones).
            </P>
            <Field nombre="Número para notificaciones" desc="Tu WhatsApp personal — el bot te avisa ahí cada vez que se confirma un turno. Se ingresa con código de país, sin el signo +  (ej: 5491112345678)." />

            <Sub id="servicios-catalogo">Servicios, precios y catálogo</Sub>
            <P>
              Si tu negocio es de tipo <strong style={{ color: 'var(--text)' }}>Servicios</strong>, cargás una lista de
              servicios con su nombre y precio — el bot los usa para cotizar y para saber qué duración bloquear en el
              calendario. Si vendés productos, podés sincronizar tu catálogo de WhatsApp Business directamente (el bot lo lee
              automáticamente y lo mantiene actualizado).
            </P>

            <Sub id="personalizar-bot">Personalizar el estilo del bot</Sub>
            <P>
              Hay un campo de "prompt personalizado" donde podés darle indicaciones extra de tono y estilo — por ejemplo,
              pedirle que sea más formal, que use ciertas palabras típicas de tu zona, o que mencione una promoción vigente.
              El bot combina esas indicaciones con su comportamiento base (entender la consulta, ofrecer turnos reales,
              confirmar antes de agendar).
            </P>
          </div>

          {/* ═══ 3. INTEGRACIONES ═══ */}
          <Cat id="integraciones">🔌 Integraciones</Cat>
          <div style={bodyStyle}>
            <Sub id="int-groq">IA con Groq (obligatoria)</Sub>
            <P>
              Es la única integración que necesitás sí o sí para que el bot pueda responder — sin esto, el bot queda conectado
              a WhatsApp pero mudo. Groq tiene un nivel gratuito que alcanza perfectamente para empezar.
            </P>
            <Steps>
              <Step>Creá una cuenta gratis en <a href="https://console.groq.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>console.groq.com</a>.</Step>
              <Step>Generá una API Key desde su panel.</Step>
              <Step>Pegala en <strong style={{ color: 'var(--text)' }}>Config → Groq API (IA)</strong> y guardá.</Step>
            </Steps>
            <P>
              El motor conversacional usa el modelo <strong style={{ color: 'var(--text)' }}>LLaMA 3.1</strong> a través de
              Groq, elegido específicamente por ser rápido — las respuestas por WhatsApp tienen que sentirse naturales, no
              como esperar a que "cargue" algo.
            </P>

            <Sub id="int-calendar">Google Calendar</Sub>
            <P>
              Disponible en los planes Pro y Agencia. Conectás tu cuenta de Google y el bot sincroniza cada turno confirmado
              directamente en tu calendario — así podés verlo desde tu celular u organizarlo junto con el resto de tu agenda,
              sin depender solo del panel de Akira.
            </P>

            <Sub id="int-mp">MercadoPago</Sub>
            <P>
              Disponible en los planes Pro y Agencia. Conectás tu cuenta de MercadoPago y el bot genera automáticamente un
              link de pago cuando el cliente confirma un turno o servicio — acepta tarjeta, transferencia, Rapipago y Pago
              Fácil. El turno queda "pendiente" hasta que el pago se acredita; recién ahí se confirma en firme, evitando
              reservas fantasma que nunca se pagan.
            </P>
            <Callout tipo="tip">
              Si preferís no usar pagos online, podés dejar esa sección sin configurar y en su lugar cargar un alias o CBU para
              que el bot lo comparta cuando el cliente pregunte cómo pagar una seña por transferencia.
            </Callout>

            <Sub id="int-audio">Respuestas por audio</Sub>
            <P>
              Disponible en los planes Pro y Agencia. Con esta integración activada (RIME AI), el bot puede transcribir los
              audios que te mandan tus clientes y, si vos querés, responder también con su propia voz — para que la
              conversación se sienta lo más parecida posible a hablar con una persona.
            </P>
          </div>

          {/* ═══ 4. CÓMO FUNCIONA EL BOT ═══ */}
          <Cat id="como-funciona">🤖 Cómo funciona el bot</Cat>
          <div style={bodyStyle}>
            <Sub id="func-conversacion"><Brain size={16} style={{ display: 'inline', marginRight: 6, marginBottom: -2, color: 'var(--accent)' }} />Conversación con IA</Sub>
            <P>
              El bot no sigue un árbol rígido de "apretá 1 para esto, 2 para lo otro" — entiende lenguaje natural. Un cliente
              puede escribir "che tenés algo para el sábado a la tarde" y el bot entiende que está preguntando disponibilidad,
              consulta los horarios reales de tu negocio, y responde con opciones concretas.
            </P>
            <Sub id="func-agenda"><Calendar size={16} style={{ display: 'inline', marginRight: 6, marginBottom: -2, color: 'var(--accent)' }} />Agenda sin choques</Sub>
            <P>
              Antes de ofrecer un horario, el bot siempre chequea la disponibilidad real contra tus turnos ya agendados (y
              contra Google Calendar, si lo conectaste) — es imposible que ofrezca o confirme dos turnos superpuestos.
            </P>
            <Sub id="func-cobros"><CreditCard size={16} style={{ display: 'inline', marginRight: 6, marginBottom: -2, color: 'var(--accent)' }} />Cobros automáticos</Sub>
            <P>
              Cuando corresponde cobrar (seña o pago completo), el bot genera el link de MercadoPago, y solo confirma el turno
              en firme una vez que detecta el pago acreditado — no antes.
            </P>
            <Sub id="func-recordatorios"><Clock size={16} style={{ display: 'inline', marginRight: 6, marginBottom: -2, color: 'var(--accent)' }} />Recordatorios</Sub>
            <P>
              El bot le manda un recordatorio automático a cada cliente antes del turno, para reducir las ausencias — no
              tenés que acordarte vos de avisarle a nadie.
            </P>
            <Sub id="func-memoria"><Repeat size={16} style={{ display: 'inline', marginRight: 6, marginBottom: -2, color: 'var(--accent)' }} />Memoria de clientes</Sub>
            <P>
              El bot recuerda el historial de cada cliente entre conversaciones — su nombre, turnos anteriores, preferencias
              mencionadas — para que la próxima vez que te escriba, la atención se sienta continua y no tenga que repetir todo
              de cero.
            </P>
          </div>

          {/* ═══ 5. PANEL DE CONTROL ═══ */}
          <Cat id="panel">📊 Panel de control</Cat>
          <div style={bodyStyle}>
            <Sub id="panel-dashboard">Dashboard</Sub>
            <P>
              Tu pantalla principal: estado de la conexión de WhatsApp, mensajes del día, reservas, cobros del bot, y un panel
              de <strong style={{ color: 'var(--text)' }}>Actividad en vivo</strong> que muestra en tiempo real lo que el bot
              va haciendo — útil para ver exactamente qué está pasando cuando un cliente le escribe, sobre todo mientras estás
              probando la configuración por primera vez. También podés pausar el bot desde acá en cualquier momento, si
              necesitás atender vos personalmente por un rato.
            </P>
            <Sub id="panel-agenda">Agenda</Sub>
            <P>Todos los turnos, separados por confirmados y pendientes de pago — así sabés de un vistazo cuáles son reservas en firme y cuáles todavía están esperando que el cliente complete el pago.</P>
            <Sub id="panel-clientes">Clientes</Sub>
            <P>La base de clientes que fueron hablando con tu bot, con su historial de conversación y de turnos.</P>
            <Sub id="panel-chats">Chats</Sub>
            <P>El historial completo de conversaciones de WhatsApp gestionadas por el bot, para revisar cómo respondió en cada caso.</P>
          </div>

          {/* ═══ 6. PLAN AGENCIA ═══ */}
          <Cat id="agencia">🏢 Plan Agencia</Cat>
          <div style={bodyStyle}>
            <Sub id="agencia-multi">Varios números de WhatsApp</Sub>
            <P>
              El plan Agencia permite conectar hasta <strong style={{ color: 'var(--text)' }}>5 números de WhatsApp</strong> en
              una sola cuenta, cada uno con su propia sesión, su propia configuración y su propio historial — pensado para
              quien maneja varios locales, varias marcas, o gestiona el WhatsApp de varios clientes desde un mismo panel.
            </P>
            <P>
              Cada número funciona de forma completamente independiente: podés tener un negocio de turnos en el número 1 y uno
              de alojamiento en el número 2, con horarios, precios y estilo de bot totalmente distintos entre sí. Conectar un
              número adicional es el mismo proceso que el primero — escanear un código QR — solo que ahora elegís a cuál
              "slot" (1 a 5) lo estás conectando.
            </P>
            <Callout tipo="tip">
              Auditamos específicamente que dos números conectados al mismo tiempo (o los números de dos cuentas distintas)
              nunca se pisen entre sí ni compartan datos — cada sesión, cada conversación y cada configuración vive
              completamente aislada de las demás.
            </Callout>
          </div>

          {/* ═══ 7. PLANES Y FACTURACIÓN ═══ */}
          <Cat id="planes">💳 Planes y facturación</Cat>
          <div style={bodyStyle}>
            <Sub id="planes-comparativa">Comparativa de planes</Sub>
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text2)' }}>Función</th>
                    <th style={{ padding: '8px 10px', color: 'var(--text2)' }}>Trial</th>
                    <th style={{ padding: '8px 10px', color: 'var(--text2)' }}>Básico</th>
                    <th style={{ padding: '8px 10px', color: 'var(--accent)', fontWeight: 700 }}>Pro</th>
                    <th style={{ padding: '8px 10px', color: '#a78bfa', fontWeight: 700 }}>Agencia</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Precio', 'Gratis · 7 días', '$15.000/mes', '$35.000/mes', '$80.000/mes'],
                    ['Mensajes/mes', '100', '500', 'Ilimitado', 'Ilimitado'],
                    ['Números de WhatsApp', '1', '1', '1', 'Hasta 5'],
                    ['IA con LLaMA 3.1', '✓', '✓', '✓', '✓'],
                    ['Recordatorios automáticos', '✓', '✓', '✓', '✓'],
                    ['Google Calendar', '✗', '✗', '✓', '✓'],
                    ['Cobros con MercadoPago', '✗', '✗', '✓', '✓'],
                    ['Respuestas por audio', '✗', '✗', '✓', '✓'],
                  ].map((fila, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                      {fila.map((c, j) => (
                        <td key={j} style={{ padding: '8px 10px', textAlign: j === 0 ? 'left' : 'center', color: j === 0 ? 'var(--text)' : 'var(--text2)' }}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P>Pagando el plan anual en vez de mensual, el descuento es del 20% sobre el total. Todos los pagos se procesan de forma segura vía MercadoPago.</P>

            <Sub id="planes-cambiar">Cambiar de plan</Sub>
            <P>
              Podés subir, bajar o cancelar tu plan cuando quieras desde <strong style={{ color: 'var(--text)' }}>Planes</strong>,
              sin permanencia mínima. Si cancelás, el bot sigue activo hasta el final del período ya pagado.
            </P>

            <Sub id="planes-referidos">Programa de referidos</Sub>
            <P>
              Compartí tu código de referido (lo encontrás en la sección Planes) — cuando alguien se registra con tu código y
              paga su primer plan, vos ganás <strong style={{ color: 'var(--text)' }}>$5.000 ARS</strong> de crédito y esa
              persona recibe un descuento automático. No hay límite de referidos: cada nuevo negocio que sumás te da crédito
              nuevo.
            </P>
          </div>

          {/* ═══ 8. SEGURIDAD ═══ */}
          <Cat id="seguridad">🔒 Seguridad y privacidad</Cat>
          <div style={bodyStyle}>
            <Sub id="seguridad-datos">Cómo protegemos tus datos</Sub>
            <P>
              Las credenciales sensibles de tu cuenta (keys de Groq, tokens de MercadoPago, tokens de Google) se guardan
              cifradas con <strong style={{ color: 'var(--text)' }}>AES-256-GCM</strong>, nunca en texto plano.
            </P>
            <P>
              Cada negocio corre de forma completamente aislada: tu configuración, tu historial de conversaciones y tus datos
              de clientes nunca se mezclan ni se comparten con la cuenta de otro negocio, sin importar cuántas cuentas estén
              usando la plataforma al mismo tiempo. Esto es algo que auditamos activamente a nivel de código, no solo una
              promesa de marketing.
            </P>
            <P>
              Para más detalle legal sobre qué datos recopilamos y cómo los usamos, mirá nuestra{' '}
              <Link to="/privacidad" style={{ color: 'var(--accent)' }}>Política de Privacidad</Link>.
            </P>
          </div>

          {/* ═══ 9. FAQ ═══ */}
          <Cat id="faq">❓ Preguntas frecuentes</Cat>
          <div style={bodyStyle}>
            <Faq q="El bot no responde, ¿qué reviso primero?">
              En este orden: 1) que la conexión de WhatsApp siga activa en el Dashboard (a veces hay que volver a escanear el
              QR si se desconectó); 2) que tengas una API Key de Groq cargada y válida en Config — sin eso el bot recibe el
              mensaje pero no puede generar una respuesta; 3) que el bot no esté en modo Pausa (hay un botón en el Dashboard
              para reactivarlo).
            </Faq>
            <Faq q="No me llega el código QR o no se conecta al escanearlo">
              El QR expira a los 60 segundos — generá uno nuevo desde el Dashboard si tardaste en escanearlo. Si sigue sin
              conectar, revisá que ese número de WhatsApp no tenga ya una sesión web/multi-dispositivo activa en otro lugar, y
              que tengas buena conexión a internet en el celular en el momento de escanear.
            </Faq>
            <Faq q="Un cliente pagó pero el turno sigue como pendiente">
              MercadoPago puede tardar unos segundos en confirmar la acreditación del pago — el bot lo actualiza
              automáticamente apenas recibe la confirmación. Si pasaron varios minutos y sigue pendiente, escribinos a soporte
              con el número de operación de MercadoPago para revisarlo.
            </Faq>
            <Faq q="¿Mis clientes se dan cuenta de que están hablando con un bot?">
              No necesariamente — la conversación es natural, el bot responde en el tono que configuraste y recuerda el
              historial de cada cliente. Si un cliente pregunta directamente si está hablando con una persona o un bot, el bot
              responde con honestidad.
            </Faq>
          </div>

          {/* ═══ 10. SOPORTE ═══ */}
          <Cat id="soporte">✉️ Soporte</Cat>
          <div style={bodyStyle}>
            <Sub id="soporte-contacto">Cómo contactarnos</Sub>
            <P>
              Escribinos a <a href="mailto:soporte@akiracloud.lat" style={{ color: 'var(--accent)' }}>soporte@akiracloud.lat</a>{' '}
              y te respondemos en menos de 24 horas. Contanos qué negocio tenés configurado y, si es un problema puntual, el
              momento aproximado en el que pasó — nos ayuda a encontrarlo más rápido revisando la actividad de tu cuenta.
            </P>
          </div>

        </main>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .docs-sidebar {
            position: fixed;
            top: 0; left: 0; bottom: 0;
            width: 280px !important;
            background: var(--bg);
            border-right: 1px solid var(--border);
            padding: 0 20px;
            transform: translateX(-100%);
            transition: transform 0.2s ease-out;
            z-index: 40;
            overflow-y: auto;
          }
          .docs-sidebar.open { transform: translateX(0); }
        }
        @media (min-width: 1025px) {
          .lg-hidden { display: none; }
        }
      `}</style>
    </div>
  );
}
