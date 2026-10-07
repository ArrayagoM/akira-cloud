import { Link, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowRight, Bot, Calendar, Clock, ChevronLeft } from 'lucide-react';
import { useSeo } from '../components/VerticalNicho';

// ── DATA: posts del blog ────────────────────────────────────
// Cada post es indexable por separado en /blog/<slug>.
// Pensado para keywords long-tail que la home no cubre.
const POSTS = [
  {
    slug: 'como-automatizar-turnos-whatsapp',
    title: 'Cómo automatizar la agenda de turnos por WhatsApp paso a paso',
    description: 'Guía práctica para comerciantes argentinos: cómo automatizar la agenda de turnos de tu negocio por WhatsApp con un bot de IA, paso a paso.',
    keywords: 'automatizar turnos whatsapp, agenda turnos automatica, bot whatsapp turnos, sistema reservas whatsapp, agenda online whatsapp',
    tag: 'Guías',
    date: '2026-05-08',
    minutos: 6,
    excerpt: 'Si tenés un negocio que toma turnos por WhatsApp, probablemente pasás horas contestando "¿hay turno para el sábado?". Acá te explico cómo automatizarlo con un bot de IA, paso a paso.',
    body: [
      { type: 'p', text: 'Si tenés una peluquería, consultorio, gimnasio o cualquier negocio que toma turnos por WhatsApp, seguramente pasás varias horas al día contestando preguntas repetidas: "¿hay turno para mañana?", "¿cuánto sale?", "¿abren el sábado?". Cada minuto que dedicás a eso es un minuto que no atendés a un cliente presencial.' },
      { type: 'h2', text: '¿Por qué automatizar?' },
      { type: 'p', text: 'Hacé el cálculo con tus números: cuántas horas por día pasás contestando WhatsApp, multiplicadas por lo que vale una hora de tu trabajo. Para muchos negocios es una cifra importante al mes. Y mientras contestás a uno, otro cliente espera y a veces se va con la competencia.' },
      { type: 'h2', text: 'Lo que necesitás para empezar' },
      { type: 'list', items: [
        'Un número de WhatsApp Business (gratis).',
        'Una cuenta de Google con Google Calendar (opcional: Akira también trae su propia agenda).',
        'Una cuenta de MercadoPago si querés cobrar señas (gratis).',
        'Una computadora con Windows 10 u 11 que quede prendida en el horario de atención.',
        'Akira Cloud — hay un trial gratis (100 mensajes, sin tarjeta) y planes desde $15.000 ARS por mes.',
      ]},
      { type: 'h2', text: 'Paso 1 — Conectar WhatsApp' },
      { type: 'p', text: 'Creás tu cuenta en akiracloud.lat, instalás Akira en tu PC con Windows y escaneás un QR con el WhatsApp del negocio (queda vinculado como un dispositivo más, igual que WhatsApp Web). Tu número sigue funcionando normal en el celular.' },
      { type: 'h2', text: 'Paso 2 — Configurar tus horarios y servicios' },
      { type: 'p', text: 'En el programa definís: días que trabajás, horario por día, servicios que ofrecés (con precio y duración) y días bloqueados (vacaciones, feriados). Si querés ir más rápido, hay plantillas por rubro (peluquería, consultorio, gimnasio, veterinaria y más) con servicios y horarios de ejemplo para ajustar. El bot conoce todo esto y lo respeta.' },
      { type: 'h2', text: 'Paso 3 — Conectar MercadoPago (y Google Calendar, si querés)' },
      { type: 'p', text: 'Cargás tu Access Token de MercadoPago si querés cobrar la seña o el total al confirmar el turno. Si usás Google Calendar, lo conectás para que los turnos también aparezcan ahí (en el plan Pro); si no, Akira usa su propia agenda.' },
      { type: 'h2', text: 'Paso 4 — El bot empieza a atender solo' },
      { type: 'p', text: 'Desde el momento que activás el bot, los mensajes nuevos los responde la IA. Ofrece horarios libres, cobra la seña, agenda el turno y manda recordatorios. Vos podés intervenir cuando quieras: silenciar un chat, responder vos o pausar el bot.' },
      { type: 'h2', text: 'Qué cambia en el día a día' },
      { type: 'list', items: [
        'Recuperás el tiempo que pasabas contestando las mismas preguntas.',
        'Los recordatorios automáticos (24 h, 4 h y 30 min antes) ayudan a que los clientes no se olviden del turno.',
        'Se atienden consultas y reservas también fuera de tu horario, mientras la PC esté prendida.',
        'No se pisan turnos: el bot solo ofrece horarios que están libres en tu agenda.',
      ]},
      { type: 'cta' },
    ],
  },
  {
    slug: 'cobrar-mercadopago-whatsapp',
    title: 'Cómo cobrar con MercadoPago directamente desde WhatsApp',
    description: 'Aprendé a cobrar señas, turnos o pedidos por WhatsApp con links de pago de MercadoPago, sin que tu cliente salga del chat.',
    keywords: 'cobrar mercadopago whatsapp, link de pago mercadopago, mercadopago whatsapp business, cobros automaticos whatsapp, sena con mercadopago, link pago whatsapp',
    tag: 'Pagos',
    date: '2026-05-06',
    minutos: 5,
    excerpt: 'Cómo cobrar señas o productos por WhatsApp con un link de MercadoPago y enterarte del pago sin revisar el home banking.',
    body: [
      { type: 'p', text: 'Si tu negocio recibe pedidos por WhatsApp y tenés que cobrar, lo más común es: pedir alias o CBU, esperar que el cliente "te avise cuando paga", y muchas veces no paga nunca. Hay una forma mucho mejor.' },
      { type: 'h2', text: 'El problema con la transferencia tradicional' },
      { type: 'list', items: [
        'No tenés confirmación automática del pago.',
        'El cliente te puede decir que pagó cuando no lo hizo.',
        'Vos perdés tiempo verificando uno por uno en tu home banking.',
        'Sin pago real, no podés bloquear el turno o reservar el producto.',
      ]},
      { type: 'h2', text: 'La solución: links de pago de MercadoPago' },
      { type: 'p', text: 'MercadoPago te permite generar links de pago únicos por transacción. El cliente abre el link, paga con tarjeta/efectivo/saldo MP, y vos recibís una notificación automática (webhook) confirmando el pago.' },
      { type: 'h2', text: '¿Cómo se hace con Akira Cloud?' },
      { type: 'p', text: 'Akira genera el link de pago automáticamente cuando el cliente confirma un turno o un pedido. El cliente paga, MercadoPago avisa y el bot confirma el turno o el pedido al cliente, sin que vos hagas nada. Usás tu propia cuenta de MercadoPago: la plata va directo a tu cuenta.' },
      { type: 'h2', text: 'Ventajas concretas' },
      { type: 'list', items: [
        'Cobro instantáneo — el cliente paga en el momento, no después.',
        'Cero verificación manual — sabés que está pagado porque MercadoPago te avisa.',
        'Reduce los "fantasmas" (clientes que reservan y no van).',
        'Permite cobrar la seña antes de bloquear el turno.',
        'El cliente elige cómo pagar en MercadoPago: tarjeta, saldo de la cuenta y otros medios disponibles.',
      ]},
      { type: 'h2', text: 'Costo' },
      { type: 'p', text: 'MercadoPago cobra su propia comisión por cada cobro; el porcentaje depende del medio de pago y de cuándo querés disponer de la plata, así que conviene mirar la tarifa vigente en su sitio. Akira Cloud no cobra comisión adicional sobre tus cobros.' },
      { type: 'h2', text: '¿Y si no querés cobrar todo por adelantado?' },
      { type: 'p', text: 'Podés cobrar solo una seña: en cada servicio elegís un porcentaje o un monto fijo, y el bot le avisa al cliente que el resto se paga en el local. Mirá la guía sobre señas para más detalle.' },
      { type: 'cta' },
    ],
  },
  {
    slug: 'bot-whatsapp-vs-secretaria',
    title: 'Bot de WhatsApp con IA vs secretaria: cuándo conviene cada uno',
    description: 'Comparativa honesta entre tener una secretaria humana y un bot de WhatsApp con IA. Costos, ventajas y cuándo conviene cada uno.',
    keywords: 'bot whatsapp vs secretaria, asistente virtual vs secretaria, automatizar atencion al cliente, ahorrar costos atencion cliente, ia para pymes argentina',
    tag: 'Comparativas',
    date: '2026-05-05',
    minutos: 4,
    excerpt: '¿Conviene contratar una secretaria o usar un bot de WhatsApp? Una comparación honesta: qué hace mejor cada uno y cuándo conviene combinarlos.',
    body: [
      { type: 'p', text: 'La pregunta si tu negocio crece: ¿contrato una secretaria o uso un bot de WhatsApp con IA? Te lo cuento sin marketing, con las ventajas y los límites de cada uno.' },
      { type: 'h2', text: 'Cómo comparar los costos' },
      { type: 'list', items: [
        'Una secretaria en relación de dependencia cuesta el sueldo más cargas sociales, ART y aguinaldo: sumá todo con los valores vigentes de tu convenio.',
        'Una persona part-time cuesta menos, pero cubre menos horas.',
        'Akira Cloud Pro cuesta $35.000 por mes (mensajes ilimitados, Google Calendar, MercadoPago y audios); Básico, $15.000.',
      ]},
      { type: 'h2', text: 'Ventajas de la secretaria humana' },
      { type: 'list', items: [
        'Empatía real — un paciente angustiado, un cliente complicado.',
        'Decisiones complejas que requieren contexto humano.',
        'Tareas múltiples (atender presencial + telefónicas + administrativas).',
        'Sentido común en situaciones imprevistas.',
      ]},
      { type: 'h2', text: 'Ventajas del bot con IA' },
      { type: 'list', items: [
        'Funciona 24/7 — atiende a las 3am, los domingos, los feriados.',
        'Responde en segundos, a cualquier hora.',
        'No se toma vacaciones ni licencias (eso sí: necesita la PC prendida y con internet).',
        'Puede llevar muchas conversaciones a la vez.',
        'Cobra automáticamente con MercadoPago.',
        'Manda recordatorios automáticos.',
        'Cuesta bastante menos que un sueldo.',
      ]},
      { type: 'h2', text: '¿Cuándo conviene cada uno?' },
      { type: 'p', text: 'Bot solo: si tu negocio es transaccional (turnos, reservas, pedidos) y casi todas las consultas se repiten: peluquerías, consultorios, gimnasios, alquileres, restaurantes con reservas.' },
      { type: 'p', text: 'Secretaria sola: si tu negocio requiere mucha atención humana sensible (clínica psicológica, abogacía con clientes en conflicto, atención de quejas).' },
      { type: 'p', text: 'Combinación (lo más común): el bot atiende lo repetitivo (consultas, turnos, pagos) y una persona resuelve lo complejo. Cuando el bot no sabe algo, te avisa y vos respondés; incluso podés pedirle un borrador de respuesta y revisarlo antes de enviarlo.' },
      { type: 'h2', text: 'Recomendación práctica' },
      { type: 'p', text: 'Probalo con el trial gratis (100 mensajes, sin tarjeta) y fijate qué parte de tus mensajes resuelve solo el bot. Si es la mayoría, ya sabés qué conviene; si necesitás una persona para casi todo, al menos lo comprobaste sin gastar.' },
      { type: 'cta' },
    ],
  },
  {
    slug: 'cobrar-senas-whatsapp-turnos',
    title: 'Cómo cobrar señas por WhatsApp y reducir los turnos perdidos',
    description: 'Qué es una seña, por qué ayuda con los turnos que no se cumplen y cómo cobrarla por WhatsApp con MercadoPago, eligiendo un porcentaje o un monto fijo por servicio.',
    keywords: 'cobrar seña whatsapp, seña turnos, reducir ausentismo turnos, seña mercadopago, cobrar adelanto turno, turnos perdidos peluqueria, no show turnos',
    tag: 'Pagos',
    date: '2026-10-07',
    minutos: 5,
    excerpt: 'Un turno al que el cliente no va es una hora que no se vuelve a vender. Una seña bien planteada ayuda a que se cumplan. Te cuento cómo cobrarla por WhatsApp sin complicarte.',
    body: [
      { type: 'p', text: 'Si tomás turnos, seguro te pasó: reservan, no avisan y no aparecen. Esa hora quedó vacía y ya no se recupera. Una seña (un adelanto que el cliente paga al reservar) es la herramienta más usada para que los turnos se cumplan, porque el cliente ya puso algo de plata y tiene un motivo para venir o avisar.' },
      { type: 'h2', text: '¿Cobrar todo o solo una parte?' },
      { type: 'p', text: 'Depende del servicio. Para algo corto y barato quizás convenga cobrarlo entero al reservar. Para un servicio largo o caro, lo habitual es una seña (por ejemplo, un porcentaje del precio) y el resto se paga en el local. Lo importante es que el cliente lo sepa de entrada, antes de pagar.' },
      { type: 'h2', text: 'Cómo se configura en Akira Cloud' },
      { type: 'list', items: [
        'En Catálogo → Servicios, cada servicio tiene la opción “Seña para reservar”: elegís “Todo”, un porcentaje del precio o un monto fijo.',
        'Cuando el cliente confirma el turno, el bot genera el link de pago de MercadoPago solo por el monto de la seña y le avisa que el resto se abona en el local.',
        'Cuando se acredita el pago, el turno queda confirmado y el cliente recibe el aviso. En tu Caja entra solo lo cobrado.',
        'Si no configurás nada, se cobra el total, como siempre.',
      ]},
      { type: 'h2', text: 'Lo que ayuda además de la seña' },
      { type: 'list', items: [
        'Recordatorios automáticos 24 horas, 4 horas y 30 minutos antes del turno.',
        'Una política de cancelación clara: Akira permite definir cuántas horas antes se puede cancelar.',
        'Marcar a quien no vino: en la ficha del cliente tocás “No vino” en ese turno. A quien falta seguido, el bot le pide seña antes de reservar, aunque al resto no se la pida.',
        'Ver el panorama: en Reportes aparece cuánto se pierde por ausencias y quiénes faltan más.',
      ]},
      { type: 'h2', text: 'Consejos para plantearla bien' },
      { type: 'list', items: [
        'Explicá qué pasa con la seña si el cliente cancela a tiempo y si no (definí tu regla y respetala).',
        'Empezá con una seña moderada y ajustala según cómo reaccionen tus clientes.',
        'Mantené el precio y la seña visibles en tu catálogo: el bot siempre responde lo que cargaste, no inventa montos.',
      ]},
      { type: 'cta' },
    ],
  },
  {
    slug: 'datos-del-negocio-en-tu-pc',
    title: 'Dónde se guardan los datos de un bot de WhatsApp (y por qué importa)',
    description: 'Qué información maneja un bot de WhatsApp para negocios, dónde se guarda según el tipo de programa y qué preguntar antes de elegir uno. Cómo lo resuelve Akira Cloud.',
    keywords: 'privacidad bot whatsapp, datos clientes whatsapp, donde se guardan los datos, bot whatsapp datos locales, seguridad datos negocio, respaldo datos negocio',
    tag: 'Privacidad',
    date: '2026-10-07',
    minutos: 5,
    excerpt: 'Un bot de WhatsApp ve los nombres, teléfonos y conversaciones de tus clientes. Dónde queda esa información es una pregunta que conviene hacer antes de elegir un programa.',
    body: [
      { type: 'p', text: 'Un bot de WhatsApp para tu negocio maneja información sensible: los teléfonos de tus clientes, lo que te escriben, qué turnos sacan, qué te deben. Antes de elegir uno, conviene saber dónde queda guardada esa información y quién puede acceder a ella.' },
      { type: 'h2', text: 'Dos formas de hacerlo' },
      { type: 'list', items: [
        'Servicio en la nube: el proveedor tiene tus datos en sus servidores. Ventaja: no dependés de una computadora tuya. A tener en cuenta: tu base de clientes vive en la infraestructura de otro y dependés de sus políticas y de que el servicio siga funcionando.',
        'Programa en tu computadora: los datos quedan en tu equipo. Ventaja: el control es tuyo. A tener en cuenta: la PC tiene que estar prendida y con internet para que el bot responda, y los respaldos son tu responsabilidad.',
      ]},
      { type: 'h2', text: 'Cómo lo hace Akira Cloud' },
      { type: 'p', text: 'Akira es un programa para Windows. El bot, la sesión de WhatsApp y la base de datos (clientes, conversaciones, turnos, caja, catálogo) viven en tu computadora. La nube de Akira guarda solamente tu cuenta (email y contraseña cifrada), tu licencia y se encarga de enviar emails; no guarda tus clientes ni tus mensajes.' },
      { type: 'list', items: [
        'Las claves que cargás (por ejemplo, la de MercadoPago) se cifran con el almacén de claves de Windows.',
        'Los respaldos son archivos cifrados con una contraseña que elegís vos; sin esa contraseña no se pueden abrir (por eso conviene anotarla en un lugar seguro).',
        'Podés restaurar un respaldo en otra computadora si cambiás de equipo o se rompe el tuyo.',
        'Lo que sale de tu PC es opcional y está apagado por defecto: estadísticas anónimas de uso (solo cuántas veces se abre cada pantalla), el resumen del negocio para ver desde la web y los webhooks hacia otras herramientas.',
      ]},
      { type: 'h2', text: 'Qué preguntarle a cualquier proveedor' },
      { type: 'list', items: [
        '¿Dónde se guardan los datos de mis clientes y mis conversaciones?',
        '¿Quién puede verlos? ¿Los usan para entrenar modelos o para otra cosa?',
        '¿Puedo llevarme mis datos (exportarlos) si me voy?',
        '¿Qué pasa si el servicio cierra o si mi equipo se rompe? ¿Hay respaldos?',
        '¿Cómo se conecta a WhatsApp: con la API oficial o vinculando un dispositivo?',
      ]},
      { type: 'h2', text: 'Un dato sobre WhatsApp' },
      { type: 'p', text: 'Akira se conecta como un dispositivo vinculado (escaneando un QR), no con la API oficial de WhatsApp Business. Para cuidar tu número, limita los mensajes que se mandan a grupos de clientes, respeta a quienes piden la baja y siempre te pide confirmación antes de enviar mensajes masivos.' },
      { type: 'cta' },
    ],
  },
  {
    slug: 'llevar-la-caja-de-un-negocio-chico',
    title: 'Cómo llevar la caja de un negocio chico, paso a paso',
    description: 'Una guía simple para ordenar la plata de un negocio chico: separar cuentas, registrar ingresos y gastos, cerrar la caja del día, gastos fijos y metas. Con ejemplos de cómo hacerlo en Akira Cloud.',
    keywords: 'llevar la caja negocio, caja diaria negocio chico, cierre de caja, gastos fijos negocio, ordenar finanzas pyme, control de gastos peluqueria, planilla de caja',
    tag: 'Gestión',
    date: '2026-10-07',
    minutos: 6,
    excerpt: 'No hace falta ser contador para saber si tu negocio gana plata. Con unos hábitos simples (y una herramienta que los haga fáciles) alcanza.',
    body: [
      { type: 'p', text: 'Mucha gente que tiene un negocio chico sabe “más o menos” cuánto vendió, pero no cuánto le quedó. Llevar la caja no es complicado si se hace todos los días y siempre de la misma manera. Estos son los pasos que más ayudan.' },
      { type: 'h2', text: '1. Separá la plata del negocio de la personal' },
      { type: 'p', text: 'Si se mezclan, nunca vas a saber si el negocio funciona. Lo ideal es una cuenta (o al menos una billetera) para el negocio y que tu sueldo sea un retiro que anotás como tal.' },
      { type: 'h2', text: '2. Registrá todo lo que entra y todo lo que sale' },
      { type: 'p', text: 'Con fecha, monto, medio de pago (efectivo, transferencia, MercadoPago, tarjeta) y una categoría (alquiler, insumos, sueldos, impuestos). En Akira, los turnos cobrados entran solos a la Caja y vos cargás el resto con “+ Ingreso” y “+ Gasto”; las ventas de mostrador y los pedidos pagados también suman solos.' },
      { type: 'h2', text: '3. Cerrá la caja todos los días' },
      { type: 'p', text: 'Al final del día, contá el efectivo y compará con lo que debería haber: lo que había al empezar, más lo cobrado en efectivo, menos lo gastado en efectivo. Si sobra o falta, anotalo y buscá la causa mientras todavía te acordás. En Akira, el botón “Cerrar caja” te hace la cuenta y te dice si cerró justa.' },
      { type: 'h2', text: '4. Cargá los gastos fijos una sola vez' },
      { type: 'p', text: 'Alquiler, internet, monotributo: son siempre iguales y vencen el mismo día. En Akira los cargás una vez, se anotan solos en la Caja cada mes y te avisan por WhatsApp unos días antes del vencimiento.' },
      { type: 'h2', text: '5. Conciliá lo que cobrás por MercadoPago' },
      { type: 'p', text: 'Una vez por semana comparás lo que entró a tu cuenta de MercadoPago con lo que tenés anotado. Así detectás cobros sin registrar y ves cuánto te descontó de comisión. Akira lo hace con un botón.' },
      { type: 'h2', text: '6. Mirá el mes completo' },
      { type: 'list', items: [
        'Ingresos, gastos y resultado del mes.',
        'Qué servicios o productos dejan más.',
        'Qué días y horarios se llenan.',
        'Una meta mensual con barra de avance, para saber si vas bien antes de que termine el mes.',
      ]},
      { type: 'h2', text: '7. Pasale la información ordenada a tu contador' },
      { type: 'p', text: 'Exportá la Caja del mes a Excel, CSV o PDF. Si guardás las planillas en una carpeta de Google Drive, OneDrive o Dropbox, tu contador las puede ver siempre actualizadas.' },
      { type: 'p', text: 'Aclaración: esta guía es práctica y general, no reemplaza el consejo de un contador. Y los presupuestos y recibos que genera Akira no son facturas fiscales.' },
      { type: 'cta' },
    ],
  },
];

// ── Index del blog (lista de posts) ─────────────────────────
function BlogIndex() {
  useSeo({
    title: 'Blog de Akira Cloud — Guías, comparativas y consejos sobre WhatsApp, IA y automatización',
    description: 'El blog de Akira Cloud: guías prácticas para automatizar tu negocio con WhatsApp e inteligencia artificial. Cómo agendar turnos, cobrar con MercadoPago, comparativas y casos de uso.',
    keywords: 'blog whatsapp ia, blog bot whatsapp, blog automatizacion whatsapp, articulos chatbot, guias whatsapp business, akira cloud blog',
    canonical: 'https://akiracloud.lat/blog',
  });

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      <header className="px-5 md:px-8 py-4 sticky top-0 z-40"
        style={{ background: 'rgba(13,13,13,0.85)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}>
              <Bot size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <span className="font-bold text-base text-white">Akira<span style={{ color: 'var(--accent)' }}> Cloud</span></span>
          </Link>
          <Link to="/register" className="btn-primary text-sm px-4 py-2">Empezar gratis</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 md:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white">
            Blog de <span style={{ color: 'var(--accent)' }}>Akira Cloud</span>
          </h1>
          <p className="mt-4 text-base max-w-2xl mx-auto" style={{ color: 'var(--text2)' }}>
            Guías prácticas, comparativas y consejos para automatizar tu negocio
            con WhatsApp e inteligencia artificial.
          </p>
        </div>

        <div className="space-y-4">
          {[...POSTS].sort((a, b) => b.date.localeCompare(a.date)).map((p) => (
            <Link key={p.slug} to={`/blog/${p.slug}`}
              className="block p-6 rounded-2xl transition-all hover:-translate-y-1"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--muted)' }}>
                <span className="px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(0,232,123,0.10)', color: 'var(--accent)' }}>
                  {p.tag}
                </span>
                <span className="flex items-center gap-1"><Calendar size={11} /> {p.date}</span>
                <span className="flex items-center gap-1"><Clock size={11} /> {p.minutos} min</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-white">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
                {p.excerpt}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                Leer artículo <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link to="/" className="btn-secondary text-sm px-5 py-2.5">
            Volver al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}

// ── Post individual ─────────────────────────────────────────
function BlogPost({ post }) {
  const canonical = `https://akiracloud.lat/blog/${post.slug}`;

  // JSON-LD Article
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Person',
      name: 'Juan Martín Arrayago',
      alternateName: 'TinchoDev',
      url: 'https://martinarrayago.lat',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Akira Cloud',
      logo: { '@type': 'ImageObject', url: 'https://akiracloud.lat/favicon.svg' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: 'es-AR',
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://akiracloud.lat/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://akiracloud.lat/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
    ],
  };

  useSeo({
    title: `${post.title} | Akira Cloud`,
    description: post.description,
    keywords: post.keywords,
    canonical,
    faqJsonLd: articleJsonLd,
    breadcrumb,
  });

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      <header className="px-5 md:px-8 py-4 sticky top-0 z-40"
        style={{ background: 'rgba(13,13,13,0.85)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)' }}>
              <Bot size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <span className="font-bold text-base text-white">Akira<span style={{ color: 'var(--accent)' }}> Cloud</span></span>
          </Link>
          <Link to="/blog" className="text-sm flex items-center gap-1 hover:text-white" style={{ color: 'var(--text2)' }}>
            <ChevronLeft size={14} /> Blog
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-8 py-16">
        <article>
          <div className="flex items-center gap-3 text-xs mb-4" style={{ color: 'var(--muted)' }}>
            <span className="px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(0,232,123,0.10)', color: 'var(--accent)' }}>
              {post.tag}
            </span>
            <span>{post.date}</span>
            <span>·</span>
            <span>{post.minutos} min de lectura</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
            {post.title}
          </h1>
          <p className="mt-4 text-base md:text-lg" style={{ color: 'var(--text2)' }}>
            {post.excerpt}
          </p>

          <div className="mt-10 space-y-5 text-base leading-relaxed" style={{ color: 'var(--text)' }}>
            {post.body.map((block, i) => {
              if (block.type === 'h2') {
                return <h2 key={i} className="text-2xl font-bold text-white pt-4">{block.text}</h2>;
              }
              if (block.type === 'p') {
                return <p key={i}>{block.text}</p>;
              }
              if (block.type === 'list') {
                return (
                  <ul key={i} className="space-y-2 pl-2">
                    {block.items.map((it, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <span style={{ color: 'var(--accent)' }} className="mt-1">▸</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                );
              }
              if (block.type === 'cta') {
                return (
                  <div key={i} className="mt-8 p-6 rounded-2xl text-center"
                    style={{
                      background: 'linear-gradient(160deg, rgba(0,232,123,0.10) 0%, var(--surface) 60%)',
                      border: '1px solid rgba(0,232,123,0.30)',
                    }}>
                    <h3 className="text-xl font-bold text-white">¿Querés probarlo?</h3>
                    <p className="mt-2 text-sm" style={{ color: 'var(--text2)' }}>
                      100 mensajes gratis, sin tarjeta, en 5 minutos.
                    </p>
                    <Link to="/register" className="mt-4 inline-flex btn-primary text-sm px-5 py-2.5">
                      Empezar ahora <ArrowRight size={14} />
                    </Link>
                  </div>
                );
              }
              return null;
            })}
          </div>

          <div className="mt-16 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>
              Escrito por <Link to="/#creador" className="font-semibold hover:text-white" style={{ color: 'var(--accent)' }}>Juan Martín Arrayago (TinchoDev)</Link>,
              creador y fundador de Akira Cloud.
            </p>
          </div>
        </article>

        <div className="mt-12">
          <h3 className="text-lg font-bold text-white mb-4">Otros artículos</h3>
          <div className="space-y-3">
            {POSTS.filter((p) => p.slug !== post.slug).slice(0, 3).map((p) => (
              <Link key={p.slug} to={`/blog/${p.slug}`}
                className="block p-4 rounded-xl transition-colors hover:bg-[var(--surface2)]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-sm font-bold text-white">{p.title}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{p.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Router internal: index vs post según param ──────────────
export default function Blog() {
  const { slug } = useParams();
  if (!slug) return <BlogIndex />;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) {
    return (
      <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', padding: '4rem 1rem', textAlign: 'center' }}>
        <h1 className="text-2xl font-bold text-white">Artículo no encontrado</h1>
        <Link to="/blog" className="mt-4 inline-block btn-primary text-sm px-5 py-2.5">Ver todos los artículos</Link>
      </div>
    );
  }
  return <BlogPost post={post} />;
}

// Exportamos POSTS para que el sitemap dinámico (si en el futuro lo hacemos)
// pueda leer la lista. Por ahora el sitemap.xml estático en public/ se mantiene.
export { POSTS };
