# serie_funciones.py — guiones de la serie "una pantalla, un video" (uno por cada funcionalidad del programa).
# Regla de contenido: cada frase dice solo lo que el programa hace HOY (fuente: frontend/src/data/funciones.js). Nada inventado.
# Los datos que se ven en pantalla son de un negocio ficticio ("Aurora Estudio"): lo aclara cada descripción.
#
#   python serie_funciones.py            → escribe specs/f-<id>.json (un guion por pantalla)
#   python hacer_serie.py                → arma todos los videos (voz + cuadros) y los deja en salidas/
import json, os

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, 'specs'); os.makedirs(SALIDA, exist_ok=True)
CTA = 'Probalo gratis en akiracloud punto lat.'
NOTA = 'Los datos que se ven son de un negocio de ejemplo. '
PIE = 'Probalo gratis, 7 días de uso y sin tarjeta: akiracloud.lat'

# id, captura(s), titulo de ventana, titular (2 líneas), frases (4), descripción para la publicación, hashtags
V = [
 ('dashboard', ['dashboard'], 'Dashboard', ['¿Tu bot está atendiendo', 'ahora mismo?'],
  ['¿Sabés si tu bot está atendiendo ahora mismo?', 'En el Dashboard ves los mensajes, las reservas y los cobros del día.', 'Una lista en vivo te muestra todo lo que el bot va haciendo.', 'Y si querés atender vos un rato, activás el modo pausa.'],
  'El Dashboard de Akira Cloud: prendés el bot, ves los números del día y lo que hace en vivo, y lo pausás cuando querés atender vos.', ['#whatsappbusiness', '#emprendedores', '#argentina']),
 ('agenda', ['agenda'], 'Agenda', ['Tus turnos del día,', 'sin dobles reservas'],
  ['¿Seguís anotando los turnos en un cuaderno?', 'La Agenda muestra cada día, separando los confirmados de los que esperan el pago.', 'Asignás quién atiende cada turno y filtrás por profesional.', 'Y el bot nunca ofrece dos turnos superpuestos.'],
  'La Agenda de Akira Cloud: turnos confirmados y pendientes de pago por día, con profesional asignado. El bot chequea la disponibilidad real antes de ofrecer un horario.', ['#turnos', '#peluqueria', '#emprendedores']),
 ('clientes', ['clientes'], 'Clientes', ['Todos tus clientes,', 'con su historia'],
  ['¿Te acordás qué se hizo cada cliente la última vez?', 'En Clientes abrís la ficha con sus turnos, lo que debe y los documentos que mandó.', 'Guardás notas que solo ves vos y armás grupos, como los clientes VIP.', 'Y podés escribirle a un grupo: lo revisás antes, y se respeta a quien pide la baja.'],
  'Clientes en Akira Cloud: ficha completa, notas privadas, etiquetas y mensajes a grupos con tope diario y baja voluntaria.', ['#clientes', '#crm', '#emprendedores']),
 ('chats', ['chats'], 'Chats', ['Mirá lo que le responde', 'tu bot a la gente'],
  ['¿Te da curiosidad qué le contesta tu bot a la gente?', 'En Chats leés cada conversación de WhatsApp completa.', 'Si querés atender vos, silenciás ese chat y el bot deja de responder ahí.', 'Y podés bloquear un número para que lo ignore por completo.'],
  'Chats en Akira Cloud: el historial de conversaciones del bot, con opción de silenciar un chat o bloquear un número.', ['#whatsappbusiness', '#chatbot', '#negocios']),
 ('profesionales', ['profesionales'], 'Profesionales', ['Cada profesional,', 'con su comisión'],
  ['¿Cuánto le corresponde a cada empleado este mes?', 'Cargás a cada profesional con su color, su comisión y los servicios que hace.', 'Le asignás los turnos desde la Agenda.', 'Y ves la liquidación del período, lista para exportar.'],
  'Profesionales en Akira Cloud: agenda propia, porcentaje de comisión y liquidación del período para cada persona.', ['#peluqueria', '#barberia', '#emprendedores']),
 ('vender', ['vender'], 'Vender', ['Ventas de mostrador', 'en dos toques'],
  ['¿Cobrás en el local con una libreta y una calculadora?', 'Armás la venta tocando productos o escaneando el código de barras.', 'Elegís cómo pagó: efectivo, tarjeta, transferencia o Mercado Pago.', 'Se descuenta el stock y el ingreso entra solo a la Caja.'],
  'Vender en Akira Cloud: ventas de mostrador con lector de código de barras, stock que se descuenta y cobro que entra a la Caja.', ['#kiosco', '#comercio', '#emprendedores']),
 ('catalogo', ['catalogo'], 'Catálogo', ['Tus precios cargados,', 'tu bot no inventa'],
  ['¿Tu bot inventa precios? Con Akira no.', 'En el Catálogo cargás tus servicios con precio, duración y seña.', 'Y tus productos con stock, foto y código de barras.', 'Importás tu lista de precios desde Excel, un archivo PDF o hasta una foto.'],
  'El Catálogo de Akira Cloud: el bot responde y agenda siempre con los servicios y productos que cargaste, nunca inventa.', ['#catalogo', '#whatsappbusiness', '#pymes']),
 ('pedidos', ['pedidos'], 'Pedidos', ['Pedidos por WhatsApp,', 'con carrito y pago'],
  ['¿Tus clientes te piden productos por WhatsApp y vos anotás todo a mano?', 'El cliente arma el pedido charlando con el bot.', 'Recibe el total con el link de pago o los datos de transferencia.', 'Y vos seguís cada pedido desde esta pantalla.'],
  'Pedidos en Akira Cloud: el cliente arma el carrito conversando con el bot y recibe el total con el pago. Se activa desde Clientes, en Programas con tus clientes.', ['#ventasonline', '#whatsappbusiness', '#emprendedores']),
 ('caja', ['caja'], 'Caja', ['La plata de tu negocio,', 'mes a mes'],
  ['¿Sabés cuánto ganaste este mes?', 'La Caja suma sola los turnos cobrados, y vos cargás ingresos y gastos.', 'Ves el resultado, los cobros por método de pago y lo que te deben.', 'Cerrás la caja del día y exportás el mes para tu contador.'],
  'La Caja de Akira Cloud: ingresos, gastos y resultado del mes, cierre de caja diario y exportación a Excel o PDF.', ['#finanzas', '#pymes', '#emprendedores']),
 ('reportes', ['reportes'], 'Reportes', ['Decidí con datos,', 'no a ojo'],
  ['¿Cuál es el servicio que más se pide en tu negocio?', 'En Reportes elegís el período y ves los servicios más pedidos y los clientes que más vienen.', 'También las horas pico y las ausencias.', 'Y lo exportás a Excel.'],
  'Reportes en Akira Cloud: servicios más pedidos, clientes frecuentes, horas pico, ausencias y evolución mes a mes.', ['#datos', '#negocios', '#emprendedores']),
 ('sucursales', ['sucursales'], 'Sucursales', ['Más de un local,', 'cada plata en su lugar'],
  ['¿Tenés más de un local y se te mezcla todo?', 'Creás cada sucursal con su dirección.', 'En la Caja elegís una y ves solo lo suyo.', 'Y cada profesional atiende en una sucursal, donde cuentan sus turnos.'],
  'Sucursales en Akira Cloud: la plata y los turnos separados por local. El bot sigue siendo uno solo para todo el negocio.', ['#sucursales', '#pymes', '#negocios']),
 ('presupuestos', ['presupuestos'], 'Presupuestos y recibos', ['Presupuestos con tu logo,', 'listos en un minuto'],
  ['¿Armás los presupuestos a mano y los mandás en una foto?', 'Elegís el cliente, sumás productos o servicios, y sale un PDF con tu logo.', 'Se lo mandás por WhatsApp con un toque.', 'Cuando paga, se genera el recibo y el cobro entra a la Caja. Ojo: no son facturas fiscales.'],
  'Presupuestos y recibos en Akira Cloud: PDF con tu logo, envío por WhatsApp y cobro a la Caja. Son comprobantes comunes, no facturas fiscales.', ['#presupuesto', '#pymes', '#emprendedores']),
 ('deudores', ['deudores'], 'Deudores', ['¿Quién te debe plata?', 'Sin planillas'],
  ['¿Quién te debe plata, y desde cuándo?', 'Cargás la deuda cuando fiás y ves el total a cobrar.', 'Registrás los pagos a cuenta, y suman a la Caja.', 'Y mandás un recordatorio por WhatsApp: lo revisás antes de enviarlo.'],
  'Deudores en Akira Cloud: quién te debe y cuánto, pagos a cuenta y recordatorios por WhatsApp que vos revisás antes de enviar.', ['#cobranzas', '#pymes', '#emprendedores']),
 ('proveedores', ['proveedores'], 'Proveedores', ['¿Cuánto le debés', 'a cada proveedor?'],
  ['¿Sabés cuánto le debés a cada proveedor?', 'Cargás cada proveedor con su CUIT, su rubro y tus notas.', 'Llevás lo que debés y los pagos que hacés, y también aparece en la Caja.', 'Y ves cuánto le comprás a cada uno por mes.'],
  'Proveedores en Akira Cloud: la cuenta de tus compras a crédito y cuánto le comprás a cada proveedor por mes.', ['#proveedores', '#pymes', '#negocios']),
 ('documentos', ['documentos'], 'Documentos', ['Un cliente manda un comprobante.', '¿Es real?'],
  ['Un cliente te manda un comprobante. ¿Cómo sabés si es real?', 'Los archivos que te mandan por WhatsApp quedan guardados solo en tu PC.', 'Akira lee el monto, la fecha y quién pagó, y lo compara con tu cuenta.', 'Una captura se puede falsificar, así que confirmar el pago sigue siendo decisión tuya.'],
  'Documentos en Akira Cloud: los comprobantes y facturas que te mandan por WhatsApp, con lectura y verificación del comprobante de transferencia. Una captura se puede falsificar: confirmá siempre el pago.', ['#transferencias', '#mercadopago', '#emprendedores']),
 ('conocimiento', ['conocimiento'], 'Conocimiento', ['Que tu bot responda', 'con tus palabras'],
  ['¿Tu bot contesta cosas que vos nunca dijiste?', 'En Conocimiento pegás tus preguntas frecuentes, tus políticas y cómo llegar.', 'Podés subir un archivo PDF, un texto o una foto.', 'Y probás una pregunta para ver qué fragmento usaría el bot.'],
  'Conocimiento en Akira Cloud: tus preguntas frecuentes y políticas para que el bot responda con tus palabras en vez de inventar.', ['#chatbot', '#atencionalcliente', '#whatsappbusiness']),
 ('preguntan', ['preguntan'], 'Qué preguntan', ['¿Qué te preguntan', 'tus clientes?'],
  ['¿Qué es lo que más te preguntan tus clientes?', 'En Qué preguntan ves los temas más consultados en los últimos siete, treinta o noventa días.', 'Y las preguntas que el bot no supo responder.', 'Sumás esas respuestas a Conocimiento o al Catálogo, y la próxima vez las contesta solo.'],
  'Qué preguntan en Akira Cloud: los temas más consultados y lo que el bot no supo responder. Se guardan solo las preguntas, sin teléfonos ni mails, y solo en tu PC.', ['#clientes', '#datos', '#whatsappbusiness']),
 ('marketing', ['marketing-equipo', 'marketing-borrador'], 'Marketing con IA', ['¿Qué publicás hoy?', 'Que lo escriba la IA'],
  ['¿Qué publicás hoy en tus redes?', 'Un equipo de especialistas con inteligencia artificial te escribe borradores con tus precios y servicios reales.', 'Publicaciones, promociones, respuestas a reseñas y un plan semanal.', 'Todo es un borrador: nada se publica ni se envía solo.'],
  'Marketing con IA en Akira Cloud: borradores con los datos reales de tu negocio. Nada se publica ni se envía solo. Usa tu propia clave de Groq.', ['#marketingdigital', '#emprendedores', '#ia']),
 ('bot', ['chats', 'dashboard'], 'Tu bot, solo', ['¿Qué hace tu bot', 'cuando vos no estás?'],
  ['¿Qué hace tu bot cuando vos no estás?', 'Conversa en lenguaje natural, entiende audios y manda fotos de tus productos.', 'Ofrece solo horarios libres, agenda y cobra la seña con Mercado Pago o por transferencia.', 'Manda recordatorios antes del turno, y le pide seña a quien falta seguido.'],
  'Lo que el bot de Akira Cloud hace por su cuenta una vez conectado tu WhatsApp: atiende las veinticuatro horas, agenda, cobra y recuerda.', ['#chatbot', '#whatsappbusiness', '#automatizacion']),
 ('equipo', ['equipo'], 'Equipo', ['Cada empleado', 've solo lo suyo'],
  ['¿Querés que todos tus empleados vean la plata del negocio?', 'Con los perfiles y el PIN, cada persona entra y ve solo lo que le corresponde.', 'El empleado atiende chats, agenda y ventas, pero no ve la plata.', 'Y el encargado maneja el negocio, pero no la configuración.'],
  'Equipo en Akira Cloud: perfiles con PIN para dueño, encargado y empleado. Evitan accesos accidentales en la misma computadora.', ['#equipo', '#pymes', '#negocios']),
 ('integraciones', ['integraciones'], 'Integraciones', ['Conectá Akira', 'con tus herramientas'],
  ['¿Usás Zapier, Make o n8n?', 'Akira avisa por webhook una venta, un pedido pagado o un turno confirmado.', 'Y mantiene planillas actualizadas en una carpeta de Drive, OneDrive o Dropbox.', 'Es opcional, viene apagado, y nadie puede mandarle órdenes desde internet.'],
  'Integraciones en Akira Cloud: webhooks firmados hacia Zapier, Make o n8n y planillas siempre actualizadas. Opcional y apagado por defecto.', ['#zapier', '#automatizacion', '#pymes']),
 ('respaldo', ['respaldo'], 'Respaldo', ['Si se rompe la compu,', 'no perdés nada'],
  ['¿Qué pasa con tus datos si se rompe la computadora?', 'Elegís una carpeta y una contraseña que solo sabés vos.', 'Akira hace una copia cifrada por día y conserva las últimas diez.', 'Y la restaurás en otra PC con la misma contraseña.'],
  'Respaldo en Akira Cloud: copia cifrada diaria de tus datos, con restauración en otra computadora. Si perdés la contraseña, el respaldo no se puede abrir.', ['#respaldo', '#seguridad', '#pymes']),
 ('config', ['config'], 'Config', ['Enseñale a tu bot', 'cómo es tu negocio'],
  ['¿Cómo le explicás tu negocio a tu bot?', 'En Config cargás el tipo de negocio, tus servicios y tus horarios de atención.', 'Conectás Mercado Pago o tu alias para cobrar, y el celular donde te avisa de cada turno.', 'Y pausás el bot o bloqueás días por feriados y vacaciones.'],
  'Config en Akira Cloud: datos del negocio, horarios, cobros con Mercado Pago o transferencia y avisos al celular.', ['#configuracion', '#whatsappbusiness', '#emprendedores']),
 ('app', ['app'], 'App', ['Instalalo en', 'otra computadora'],
  ['¿Querés usar Akira en otra computadora?', 'Descargás el programa para Windows, o la versión de prueba para Mac.', 'En Windows se actualiza sola, desde el botón de buscar actualización.', 'Y en el celular tenés un control remoto del bot: app para Android y versión web para iPhone.'],
  'App en Akira Cloud: descarga para Windows, versión de prueba para Mac y control remoto desde el celular (Android y iPhone).', ['#software', '#windows', '#emprendedores']),
 ('planes', ['planes'], 'Planes', ['¿Cuánto sale tener', 'tu propio bot?'],
  ['¿Cuánto sale tener tu propio bot de WhatsApp?', 'Hay cuatro planes: la prueba gratis, Básico, Pro y Agencia.', 'Si pagás el año completo, tenés veinte por ciento de descuento.', 'Los precios están en pesos, y se pagan con Mercado Pago.'],
  'Planes de Akira Cloud: prueba gratis, Básico, Pro y Agencia, con pago mensual o anual en pesos por Mercado Pago. Descuento del 20 % pagando el año completo.', ['#precios', '#whatsappbusiness', '#argentina']),
 ('ayuda', ['ayuda', 'ideas'], 'Ayuda e Ideas', ['¿No sabés cómo', 'hacer algo?'],
  ['¿No sabés cómo hacer algo en el programa?', 'En Ayuda buscás lo que querés hacer, por ejemplo cobrar una seña o cerrar la caja.', 'Y si falta algo, en Ideas nos contás qué te gustaría que Akira haga.', 'Las mejores ideas se implementan.'],
  'Ayuda e Ideas en Akira Cloud: un centro de ayuda dentro del programa y un canal directo con el equipo para proponer mejoras.', ['#soporte', '#software', '#emprendedores']),
]

ESCALAS = [1.15, 1.3, 1.4, 1.3]
for (id_, caps, titulo, titular, frases, desc, tags) in V:
    visuales = []
    for i in range(4):
        archivo = caps[min(len(caps) - 1, 0 if i < 2 else 1)] if len(caps) > 1 else caps[0]
        v = {'tipo': 'ventana', 'archivo': f'../capturas-video/{archivo}.png', 'titulo': titulo, 'escala': 1.0, 'alto': 1100, 'maxh': 1260, 'recorta_menu': False, 'cy': 960}
        if i == 0: v['desde_el_inicio'] = True
        visuales.append(v)
    visuales.append({'tipo': 'cta'})
    spec = {'id': f'f-{id_}', 'titulo': titulo, 'titular': titular, 'frases': frases + [CTA], 'visuales': visuales, 'voz': 'abril', 'tomas': 3,
            'caption': f'{desc} {NOTA}{PIE}', 'hashtags': tags + ['#akiracloud']}
    with open(os.path.join(SALIDA, f'f-{id_}.json'), 'w', encoding='utf-8') as f: json.dump(spec, f, ensure_ascii=False, indent=2)
print(len(V), 'guiones escritos en', SALIDA)
