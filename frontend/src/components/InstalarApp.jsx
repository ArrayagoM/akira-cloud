import { useEffect, useState } from 'react';
import { Download, LogIn, QrCode, CheckCircle2, ChevronDown, Monitor, Clock } from 'lucide-react';

// Servidor de licencias (Vercel): mismo JWT que la plataforma, así que el
// panel web puede preguntarle si esta cuenta ya tiene la app instalada.
const LICENSE_API = import.meta.env.VITE_LICENSE_API_URL || 'https://akira-licencias.vercel.app';

const PREGUNTAS = [
  {
    q: 'Windows dice "Windows protegió su PC". ¿Es normal?',
    a: 'Sí, es normal con las apps nuevas. Tocá "Más información" y después "Ejecutar de todos modos". Se hace una sola vez.',
  },
  {
    q: '¿Tengo que dejar la computadora prendida?',
    a: 'Sí. El bot atiende mientras la PC esté prendida y con internet. Si la apagás, deja de responder hasta que la vuelvas a prender.',
  },
  {
    q: '¿Puedo cerrar la ventana de Akira?',
    a: 'Sí. Al cerrarla, Akira sigue funcionando en segundo plano (ícono junto al reloj). Para apagarlo del todo: clic derecho en ese ícono → Salir.',
  },
  {
    q: '¿Por qué hay que instalarlo en mi PC?',
    a: 'Así tu WhatsApp y las conversaciones de tus clientes quedan en tu computadora y no en un servidor ajeno.',
  },
  {
    q: 'Me pide una clave de Groq, ¿qué es?',
    a: 'Es la "inteligencia" del bot y es gratis. Dentro de la app hay un botón que te lleva a conseguirla en 1 minuto.',
  },
];

function Paso({ n, icono: Icono, titulo, texto, hecho, children }) {
  return (
    <div className="flex gap-4 p-4 rounded-xl"
      style={{ background: hecho ? 'rgba(0,232,123,0.05)' : 'var(--surface2)', border: `1px solid ${hecho ? 'rgba(0,232,123,0.25)' : 'var(--border)'}` }}>
      <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
        style={{ background: hecho ? 'rgba(0,232,123,0.15)' : 'var(--surface3)', color: hecho ? '#00e87b' : 'var(--text2)' }}>
        {hecho ? <CheckCircle2 size={20} /> : n}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white flex items-center gap-2"><Icono size={16} style={{ color: '#00e87b' }} />{titulo}</p>
        <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text2)' }}>{texto}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}

// compacto: versión para el Dashboard (sin preguntas frecuentes) — se
// oculta sola cuando la app ya quedó instalada y activada.
export default function InstalarApp({ compacto = false }) {
  const [info, setInfo] = useState(null);
  const [instalada, setInstalada] = useState(null); // null = todavía no sé
  const [abierta, setAbierta] = useState(null);
  const esWindows = /Windows/i.test(navigator.userAgent);

  useEffect(() => {
    fetch(`${LICENSE_API}/api/desktop/latest`).then((r) => r.json()).then(setInfo).catch(() => setInfo({ disponible: false }));
    const token = localStorage.getItem('akira_token');
    if (token) {
      fetch(`${LICENSE_API}/api/licenses/mine`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setInstalada(!!d?.devices?.length))
        .catch(() => setInstalada(null));
    } else {
      setInstalada(false);
    }
  }, []);

  if (compacto && instalada) return null;

  const botonDescarga = info?.disponible ? (
    <a href={info.url} className="btn-primary inline-flex items-center gap-2 px-5 py-3 rounded-xl text-base font-semibold">
      <Download size={18} /> Descargar Akira para Windows
      {info.sizeMB ? <span className="text-xs font-normal opacity-80">({info.sizeMB} MB)</span> : null}
    </a>
  ) : (
    <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
      style={{ background: 'var(--surface3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
      <Clock size={16} /> El instalador estará disponible muy pronto — te avisamos por email.
    </div>
  );

  return (
    <section className="rounded-2xl p-5 md:p-6 mb-6"
      style={{ background: 'var(--surface)', border: '1px solid rgba(0,232,123,0.2)', boxShadow: '0 0 40px rgba(0,232,123,0.05)' }}>
      <h2 className="text-xl font-bold text-white">Dejá tu bot funcionando en 3 minutos</h2>
      <p className="text-sm mt-1 mb-5" style={{ color: 'var(--text2)' }}>
        Tu bot corre en tu computadora. Seguí estos 3 pasos y listo — no necesitás saber nada técnico.
      </p>

      <div className="space-y-3">
        <Paso n={1} icono={Download} titulo="Descargá e instalá Akira" hecho={instalada === true}
          texto="Descargalo, abrilo y tocá “Siguiente” hasta que termine. Es como instalar cualquier programa.">
          {instalada === true && (
            <p className="text-sm mb-2" style={{ color: '#00e87b' }}>✓ Ya tenés Akira instalado y vinculado a tu cuenta. ¿Lo necesitás en otra PC o hay que reinstalarlo?</p>
          )}
          {botonDescarga}
          {!esWindows && (
            <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#f59e0b' }}>
              <Monitor size={12} /> Por ahora Akira funciona en computadoras con Windows 10 u 11.
            </p>
          )}
        </Paso>

        <Paso n={2} icono={LogIn} titulo="Abrilo e ingresá con tu cuenta" hecho={instalada === true}
          texto="Tocá “Continuar con Google” (o usá tu email) con la misma cuenta con la que te registraste acá. Tus datos se cargan solos." />

        <Paso n={3} icono={QrCode} titulo="Escaneá el código con tu WhatsApp"
          texto="En la app tocá “Iniciar bot”. Aparece un código QR: en tu celular abrí WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escaneá. ¡Listo, tu bot ya atiende!" />
      </div>

      {!compacto && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-white mb-2">Preguntas frecuentes</p>
          <div className="space-y-2">
            {PREGUNTAS.map((p, i) => (
              <div key={i} className="rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <button onClick={() => setAbierta(abierta === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 text-left px-4 py-3 text-sm text-white">
                  {p.q}
                  <ChevronDown size={16} style={{ transform: abierta === i ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: 'var(--muted)' }} />
                </button>
                {abierta === i && <p className="px-4 pb-3 text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{p.a}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
