import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Terminos() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', textDecoration: 'none', fontSize: 14 }}>
          <ArrowLeft size={16} />
          Volver
        </Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00e87b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Akira</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Términos de Servicio</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 40 }}>Última actualización: 28 de marzo de 2025</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, lineHeight: 1.75, fontSize: 15, color: 'var(--text-secondary, #c4c4c4)' }}>

          <Section title="1. Aceptación de los términos">
            <p>
              Al acceder y usar Akira ("el Servicio"), aceptás estos Términos de Servicio en su totalidad.
              Si no estás de acuerdo con alguna parte de estos términos, no podés usar el Servicio.
              El uso continuado implica la aceptación de cualquier modificación publicada.
            </p>
          </Section>

          <Section title="2. Descripción del servicio">
            <p>
              Akira es una plataforma SaaS que permite a negocios y emprendedores automatizar la atención al cliente
              mediante un bot de WhatsApp Business con inteligencia artificial, gestión de agenda a través de Google Calendar,
              administración de catálogo de productos y análisis del negocio.
            </p>
            <p>
              El Servicio se ofrece en distintos planes de suscripción (Trial, Starter, Pro, Agencia)
              con diferentes capacidades según el plan contratado.
            </p>
          </Section>

          <Section title="3. Registro y cuenta">
            <ul>
              <li>Debés tener al menos 18 años para crear una cuenta.</li>
              <li>Sos responsable de mantener la confidencialidad de tu contraseña.</li>
              <li>Sos responsable de todas las actividades realizadas bajo tu cuenta.</li>
              <li>Debés notificarnos inmediatamente ante cualquier uso no autorizado de tu cuenta.</li>
              <li>Solo podés tener una cuenta por persona o negocio.</li>
            </ul>
          </Section>

          <Section title="4. Planes y pagos">
            <p>
              Los planes de suscripción y sus precios están disponibles en <a href="https://akira-cloud.vercel.app/#precios" style={{ color: '#00e87b' }}>akira-cloud.vercel.app/#precios</a>.
            </p>
            <ul>
              <li>Los pagos son procesados por MercadoPago. Al pagar, aceptás también sus términos.</li>
              <li>Las suscripciones se renuevan automáticamente salvo que las canceles antes del vencimiento.</li>
              <li>No se realizan reembolsos por períodos parciales, salvo requerimiento legal.</li>
              <li>Nos reservamos el derecho de modificar los precios con 30 días de aviso previo.</li>
              <li>El plan Trial tiene limitaciones de uso definidas en la plataforma.</li>
            </ul>
          </Section>

          <Section title="5. Uso aceptable">
            <p>Al usar Akira te comprometés a NO:</p>
            <ul>
              <li>Usar el servicio para enviar spam, mensajes no solicitados o contenido ilegal.</li>
              <li>Violar los Términos de Servicio de WhatsApp Business o Meta.</li>
              <li>Intentar acceder a cuentas de otros usuarios.</li>
              <li>Usar el bot para propósitos fraudulentos, de phishing o engañosos.</li>
              <li>Sobrecargar intencionalmente la infraestructura del servicio.</li>
              <li>Revender o sublicenciar el acceso al servicio sin autorización expresa.</li>
              <li>Usar el servicio para actividades ilegales en tu jurisdicción.</li>
            </ul>
          </Section>

          <Section title="6. Integración con WhatsApp Business">
            <p>
              Para usar el bot de WhatsApp necesitás una cuenta de WhatsApp Business válida y aceptar
              los <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer" style={{ color: '#00e87b' }}>Términos de WhatsApp Business</a>.
            </p>
            <p>
              Akira actúa como herramienta de automatización y no es responsable de bloqueos o suspensiones
              de cuentas de WhatsApp que resulten del mal uso de la automatización por parte del usuario.
            </p>
          </Section>

          <Section title="7. Integración con Google">
            <p>
              La integración con Google Calendar es opcional. Al habilitarla, autorizás a Akira a
              leer y crear eventos en tu calendario. Este acceso puede ser revocado en cualquier momento.
              El uso está sujeto a las <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#00e87b' }}>Condiciones del Servicio de Google</a>.
            </p>
          </Section>

          <Section title="8. Propiedad intelectual">
            <p>
              Todo el software, diseño, código y contenido de Akira es propiedad de sus desarrolladores
              y está protegido por leyes de propiedad intelectual.
            </p>
            <p>
              Vos conservás la propiedad de los datos e información de tu negocio. Nos otorgás una
              licencia limitada para procesar esos datos únicamente con el fin de operar el servicio.
            </p>
          </Section>

          <Section title="9. Disponibilidad y SLA">
            <p>
              Nos esforzamos por mantener el servicio disponible 24/7, pero no garantizamos uptime específico.
              Pueden existir períodos de mantenimiento planificado (notificados con anticipación) o
              interrupciones imprevistas. No somos responsables por pérdidas causadas por interrupciones del servicio.
            </p>
          </Section>

          <Section title="10. Limitación de responsabilidad">
            <p>
              En la máxima medida permitida por la ley aplicable, Akira no será responsable por:
            </p>
            <ul>
              <li>Pérdida de datos, ganancias o negocios indirectas.</li>
              <li>Daños causados por el uso del servicio o la imposibilidad de usarlo.</li>
              <li>Acciones de terceros (WhatsApp, Google, MercadoPago) que afecten el servicio.</li>
              <li>Pérdidas derivadas del bloqueo de cuentas de WhatsApp por parte de Meta.</li>
            </ul>
            <p>
              La responsabilidad máxima de Akira se limita al monto pagado por el usuario en los últimos 3 meses.
            </p>
          </Section>

          <Section title="11. Cancelación y suspensión">
            <p>
              Podés cancelar tu suscripción en cualquier momento desde el panel de configuración.
              Nos reservamos el derecho de suspender o cancelar cuentas que violen estos términos,
              sin reembolso, con o sin previo aviso según la gravedad del incumplimiento.
            </p>
          </Section>

          <Section title="12. Modificaciones al servicio">
            <p>
              Nos reservamos el derecho de modificar, suspender o discontinuar cualquier parte del
              servicio en cualquier momento. Te notificaremos de cambios significativos con al menos
              15 días de anticipación.
            </p>
          </Section>

          <Section title="13. Ley aplicable">
            <p>
              Estos términos se rigen por las leyes de la República Argentina.
              Cualquier disputa se resolverá ante los tribunales ordinarios de la Ciudad de Buenos Aires.
            </p>
          </Section>

          <Section title="14. Contacto">
            <p>
              Para consultas sobre estos Términos:<br />
              <strong>Email:</strong> soporte@akira-cloud.vercel.app<br />
              <strong>Web:</strong> <a href="https://akira-cloud.vercel.app" style={{ color: '#00e87b' }}>akira-cloud.vercel.app</a>
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}
