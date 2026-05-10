import { Calendar, CreditCard, Bell, Bot, Users, Shield } from 'lucide-react';
import VerticalNicho from '../components/VerticalNicho';

export default function Alquileres() {
  return (
    <VerticalNicho
      nicho="alquileres turísticos"
      nichoUpper="Alquileres turísticos y hospedajes"
      nichoSingular="alquiler"
      emoji="🏡"
      slug="alquileres"
      title="Bot de WhatsApp para alquileres turísticos y AirBnb | Akira Cloud Argentina"
      description="Akira Cloud es el asistente de WhatsApp con IA para alquileres turísticos, AirBnb, cabañas, hospedajes y casas de campo en Argentina. Cotiza estadías, cobra señas con MercadoPago y atiende consultas 24/7."
      keywords="bot whatsapp alquiler turistico, bot whatsapp airbnb, agenda reservas cabañas, sistema reservas hospedaje, bot whatsapp casa campo, software gestion alojamiento, bot reservas hostel, asistente whatsapp turismo, chatbot alquiler temporario, bot whatsapp posada"
      hero={{
        eyebrow: 'Para alquileres turísticos y AirBnb',
        h1: 'Tu alquiler turístico cotizando y reservando por WhatsApp solo',
        sub: 'Akira Cloud cotiza estadías según fechas y cantidad de personas, cobra la seña con MercadoPago, manda check-in instructions y libera tu tiempo. Pensado para AirBnb, cabañas, casas de campo, posadas y hospedajes.',
      }}
      beneficios={[
        { Icon: Calendar, titulo: 'Disponibilidad por fechas reales', desc: 'El bot conoce tus reservas y solo cotiza fechas libres. Cero overbookings.' },
        { Icon: CreditCard, titulo: 'Cobra la seña al confirmar', desc: 'Link de MercadoPago automático. La reserva se confirma cuando paga, no antes.' },
        { Icon: Bot, titulo: 'Cotiza por noches y personas', desc: 'Configurás precios por noche y persona. El bot calcula el total de la estadía solo.' },
        { Icon: Bell, titulo: 'Check-in y check-out automático', desc: 'Manda instrucciones de llegada antes del check-in y solicita feedback después del check-out.' },
        { Icon: Users, titulo: 'Multi-unidad', desc: 'Si tenés varias cabañas/departamentos, el bot maneja la disponibilidad de cada uno por separado.' },
        { Icon: Shield, titulo: 'Responde en cualquier idioma', desc: 'Para huéspedes extranjeros, el bot puede responder en inglés, portugués u otros idiomas.' },
      ]}
      casosDeUso={[
        'Cotizar una estadía del 15 al 20 de enero para 4 personas.',
        'Ver disponibilidad real sin tener que esperar respuesta tuya.',
        'Pagar la seña con MercadoPago para asegurar la reserva.',
        'Recibir las instrucciones de check-in (dirección, llave, código WiFi).',
        'Consultar reglas de la casa, qué incluye, qué traer.',
        'Avisar la hora de llegada estimada.',
      ]}
      testimonio={{
        texto: 'Tengo 3 cabañas en alquiler y antes me la pasaba contestando "¿está libre tal fin de semana?" todo el día. Con Akira el bot cotiza solo, cobra la seña, y yo solo reviso el calendario para ver quién llega.',
        autor: 'Caso de uso típico',
        rol: 'Alquileres turísticos — Villa General Belgrano',
      }}
      faq={[
        {
          q: '¿Cómo cotiza el bot las estadías?',
          a: 'Configurás el precio por noche (puede variar según la temporada: alta, baja, fin de semana). El bot multiplica las noches por el precio y aplica descuentos si configuraste (ej: 7+ noches con 10% off). El cliente recibe un total claro y un link de pago.',
        },
        {
          q: '¿Puedo manejar varias propiedades?',
          a: 'Sí. Configurás cada unidad (Cabaña 1, Cabaña 2, Departamento centro, etc.) con sus precios y capacidad. El bot maneja la disponibilidad de cada una por separado. En el plan Agencia podés tener hasta 5 cuentas de WhatsApp distintas.',
        },
        {
          q: '¿Funciona para AirBnb?',
          a: 'Akira no se conecta directamente a AirBnb (Airbnb no permite integraciones de bots), pero podés sincronizar tu calendario de AirBnb con Google Calendar (función "Calendar Sync" de AirBnb) y Akira lee Google Calendar. Así, si AirBnb confirma una reserva, automáticamente esas fechas quedan bloqueadas para Akira.',
        },
        {
          q: '¿Qué pasa con las cancelaciones?',
          a: 'Configurás tu política de cancelación (ej: hasta 7 días antes se devuelve el 100%, hasta 48hs el 50%, después nada). El bot informa esto al cliente al cotizar y maneja las cancelaciones según las reglas que pusiste.',
        },
        {
          q: '¿Puede mandar las instrucciones de check-in automáticamente?',
          a: 'Sí. El día de llegada (o las horas que vos elijas antes), el bot manda al huésped: dirección exacta, cómo llegar, ubicación de la llave/código de cerradura, WiFi, reglas de la casa. Vos no tenés que estar pendiente.',
        },
        {
          q: '¿Cobra la estadía completa o solo seña?',
          a: 'Vos decidís. Podés configurar para cobrar el 30%, 50% o 100% como seña inicial, y el resto al check-in (o también con MercadoPago). El bot maneja ambos cobros.',
        },
      ]}
    />
  );
}
