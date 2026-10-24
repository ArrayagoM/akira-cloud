// services/email.novedades.js
// Emails de campaña (novedades del programa). Todos usan la plantilla única de services/email.plantilla.js.
// Regla de contenido: cada punto describe algo que EXISTE hoy en la app o en el servidor; lo que todavía es de prueba se dice como de prueba,
// y el tamaño y la versión del instalador salen de la misma configuración que usa la web (nada escrito a mano).
'use strict';

const jwt = require('jsonwebtoken');
const P = require('./email.plantilla');
const { escapar } = P;

// Lo que se promete como "próximamente" en el aviso de instalador (campaña vieja, ya enviada).
const PROXIMAMENTE = [
  ['Conectar Google Calendar desde la app', 'Vincular tu calendario con un clic, sin pasos técnicos.'],
  ['Mejoras cada semana', 'La app se actualiza sola: sin volver a descargar nada.'],
  ['Versión para Linux', 'Para quienes trabajan con Linux.'],
];

function urlBaja(userId) {
  // Token firmado, sin vencimiento: la baja debe funcionar aunque el email sea viejo.
  const t = jwt.sign({ id: String(userId), p: 'baja-novedades' }, process.env.JWT_SECRET);
  return `${P.front()}/api/auth/baja-novedades?t=${encodeURIComponent(t)}`;
}

const PIE = 'Recibís este email porque tenés una cuenta en Akira Cloud.';
const NOTA_WINDOWS = 'Si Windows muestra “Windows protegió su PC”, tocá <em>Más información</em> y después <em>Ejecutar de todos modos</em>: aparece porque el instalador todavía no tiene firma digital.';
const dato = (version) => [version ? `Versión ${escapar(version)}` : '', 'Windows 10 y 11', P.tamanoInstalador()].filter(Boolean).join(' · ');

// ─────────────────────────────────────────────────────────────
// Campaña "instalador" (ya enviada el 6/10): avisa que el programa se instala en la PC.
// ─────────────────────────────────────────────────────────────
function asuntoNovedades() { return 'Akira ya se instala en tu PC: descargalo en 3 minutos'; }
function htmlNovedades({ nombre, userId, urlDescarga, version }) {
  const descarga = urlDescarga || P.enlaceDescarga('email-instalador');
  const guia = `${P.front()}/descargar`;
  return P.marco({
    titulo: 'Akira ya se instala en tu PC', pie: PIE, enlaceBaja: userId ? urlBaja(userId) : '',
    cuerpo: `${P.saludo(nombre)}
      ${P.parrafo(`Tenemos una novedad importante: ${P.fuerte('Akira ya se instala en tu computadora')}. Tu bot de WhatsApp corre en tu PC y tus conversaciones quedan con vos.`)}
      ${P.aviso('Sabemos que en estos días hubo fallos y demoras, y te pedimos disculpas: no es la experiencia que queremos darte. Seguimos trabajando todos los días.')}
      ${P.boton(descarga, 'Descargar Akira para Windows', dato(version))}
      ${P.titulo2('Listo en 3 pasos')}
      ${P.pasos([['Instalalo', 'Abrí el archivo y esperá a que termine. No hay que configurar nada.'], ['Ingresá con tu cuenta', 'Usá la misma cuenta que ya tenés en Akira.'], ['Escaneá el QR', 'Tocá “Iniciar bot” y vinculá tu WhatsApp desde el celular.']])}
      ${P.parrafo(`${NOTA_WINDOWS} Guía completa: <a href="${guia}" style="color:#00e87b">${guia.replace(/^https?:\/\//, '')}</a>`, { color: '#7a7a7a', tam: 12.5 })}
      ${P.titulo2('Lo que viene')}
      ${P.listaNovedades(PROXIMAMENTE)}
      ${P.parrafo('¿Dudas o algo no te funciona? Respondé este email y te ayudamos.', { margen: '22px 0 16px' })}`,
  });
}

// ─────────────────────────────────────────────────────────────
// Campañas de novedades: mismo armado, distinto contenido.
// ─────────────────────────────────────────────────────────────
function armarActualizacion({ nombre, userId, urlDescarga, version, reactivado }, { novedades, enCamino, intro, avisoReactivado, origen, instalar }) {
  const descarga = urlDescarga || P.enlaceDescarga(origen || 'email');
  const guia = `${P.front()}/descargar`;
  return P.marco({
    titulo: 'Novedades de Akira', pie: PIE, enlaceBaja: userId ? urlBaja(userId) : '',
    cuerpo: `${P.saludo(nombre)}
      ${P.parrafo(`${escapar(intro)} Esto es lo nuevo hasta la versión ${escapar(version || '')}:`)}
      ${reactivado && avisoReactivado ? P.aviso(avisoReactivado) : ''}
      ${P.listaNovedades(novedades)}
      ${P.aviso(`${P.fuerte('Tus datos siguen siendo tuyos.')} La información de gestión (clientes, caja, deudas, proveedores y documentos) se guarda en tu propia computadora y no pasa por nuestros servidores. La única excepción son los contadores del día, y solo si activás ver tu negocio desde el celular.`)}
      ${P.titulo2('Cómo actualizar')}
      ${P.parrafo(`Si ya tenés Akira instalada, ${P.fuerte('se actualiza sola')}: vas a ver un aviso dentro de la app para reiniciar con la versión nueva (o tocá “Buscar actualización” en el menú lateral). Si todavía no la instalaste, podés descargarla acá:`, { tam: 13.5 })}
      ${P.boton(descarga, 'Descargar Akira para Windows', `${dato(version)} · <a href="${guia}" style="color:#00e87b;text-decoration:none">guía de instalación</a>`)}
      ${instalar ? P.parrafo(NOTA_WINDOWS, { color: '#7a7a7a', tam: 12.5, margen: '0 0 6px' }) : ''}
      ${enCamino && enCamino.length ? `${P.titulo2('En camino')}${P.listaNovedades(enCamino)}` : ''}
      ${P.parrafo('¿Dudas o sugerencias? Respondé este email y las vemos. Gracias por acompañarnos.', { margen: '22px 0 6px', tam: 13.5 })}
      ${P.parrafo('El equipo de Akira', { color: '#8a8a8a', tam: 13.5, margen: '0 0 20px' })}`,
  });
}

// ─────────────────────────────────────────────────────────────
// Campaña "actualización" (7/10, ya enviada): novedades de gestión del negocio.
// ─────────────────────────────────────────────────────────────
const NOVEDADES_GESTION = [
  ['Catálogo con importación', 'Cargá tus productos y servicios a mano o importalos desde Excel, CSV, PDF o una foto de tu lista de precios. Tu bot los usa al instante para cotizar y agendar.'],
  ['Caja', 'Ingresos, gastos y resultado de cada mes en una sola pantalla. Los turnos cobrados suman solos y podés exportar todo a Excel o PDF para tu contador.'],
  ['Deudores', 'Quién te debe y desde hace cuánto. Registrá pagos a cuenta y enviá recordatorios por WhatsApp: siempre los revisás y confirmás vos antes de que se envíen.'],
  ['Proveedores', 'Llevá la cuenta de tus compras a crédito y pagos, y cuánto le comprás a cada proveedor por mes.'],
  ['Documentos', 'Los comprobantes y facturas que te mandan tus clientes por WhatsApp se guardan en tu PC. El bot confirma la recepción y vos los registrás en la Caja con un clic.'],
  ['Actualización en un clic y mayor estabilidad', 'La app avisa cuando hay una versión nueva y se actualiza desde el mismo aviso. Además, mejoramos la velocidad y la estabilidad de las respuestas del bot.'],
];
const EN_CAMINO = [
  ['Reportes', 'Servicios más pedidos, clientes frecuentes y ausencias.'],
  ['Importar clientes desde Excel', 'Para traer tu agenda de contactos de una sola vez.'],
  ['Instalador con firma digital', 'Para que Windows no muestre el aviso de “editor desconocido”.'],
  ['Versión para Linux', 'Para quienes trabajan con ese sistema.'],
];


function asuntoActualizacion() { return 'Novedades de Akira: Caja, Deudores, Proveedores y más'; }
function htmlActualizacion(datos) {
  return armarActualizacion(datos, { novedades: NOVEDADES_GESTION, enCamino: EN_CAMINO, origen: 'email-gestion', intro: 'Seguimos mejorando Akira. Sumamos herramientas para llevar la gestión de tu negocio desde el mismo programa donde atiende tu bot.' });
}

// ─────────────────────────────────────────────────────────────
// Campaña "actualización 2" (7/10, ya enviada): lo que se sumó entre las versiones 1.0.17 y 1.0.24.
// ─────────────────────────────────────────────────────────────
const NOVEDADES_2 = [
  ['Clientes', 'Importá tu agenda desde Excel, mirá la ficha completa de cada cliente, armá grupos, avisá cumpleaños, controlá ausencias y premiá a los habituales ("a la décima visita, una gratis"). Los mensajes a grupos tienen tope diario y baja voluntaria.'],
  ['Plantillas por rubro y conocimiento propio', 'Arrancá con servicios y respuestas ya armados para tu tipo de negocio y cargá un PDF con tus preguntas frecuentes para que el bot conteste con tu información.'],
  ['Pedidos con carrito y pago', 'Tus clientes arman el pedido por WhatsApp, reciben el total con el link de pago y el stock se descuenta solo. El catálogo ahora admite fotos.'],
  ['Ventas de mostrador y señas por servicio', 'Registrá ventas rápidas (con lector de código de barras) y definí cuánta seña pide cada servicio, en porcentaje o monto fijo.'],
  ['Caja más completa', 'Cierre de caja diario, gastos fijos con aviso de vencimiento, metas del mes y reportes: servicios más pedidos, clientes que más vienen, horas pico, ausencias y evolución mensual.'],
  ['Presupuestos y recibos en PDF', 'Con tu logo, enviados por WhatsApp. Cuando el cliente paga, el recibo se arma solo y el cobro entra a la Caja. Son comprobantes comunes, no facturas fiscales. También hay conciliación con MercadoPago.'],
  ['Equipo y sucursales', 'Perfiles con PIN para que cada persona vea solo lo que le corresponde, profesionales con comisiones y liquidación, y sucursales para separar la plata y los turnos por local.'],
  ['Seguridad y avisos', 'Respaldo cifrado con restauración en otra PC, resumen del día por WhatsApp y alertas por email y notificación de Windows si el bot se desconecta.'],
  ['Integraciones y ayuda', 'Webhooks para conectar con Zapier, Make o n8n, planillas siempre actualizadas en una carpeta de Google Drive, OneDrive o Dropbox, y un centro de ayuda dentro de la app.'],
];
const EN_CAMINO_2 = [
  ['App de celular para monitorear', 'Estado del bot y resumen del día desde el teléfono. El bot y tus datos siguen en la PC.'],
  ['Instalador con firma digital', 'Para que Windows no muestre el aviso de “editor desconocido”.'],
];

function asuntoActualizacion2() { return 'Novedades de Akira: clientes, pedidos, presupuestos, equipo y más'; }
function htmlActualizacion2(datos) {
  return armarActualizacion(datos, { novedades: NOVEDADES_2, enCamino: EN_CAMINO_2, origen: 'email-gestion2', intro: 'Desde el último aviso sumamos muchas herramientas nuevas para atender y manejar tu negocio desde el mismo programa.' });
}

// ─────────────────────────────────────────────────────────────
// Campaña "actualización 4" (la vigente): todo lo que se sumó desde la versión 1.0.24 hasta la 1.0.31, que es lo último que recibieron.
// Cada punto se verificó contra el programa. Los precios no se mencionan: están en la pantalla Planes.
// A quien se le devolvió la prueba (user.trialReactivado) se le suma un aviso destacado arriba.
// ─────────────────────────────────────────────────────────────
const NOVEDADES_4 = [
  ['Verificación de comprobantes de transferencia', 'Cuando un cliente te manda la captura o el PDF de una transferencia, Akira lee el comprobante y controla que el monto, el destinatario, la fecha y el número de operación coincidan con lo que ese cliente debe. Te avisa el resultado por WhatsApp y lo ves en Documentos. La lectura se hace en tu PC. Una captura se puede falsificar, así que dar el pago por recibido sigue siendo decisión tuya.'],
  ['Tu negocio en el celular, casi en vivo', 'Si activás “Ver tu negocio desde el celular”, el resumen del día se actualiza solo cada pocos segundos mientras lo mirás desde la web o el celular. Se envían únicamente contadores del día, y solo si lo activás.'],
  ['Prueba gratis por uso, no por calendario', 'Los 7 días de prueba se gastan solo los días en que el bot atiende al menos un mensaje. Si te registraste y todavía no la probaste, no se te vence. Tiene un tope de 60 días desde el alta y de 100 mensajes.'],
  ['Marketing con IA', 'Borradores con los datos reales de tu negocio: publicaciones para redes, promociones, respuestas a reseñas, un plan semanal y mensajes para tus clientes. Usa tu propia clave de Groq (gratis) y nada se publica ni se envía solo.'],
  ['Menos cortes y una actualización que no se traba', 'Corregimos el aviso “Tu sesión venció” que aparecía de más y la actualización que se quedaba en “Reiniciando”.'],
  ['Mac y Android (versiones de prueba)', 'Hay una versión de prueba para Mac, una app de prueba para Android y la web instalable /celular para ver el estado del bot desde el teléfono.'],
];
const EN_CAMINO_4 = [
  ['Instalador con firma digital', 'Para que Windows no muestre el aviso de “editor desconocido”.'],
];
function asuntoActualizacion4() { return 'Novedades de Akira: comprobantes de transferencia, tu negocio en el celular y más'; }
function htmlActualizacion4(datos) {
  return armarActualizacion(datos, { novedades: NOVEDADES_4, enCamino: EN_CAMINO_4, origen: 'email-actualizacion4', instalar: true,
    intro: 'Desde el último aviso mejoramos Akira en varios frentes.',
    avisoReactivado: `${P.fuerte('Te devolvimos tu prueba gratis.')} Vimos que se te había vencido sin que llegaras a usar Akira. Ahora son 7 días de uso: solo se gastan los días en que el bot atiende mensajes. Abrí la app, conectá tu WhatsApp y empezá cuando quieras.` });
}

// Campañas de email disponibles. La clave se guarda en cada usuario (novedadesEnviadas)
// para no repetir el envío. Para una campaña nueva: agregar una entrada acá.
const CAMPANAS = {
  'instalador-1.0.0': { asunto: asuntoNovedades, html: htmlNovedades },
  'actualizacion-2026-10': { asunto: asuntoActualizacion, html: htmlActualizacion },
  'actualizacion-2026-10b': { asunto: asuntoActualizacion2, html: htmlActualizacion2 },
  'actualizacion-2026-10d': { asunto: asuntoActualizacion4, html: htmlActualizacion4 },
};

// Encabezado para que Gmail y Outlook muestren su propio botón "Cancelar suscripción".
const cabecerasBaja = (userId) => (userId ? { 'List-Unsubscribe': `<${urlBaja(userId)}>` } : undefined);

module.exports = { htmlNovedades, asuntoNovedades, htmlActualizacion, asuntoActualizacion, CAMPANAS, urlBaja, cabecerasBaja, PROXIMAMENTE };
