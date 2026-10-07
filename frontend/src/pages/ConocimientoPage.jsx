import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { aBase64 } from '../utils/archivos';
import { Brain, Upload, FileText, Trash2, Loader2, Search, Plus } from 'lucide-react';

// Base de conocimiento propia: preguntas frecuentes, políticas, cómo llegar, cuidados… El bot la usa para responder.
// Todo se guarda en esta PC; a la IA solo se le pasan los fragmentos que sirven para cada pregunta.
const msg = (e, d) => e?.response?.data?.error || d;
const fechaCorta = (f) => (f ? new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function ConocimientoPage() {
  const [docs, setDocs] = useState(null);
  const [limites, setLimites] = useState(null);
  const [modo, setModo] = useState('archivo');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [prueba, setPrueba] = useState(null);
  const [probando, setProbando] = useState(false);
  const input = useRef(null);

  const cargar = useCallback(async () => { try { const r = await api.get('/app/conocimiento'); setDocs(r.data.documentos); setLimites(r.data.limites); } catch { toast.error('No se pudo cargar la base de conocimiento'); } }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const subirArchivo = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    try { await api.post('/app/conocimiento/archivo', { nombre: archivo.name, titulo: titulo.trim() || undefined, base64: await aBase64(archivo) }, { timeout: 120000 }); toast.success('Listo: el bot ya puede usar este documento'); setTitulo(''); cargar(); }
    catch (e) { toast.error(msg(e, 'No se pudo subir el archivo')); } finally { setSubiendo(false); if (input.current) input.current.value = ''; }
  };
  const guardarTexto = async () => {
    setSubiendo(true);
    try { await api.post('/app/conocimiento/texto', { titulo, texto }); toast.success('Guardado: el bot ya puede usarlo'); setTitulo(''); setTexto(''); cargar(); }
    catch (e) { toast.error(msg(e, 'No se pudo guardar')); } finally { setSubiendo(false); }
  };
  const borrar = async (d) => {
    if (!window.confirm(`¿Borrar "${d.titulo}"? El bot dejará de usar esa información.`)) return;
    try { await api.delete(`/app/conocimiento/${d._id}`); toast.success('Borrado'); cargar(); } catch { toast.error('No se pudo borrar'); }
  };
  const probar = async () => {
    setProbando(true);
    try { setPrueba((await api.post('/app/conocimiento/probar', { pregunta })).data); } catch (e) { toast.error(msg(e, 'No se pudo probar')); } finally { setProbando(false); }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Brain size={22} className="text-[var(--accent)]" /> Conocimiento</h1>
          <p className="text-sm text-gray-500">Subí tus preguntas frecuentes, políticas, formas de pago, cómo llegar, cuidados… El bot las usa para responder con tus palabras en vez de inventar. Se guarda en esta PC.</p>
        </div>

        <div className="card space-y-3">
          <div className="flex gap-2">
            {[['archivo', 'Subir archivo', Upload], ['texto', 'Pegar texto', FileText]].map(([id, t, I]) => (
              <button key={id} onClick={() => setModo(id)} className="text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition" style={modo === id ? { color: 'var(--accent)', background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.35)' } : { color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)' }}><I size={14} /> {t}</button>
            ))}
          </div>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (opcional). Ej: Preguntas frecuentes" maxLength={80} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
          {modo === 'archivo' ? (
            <div>
              <input ref={input} type="file" accept=".pdf,.txt,.md,.csv,image/*" className="hidden" onChange={(e) => subirArchivo(e.target.files?.[0])} />
              <button onClick={() => input.current?.click()} disabled={subiendo} className="w-full rounded-xl border-2 border-dashed border-white/15 py-8 text-center hover:border-[var(--accent)]/40 transition disabled:opacity-60">
                {subiendo ? <Loader2 className="animate-spin mx-auto text-[var(--accent)]" /> : <Upload className="mx-auto text-gray-500" />}
                <p className="text-sm text-white mt-2">{subiendo ? 'Leyendo el documento…' : 'Elegí un PDF, un archivo de texto o una foto'}</p>
                <p className="text-xs text-gray-500">PDF con texto (no escaneado), .txt o una foto nítida · hasta 15 MB</p>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} placeholder={'Pegá acá tus preguntas frecuentes, por ejemplo:\n\n¿Aceptan tarjeta? Sí, débito y crédito en un pago.\n¿Dónde están? Av. San Martín 1234…'} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
              <div className="flex justify-between items-center"><span className="text-[11px] text-gray-500">{texto.length.toLocaleString('es-AR')} caracteres</span>
                <button className="btn-primary text-sm flex items-center gap-1.5" disabled={subiendo || texto.trim().length < 20} onClick={guardarTexto}>{subiendo ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Guardar</button></div>
            </div>
          )}
        </div>

        <div className="card">
          <p className="text-sm font-semibold text-white mb-2">Tus documentos {docs && limites && <span className="text-xs text-gray-500 font-normal">({docs.length} de {limites.maxDocumentos})</span>}</p>
          {!docs ? <Loader2 className="animate-spin text-gray-500" /> : docs.length === 0 ? <p className="text-sm text-gray-500">Todavía no cargaste nada. Con un documento de preguntas frecuentes, el bot responde dudas sobre pagos, ubicación, políticas y más.</p> : (
            <ul className="divide-y divide-white/5">
              {docs.map((d) => (
                <li key={d._id} className="flex items-start gap-3 py-2.5">
                  <FileText size={16} className="text-gray-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{d.titulo}</p>
                    <p className="text-[11px] text-gray-500">{d.fragmentos} {d.fragmentos === 1 ? 'fragmento' : 'fragmentos'} · {d.caracteres.toLocaleString('es-AR')} caracteres · {d.origen} · {fechaCorta(d.creado)}</p>
                    {d.vista && <p className="text-[11px] text-gray-600 truncate mt-0.5">{d.vista}</p>}
                  </div>
                  <button onClick={() => borrar(d)} className="text-gray-500 hover:text-red-400 shrink-0" aria-label={`Borrar ${d.titulo}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card space-y-2">
          <p className="text-sm font-semibold text-white flex items-center gap-1.5"><Search size={14} /> Probar: ¿qué usaría el bot para esta pregunta?</p>
          <div className="flex gap-2">
            <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pregunta.trim().length >= 3 && probar()} placeholder="Ej: ¿aceptan mercadopago?" className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/50" />
            <button className="btn-secondary text-sm" disabled={probando || pregunta.trim().length < 3} onClick={probar}>{probando ? <Loader2 size={14} className="animate-spin" /> : 'Probar'}</button>
          </div>
          {prueba && (!prueba.hayDocumentos ? <p className="text-xs text-gray-500">Primero cargá un documento.</p> : prueba.fragmentos.length === 0 ? <p className="text-xs text-amber-300">Ningún fragmento responde esa pregunta: el bot le diría al cliente que consulta con vos. Podés agregar esa información al documento.</p> : (
            <div className="space-y-1.5">{prueba.fragmentos.map((f, i) => <p key={i} className="text-xs text-gray-300 rounded-lg p-2.5 whitespace-pre-line" style={{ background: 'rgba(255,255,255,0.04)' }}>{f.texto}</p>)}</div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
