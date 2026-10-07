import { useState, useEffect, useRef } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { aBase64 } from '../utils/archivos';

// Foto de un producto: el bot se la manda al cliente cuando pregunta por ese producto. Se guarda en esta PC.
export default function FotoProducto({ valor, onCambio }) {
  const [url, setUrl] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef(null);
  const local = typeof valor === 'string' && valor.startsWith('local:');

  useEffect(() => {
    let vivo = true; let objeto = null;
    if (!local) { setUrl(null); return undefined; }
    api.get(`/app/catalogo-fotos/${valor.replace('local:', '')}`, { responseType: 'blob' }).then((r) => { if (vivo) { objeto = URL.createObjectURL(r.data); setUrl(objeto); } }).catch(() => {});
    return () => { vivo = false; if (objeto) URL.revokeObjectURL(objeto); };
  }, [valor, local]);

  const subir = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    try { const r = await api.post('/app/catalogo-fotos', { base64: await aBase64(archivo) }, { timeout: 60000 }); onCambio(r.data.ref); }
    catch (e) { toast.error(e?.response?.data?.error || 'No se pudo subir la foto'); } finally { setSubiendo(false); if (input.current) input.current.value = ''; }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
      {local ? (
        <>
          <button type="button" onClick={() => input.current?.click()} title="Cambiar la foto" className="w-9 h-9 rounded-md overflow-hidden border border-white/15 shrink-0 bg-black/30">
            {url ? <img src={url} alt="Foto del producto" className="w-full h-full object-cover" /> : <Loader2 size={14} className="animate-spin m-auto text-gray-500" />}
          </button>
          <button type="button" onClick={() => onCambio('')} title="Quitar la foto" className="text-gray-500 hover:text-red-400" aria-label="Quitar la foto"><X size={14} /></button>
        </>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={subiendo} title="Agregar foto: el bot se la manda al cliente cuando pregunta por este producto"
          className="w-9 h-9 rounded-md border border-dashed border-white/20 text-gray-500 hover:text-[var(--accent)] hover:border-[var(--accent)]/50 flex items-center justify-center shrink-0 disabled:opacity-50">
          {subiendo ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={15} />}
        </button>
      )}
    </div>
  );
}
