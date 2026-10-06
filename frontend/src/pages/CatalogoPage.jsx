import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Package, Scissors, Plus, Upload, Download, Trash2, Search, Loader2, X, FileSpreadsheet,
  FileText, Image as ImageIcon, CheckCircle2, AlertTriangle, Undo2, ChevronDown, Save,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Catálogo: productos y servicios del negocio. Es la MISMA lista que usa el bot
// para cotizar y agendar. Se puede editar a mano, importar (Excel, CSV, PDF o
// foto de una lista de precios) y exportar. Todo queda en esta PC.
// ─────────────────────────────────────────────────────────────

const TIPOS = {
  productos: { label: 'Productos', icon: Package, vacio: { nombre: '', precio: 0, categoria: '', stock: -1, descripcion: '', disponible: true, fuente: 'manual' }, singular: 'producto' },
  servicios: { label: 'Servicios', icon: Scissors, vacio: { nombre: '', precio: 0, duracion: 60, intervaloRecordatorioDias: 0, mensajeRecordatorio: '' }, singular: 'servicio' },
};
const CAMPOS_MAPEO = {
  productos: [['nombre', 'Nombre', true], ['precio', 'Precio', true], ['categoria', 'Categoría'], ['stock', 'Stock'], ['descripcion', 'Descripción']],
  servicios: [['nombre', 'Nombre', true], ['precio', 'Precio', true], ['duracion', 'Duración (min)']],
};
const ESTADOS = {
  nuevo:      { txt: 'Nuevo',        cls: 'text-emerald-300 bg-emerald-500/10' },
  actualiza:  { txt: 'Actualiza',    cls: 'text-sky-300 bg-sky-500/10' },
  duplicado:  { txt: 'Repetido',     cls: 'text-gray-400 bg-white/5' },
  error:      { txt: 'Con error',    cls: 'text-red-300 bg-red-500/10' },
};

const pesos = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function bajarArchivo(ruta, nombreFallback) {
  const r = await api.get(ruta, { responseType: 'blob', timeout: 60000 });
  const cd = r.headers['content-disposition'] || '';
  const nombre = (cd.match(/filename="([^"]+)"/) || [])[1] || nombreFallback;
  descargar(r.data, nombre);
}
const aBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1] || '');
  fr.onerror = () => rej(new Error('No se pudo leer el archivo'));
  fr.readAsDataURL(file);
});

// ───────────────────────── Asistente de importación ─────────────────────────
function Importar({ tipoInicial, onClose, onListo }) {
  const [paso, setPaso] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [analisis, setAnalisis] = useState(null);
  const [tipo, setTipo] = useState(tipoInicial);
  const [hoja, setHoja] = useState(0);
  const [mapeo, setMapeo] = useState({});
  const [modo, setModo] = useState('agregar');
  const [vista, setVista] = useState(null);
  const [excluir, setExcluir] = useState(new Set());
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);

  const hojaActual = analisis?.hojas?.[hoja];
  const err = (e, base) => toast.error(e.response?.data?.error || base);

  const subir = async (file) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast.error('El archivo es muy pesado (máximo 15 MB)'); return; }
    setCargando(true);
    try {
      const base64 = await aBase64(file);
      const r = await api.post('/gestion/analizar', { nombre: file.name, mimetype: file.type, base64 }, { timeout: 180000 });
      setAnalisis(r.data);
      setTipo(r.data.tipoSugerido || tipoInicial);
      setHoja(0);
      setMapeo(r.data.hojas[0].mapeoSugerido[r.data.tipoSugerido || tipoInicial]);
      setPaso(2);
    } catch (e) { err(e, 'No pude leer el archivo'); }
    finally { setCargando(false); }
  };

  const cambiarTipo = (t) => { setTipo(t); if (hojaActual) setMapeo(hojaActual.mapeoSugerido[t]); };
  const cambiarHoja = (i) => { setHoja(i); setMapeo(analisis.hojas[i].mapeoSugerido[tipo]); };

  const body = () => ({ importacionId: analisis.importacionId, hoja, tipo, mapeo, modo, excluir: [...excluir] });

  const previsualizar = async () => {
    if (mapeo.nombre == null || mapeo.precio == null) { toast.error('Indicá qué columna es el nombre y cuál es el precio'); return; }
    setCargando(true);
    try {
      const r = await api.post('/gestion/previsualizar', body());
      setVista(r.data); setExcluir(new Set()); setPaso(3);
    } catch (e) { err(e, 'No se pudo armar la vista previa'); }
    finally { setCargando(false); }
  };

  const confirmar = async () => {
    if (modo === 'reemplazar' && !window.confirm(`Esto borra tus ${TIPOS[tipo].label.toLowerCase()} actuales y deja solo lo del archivo. ¿Seguro? (Después podés deshacerlo.)`)) return;
    setCargando(true);
    try {
      const r = await api.post('/gestion/confirmar', body());
      setResultado(r.data); setPaso(4); onListo();
    } catch (e) { err(e, 'No se pudo importar'); }
    finally { setCargando(false); }
  };

  const deshacer = async () => {
    setCargando(true);
    try {
      await api.post('/gestion/deshacer', { deshacerId: resultado.deshacerId });
      toast.success('Importación deshecha'); onListo(); onClose();
    } catch (e) { err(e, 'No se pudo deshacer'); }
    finally { setCargando(false); }
  };

  const validas = vista ? vista.filas.filter((f) => (f.estado === 'nuevo' || f.estado === 'actualiza') && !excluir.has(f.fila)).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Importar {TIPOS[tipo].label.toLowerCase()}</h3>
            <p className="text-xs text-gray-500">Paso {paso} de 4 · {['Elegí el archivo', 'Revisá las columnas', 'Vista previa', 'Listo'][paso - 1]}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>

        {paso === 1 && (
          <div>
            <div onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files?.[0]); }}
              onClick={() => !cargando && inputRef.current?.click()}
              className="rounded-xl border-2 border-dashed text-center py-12 cursor-pointer transition"
              style={{ borderColor: arrastrando ? 'var(--accent)' : 'rgba(255,255,255,0.15)', background: arrastrando ? 'rgba(0,232,123,0.05)' : 'transparent' }}>
              {cargando ? <><Loader2 className="mx-auto animate-spin text-gray-400 mb-2" /><p className="text-sm text-gray-400">Leyendo el archivo… (las fotos pueden tardar unos segundos)</p></>
                : <>
                  <Upload className="mx-auto text-gray-500 mb-2" />
                  <p className="text-white font-medium">Arrastrá tu archivo acá o hacé clic para elegirlo</p>
                  <p className="text-xs text-gray-500 mt-1">Excel (.xlsx), CSV, PDF o una foto de tu lista de precios · hasta 15 MB</p>
                </>}
              <input ref={inputRef} type="file" className="hidden" accept=".xlsx,.csv,.txt,.pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <div className="grid sm:grid-cols-3 gap-2 mt-3 text-xs text-gray-500">
              <p className="flex items-center gap-1.5"><FileSpreadsheet size={13} /> Excel y CSV: lo ideal.</p>
              <p className="flex items-center gap-1.5"><FileText size={13} /> PDF: debe tener texto (no escaneado).</p>
              <p className="flex items-center gap-1.5"><ImageIcon size={13} /> Foto: nítida y de frente.</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-4 text-xs">
              <span className="text-gray-500">¿No tenés planilla? Descargá una de ejemplo:</span>
              <button className="text-[var(--accent)] hover:underline" onClick={() => bajarArchivo(`/gestion/plantilla?tipo=${tipo}&formato=xlsx`, `plantilla-${tipo}.xlsx`).catch(() => toast.error('No se pudo descargar'))}>Excel</button>
              <button className="text-[var(--accent)] hover:underline" onClick={() => bajarArchivo(`/gestion/plantilla?tipo=${tipo}&formato=csv`, `plantilla-${tipo}.csv`).catch(() => toast.error('No se pudo descargar'))}>CSV</button>
            </div>
          </div>
        )}

        {paso === 2 && analisis && hojaActual && (
          <div className="space-y-4">
            {analisis.aviso && <p className="text-xs text-amber-300 bg-amber-500/10 rounded-lg p-2.5 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{analisis.aviso}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-400">El archivo tiene:</span>
              {Object.entries(TIPOS).map(([k, t]) => (
                <button key={k} onClick={() => cambiarTipo(k)} className="text-sm px-3 py-1 rounded-full border"
                  style={tipo === k ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{t.label}</button>
              ))}
              {analisis.hojas.length > 1 && (
                <select value={hoja} onChange={(e) => cambiarHoja(+e.target.value)} className="ml-auto text-sm rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-white">
                  {analisis.hojas.map((h) => <option key={h.indice} value={h.indice}>Hoja: {h.nombre} ({h.totalFilas} filas)</option>)}
                </select>
              )}
            </div>
            <p className="text-sm text-gray-400">Encontré <strong className="text-white">{hojaActual.totalFilas}</strong> filas. Dónde está cada dato:</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {CAMPOS_MAPEO[tipo].map(([campo, etiqueta, obligatorio]) => (
                <label key={campo} className="text-xs text-gray-500">{etiqueta}{obligatorio ? ' *' : ''}
                  <select value={mapeo[campo] ?? ''} onChange={(e) => setMapeo((m) => ({ ...m, [campo]: e.target.value === '' ? null : +e.target.value }))}
                    className="mt-1 w-full rounded-lg bg-black/30 border px-3 py-2 text-sm text-white" style={{ borderColor: obligatorio && mapeo[campo] == null ? 'rgba(248,113,113,0.6)' : 'rgba(255,255,255,0.1)' }}>
                    <option value="">— no usar —</option>
                    {hojaActual.columnas.map((c, i) => <option key={i} value={i}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead><tr className="text-gray-500 text-left">{hojaActual.columnas.map((c, i) => <th key={i} className="px-2 py-1.5 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
                <tbody>{hojaActual.muestra.map((f, i) => <tr key={i} className="border-t border-white/5">{f.map((c, j) => <td key={j} className="px-2 py-1 text-gray-300 whitespace-nowrap max-w-[220px] truncate">{String(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="flex justify-between">
              <button className="btn-secondary text-sm" onClick={() => setPaso(1)}>Atrás</button>
              <button className="btn-primary text-sm" disabled={cargando} onClick={previsualizar}>{cargando ? 'Revisando…' : 'Ver vista previa'}</button>
            </div>
          </div>
        )}

        {paso === 3 && vista && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {[['nuevos', 'nuevo', 'nuevos'], ['actualizan', 'actualiza', 'se actualizan'], ['duplicados', 'duplicado', 'repetidos (se omiten)'], ['errores', 'error', 'con error (se omiten)']].map(([k, est, txt]) => (
                vista.resumen[k] > 0 && <span key={k} className={`px-2.5 py-1 rounded-full ${ESTADOS[est].cls}`}>{vista.resumen[k]} {txt}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer"><input type="radio" checked={modo === 'agregar'} onChange={() => setModo('agregar')} /> Sumar y actualizar lo que ya tengo</label>
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer"><input type="radio" checked={modo === 'reemplazar'} onChange={() => setModo('reemplazar')} /> Reemplazar todo por este archivo</label>
            </div>
            <div className="overflow-auto rounded-lg border border-white/10 max-h-[42vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#0b1017]"><tr className="text-gray-500 text-left"><th className="px-2 py-1.5 w-8"></th><th className="px-2 py-1.5">Nombre</th><th className="px-2 py-1.5">Precio</th><th className="px-2 py-1.5">{tipo === 'productos' ? 'Categoría · Stock' : 'Duración'}</th><th className="px-2 py-1.5">Estado</th></tr></thead>
                <tbody>
                  {vista.filas.map((f) => {
                    const apagada = f.estado === 'error' || f.estado === 'duplicado' || excluir.has(f.fila);
                    return (
                      <tr key={f.fila} className={`border-t border-white/5 ${apagada ? 'opacity-50' : ''}`}>
                        <td className="px-2 py-1"><input type="checkbox" disabled={f.estado === 'error' || f.estado === 'duplicado'} checked={!apagada}
                          onChange={() => setExcluir((s) => { const n = new Set(s); n.has(f.fila) ? n.delete(f.fila) : n.add(f.fila); return n; })} /></td>
                        <td className="px-2 py-1 text-white">{f.dato.nombre || <em className="text-gray-500">(vacío)</em>}</td>
                        <td className="px-2 py-1 text-gray-300">{f.errores.length ? '—' : pesos(f.dato.precio)}</td>
                        <td className="px-2 py-1 text-gray-400">{tipo === 'productos' ? `${f.dato.categoria || '—'} · ${f.dato.stock >= 0 ? f.dato.stock : 'sin control'}` : `${f.dato.duracion} min`}</td>
                        <td className="px-2 py-1">
                          <span className={`px-2 py-0.5 rounded-full ${ESTADOS[f.estado].cls}`}>{ESTADOS[f.estado].txt}</span>
                          {[...f.errores, ...f.avisos].map((m, i) => <p key={i} className={`mt-0.5 ${f.errores.length ? 'text-red-300' : 'text-amber-300'}`}>{m}</p>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {vista.truncado && <p className="text-[11px] text-gray-500">Se muestran las primeras 300 filas; el resto se importa igual con las mismas reglas.</p>}
            <div className="flex justify-between">
              <button className="btn-secondary text-sm" onClick={() => setPaso(2)}>Atrás</button>
              <button className="btn-primary text-sm" disabled={cargando || (validas === 0 && vista.resumen.nuevos + vista.resumen.actualizan === 0)} onClick={confirmar}>
                {cargando ? 'Importando…' : `Importar ${vista.resumen.nuevos + vista.resumen.actualizan - [...excluir].length > 0 ? vista.resumen.nuevos + vista.resumen.actualizan - [...excluir].length : ''} ${TIPOS[tipo].label.toLowerCase()}`}
              </button>
            </div>
          </div>
        )}

        {paso === 4 && resultado && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
            <p className="text-white text-lg font-semibold">¡Listo! Ya lo usa tu bot</p>
            <p className="text-sm text-gray-400">{resultado.agregados} nuevos · {resultado.actualizados} actualizados{resultado.omitidos ? ` · ${resultado.omitidos} omitidos` : ''} · ahora tenés {resultado.total} {TIPOS[tipo].label.toLowerCase()}.</p>
            <div className="flex justify-center gap-2 pt-2">
              <button className="btn-secondary text-sm flex items-center gap-1.5" disabled={cargando} onClick={deshacer}><Undo2 size={14} /> Deshacer importación</button>
              <button className="btn-primary text-sm" onClick={onClose}>Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Página ─────────────────────────
export default function CatalogoPage() {
  const [tipo, setTipo] = useState('productos');
  const [lista, setLista] = useState([]);
  const [original, setOriginal] = useState('[]');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [importando, setImportando] = useState(false);
  const [menuExp, setMenuExp] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get(`/gestion/lista?tipo=${tipo}`);
      setLista(r.data.lista || []); setOriginal(JSON.stringify(r.data.lista || []));
    } catch { toast.error('No se pudo cargar la lista'); }
    finally { setCargando(false); }
  }, [tipo]);
  useEffect(() => { cargar(); }, [cargar]);

  const sucio = JSON.stringify(lista) !== original;
  const cambiar = (i, campo, valor) => setLista((l) => l.map((x, k) => (k === i ? { ...x, [campo]: valor } : x)));
  const borrar = (i) => setLista((l) => l.filter((_, k) => k !== i));
  const agregar = () => setLista((l) => [{ ...TIPOS[tipo].vacio }, ...l]);

  const guardar = async () => {
    if (lista.some((x) => !String(x.nombre || '').trim())) { toast.error('Hay filas sin nombre: completalas o borralas'); return; }
    setGuardando(true);
    try {
      const r = await api.put('/gestion/lista', { tipo, lista });
      setLista(r.data.lista); setOriginal(JSON.stringify(r.data.lista));
      toast.success('Guardado — tu bot ya usa estos datos');
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const cambiarTipo = (t) => { if (sucio && !window.confirm('Tenés cambios sin guardar. ¿Descartarlos?')) return; setTipo(t); };

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return lista.map((x, i) => ({ x, i })).filter(({ x }) => !q || `${x.nombre} ${x.categoria || ''}`.toLowerCase().includes(q));
  }, [lista, buscar]);

  const T = TIPOS[tipo];
  const entrada = 'w-full rounded-md bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-[var(--accent)]/50';

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-4 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Catálogo</h1>
          <p className="text-sm text-gray-500">Los {T.label.toLowerCase()} que tu bot ofrece y cotiza. Cargalos a mano o importalos desde Excel, PDF o una foto.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(TIPOS).map(([k, t]) => { const I = t.icon; return (
            <button key={k} onClick={() => cambiarTipo(k)} className="text-sm px-3.5 py-1.5 rounded-full border flex items-center gap-1.5"
              style={tipo === k ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}><I size={14} />{t.label}</button>
          ); })}
          <div className="relative ml-auto flex-1 min-w-[160px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar…" className={`${entrada} pl-8`} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={agregar}><Plus size={14} /> Agregar {T.singular}</button>
          <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setImportando(true)}><Upload size={14} /> Importar</button>
          <div className="relative">
            <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => setMenuExp((v) => !v)}><Download size={14} /> Exportar <ChevronDown size={12} /></button>
            {menuExp && (
              <div className="absolute z-20 mt-1 w-44 rounded-lg border border-white/10 bg-[#0b1017] shadow-xl overflow-hidden" onMouseLeave={() => setMenuExp(false)}>
                {[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV (para Excel)']].map(([f, txt]) => (
                  <button key={f} className="w-full text-left text-sm px-3 py-2 text-gray-300 hover:bg-white/5" onClick={() => { setMenuExp(false); bajarArchivo(`/gestion/exportar?tipo=${tipo}&formato=${f}`, `${tipo}.${f}`).catch(() => toast.error('No se pudo exportar')); }}>{txt}</button>
                ))}
              </div>
            )}
          </div>
          {sucio && (
            <button className="btn-primary text-sm flex items-center gap-1.5 ml-auto" disabled={guardando} onClick={guardar}>
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar cambios
            </button>
          )}
        </div>

        {cargando ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div>
        ) : lista.length === 0 ? (
          <div className="card text-center py-14">
            <T.icon className="mx-auto text-gray-600 mb-3" size={36} />
            <p className="text-white font-medium">Todavía no cargaste {T.label.toLowerCase()}</p>
            <p className="text-sm text-gray-500 mt-1">Agregalos a mano o importá tu lista de precios: el bot la usa para responder y agendar.</p>
            <button className="btn-primary text-sm mt-4" onClick={() => setImportando(true)}>Importar desde archivo</button>
          </div>
        ) : (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 text-left border-b border-white/10">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium w-32">Precio ($)</th>
                  {tipo === 'productos' ? (<><th className="px-3 py-2 font-medium w-40">Categoría</th><th className="px-3 py-2 font-medium w-24" title="Vacío = sin control de stock">Stock</th><th className="px-3 py-2 font-medium w-20 text-center">Se ofrece</th></>)
                    : (<th className="px-3 py-2 font-medium w-32">Duración (min)</th>)}
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ x, i }) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-1.5"><input className={entrada} value={x.nombre} onChange={(e) => cambiar(i, 'nombre', e.target.value)} placeholder={`Nombre del ${T.singular}`} /></td>
                    <td className="px-3 py-1.5"><input className={entrada} type="number" min="0" step="0.01" value={x.precio} onChange={(e) => cambiar(i, 'precio', e.target.value === '' ? '' : Number(e.target.value))} /></td>
                    {tipo === 'productos' ? (<>
                      <td className="px-3 py-1.5"><input className={entrada} value={x.categoria || ''} onChange={(e) => cambiar(i, 'categoria', e.target.value)} /></td>
                      <td className="px-3 py-1.5"><input className={entrada} type="number" min="0" value={x.stock >= 0 ? x.stock : ''} placeholder="∞" onChange={(e) => cambiar(i, 'stock', e.target.value === '' ? -1 : Number(e.target.value))} /></td>
                      <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={x.disponible !== false} onChange={(e) => cambiar(i, 'disponible', e.target.checked)} /></td>
                    </>) : (
                      <td className="px-3 py-1.5"><input className={entrada} type="number" min="5" step="5" value={x.duracion} onChange={(e) => cambiar(i, 'duracion', e.target.value === '' ? '' : Number(e.target.value))} /></td>
                    )}
                    <td className="px-2 py-1.5"><button className="text-gray-500 hover:text-red-400" onClick={() => borrar(i)} aria-label="Borrar"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sucio && <p className="text-xs text-amber-300">Tenés cambios sin guardar. El bot sigue usando la versión anterior hasta que guardes.</p>}
      </div>

      {importando && <Importar tipoInicial={tipo} onClose={() => setImportando(false)} onListo={cargar} />}
    </Layout>
  );
}
