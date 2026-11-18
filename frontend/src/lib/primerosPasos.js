// lib/primerosPasos.js
// Guía única de primeros pasos (reemplaza a las dos que había: "OnboardingChecklist" y "PrimerosPasos"). Orden real de la app:
// cuenta, clave de IA, datos del negocio, vincular WhatsApp (el bot corre en la PC), probar. Funciones puras: probadas en
// desktop/tests/primeros-pasos.test.js.

export const CLAVE_OCULTO = 'akira_primeros_pasos_oculto';
// Clave que usaba la guía anterior (OnboardingChecklist). Se sigue respetando: quien ya la había ocultado no la vuelve a ver.
export const CLAVE_OCULTO_ANTERIOR = 'akira_onboarding_dismissed';
export const CLAVE_PROBADO = 'akira_primeros_pasos_probado';

// `leer(clave)` devuelve true si esa clave guardada vale '1'.
export const estaOculta = (leer) => !!(leer(CLAVE_OCULTO) || leer(CLAVE_OCULTO_ANTERIOR));

// Interpreta la respuesta de GET /config (o null si falló).
export function datosDeConfig(cfg) {
  const c = cfg?.config || {};
  return {
    groq: !!cfg?.keys?.groq,
    negocio: !!c.negocio && ((c.serviciosList || []).length > 0 || !!c.servicios),
    celular: String(c.celularNotificaciones || '').replace(/\D/g, '').length >= 10,
  };
}

// escritorio=true: la app de la PC (donde corre el bot). escritorio=false: la web en el navegador, donde no se puede iniciar el
// bot: el primer paso real es instalar Akira en la PC.
export function armarPasos({ escritorio, datos = {}, botConectado = false, probado = false }) {
  const cuenta = { id: 'cuenta', hecho: true, titulo: 'Cuenta creada', detalle: '' };
  if (!escritorio) {
    return [
      cuenta,
      { id: 'instalar', hecho: false, titulo: 'Instalá Akira en tu PC', detalle: 'El bot de WhatsApp y los datos de tu negocio viven en tu computadora con Windows. Descargala, instalala e iniciá sesión con esta misma cuenta.', ir: '/descargar', cta: 'Ver cómo instalarla' },
    ];
  }
  return [
    cuenta,
    { id: 'groq', hecho: !!datos.groq, titulo: 'Cargá tu clave de IA (Groq, gratis)', detalle: 'Es la inteligencia artificial que usa el bot: sin la clave no puede responder. Creás la cuenta en groq.com y pegás la clave.', ir: '/config', cta: 'Ir a Config' },
    { id: 'negocio', hecho: !!datos.negocio, titulo: 'Contale a Akira de tu negocio', detalle: 'Nombre, servicios, precios y horarios: con eso responde y agenda. Podés arrancar con una plantilla de tu rubro.', ir: '/config', cta: 'Completar', extra: 'plantilla' },
    { id: 'wa', hecho: !!botConectado, titulo: 'Vinculá tu WhatsApp con el QR', detalle: 'Tocá "Iniciar bot" en esta pantalla, esperá el QR y escanealo desde WhatsApp → Dispositivos vinculados → Vincular.', ir: null },
    { id: 'prueba', hecho: !!probado, titulo: 'Probalo escribiéndole desde otro celular', detalle: 'Pedí un turno como si fueras un cliente. Cuando lo hayas probado, marcalo.', ir: null, marcar: true },
    { id: 'celular', hecho: !!datos.celular, opcional: true, titulo: 'Cargá tu celular para los avisos', detalle: 'Ahí te avisa cuando se agenda un turno, y te manda el resumen del día si lo activás.', ir: '/config#avisos-celular', cta: 'Cargar celular' },
  ];
}

// Los pasos opcionales no cuentan para dar la guía por completa.
export function resumenPasos(pasos) {
  const obligatorios = pasos.filter((p) => !p.opcional);
  const hechos = obligatorios.filter((p) => p.hecho).length;
  return {
    hechos,
    total: obligatorios.length,
    completo: obligatorios.every((p) => p.hecho),
    proximo: pasos.find((p) => !p.hecho && !p.opcional) || null,
  };
}
