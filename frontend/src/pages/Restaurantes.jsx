import { Calendar, CreditCard, Bell, Bot, Users, Shield } from 'lucide-react';
import VerticalNicho from '../components/VerticalNicho';

export default function Restaurantes() {
  return (
    <VerticalNicho
      nicho="restaurantes"
      nichoUpper="Restaurantes, bares y cafeterías"
      nichoSingular="restaurante"
      emoji="🍽️"
      slug="restaurantes"
      title="Bot de WhatsApp para restaurantes y reservas de mesa | Akira Cloud Argentina"
      description="Akira Cloud es el bot de WhatsApp ideal para restaurantes, bares y cafeterías en Argentina. Maneja reservas de mesa, pedidos para llevar, consultas de menú y promociones automáticamente."
      keywords="bot whatsapp restaurante, reservas mesa whatsapp, sistema reservas restaurante, bot whatsapp bar, automatizar pedidos restaurante, chatbot restaurante argentina, agenda mesa restaurante, software gestion restaurante, bot whatsapp cafeteria, asistente whatsapp gastronomia"
      hero={{
        eyebrow: 'Para restaurantes y bares',
        h1: 'Tu restaurante recibiendo reservas y pedidos por WhatsApp solo',
        sub: 'Akira Cloud reserva mesas según tu disponibilidad real, toma pedidos para llevar, manda promociones a clientes recurrentes y libera a tu personal para atender lo que importa.',
      }}
      beneficios={[
        { Icon: Calendar, titulo: 'Reserva mesas con disponibilidad real', desc: 'El bot conoce cuántas mesas tenés y para cuántas personas. Solo confirma reservas posibles.' },
        { Icon: CreditCard, titulo: 'Cobra seña en eventos especiales', desc: 'Para fiestas privadas, fechas patrias o reservas grandes, cobrá la seña con MercadoPago.' },
        { Icon: Bell, titulo: 'Recordatorio de reserva', desc: 'Confirmación 24h y 2h antes para reducir reservas que no se presentan.' },
        { Icon: Users, titulo: 'Clientes recurrentes identificados', desc: 'El bot reconoce a tus habitués y los saluda por nombre. Más cercanía, más fidelidad.' },
        { Icon: Bot, titulo: 'Menú y consultas 24/7', desc: 'Horarios, dirección, opciones vegetarianas, precios — todo respondido al instante sin molestar a tus mozos.' },
        { Icon: Shield, titulo: 'Promos automáticas a clientes fieles', desc: 'Mandá descuentos o invitaciones a clientes recurrentes con un click desde el panel.' },
      ]}
      casosDeUso={[
        'Reservar mesa para 4 personas el viernes a las 21:00.',
        'Consultar el menú actualizado y los precios.',
        'Hacer un pedido para llevar (take away) sin llamar.',
        'Pagar la seña de una reserva grande con MercadoPago.',
        'Consultar horarios, dirección, cómo llegar, estacionamiento.',
        'Recibir aviso de promociones especiales (happy hour, eventos).',
      ]}
      testimonio={{
        texto: 'Antes el WhatsApp del restaurante era un caos: 100 mensajes mezclados de reservas, pedidos, consultas. Con Akira las reservas quedan organizadas en mi calendario, y los mozos no se distraen contestando "¿hay mesa?" todo el día.',
        autor: 'Caso de uso típico',
        rol: 'Parrilla de barrio — CABA',
      }}
      faq={[
        {
          q: '¿Cómo maneja el bot la disponibilidad de mesas?',
          a: 'Configurás cuántas mesas tenés y para cuántas personas cada una. El bot conoce las reservas existentes (sincronizadas con Google Calendar) y solo confirma reservas que entren en la capacidad disponible para ese horario.',
        },
        {
          q: '¿Puede tomar pedidos para llevar?',
          a: 'Sí. Configurás tu menú con precios y categorías. El cliente arma su pedido conversando con el bot, confirma el total y paga con MercadoPago si tenés cobro habilitado. Vos recibís el pedido en tu WhatsApp listo para preparar.',
        },
        {
          q: '¿Qué pasa con las reservas que no se presentan (no-show)?',
          a: 'Akira manda recordatorio 24h y 2h antes. Para reservas grandes (más de 6 personas) podés exigir seña con MercadoPago — la reserva solo se confirma si paga. Esto reduce los no-shows en un 70-80%.',
        },
        {
          q: '¿Sirve para bares, cafeterías, parrillas, sushi, etc.?',
          a: 'Sí, sirve para cualquier negocio gastronómico que reciba consultas y reservas por WhatsApp. Bares con eventos, parrillas con reservas de fin de semana, cafeterías con take-away, restaurantes de alta gama.',
        },
        {
          q: '¿Puede mandar promociones a mis clientes?',
          a: 'Sí. Desde el panel podés mandar mensajes a tu lista de clientes (los que ya interactuaron con el bot). Útil para promocionar happy hour, días especiales, nuevo menú, eventos.',
        },
        {
          q: '¿Y si el cliente quiere modificar la reserva?',
          a: 'El bot maneja modificaciones y cancelaciones automáticamente. Si el cliente quiere cambiar de horario, le ofrece nuevos horarios disponibles. Si quiere cancelar, libera la mesa para otra reserva.',
        },
      ]}
    />
  );
}
