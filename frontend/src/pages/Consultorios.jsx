import { Calendar, CreditCard, Bell, Bot, Users, Shield } from 'lucide-react';
import VerticalNicho from '../components/VerticalNicho';

export default function Consultorios() {
  return (
    <VerticalNicho
      nicho="consultorios médicos"
      nichoUpper="Consultorios y profesionales de la salud"
      nichoSingular="consultorio"
      emoji="🏥"
      slug="consultorios"
      title="Bot de WhatsApp para consultorios médicos y profesionales | Akira Cloud"
      description="Akira Cloud es el asistente de WhatsApp con IA para consultorios médicos, kinesiólogos, psicólogos, nutricionistas y odontólogos en Argentina. Agenda turnos, envía recordatorios y reduce ausencias automáticamente."
      keywords="bot whatsapp consultorio, agenda turnos consultorio, sistema turnos medico, bot whatsapp medico argentina, agenda turnos psicologo, agenda turnos kinesiologo, software gestion consultorio, sistema reservas consultorio, agenda online medico, asistente virtual medico, bot turnos odontologo, chatbot consultorio"
      hero={{
        eyebrow: 'Para profesionales de la salud',
        h1: 'Tu consultorio agendando pacientes 24/7 por WhatsApp',
        sub: 'Akira Cloud agenda turnos según tu disponibilidad real, manda recordatorios para reducir ausencias y libera a tu secretaria de contestar consultas repetitivas. Pensado para médicos, kinesiólogos, psicólogos, nutricionistas y odontólogos.',
      }}
      beneficios={[
        { Icon: Calendar, titulo: 'Turnos sin sobreposición', desc: 'Sincronizado con tu Google Calendar. Imposible agendar dos pacientes a la misma hora.' },
        { Icon: Bell, titulo: 'Reduce el ausentismo', desc: 'Recordatorios 24h, 4h y 30min antes. Estudios muestran que reducen el no-show hasta un 70%.' },
        { Icon: CreditCard, titulo: 'Cobra la consulta o seña', desc: 'Link de pago de MercadoPago para pre-pagar la consulta o asegurar el turno.' },
        { Icon: Users, titulo: 'Historial por paciente', desc: 'Cada paciente queda con su nombre, teléfono y registro de turnos anteriores.' },
        { Icon: Bot, titulo: 'Responde consultas frecuentes', desc: 'Horarios, ubicación, obras sociales, precios — sin que tu secretaria repita lo mismo 50 veces al día.' },
        { Icon: Shield, titulo: 'Datos cifrados y seguros', desc: 'Cifrado AES-256-GCM. Cumplimos con la política de uso de Google API Services.' },
      ]}
      casosDeUso={[
        'Pedir turno de primera vez o de control especificando el motivo.',
        'Consultar qué obras sociales aceptás y cuáles son los precios particulares.',
        'Reagendar un turno sin tener que llamar al consultorio.',
        'Pagar la consulta o seña por MercadoPago al confirmar.',
        'Recibir recordatorios automáticos para no olvidarse del turno.',
        'Avisar si llega tarde o si no puede ir — el bot te notifica.',
      ]}
      testimonio={{
        texto: 'Mi secretaria pasaba 4 horas al día contestando WhatsApp. Con Akira ahora dedica ese tiempo a los pacientes presenciales y a la facturación. El no-show bajó del 25% al 8%.',
        autor: 'Caso de uso típico',
        rol: 'Consultorio de kinesiología — La Plata',
      }}
      faq={[
        {
          q: '¿Akira sirve para mi consultorio médico, psicológico, kinesiológico, etc.?',
          a: 'Sí. Akira es flexible para cualquier profesional de la salud que agende turnos: médicos, psicólogos, kinesiólogos, nutricionistas, fonoaudiólogos, odontólogos, podólogos, terapeutas. Configurás tus horarios, duración por turno y servicios específicos.',
        },
        {
          q: '¿Cómo se reduce el ausentismo (no-show) con el bot?',
          a: 'Akira manda recordatorios automáticos 24 horas antes, 4 horas antes y 30 minutos antes del turno. Estudios muestran que los recordatorios automáticos reducen las ausencias entre 50% y 70%. Si querés más rigor, podés exigir una seña con MercadoPago al confirmar.',
        },
        {
          q: '¿Es compatible con la Ley de Protección de Datos Personales?',
          a: 'Akira encripta toda la información sensible con AES-256-GCM y solo guarda lo mínimo necesario (nombre, teléfono, motivo del turno, historial de visitas). No guarda historias clínicas. Cumplimos con la Ley 25.326 (Argentina) y con la Google API Services User Data Policy.',
        },
        {
          q: '¿Puedo configurar diferentes duraciones para cada tipo de consulta?',
          a: 'Sí. Definís tus servicios (consulta de primera vez 60min, control 30min, sesión 45min, etc.) y el bot bloquea el tiempo correcto en tu calendario según el servicio que elija el paciente.',
        },
        {
          q: '¿Qué pasa si tengo varios consultorios o trabajo en clínica?',
          a: 'En el plan Agencia podés tener hasta 5 cuentas de WhatsApp. Útil si trabajás en varios consultorios con números distintos, o si sos clínica y querés un bot por especialidad.',
        },
        {
          q: '¿El paciente sabe que está hablando con un bot?',
          a: 'No necesariamente. La conversación es muy natural (LLaMA 3.3 70B vía Groq). El bot saluda por nombre, recuerda el historial del paciente y responde con tu propio estilo si lo configurás. Si el paciente pide hablar con un humano, el bot te avisa para que intervengas.',
        },
      ]}
    />
  );
}
