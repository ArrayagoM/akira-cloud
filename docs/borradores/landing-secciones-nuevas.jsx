// ─────────────────────────────────────────────────────────────
// GESTIÓN DEL NEGOCIO — lo que hay dentro del programa además del bot
// ─────────────────────────────────────────────────────────────
const GESTION = [
  {
    icon: Package,
    color: '#a5b4fc',
    title: 'Catálogo',
    desc: 'Servicios y productos con precio, categoría y stock. Importás tu lista desde Excel, CSV o PDF y el bot la usa para responder y cotizar.',
  },
  {
    icon: Wallet,
    color: '#00e87b',
    title: 'Caja',
    desc: 'Ingresos y gastos del día y del mes, por método de pago. Cada turno cobrado entra solo. Exportás el cierre a Excel o PDF.',
  },
  {
    icon: Receipt,
    color: '#fbbf24',
    title: 'Deudores',
    desc: 'Quién te debe, cuánto y desde cuándo. Cuentas corrientes de clientes integradas a la Caja y recordatorios de cobro.',
  },
  {
    icon: Truck,
    color: '#f9a8d4',
    title: 'Proveedores',
    desc: 'Lo que debés y a quién. Registrás compras y pagos, y el saldo se actualiza en tu Caja sin planillas aparte.',
  },
  {
    icon: FileSearch,
    color: '#7dd3fc',
    title: 'Documentos por WhatsApp',
    desc: 'Si un cliente te manda una factura, un comprobante o una foto, el bot avisa que la recibió, lee el texto (OCR) y te la deja ordenada.',
  },
  {
    icon: RefreshCw,
    color: '#34d399',
    title: 'Actualizaciones automáticas',
    desc: 'Akira se actualiza sola con las mejoras nuevas. Sin reinstalar y sin perder tus datos.',
  },
];

function GestionSection() {
  return (
    <Section id="gestion">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Eyebrow color="#a5b4fc">Gestión del negocio</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            No es solo un bot: es <span className="text-[var(--accent)]">todo tu negocio</span> en un
            programa
          </h2>
          <p className="mt-3 text-base" style={{ color: 'var(--text2)' }}>
            Catálogo, caja, deudores, proveedores y documentos conectados entre sí. Importás desde
            Excel o PDF y exportás a Excel o PDF cuando quieras.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GESTION.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="card card-glow flex flex-col gap-3"
                style={{ animation: `fadeUp 0.5s ease-out ${i * 60}ms both` }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${f.color}1a`, border: `1px solid ${f.color}40` }}
                >
                  <Icon size={18} style={{ color: f.color }} />
                </div>
                <h3 className="text-base font-semibold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// DATOS EN TU PC — el diferencial de privacidad
// ─────────────────────────────────────────────────────────────
const SE_QUEDA_EN_TU_PC = [
  'Tus clientes y su historial',
  'Turnos, agenda y lista de espera',
  'Caja, deudas y proveedores',
  'Conversaciones y documentos recibidos',
  'La sesión de WhatsApp y tus claves (cifradas con Windows)',
];
const VIAJA_A_LA_NUBE = [
  'Tu cuenta (email) y tu plan',
  'La licencia del equipo (para validar la suscripción)',
  'Solo si lo activás: unos pocos números de resumen para verlos desde el celular',
];

function DatosLocalesSection() {
  return (
    <Section id="datos-locales">
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Eyebrow color="#34d399">Privacidad real</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            Tus datos viven en <span className="text-[var(--accent)]">tu PC</span>, no en un servidor
            ajeno
          </h2>
          <p className="mt-3 text-base" style={{ color: 'var(--text2)' }}>
            Akira es un programa para Windows: el bot, la sesión de WhatsApp y la base de datos
            funcionan en tu computadora. Nadie más tiene acceso a la información de tus clientes.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div
            className="card"
            style={{ border: '1px solid rgba(0,232,123,0.28)', background: 'rgba(0,232,123,0.04)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <HardDrive size={18} className="text-[var(--accent)]" />
              <h3 className="text-base font-semibold text-white">Se queda en tu PC</h3>
            </div>
            <ul className="space-y-2.5">
              {SE_QUEDA_EN_TU_PC.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
                  <CheckCircle size={15} className="mt-0.5 flex-shrink-0 text-[var(--accent)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Lock size={18} style={{ color: 'var(--muted)' }} />
              <h3 className="text-base font-semibold text-white">Lo único que viaja a la nube</h3>
            </div>
            <ul className="space-y-2.5">
              {VIAJA_A_LA_NUBE.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text2)' }}>
                  <ChevronRight size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              Usás tu propia clave de Groq (gratis): así tus mensajes los procesa tu cuenta y no una
              compartida.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/descargar" className="btn-primary text-sm px-5 py-2.5">
            <Download size={15} /> Descargar para Windows
          </Link>
          <Link to="/documentacion" className="btn-secondary text-sm px-5 py-2.5">
            Cómo se instala y configura
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPARATIVA — Akira vs. el bot en la nube típico
// ─────────────────────────────────────────────────────────────
const COMPARATIVA = [
  ['Tus datos de clientes', 'En tu propia PC', 'En el servidor del proveedor'],
  ['Gestión (caja, deudas, proveedores)', 'Incluida', 'Otro sistema aparte'],
  ['Importar Excel / PDF y exportar', 'Sí', 'Rara vez'],
  ['Documentos que mandan por WhatsApp (OCR)', 'Los lee y ordena', 'No'],
  ['Agenda + cobro con MercadoPago', 'Integrado', 'Depende del plan'],
  ['Si cae internet un rato', 'Sigue con tus datos locales', 'Todo depende de la nube'],
  ['Precio', 'Fijo en pesos, sin comisión por mensaje', 'Suele cobrarse en dólares o por mensaje'],
];

function ComparativaSection() {
  return (
    <Section id="comparativa" className="!py-16">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <Eyebrow color="#7dd3fc">Comparativa</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight">
            Akira vs. un bot de WhatsApp en la nube
          </h2>
        </div>
        <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm" style={{ minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }} />
                <th className="text-left px-4 py-3 font-semibold text-[var(--accent)]">Akira Cloud</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>
                  Bot en la nube típico
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARATIVA.map(([fila, akira, otro]) => (
                <tr key={fila} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-3 text-white">{fila}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text)' }}>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle size={14} className="flex-shrink-0 text-[var(--accent)]" /> {akira}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text2)' }}>
                    <span className="inline-flex items-center gap-1.5">
                      <XIcon size={14} className="flex-shrink-0" style={{ color: 'var(--muted)' }} /> {otro}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// APP MÓVIL — próximamente (monitoreo y ajustes mínimos)
// ─────────────────────────────────────────────────────────────
const MOVIL = [
  'Mirá si tu bot y tu WhatsApp están conectados',
  'Mensajes, turnos, ingresos y deudas del día',
  'Alertas al celular si algo se desconecta',
  'Pausá o reanudá el bot con un toque',
];

function MovilSection() {
  return (
    <Section id="movil">
      <div className="max-w-5xl mx-auto grid md:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
        <div>
          <Eyebrow color="#f9a8d4">Próximamente · Android y iOS</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight">
            Tu negocio en el bolsillo
          </h2>
          <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--text2)' }}>
            Una app para el celular pensada solo para <strong className="text-white">monitorear</strong>{' '}
            y hacer ajustes mínimos. El bot, la sesión de WhatsApp y tus datos siguen en tu PC.
          </p>
          <ul className="mt-6 space-y-2.5">
            {MOVIL.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <CheckCircle size={15} className="mt-0.5 flex-shrink-0 text-[var(--accent)]" />
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            Mientras tanto ya podés ver un resumen de tu negocio desde cualquier celular entrando a
            akiracloud.lat con tu cuenta (opcional, lo activás desde el programa).
          </p>
        </div>
        <div className="flex justify-center">
          <div
            className="w-56 rounded-[2rem] p-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            aria-hidden="true"
          >
            <div className="rounded-[1.5rem] p-4 space-y-3" style={{ background: 'var(--bg)' }}>
              <div className="flex items-center gap-2">
                <Smartphone size={14} className="text-[var(--accent)]" />
                <span className="text-xs font-semibold text-white">Mi negocio</span>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'rgba(0,232,123,0.08)', border: '1px solid rgba(0,232,123,0.25)' }}>
                <p className="text-[10px]" style={{ color: 'var(--muted)' }}>Bot</p>
                <p className="text-sm font-semibold text-[var(--accent)]">● Conectado</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[['Mensajes hoy', '34'], ['Turnos hoy', '6']].map(([k, v]) => (
                  <div key={k} className="rounded-xl p-2.5" style={{ background: 'var(--surface2)' }}>
                    <p className="text-[9px]" style={{ color: 'var(--muted)' }}>{k}</p>
                    <p className="text-lg font-bold text-white">{v}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-2.5 flex items-center gap-2" style={{ background: 'var(--surface2)' }}>
                <PauseCircle size={14} style={{ color: '#fbbf24' }} />
                <span className="text-[11px] text-white">Pausar bot</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

