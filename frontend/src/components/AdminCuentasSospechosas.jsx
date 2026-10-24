import { useState } from 'react';
import { ShieldAlert, Loader2, MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Cuentas creadas con email y contraseña que nunca instalaron la app ni confirmaron su email. Primero se ve la lista; recién con "Exigir verificación"
// se les pide confirmar el email (se cierran sus sesiones; no se borra ni se bloquea a nadie).
export default function AdminCuentasSospechosas({ onCambio }) {
  const [dias, setDias] = useState(30);
  const [lista, setLista] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const revisar = async () => {
    setCargando(true);
    try { const r = await api.post('/admin/cuentas-sospechosas', { dias }); setLista(r.data); }
    catch (err) { toast.error(err.response?.data?.error || 'No se pudo revisar'); }
    finally { setCargando(false); }
  };
  const exigir = async () => {
    if (!window.confirm(`Se les va a exigir confirmar el email a ${lista.cantidad} cuenta(s) y se cerrarán sus sesiones. ¿Seguir?`)) return;
    setAplicando(true);
    try { const r = await api.post('/admin/cuentas-sospechosas', { dias, confirmar: true }); toast.success(`Listo: ${r.data.cantidad} cuenta(s) deberán confirmar su email.`); setLista(null); onCambio?.(); }
    catch (err) { toast.error(err.response?.data?.error || 'No se pudo aplicar'); }
    finally { setAplicando(false); }
  };

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-white flex items-center gap-2 flex-1 min-w-[220px]"><ShieldAlert size={16} className="text-amber-300" /> Cuentas para revisar</p>
        <select value={dias} onChange={(e) => { setDias(Number(e.target.value)); setLista(null); }} className="input-base w-36">
          {[7, 30, 90, 365].map((n) => <option key={n} value={n}>Últimos {n} días</option>)}
        </select>
        <button onClick={revisar} disabled={cargando} className="btn-secondary text-sm px-3 py-2 flex items-center gap-2">{cargando ? <Loader2 size={14} className="animate-spin" /> : null} Revisar</button>
      </div>
      <p className="text-xs text-gray-500">Busca cuentas creadas con email y contraseña que nunca instalaron la app y que no confirmaron su email. No borra ni bloquea nada: solo les exige confirmar el email al volver a entrar.</p>
      {lista && (lista.cantidad === 0
        ? <p className="text-sm text-gray-400">No hay cuentas para revisar en ese período.</p>
        : <>
            <div className="max-h-56 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
              {lista.cuentas.map((c) => (
                <div key={c._id} className="flex justify-between gap-3 px-3 py-2 text-xs border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-gray-300 truncate">{c.nombre} · {c.email}</span>
                  <span className="text-gray-500 whitespace-nowrap">{new Date(c.creada).toLocaleDateString('es-AR')} · {c.ingresos} ingreso(s)</span>
                </div>
              ))}
            </div>
            <button onClick={exigir} disabled={aplicando} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
              {aplicando ? <Loader2 size={14} className="animate-spin" /> : <MailCheck size={14} />} Exigir verificación a estas {lista.cantidad} cuentas
            </button>
          </>)}
    </div>
  );
}
