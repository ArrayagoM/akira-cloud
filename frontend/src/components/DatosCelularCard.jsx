import { useState, useEffect } from 'react';
import { Smartphone, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { alternarGrupo } from '../lib/resumenVer';

// Solo en la app de escritorio. Interruptor OPCIONAL (apagado por defecto) para ver desde el celular los datos del negocio:
// agenda, caja, clientes y deudores, catálogo. A diferencia de "Ver tu negocio desde el celular" (solo números), ACÁ SÍ se suben
// nombres, teléfonos y montos de los clientes: el servidor los guarda cifrados y solo los ve esta cuenta. Al apagarlo se borran.
const AVISO = 'Se van a subir a tu cuenta de Akira, guardados cifrados, SOLO los datos que elijas en esta tarjeta. Incluyen nombres, teléfonos y montos de tus clientes. '
  + 'Solo los ves vos al iniciar sesión en el celular. Nadie del equipo de Akira los ve. Podés apagarlo cuando quieras y se borran del servidor. ¿Activarlo?';

export default function DatosCelularCard() {
  const [datos, setDatos] = useState(null); // { activo, tipos, disponibles }
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { api.get('/app/datos-celular').then((r) => setDatos(r.data)).catch(() => {}); }, []);
  if (!datos) return null;

  const enviar = async (cambios, mensajeOk) => {
    const antes = datos;
    setGuardando(true);
    try {
      const r = await api.put('/app/datos-celular', cambios);
      setDatos(r.data); if (mensajeOk) toast.success(mensajeOk);
    } catch (e) { setDatos(antes); toast.error(e.response?.data?.error || 'No se pudo cambiar'); } finally { setGuardando(false); }
  };

  const cambiar = () => {
    if (guardando) return;
    if (!datos.activo && !window.confirm(AVISO)) return;
    enviar({ activo: !datos.activo }, datos.activo ? 'Apagado: se borraron los datos del servidor' : 'Listo: ya podés ver tus datos desde el celular');
  };

  const tocar = (id) => {
    if (guardando) return;
    const nuevos = alternarGrupo(datos.tipos, id, datos.disponibles);
    if (nuevos === null) { toast('Tiene que quedar al menos un dato. Para no compartir nada, apagá la opción.'); return; }
    setDatos({ ...datos, tipos: nuevos });
    enviar({ tipos: nuevos });
  };

  return (
    <div className="card">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,232,123,0.1)' }}><Smartphone size={18} style={{ color: '#00e87b' }} /></div>
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold text-white">Ver los datos de mi negocio en el celular</p>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>
            {datos.activo
              ? 'Activado: en la app del celular ves lo que elegiste abajo. Se actualiza solo mientras esta PC esté prendida y con internet.'
              : 'Opcional. Mirá tu agenda, tu caja, tus clientes y tu catálogo desde el celular. Se suben nombres y montos de tus clientes, cifrados, y solo los ves vos.'}
          </p>
        </div>
        <button onClick={cambiar} disabled={guardando} aria-pressed={datos.activo} aria-label="Ver los datos de mi negocio en el celular"
          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60" style={{ background: datos.activo ? '#00e87b' : 'rgba(255,255,255,0.15)' }}>
          {guardando ? <Loader2 size={13} className="animate-spin mx-auto text-black" /> : <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: `translateX(${datos.activo ? 24 : 4}px)` }} />}
        </button>
      </div>
      {datos.activo && (
        <div className="mt-3 pt-3 border-t border-white/10" role="group" aria-label="Qué datos compartir con el celular">
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--muted)' }}>Qué querés ver en el celular:</p>
          {datos.disponibles.map((d) => {
            const on = datos.tipos.includes(d.id);
            return (
              <button key={d.id} type="button" onClick={() => tocar(d.id)} aria-pressed={on} disabled={guardando}
                className="flex items-center gap-2.5 w-full text-left text-sm py-1.5 disabled:opacity-60" style={{ color: 'var(--text, #e5e7eb)' }}>
                <span className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0" style={{ borderColor: on ? '#00e87b' : 'rgba(255,255,255,0.25)', background: on ? '#00e87b' : 'transparent' }}>
                  {on && <Check size={13} color="#000" strokeWidth={3} />}
                </span>
                {d.etiqueta}
              </button>
            );
          })}
          <p className="text-[11px] mt-2" style={{ color: 'var(--muted)' }}>Lo que sacás de la lista se borra del servidor.</p>
        </div>
      )}
    </div>
  );
}
