import { useState } from 'react';
import { Sparkles, Loader2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

// Copiloto: cuando atendés vos un chat, te redacta un borrador usando lo que sabe tu negocio. NUNCA se envía solo: lo
// revisás, lo editás y recién ahí lo mandás por WhatsApp.
const msg = (e, d) => e?.response?.data?.error || d;

export default function Copiloto({ jid, nombre, alEnviar }) {
  const [texto, setTexto] = useState('');
  const [nota, setNota] = useState('');
  const [pensando, setPensando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const base = `/bot/clientes/${encodeURIComponent(jid)}`;

  const sugerir = async (instruccion = '') => {
    setPensando(true);
    try { const r = await api.post(`${base}/sugerir`, { instruccion }, { timeout: 40000 }); setTexto(r.data.texto); setNota(''); }
    catch (e) { toast.error(msg(e, 'No se pudo generar el borrador')); } finally { setPensando(false); }
  };
  const enviar = async () => {
    setEnviando(true);
    try { await api.post(`${base}/responder`, { texto }); toast.success(`Mensaje enviado a ${nombre || 'el cliente'}`); setTexto(''); alEnviar?.(); }
    catch (e) { toast.error(msg(e, 'No se pudo enviar')); } finally { setEnviando(false); }
  };

  return (
    <section className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(0,232,123,0.04)', border: '1px solid rgba(0,232,123,0.18)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-200"><Sparkles size={13} className="text-[var(--accent)]" /> Copiloto: responder yo</p>
        <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => sugerir(nota)} disabled={pensando}>{pensando ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {texto ? 'Otra sugerencia' : 'Sugerir respuesta'}</button>
      </div>
      <p className="text-[11px] text-gray-500">Te redacta un borrador con tus precios, horarios y tu documento de conocimiento. Lo revisás y lo mandás vos. Si lo atendés vos, silenciá el bot en este chat para que no conteste también.</p>
      {texto !== '' || pensando ? (
        <>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={1000} placeholder="El borrador aparece acá…" className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
          <div className="flex gap-1.5 flex-wrap">
            {['Más corto', 'Más cálido', 'Más formal'].map((p) => <button key={p} className="text-[11px] px-2 py-0.5 rounded-full text-gray-400 border border-dashed border-white/20 hover:text-white" disabled={pensando} onClick={() => { setNota(p); sugerir(p); }}>{p}</button>)}
          </div>
          <div className="flex justify-end">
            <button className="btn-primary text-xs flex items-center gap-1.5" disabled={enviando || texto.trim().length < 1} onClick={enviar}>{enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar por WhatsApp</button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional: una indicación (ej. “decile que sí hay lugar”)" maxLength={200} className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-xs text-white outline-none" />
        </div>
      )}
    </section>
  );
}
