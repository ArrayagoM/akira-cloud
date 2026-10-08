// Guía de funciones de Akira (Documentación → "Guía de funciones"): una entrada por cada pantalla del menú de la app,
// agrupadas igual que el menú lateral. Para sumar una función nueva: agregá un objeto en el grupo que corresponda.
// Cada entrada: id único, menu (cómo se llama en el menú), titulo, que (qué es, en una frase), hace (lista de lo que se puede
// hacer) y nota (opcional). Los pasos detallados de las tareas más comunes están en el Centro de ayuda de la app.

export const GUIA = [
  {
    id: 'g-atencion',
    titulo: 'Atención al cliente',
    icono: '💬',
    items: [
      {
        id: 'f-dashboard', menu: 'Dashboard', titulo: 'Dashboard (inicio)',
        que: 'La pantalla principal: ahí prendés el bot, ves cómo está y qué está haciendo en este momento.',
        hace: [
          'Iniciar el bot: aparece un código QR (se renueva cada 20 segundos) que escaneás en WhatsApp → Dispositivos vinculados. Cuando termina dice “¡Bot activo y conectado!”.',
          'Si WhatsApp pide vincular de nuevo (“Sesión de WhatsApp expirada”), volvés a escanear el QR; tus clientes, turnos y datos no se pierden.',
          'Ver los números del día: mensajes, reservas, cobros del bot y estado de la conexión.',
          'Seguir la actividad en vivo: una lista en tiempo real de lo que el bot va haciendo.',
          'Modo pausa: el bot deja de tomar turnos y tus clientes ven un mensaje de no disponibilidad (sirve para vacaciones o para atender vos un rato).',
          'Primeros pasos: una guía de 6 pasos que se tilda sola a medida que configurás clave de Groq, datos del negocio, WhatsApp, celular de avisos, prueba del bot y respaldo.',
          'Tarjetas opcionales: alertas si el bot se cae (por email y/o celular), resumen del día por WhatsApp, “Controlar desde la app del celular” y “Ver tu negocio desde el celular”.',
        ],
        nota: 'Las estadísticas anónimas de uso (solo cuántas veces se abre cada pantalla) son opcionales y vienen apagadas.',
      },
      {
        id: 'f-agenda', menu: 'Agenda', titulo: 'Agenda',
        que: 'Todos tus turnos por día, separados entre confirmados y pendientes de pago.',
        hace: [
          'Ver los turnos de cada día y saber de un vistazo cuáles son reservas en firme y cuáles esperan que el cliente pague.',
          'Filtrar por profesional y asignar quién atiende cada turno confirmado.',
          'Ver la lista de espera y quitar de ahí a quien ya no corresponda.',
          'Si conectaste Google Calendar, los turnos también aparecen en tu calendario.',
        ],
        nota: 'El bot nunca ofrece ni confirma dos turnos superpuestos: chequea la disponibilidad real antes de responder.',
      },
      {
        id: 'f-clientes', menu: 'Clientes', titulo: 'Clientes',
        que: 'La base de personas que hablaron con tu bot, con la ficha completa de cada una.',
        hace: [
          'Buscar por nombre o número y abrir la ficha: historial de turnos, cuenta corriente (lo que te debe), documentos que mandó y premio de fidelidad.',
          'Guardar notas que solo ves vos (por ejemplo “alergia a tinturas, prefiere turnos a la mañana”), etiquetas (VIP, etc.) y la fecha de cumpleaños.',
          'Importar tus clientes desde Excel o CSV (se puede deshacer; los importados no reciben ningún mensaje).',
          'Escribir a un grupo (por ejemplo VIP o inactivos): elegís una plantilla o escribís tu mensaje, ves a quiénes llega y confirmás. Se manda de a poco, con tope diario, y se respeta a quien responde “BAJA”.',
          'Programas con tus clientes: fidelidad (“a la décima visita, una gratis”), pedido de reseñas y pedidos por WhatsApp.',
          'Copiloto: en la ficha, el botón “Sugerir respuesta” te arma un borrador para que lo revises, lo edites y lo mandes. Nunca manda nada solo.',
          'Marcar que un cliente no vino: si falta seguido, el bot le pide seña para reservar.',
        ],
      },
      {
        id: 'f-chats', menu: 'Chats', titulo: 'Chats',
        que: 'El historial de las conversaciones de WhatsApp del bot, para revisar cómo respondió en cada caso.',
        hace: [
          'Buscar una conversación por nombre o número y leerla completa.',
          'Silenciar un chat: el bot deja de responder ahí (útil cuando atendés vos). El cliente puede reactivarlo escribiendo “akira reactivate”.',
          'Bloquear un número: el bot lo ignora por completo y no procesa nada.',
        ],
      },
      {
        id: 'f-profesionales', menu: 'Profesionales', titulo: 'Profesionales',
        que: 'Las personas que atienden en tu negocio, con su agenda propia y su comisión.',
        hace: [
          'Crear cada profesional con su nombre, color, porcentaje de comisión, servicios que hace y sucursal.',
          'Asignarles turnos desde la Agenda (el bot todavía no elige profesional solo).',
          'Ver la liquidación del período con lo que le corresponde a cada uno y exportarla.',
        ],
        nota: 'Cada turno usa la comisión que tenía el profesional cuando se lo asignaste.',
      },
    ],
  },
  {
    id: 'g-ventas',
    titulo: 'Ventas y stock',
    icono: '🛒',
    items: [
      {
        id: 'f-vender', menu: 'Vender', titulo: 'Vender',
        que: 'Ventas de mostrador, rápidas, para el que compra en el local.',
        hace: [
          'Armar la venta tocando productos o escaneando el código de barras con un lector USB.',
          'Elegir cómo pagó (efectivo, tarjeta, transferencia, MercadoPago) y cobrar.',
          'Se descuenta el stock y el ingreso entra solo a la Caja.',
          'Anular una venta desde “Últimas ventas”: el stock vuelve.',
        ],
      },
      {
        id: 'f-catalogo', menu: 'Catálogo', titulo: 'Catálogo',
        que: 'Tus servicios y productos con sus precios: el bot responde y agenda siempre con lo que ves acá, nunca inventa.',
        hace: [
          'Servicios: nombre, precio, duración, seña para reservar (porcentaje o monto fijo) y recordatorio para que el cliente vuelva cada cierta cantidad de días.',
          'Productos: precio, categoría, stock (vacío = sin control), foto que el bot manda cuando preguntan por el producto y código de barras.',
          'Importar desde un archivo: tu lista de precios en Excel, CSV, PDF o incluso una foto.',
          '“Generar códigos” les pone un código propio a los productos que no traen uno, y “Etiquetas” baja un PDF con códigos de barras para pegar.',
          'Cuando queda poco stock (3 o menos) te avisa, y el bot no vende lo que está agotado.',
        ],
        nota: 'Los cambios se aplican al tocar “Guardar cambios”: hasta entonces el bot sigue usando la versión anterior.',
      },
      {
        id: 'f-pedidos', menu: 'Pedidos', titulo: 'Pedidos',
        que: 'Lo que tus clientes piden por WhatsApp, con carrito, total y pago.',
        hace: [
          'El cliente arma el pedido charlando con el bot (retiro, envío o ambos) y recibe el total con el link de pago o los datos de transferencia.',
          'Seguís cada pedido acá. Al pagarse con MercadoPago se descuenta el stock y entra a la Caja; si pagó por transferencia o en efectivo, tocás “Ya me pagó”.',
        ],
        nota: 'Viene apagado: se activa en Clientes → Programas con tus clientes → Pedidos por WhatsApp, y necesitás productos con precio en el Catálogo.',
      },
    ],
  },
  {
    id: 'g-dinero',
    titulo: 'Dinero',
    icono: '💰',
    items: [
      {
        id: 'f-caja', menu: 'Caja', titulo: 'Caja',
        que: 'Lo que entra y lo que sale de tu negocio, mes a mes. Los turnos cobrados suman solos.',
        hace: [
          'Cargar ingresos y gastos a mano (“+ Ingreso”, “+ Gasto”) o importarlos desde una planilla, y exportar el mes a Excel o PDF para tu contador.',
          'Ver el resultado del mes, los ingresos por método de pago, los turnos por cobrar, lo que te deben los clientes y lo que debés a proveedores.',
          'Filtrar por sucursal si tenés más de un local.',
          'Cerrar la caja del día: te dice cuánto efectivo debería haber, contás el cajón y te indica si sobra, falta o está justa.',
          'Gastos fijos y vencimientos (alquiler, monotributo…): se anotan solos en la Caja y te avisa por WhatsApp unos días antes.',
          'Meta del mes: cuánto querés facturar y/o cuántos turnos, para ver el avance.',
          'Conciliar MercadoPago: cruza tus cobros de MercadoPago con la Caja y registra los que faltaban (solo lee, no mueve plata).',
        ],
      },
      {
        id: 'f-reportes', menu: 'Reportes', titulo: 'Reportes',
        que: 'Los números del negocio para decidir con datos.',
        hace: [
          'Elegir el período y ver los servicios más pedidos, los clientes que más vienen, las horas pico, las ausencias y la evolución mes a mes.',
          'Exportar a Excel o CSV.',
        ],
      },
      {
        id: 'f-sucursales', menu: 'Sucursales', titulo: 'Sucursales',
        que: 'Para el que tiene más de un local: separar la plata y los turnos por sucursal.',
        hace: [
          'Crear cada local con su dirección.',
          'En la Caja elegís la sucursal para ver solo lo suyo, y al cargar un ingreso o gasto indicás a cuál pertenece.',
          'Cada profesional atiende en una sucursal y sus turnos cuentan para ella.',
        ],
        nota: 'El bot sigue siendo uno solo para todo el negocio (mismos servicios y horarios).',
      },
      {
        id: 'f-presupuestos', menu: 'Presupuestos', titulo: 'Presupuestos y recibos',
        que: 'Comprobantes en PDF con tu logo, listos para mandar por WhatsApp.',
        hace: [
          'Crear un presupuesto o un recibo eligiendo cliente y agregando productos, servicios o ítems sueltos.',
          'Descargar el PDF o mandárselo por WhatsApp con un toque.',
          'Cuando el cliente paga, “Ya pagó” genera el recibo y el cobro entra a la Caja.',
        ],
        nota: 'Son comprobantes comunes, no facturas fiscales (el PDF lo aclara). Akira todavía no emite facturas de ARCA.',
      },
      {
        id: 'f-deudores', menu: 'Deudores', titulo: 'Deudores',
        que: 'Quién te debe y cuánto, sin planillas.',
        hace: [
          'Cargar una deuda cuando le fiás algo a un cliente y ver el total a cobrar, los clientes con deuda y el último movimiento de cada uno.',
          'Registrar pagos a cuenta: los pagos que registrás suman a la Caja.',
          'Mandar un recordatorio de pago por WhatsApp: lo revisás y lo editás, y no se envía nada hasta que tocás “Enviar”.',
        ],
        nota: 'Para recordarle el pago por WhatsApp hace falta el teléfono del cliente.',
      },
      {
        id: 'f-proveedores', menu: 'Proveedores', titulo: 'Proveedores',
        que: 'La cuenta de tus compras a crédito y cuánto le comprás a cada proveedor.',
        hace: [
          'Agregar proveedores con su CUIT, rubro y notas (días de entrega, contacto, condiciones) o importarlos desde una planilla.',
          'Llevar lo que debés y los pagos que hacés. Lo que debés a proveedores aparece también en la Caja.',
          'Ver cuánto le comprás a cada proveedor por mes.',
        ],
      },
      {
        id: 'f-documentos', menu: 'Documentos', titulo: 'Documentos',
        que: 'Los comprobantes, facturas y archivos que tus clientes te mandan por WhatsApp. Quedan guardados solo en tu PC.',
        hace: [
          'Cuando un cliente manda un PDF o una foto, aparece acá y te avisa. El bot le confirma la recepción.',
          'En las fotos intenta leer el texto y detectar el monto y la fecha; si no puede (letra manuscrita o imagen borrosa), cargás el monto a mano.',
          'Asociarlo a un turno pendiente, registrarlo en la Caja con un clic, clasificarlo, guardar una copia o cargar un documento nuevo a mano.',
        ],
      },
    ],
  },
  {
    id: 'g-bot',
    titulo: 'El bot',
    icono: '🤖',
    items: [
      {
        id: 'f-conocimiento', menu: 'Conocimiento', titulo: 'Conocimiento',
        que: 'Tus preguntas frecuentes, políticas, formas de pago y cómo llegar: el bot responde con tus palabras en vez de inventar.',
        hace: [
          'Pegar un texto o subir un PDF con texto, un .txt o una foto nítida (hasta 15 MB). Se guarda en tu PC.',
          'Probar una pregunta para ver qué fragmento usaría el bot para responderla.',
          'Si ningún fragmento responde, el bot le dice al cliente que consulta con vos y te avisa: podés agregar esa información al documento.',
        ],
      },
      {
        id: 'f-preguntan', menu: 'Qué preguntan', titulo: 'Qué preguntan',
        que: 'Lo que más consultan tus clientes y lo que el bot no supo responder.',
        hace: [
          'Elegir 7, 30 o 90 días y ver los temas más consultados, las preguntas que el bot resolvió y las que no.',
          'Sumar esas respuestas a Conocimiento o al Catálogo para que la próxima vez las conteste solo.',
        ],
        nota: 'Se guardan solo las preguntas, sin teléfonos ni mails, durante 90 días y únicamente en tu PC. Podés borrarlas cuando quieras.',
      },
      {
        id: 'f-bot-solo', menu: '(automático)', titulo: 'Lo que el bot hace por su cuenta',
        que: 'Todo esto funciona sin que toques nada, una vez conectado tu WhatsApp.',
        hace: [
          'Conversar en lenguaje natural las 24 horas, entender audios y mandar fotos de tus productos.',
          'Ofrecer solo horarios libres de verdad, agendar y cobrar (seña o total) con link de MercadoPago o por transferencia con tu alias o CBU.',
          'Mandar recordatorios 24 horas, 4 horas y 30 minutos antes del turno, y pedir seña a quien falta seguido.',
          'Recordar el historial de cada cliente entre conversaciones.',
          'Responder fuera de horario aclarando cuándo abrís, y derivarte las consultas que no sabe responder (te avisa por WhatsApp).',
          'Responder por audio (opcional, con RIME AI, según tu plan).',
        ],
      },
    ],
  },
  {
    id: 'g-negocio',
    titulo: 'Tu negocio y la cuenta',
    icono: '⚙️',
    items: [
      {
        id: 'f-equipo', menu: 'Equipo', titulo: 'Equipo (perfiles con PIN)',
        que: 'Cada empleado entra con su PIN y ve solo lo que le corresponde.',
        hace: [
          'Elegir tu PIN de dueño (4 a 8 números) para activar los perfiles y agregar a cada persona con su rol y su PIN.',
          'Empleado: atiende chats, clientes, agenda, pedidos y ventas, pero no ve la plata. Encargado: maneja el negocio pero no la configuración.',
          'Cambiar de persona desde el nombre que aparece abajo a la izquierda, y desactivar los perfiles cuando quieras.',
        ],
        nota: 'Los perfiles evitan accesos accidentales en la misma computadora. Para una separación más fuerte, cada persona debería tener su propio usuario del sistema.',
      },
      {
        id: 'f-integraciones', menu: 'Integraciones', titulo: 'Integraciones',
        que: 'Conectar Akira con otras herramientas, opcional y apagado por defecto.',
        hace: [
          'Webhooks firmados (HMAC-SHA256) hacia Zapier, Make o n8n: avisan una venta registrada, un pedido pagado, un turno confirmado, un movimiento de caja o un comprobante creado.',
          'Planillas siempre actualizadas (Caja, Clientes, Productos y Servicios) en una carpeta que se sincronice con Google Drive, OneDrive o Dropbox.',
        ],
        nota: 'Los webhooks solo informan hacia afuera: nadie puede mandarle órdenes a tu Akira desde internet.',
      },
      {
        id: 'f-respaldo', menu: 'Respaldo', titulo: 'Respaldo',
        que: 'Una copia cifrada de tus datos, para recuperarlos si se rompe el disco o cambiás de computadora.',
        hace: [
          'Elegir una carpeta (mejor una sincronizada con Drive u OneDrive) y una contraseña que solo sabés vos.',
          'Con la app abierta hace una copia por día (conserva las últimas 10) y podés tocar “Respaldar ahora”.',
          'Restaurar desde un archivo, incluso en una PC nueva, con la misma contraseña. Después volvés a cargar tus claves y vinculás WhatsApp con el QR.',
        ],
        nota: 'Si se pierde la contraseña, el respaldo no se puede abrir: anotala en un lugar seguro.',
      },
      {
        id: 'f-config', menu: 'Config', titulo: 'Config',
        que: 'Todo lo que le enseñás a tu Akira sobre tu negocio.',
        hace: [
          'Datos del negocio: tipo (Turnos / Citas, Alojamiento o Servicios), tu nombre, nombre del negocio, servicios, precio por hora, horas mínimas para cancelar e instrucciones extra para la IA (hasta 2000 caracteres). También podés empezar con una plantilla de tu rubro.',
          '🔔 Avisos al celular: el número de WhatsApp donde te avisa de cada turno y te manda el resumen del día.',
          'Groq (IA, obligatoria): tu clave gratuita de console.groq.com.',
          'Pagos: MercadoPago (Access Token) o transferencia con alias y CBU. Calendario: Google Calendar, opcional. Audio: RIME AI, opcional.',
          'Horarios de atención por día (con horarios cortados si cerrás al mediodía) y Disponibilidad: modo pausa y días bloqueados (feriados, vacaciones).',
        ],
        nota: 'Algunas funciones (MercadoPago, Google Calendar, audios) dependen de tu plan. Las claves se guardan cifradas con el almacén de claves de tu sistema.',
      },
      {
        id: 'f-app', menu: 'App', titulo: 'App (descarga y actualizaciones)',
        que: 'Cómo instalar Akira en otra computadora y mantenerla al día.',
        hace: [
          'Descargar el programa para Windows, o la versión de prueba para Mac, y ver los pasos de instalación.',
          'Abajo a la izquierda, “Buscar actualización” revisa si hay una versión nueva. En Windows se actualiza sola; en Mac, instalás el archivo nuevo.',
          'Instalar también la app del celular: en Android, una app nativa (archivo .apk) que se baja desde ahí; en iPhone, la versión web que se agrega a la pantalla de inicio. Es un control remoto del bot.',
        ],
      },
      {
        id: 'f-ayuda', menu: 'Ayuda', titulo: 'Ayuda',
        que: 'El Centro de ayuda dentro de la app: respuestas cortas, con los pasos y dónde tocar.',
        hace: [
          'Buscar por lo que querés hacer (“cobrar una seña”, “cerrar la caja”) y abrir el artículo.',
          'Si no encontrás nada, escribir a soporte desde ahí.',
        ],
      },
      {
        id: 'f-planes', menu: 'Planes', titulo: 'Planes',
        que: 'Tu plan, cuánto usaste y cómo cambiarlo.',
        hace: [
          'Comparar los planes (Trial, Básico, Pro y Agencia) con lo que incluye cada uno.',
          'Cambiar de plan y pagar mensual o anual (con descuento por pagar el año completo).',
          'Si te invitaron con un código de referido, el descuento se aplica en tu primer plan pago.',
        ],
      },
      {
        id: 'f-ideas', menu: 'Ideas', titulo: 'Ideas',
        que: 'Tu canal directo con el equipo: contanos qué te gustaría que Akira haga.',
        hace: [
          'Enviar sugerencias y ver las respuestas del equipo.',
          'Las mejores ideas se implementan.',
        ],
      },
    ],
  },
];
