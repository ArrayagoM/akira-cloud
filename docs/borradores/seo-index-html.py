import re, json
p = r'C:/Users/jmarr/OneDrive/Desktop/akira-cloud/frontend/index.html'
s = open(p, encoding='utf-8').read()

TITLE = 'Akira Cloud — Bot de WhatsApp con IA + gestión de tu negocio (caja, deudores, turnos) | Software para Windows, Argentina'
DESC = ('Akira Cloud es un programa para Windows con bot de WhatsApp con inteligencia artificial que agenda turnos en Google Calendar, '
        'cobra con MercadoPago y además gestiona tu negocio: catálogo, caja, deudores, proveedores y documentos con OCR. '
        'Tus datos quedan en tu propia PC. Hecho en Argentina.')
KEYS = ('bot whatsapp argentina, asistente whatsapp ia, chatbot whatsapp, agenda turnos whatsapp, bot mercadopago, '
        'software gestion negocio argentina, programa caja y deudores, sistema para peluquerias, bot whatsapp datos locales, '
        'whatsapp business automatizar, inteligencia artificial whatsapp, ocr facturas whatsapp, akira cloud, akira bot')

s = re.sub(r'<title>.*?</title>', '<title>' + TITLE + '</title>', s, count=1, flags=re.S)
s = re.sub(r'<meta name="description" content="[^"]*" />', '<meta name="description" content="' + DESC + '" />', s, count=1)
s = re.sub(r'<meta name="keywords" content="[^"]*" />', '<meta name="keywords" content="' + KEYS + '" />', s, count=1)
s = s.replace('content="Agenda turnos, cobra con MercadoPago y atiende clientes 24/7. El bot de WhatsApp más potente de Argentina."',
              'content="Bot de WhatsApp con IA + caja, deudores, proveedores y documentos con OCR. Tus datos quedan en tu PC."', 1)
s = s.replace('content="Agenda turnos, cobra con MercadoPago y atiende clientes 24/7 automáticamente."',
              'content="Bot de WhatsApp con IA que agenda, cobra y gestiona tu negocio. Software para Windows."', 1)
s = s.replace('content="Akira Cloud — Bot WhatsApp con IA para tu negocio"', 'content="Akira Cloud — Bot de WhatsApp con IA y gestión de tu negocio"', 1)

FEATURES = [
    'Bot de WhatsApp con IA que conversa de forma natural y atiende 24/7',
    'Agenda automática integrada con Google Calendar, sin choques de horarios',
    'Cobros con MercadoPago (link de pago) o transferencia (alias/CBU)',
    'Recordatorios automáticos 24 h, 4 h y 30 min antes del turno',
    'Respuesta a mensajes de audio con transcripción',
    'CRM de clientes, lista de espera y recordatorios de clientes inactivos',
    'Catálogo de productos y servicios con importación desde Excel, CSV o PDF',
    'Caja: ingresos y gastos por método de pago, con exportación a Excel y PDF',
    'Deudores: cuentas corrientes de clientes (quién te debe, cuánto y desde cuándo)',
    'Proveedores: cuentas corrientes de lo que debés',
    'Documentos por WhatsApp: recibe facturas, comprobantes e imágenes y lee su texto con OCR',
    'Datos del negocio guardados en la PC del usuario (base local), cifrado de claves con Windows',
    'Actualizaciones automáticas del programa',
    'Resumen opcional del negocio para ver desde el celular (solo contadores numéricos)',
    'Panel de administración y multi-cuenta de WhatsApp según el plan',
]

OFFERS = [
    ('Trial gratuito', 0, 'Prueba gratis con 100 mensajes, sin tarjeta'),
    ('Básico', 15000, '1 número de WhatsApp, 500 mensajes por mes'),
    ('Pro', 35000, 'Mensajes ilimitados, agenda inteligente, MercadoPago, CRM, lista de espera, audios'),
    ('Agencia', 80000, 'Hasta 5 números de WhatsApp, panel multi-cliente, soporte dedicado'),
]

software = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": "https://akiracloud.lat/#software",
    "name": "Akira Cloud",
    "alternateName": ["Akira", "Akira Bot"],
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "Bot de WhatsApp, gestión de negocio, agenda de turnos, caja y cuentas corrientes",
    "operatingSystem": "Windows 10, Windows 11",
    "description": ("Programa para Windows que combina un asistente de WhatsApp con inteligencia artificial "
                    "(agenda turnos en Google Calendar, cobra con MercadoPago, responde audios) con herramientas de "
                    "gestión del negocio: catálogo, caja, deudores, proveedores y documentos con OCR. "
                    "El bot y los datos viven en la PC del usuario; la nube solo maneja la cuenta y la licencia."),
    "url": "https://akiracloud.lat",
    "downloadUrl": "https://akiracloud.lat/descargar",
    "installUrl": "https://akiracloud.lat/descargar",
    "image": "https://akiracloud.lat/og-image.png",
    "inLanguage": "es-AR",
    "countriesSupported": "AR",
    "featureList": FEATURES,
    "offers": [
        {"@type": "Offer", "name": n, "price": str(pr), "priceCurrency": "ARS", "description": d,
         "availability": "https://schema.org/InStock", "url": "https://akiracloud.lat/#precios"}
        for n, pr, d in OFFERS
    ],
    "author": {"@type": "Person", "name": "Juan Martín Arrayago", "alternateName": "TinchoDev", "url": "https://martinarrayago.lat"},
    "publisher": {"@type": "Organization", "name": "Akira Cloud", "url": "https://akiracloud.lat"},
    "audience": {"@type": "BusinessAudience",
                 "audienceType": "Pequeños y medianos comercios y profesionales: peluquerías, barberías, consultorios, gimnasios, alquileres turísticos, restaurantes, talleres"},
}

FAQ = [
    ("¿Qué es Akira Cloud?",
     "Akira Cloud es un programa para Windows, creado en Argentina, que combina un asistente de WhatsApp con inteligencia artificial y herramientas para gestionar un negocio. El bot atiende clientes 24/7, agenda turnos en Google Calendar, cobra con MercadoPago y responde audios; además incluye catálogo, caja, deudores, proveedores y lectura de documentos con OCR. Los datos del negocio se guardan en la PC del usuario."),
    ("¿Dónde se guardan los datos de mi negocio con Akira?",
     "En tu propia computadora. Clientes, turnos, caja, deudas, proveedores, conversaciones y documentos se guardan en una base de datos local en tu PC, y las claves se cifran con el almacén seguro de Windows. A la nube solo viaja la cuenta, el plan y la licencia; y, si el usuario lo activa, unos pocos contadores numéricos de resumen para verlos desde el celular."),
    ("¿Cómo agenda turnos el bot de WhatsApp?",
     "Akira se conecta a tu Google Calendar. Cuando un cliente pide un turno, consulta los horarios libres en tiempo real, ofrece opciones, espera la confirmación, genera un link de pago de MercadoPago si tenés cobro habilitado y crea el evento en tu calendario. Envía recordatorios automáticos 24 h, 4 h y 30 minutos antes."),
    ("¿Akira sirve para llevar la caja, los deudores y los proveedores?",
     "Sí. Incluye una Caja con ingresos y gastos por método de pago, cuentas corrientes de clientes (deudores: quién te debe, cuánto y desde cuándo) y de proveedores (lo que debés). Todo está integrado, se importa desde Excel, CSV o PDF y se exporta a Excel o PDF."),
    ("¿Qué pasa si un cliente me manda una factura o comprobante por WhatsApp?",
     "El bot le avisa que lo recibió, lee el texto de la imagen o PDF con OCR y lo deja ordenado en la sección Documentos para que el dueño lo revise y lo pase a la Caja o a un proveedor."),
    ("¿Cuánto cuesta Akira Cloud?",
     "Hay un trial gratuito de 100 mensajes sin tarjeta. El plan Básico cuesta $15.000 ARS por mes (500 mensajes), el Pro $35.000 ARS por mes (mensajes ilimitados, agenda con Google Calendar, MercadoPago, CRM y audios) y el plan Agencia $80.000 ARS por mes (hasta 5 números de WhatsApp). Se puede cancelar cuando se quiera."),
    ("¿Necesito conocimientos técnicos o dejar la PC prendida?",
     "No hace falta saber programar: se instala como cualquier programa de Windows, se escanea un QR con WhatsApp y se carga la clave gratuita de Groq. Como el bot funciona en tu PC, la computadora debe estar encendida y con internet para que responda."),
    ("¿Hay app para el celular?",
     "El programa es para Windows. Una app para Android y iOS, pensada solo para monitorear (estado del bot, resumen del negocio, alertas y pausar o reanudar), está en desarrollo. Hoy ya se puede ver un resumen opcional desde el celular entrando a akiracloud.lat con la cuenta."),
    ("¿Quién creó Akira Cloud?",
     "Akira Cloud fue creada por Juan Martín Arrayago (alias TinchoDev), desarrollador full stack argentino de Ranchos, Buenos Aires, que diseña, programa y mantiene la plataforma de forma independiente."),
]
faq = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
    {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]}

howto = {
    "@context": "https://schema.org", "@type": "HowTo",
    "name": "Cómo empezar con Akira Cloud",
    "description": "Pasos para instalar Akira Cloud en Windows y poner a atender tu WhatsApp.",
    "totalTime": "PT10M",
    "step": [
        {"@type": "HowToStep", "name": "Crear la cuenta", "text": "Registrate gratis en akiracloud.lat con tu email o con Google.", "url": "https://akiracloud.lat/register"},
        {"@type": "HowToStep", "name": "Descargar e instalar", "text": "Descargá el instalador para Windows e instalalo como cualquier programa.", "url": "https://akiracloud.lat/descargar"},
        {"@type": "HowToStep", "name": "Conectar WhatsApp", "text": "Escaneá el código QR desde WhatsApp (Dispositivos vinculados), igual que WhatsApp Web."},
        {"@type": "HowToStep", "name": "Cargar tu negocio", "text": "Pegá tu clave gratuita de Groq y cargá servicios, precios y horarios (podés importarlos desde Excel o PDF)."},
        {"@type": "HowToStep", "name": "Listo", "text": "Akira atiende, agenda y cobra, y te avisa cada vez que confirma un turno."},
    ],
}

def bloque(d):
    return '<script type="application/ld+json">\n  ' + json.dumps(d, ensure_ascii=False, indent=2).replace('\n', '\n  ') + '\n  </script>'

a = s.index('  <!-- 2) SoftwareApplication')
b = s.index('  <!-- 4) Person')
nuevo = ('  <!-- 2) SoftwareApplication: ficha del producto para Google Search + IA -->\n  ' + bloque(software) +
         '\n\n  <!-- 3) FAQPage: respuestas citables por buscadores y asistentes de IA -->\n  ' + bloque(faq) +
         '\n\n  <!-- 3b) HowTo: pasos para empezar -->\n  ' + bloque(howto) + '\n\n')
s = s[:a] + nuevo + s[b:]

# Organization: descripción
s = s.replace('"description": "Plataforma argentina de bots de WhatsApp con inteligencia artificial para automatizar turnos, cobros y atención al cliente.",',
              '"description": "Software argentino para Windows: bot de WhatsApp con inteligencia artificial y herramientas de gestión del negocio (turnos, cobros, caja, deudores, proveedores).",', 1)

# noscript (contenido estático para crawlers sin JS)
na = s.index('      <section>\n        <h2>¿Qué hace Akira Cloud?</h2>')
nb = s.index('      <section>\n        <h2>¿Para quién es Akira?</h2>')
s = s[:na] + '''      <section>
        <h2>¿Qué hace Akira Cloud?</h2>
        <ul>
          <li><strong>Agenda turnos automáticamente</strong> en tu Google Calendar consultando tus horarios libres en tiempo real.</li>
          <li><strong>Cobra con MercadoPago</strong> generando links de pago al confirmar cada turno, o con transferencia (alias / CBU / CVU).</li>
          <li><strong>Atiende 24/7</strong> por WhatsApp con inteligencia artificial y responde mensajes de audio.</li>
          <li><strong>Envía recordatorios automáticos</strong> 24 horas, 4 horas y 30 minutos antes del turno.</li>
          <li><strong>Gestiona tu negocio</strong>: catálogo de productos y servicios (importa Excel, CSV y PDF), caja de ingresos y gastos, deudores (cuentas corrientes de clientes) y proveedores.</li>
          <li><strong>Lee documentos que llegan por WhatsApp</strong> (facturas, comprobantes, imágenes) con OCR y los ordena.</li>
          <li><strong>Tus datos quedan en tu PC</strong>: es un programa para Windows con base de datos local; la nube solo maneja la cuenta y la licencia.</li>
          <li><strong>Se actualiza sola</strong> y, de forma opcional, muestra un resumen del negocio en el celular.</li>
        </ul>
      </section>

''' + s[nb:]

ta = s.index('      <section>\n        <h2>Tecnología</h2>')
tb = s.index('      <section>\n        <h2>Planes y precios</h2>')
s = s[:ta] + '''      <section>
        <h2>Tecnología</h2>
        <p>Akira Cloud es una aplicación de escritorio para Windows (Electron). Usa modelos de lenguaje
          servidos por Groq con la clave del propio usuario, y se conecta a WhatsApp con Baileys (sin Chrome/Puppeteer).
          La base de datos es local (SQLite) y las claves se cifran con el almacén seguro de Windows. El servidor
          (Vercel) solo gestiona inicio de sesión, suscripciones y licencias.</p>
      </section>

''' + s[tb:]

s = s.replace('<li><strong>Trial gratuito</strong> — 100 mensajes, 1 bot, sin tarjeta.</li>\n          <li><strong>Básico</strong> — desde $15.000 ARS/mes, 500 mensajes.</li>\n          <li><strong>Pro</strong> — mensajes ilimitados, Google Calendar, MercadoPago, audio.</li>',
              '<li><strong>Trial gratuito</strong> — 100 mensajes, 1 bot, sin tarjeta.</li>\n          <li><strong>Básico</strong> — $15.000 ARS/mes, 500 mensajes.</li>\n          <li><strong>Pro</strong> — $35.000 ARS/mes, mensajes ilimitados, Google Calendar, MercadoPago, audio.</li>', 1)
s = s.replace('<li><a href="/">Inicio</a></li>', '<li><a href="/">Inicio</a></li>\n          <li><a href="/descargar">Descargar Akira para Windows</a></li>\n          <li><a href="/documentacion">Documentación</a></li>', 1)
open(p, 'w', encoding='utf-8').write(s)
print('ok', len(s))
