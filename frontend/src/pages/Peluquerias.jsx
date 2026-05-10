import { Calendar, CreditCard, Bell, Bot, Users, Shield } from 'lucide-react';
import VerticalNicho from '../components/VerticalNicho';

export default function Peluquerias() {
  return (
    <VerticalNicho
      nicho="peluquerías"
      nichoUpper="Peluquerías y barberías"
      nichoSingular="peluquería"
      emoji="💇"
      slug="peluquerias"
      title="Bot de WhatsApp para peluquerías y barberías | Akira Cloud Argentina"
      description="Akira Cloud es el bot de WhatsApp con IA para peluquerías, barberías y salones de belleza en Argentina. Agenda turnos automáticamente, cobra con MercadoPago y reduce el 'no-show' con recordatorios. Probá gratis 100 mensajes."
      keywords="bot whatsapp peluqueria, agenda turnos peluqueria, sistema reservas barberia, bot whatsapp barberia argentina, automatizar turnos peluqueria, software gestion peluqueria, agenda online peluqueria, app turnos peluqueria, reservas online barberia, chatbot salon de belleza, asistente whatsapp peluqueria"
      hero={{
        eyebrow: 'Para peluquerías y barberías',
        h1: 'Tu peluquería atendiendo turnos sola por WhatsApp',
        sub: 'Akira Cloud entiende a tus clientes, ofrece horarios libres en tiempo real, cobra la seña con MercadoPago y manda recordatorios. Vos atendés, no respondés mensajes.',
      }}
      beneficios={[
        { Icon: Calendar, titulo: 'Agenda turnos sin pisarse', desc: 'El bot lee tu Google Calendar y solo ofrece horarios reales. Cero choques entre clientes.' },
        { Icon: CreditCard, titulo: 'Cobra la seña al confirmar', desc: 'Link de pago de MercadoPago automático. El turno se confirma cuando paga, no antes.' },
        { Icon: Bell, titulo: 'Reduce el no-show', desc: 'Recordatorios automáticos 24h, 4h y 30min antes. Tus clientes no se olvidan más.' },
        { Icon: Users, titulo: 'CRM de clientes integrado', desc: 'Cada cliente queda guardado: nombre, teléfono, historial de visitas y servicios.' },
        { Icon: Bot, titulo: 'Conversación natural con IA', desc: 'Tu cliente no se da cuenta que es un bot. Entiende slang, audios y mensajes confusos.' },
        { Icon: Shield, titulo: 'Funciona 24/7 sin descanso', desc: 'Atiende mientras corte pelo, mientras dormís, mientras estás de vacaciones.' },
      ]}
      casosDeUso={[
        'Pedir turno para corte, color, mechas o cualquier servicio que ofrezcas.',
        'Consultar precios actualizados sin que tengas que responder cada vez.',
        'Reagendar o cancelar un turno sin que tengas que mover nada vos.',
        'Pagar la seña al instante con MercadoPago — confirmás solo si pagó.',
        'Recibir recordatorios automáticos para no olvidarse del turno.',
        'Avisar si llega tarde — el bot te notifica para que reorganices.',
      ]}
      testimonio={{
        texto: 'Antes perdía 1 de cada 3 turnos por gente que no avisaba. Con Akira los recordatorios bajaron eso a casi cero. Y ya no atiendo WhatsApp mientras corto pelo.',
        autor: 'Caso de uso típico',
        rol: 'Peluquería con 2 sillones — Buenos Aires',
      }}
      faq={[
        {
          q: '¿Cómo agenda turnos el bot en mi peluquería?',
          a: 'Akira se conecta a tu Google Calendar. Cuando un cliente escribe pidiendo un turno, el bot consulta los horarios libres en tiempo real, ofrece opciones, y cuando el cliente elige, genera un link de pago de MercadoPago para la seña. Al recibir el pago crea el evento en tu calendario y manda recordatorios automáticos 24h, 4h y 30min antes.',
        },
        {
          q: '¿Qué pasa si el cliente quiere cancelar o reagendar?',
          a: 'El bot maneja cancelaciones y reagendamientos automáticamente. Vos definís cuántas horas antes se puede cancelar (por defecto 24hs). Si el cliente quiere mover el turno, el bot le ofrece nuevos horarios libres y lo reagenda solo, sin que tengas que intervenir.',
        },
        {
          q: '¿Tengo que tener WhatsApp Business?',
          a: 'Sí. Akira se conecta vía WhatsApp Business escaneando un QR (igual que WhatsApp Web). Tu número de WhatsApp Business sigue funcionando normal — el bot solo responde los mensajes nuevos, vos podés intervenir en cualquier momento.',
        },
        {
          q: '¿Cuánto cuesta para una peluquería?',
          a: 'Hay un trial gratuito de 100 mensajes sin tarjeta. El plan Básico arranca en $15.000 ARS/mes (500 mensajes). El plan Pro tiene mensajes ilimitados, cobros con MercadoPago y respuesta por audio — ideal para peluquerías con flujo alto.',
        },
        {
          q: '¿Puedo bloquear días de vacaciones o feriados?',
          a: 'Sí, desde el panel marcás los días bloqueados y el bot deja de ofrecer turnos esos días. También tenés un "modo pausa" que silencia el bot completamente cuando te vas de vacaciones.',
        },
        {
          q: '¿Puedo configurar diferentes precios para cada servicio?',
          a: 'Sí. Definís tu lista de servicios con precios y duración (corte, color, mechas, peinado, etc.) y el bot los muestra al cliente cuando pregunta. Cada servicio puede tener un precio distinto y un tiempo distinto.',
        },
      ]}
    />
  );
}
