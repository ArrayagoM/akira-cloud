import { Calendar, CreditCard, Bell, Bot, Users, Shield } from 'lucide-react';
import VerticalNicho from '../components/VerticalNicho';

export default function Gimnasios() {
  return (
    <VerticalNicho
      nicho="gimnasios y entrenadores"
      nichoUpper="Gimnasios, personal trainers y studios"
      nichoSingular="gimnasio"
      emoji="💪"
      slug="gimnasios"
      title="Bot de WhatsApp para gimnasios y personal trainers | Akira Cloud Argentina"
      description="Akira Cloud es el bot de WhatsApp con IA para gimnasios, personal trainers, studios de yoga, pilates y crossfit en Argentina. Reserva clases, cobra cuotas, manda recordatorios automáticos."
      keywords="bot whatsapp gimnasio, reservas clases gimnasio, agenda personal trainer, software gestion gimnasio, bot whatsapp yoga, sistema turnos pilates, agenda crossfit, bot whatsapp entrenador, chatbot gimnasio argentina, asistente whatsapp fitness"
      hero={{
        eyebrow: 'Para gimnasios y entrenadores',
        h1: 'Tu gimnasio gestionando reservas y cuotas por WhatsApp solo',
        sub: 'Akira Cloud reserva clases con cupo limitado, cobra cuotas mensuales con MercadoPago, recordatorios para reducir ausencias y avisos cuando se libera un cupo. Pensado para gimnasios, personal trainers, studios de yoga, pilates y crossfit.',
      }}
      beneficios={[
        { Icon: Calendar, titulo: 'Reservas con cupo limitado', desc: 'Tus clases tienen cupos limitados. El bot solo confirma reservas si hay lugar.' },
        { Icon: Users, titulo: 'Lista de espera automática', desc: 'Cuando un alumno cancela, el bot avisa al primero de la lista de espera. Cero clases vacías.' },
        { Icon: CreditCard, titulo: 'Cobra cuotas mensuales', desc: 'Link de pago automático para la cuota. El alumno paga con MercadoPago y queda registrado.' },
        { Icon: Bell, titulo: 'Recordatorios pre-clase', desc: 'Recordatorios 24h, 4h y 30min antes para que tus alumnos no se olviden.' },
        { Icon: Bot, titulo: 'Responde 24/7 sobre horarios', desc: 'Horarios, profesores, precios, qué ropa traer, dónde estacionar — sin molestarte un sábado a las 10pm.' },
        { Icon: Shield, titulo: 'Multi-cuenta para varias sedes', desc: 'Plan Agencia: hasta 5 cuentas de WhatsApp para gimnasios con varias sedes o profesores.' },
      ]}
      casosDeUso={[
        'Reservar la clase de yoga del lunes 18:00 si hay cupo.',
        'Pagar la cuota mensual con MercadoPago sin moverse de la casa.',
        'Anotarse en lista de espera y recibir aviso cuando se libera un cupo.',
        'Consultar el horario de las clases por especialidad.',
        'Cancelar una reserva si surge algo, sin sentirse mal.',
        'Recibir recordatorios automáticos para no olvidarse de ir.',
      ]}
      testimonio={{
        texto: 'Tenía 30-40 mensajes por día solo de "¿hay cupo en pilates de las 19?". Con Akira esos los responde el bot y mira el cupo en tiempo real. Yo me dedico a entrenar.',
        autor: 'Caso de uso típico',
        rol: 'Studio de pilates — Mar del Plata',
      }}
      faq={[
        {
          q: '¿Cómo maneja el bot el cupo de las clases?',
          a: 'Configurás tus clases con cupo limitado (ej: yoga 12 personas, crossfit 8, etc.). El bot conoce las reservas en tiempo real y solo confirma si hay lugar. Si está lleno, ofrece anotarse en la lista de espera y avisa al primero cuando se libera un cupo.',
        },
        {
          q: '¿Puede cobrar la cuota mensual?',
          a: 'Sí. El primer día del mes (o el día que vos elijas) el bot manda el link de pago de MercadoPago a cada alumno activo. Cuando paga, queda registrado y la cuota se renueva. Si no paga, el bot te avisa para que decidas qué hacer.',
        },
        {
          q: '¿Sirve para personal trainer individual?',
          a: 'Sí, perfectamente. El plan Básico ya alcanza para un personal trainer con 50-200 alumnos. Configurás tu disponibilidad, los servicios (sesión presencial, online, plan personalizado) y el bot agenda solo. Ideal para no atender mensajes mientras entrenás.',
        },
        {
          q: '¿Qué pasa si tengo varias sedes o profesores?',
          a: 'Plan Agencia: hasta 5 cuentas de WhatsApp diferentes, una por sede o profesor. Cada bot tiene sus propios horarios, precios y disponibilidad. Útil para cadenas de gimnasios o studios con varios profesores.',
        },
        {
          q: '¿Puede manejar pases libres y planes especiales?',
          a: 'Sí. Configurás los planes (mensual, trimestral, semestral, anual, sesiones sueltas) con precios distintos. El bot informa al alumno los planes disponibles y procesa el pago según el que elija.',
        },
        {
          q: '¿Funciona para crossfit, yoga, pilates, funcional, spinning, etc.?',
          a: 'Sí, funciona para cualquier disciplina con clases agendadas y cupo limitado: crossfit, yoga, pilates, funcional, spinning, boxeo, MMA, danza, calistenia, natación, etc.',
        },
      ]}
    />
  );
}
