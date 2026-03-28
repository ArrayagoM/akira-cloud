import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Privacidad() {
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
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Política de Privacidad</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 40 }}>Última actualización: 28 de marzo de 2025</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, lineHeight: 1.75, fontSize: 15, color: 'var(--text-secondary, #c4c4c4)' }}>

          <Section title="1. Información que recopilamos">
            <p>Cuando utilizás Akira, podemos recopilar la siguiente información:</p>
            <ul>
              <li><strong>Datos de cuenta:</strong> nombre, dirección de correo electrónico y contraseña cifrada al registrarte.</li>
              <li><strong>Datos de uso:</strong> interacciones con el panel de control, logs de actividad del bot, mensajes procesados (sin almacenar el contenido completo de conversaciones privadas).</li>
              <li><strong>Datos de Google Calendar:</strong> solo si autorizás la integración, accedemos a tu calendario para crear y gestionar eventos según las instrucciones configuradas. No almacenamos el contenido de tus eventos.</li>
              <li><strong>Datos de WhatsApp Business:</strong> metadatos de mensajes necesarios para operar el bot (remitente, timestamp). No almacenamos conversaciones privadas completas.</li>
              <li><strong>Datos de pago:</strong> las transacciones son procesadas por MercadoPago. No almacenamos datos de tarjetas.</li>
            </ul>
          </Section>

          <Section title="2. Cómo usamos tu información">
            <p>Utilizamos la información recopilada para:</p>
            <ul>
              <li>Operar y mejorar el servicio de Akira.</li>
              <li>Autenticar tu identidad y proteger tu cuenta.</li>
              <li>Procesar los mensajes de WhatsApp Business a través de tu bot configurado.</li>
              <li>Generar respuestas automáticas con IA (Groq) en base a tu configuración.</li>
              <li>Enviarte notificaciones relacionadas al servicio (no publicidad de terceros).</li>
              <li>Cumplir con obligaciones legales.</li>
            </ul>
          </Section>

          <Section title="3. Uso de la API de Google">
            <p>
              Akira utiliza servicios de Google (Google Calendar API) únicamente cuando el usuario otorga permiso explícito.
              El uso de la información obtenida mediante las APIs de Google se limita estrictamente a proporcionar las funciones de calendario dentro de la aplicación.
              No compartimos, vendemos ni usamos los datos de Google para fines publicitarios o de análisis externos.
            </p>
            <p>
              El acceso a los datos de Google Calendar se rige por la <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#00e87b' }}>Política de Privacidad de Google</a>.
              Podés revocar el acceso en cualquier momento desde tu panel de configuración o directamente en <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: '#00e87b' }}>Google Account Permissions</a>.
            </p>
          </Section>

          <Section title="4. Compartición de datos">
            <p>No vendemos ni alquilamos tu información personal a terceros. Solo compartimos datos con:</p>
            <ul>
              <li><strong>Groq Inc.:</strong> para procesar mensajes con IA (sin datos de identificación personal del usuario final).</li>
              <li><strong>MercadoPago:</strong> para procesar pagos de suscripciones.</li>
              <li><strong>MongoDB Atlas:</strong> proveedor de base de datos con cifrado en reposo.</li>
              <li><strong>Vercel:</strong> hosting del frontend.</li>
            </ul>
            <p>Todos los proveedores están sujetos a acuerdos de confidencialidad y solo procesan datos en la medida necesaria para prestar el servicio.</p>
          </Section>

          <Section title="5. Seguridad">
            <p>
              Implementamos medidas de seguridad técnicas y organizativas para proteger tu información:
              cifrado de contraseñas con bcrypt, comunicaciones HTTPS, tokens JWT con expiración,
              y rate limiting para prevenir accesos no autorizados.
            </p>
          </Section>

          <Section title="6. Retención de datos">
            <p>
              Conservamos tu información mientras tu cuenta esté activa. Si eliminás tu cuenta,
              eliminaremos tus datos personales dentro de los 30 días siguientes, salvo obligación legal de retención.
            </p>
          </Section>

          <Section title="7. Tus derechos">
            <p>Tenés derecho a:</p>
            <ul>
              <li>Acceder a los datos que tenemos sobre vos.</li>
              <li>Solicitar la corrección de datos incorrectos.</li>
              <li>Solicitar la eliminación de tu cuenta y datos.</li>
              <li>Revocar el acceso a servicios de Google en cualquier momento.</li>
              <li>Exportar tus datos de configuración.</li>
            </ul>
            <p>Para ejercer estos derechos, contactanos en <strong>soporte@akira-cloud.vercel.app</strong></p>
          </Section>

          <Section title="8. Menores de edad">
            <p>
              Akira está dirigido a negocios y emprendedores. No recopilamos intencionalmente
              información de personas menores de 18 años. Si detectamos que un menor ha creado una cuenta,
              procederemos a eliminarla.
            </p>
          </Section>

          <Section title="9. Cambios a esta política">
            <p>
              Podemos actualizar esta Política de Privacidad periódicamente.
              Te notificaremos de cambios significativos por correo electrónico o mediante un aviso en la aplicación.
              El uso continuado del servicio implica la aceptación de la política actualizada.
            </p>
          </Section>

          <Section title="10. Contacto">
            <p>
              Si tenés preguntas sobre esta política, podés contactarnos en:<br />
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
