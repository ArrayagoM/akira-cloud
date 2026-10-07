import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  Upload, X, Loader2, FileSpreadsheet, FileText, Image as ImageIcon, CheckCircle2, AlertTriangle, Undo2,
} from 'lucide-react';
import api from '../services/api';
import { bajarArchivo, aBase64, pesos } from '../utils/archivos';

// Asistente de importación de 4 pasos (archivo → columnas → vista previa → listo con "deshacer").
// Lo usan Catálogo (productos y servicios) y Caja (movimientos). Todo se lee en esta PC.

const ETIQUETAS = { productos: 'Productos', servicios: 'Servicios', movimientos: 'Movimientos', proveedores: 'Proveedores' };
const CAMPOS_MAPEO = {
  productos: [['nombre', 'Nombre', true], ['precio', 'Precio', true], ['categoria', 'Categoría'], ['stock', 'Stock'], ['descripcion', 'Descripción']],
  servicios: [['nombre', 'Nombre', true], ['precio', 'Precio', true], ['duracion', 'Duración (min)']],
  proveedores: [['nombre', 'Nombre', true], ['telefono', 'Teléfono'], ['cuit', 'CUIT'], ['rubro', 'Rubro'], ['notas', 'Notas']],
  movimientos: [['fecha', 'Fecha', true], ['monto', 'Monto', true], ['tipo', 'Tipo (ingreso / gasto)'], ['categoria', 'Categoría'], ['descripcion', 'Descripción'], ['metodo', 'Método de pago']],
};
const ESTADOS = {
  nuevo:      { txt: 'Nuevo',        cls: 'text-emerald-300 bg-emerald-500/10' },
  actualiza:  { txt: 'Actualiza',    cls: 'text-sky-300 bg-sky-500/10' },
  duplicado:  { txt: 'Repetido',     cls: 'text-gray-400 bg-white/5' },
  error:      { txt: 'Con error',    cls: 'text-red-300 bg-red-500/10' },
};

// ───────────────────────── Asistente de importación ─────────────────────────
export default function ImportarAsistente({ tipoInicial, tipos = ['productos', 'servicios'], onClose, onListo }) {
  const [paso, setPaso] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [analisis, setAnalisis] = useState(null);
  const [tipo, setTipo] = useState(tipoInicial);
  const [hoja, setHoja] = useState(0);
  const [mapeo, setMapeo] = useState({});
  const [tipoDefecto, setTipoDefecto] = useState('gasto'); // Caja: si el archivo no trae columna de tipo
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
      const t = tipos.includes(r.data.tipoSugerido) ? r.data.tipoSugerido : tipoInicial;
      setTipo(t);
      setHoja(0);
      setMapeo(r.data.hojas[0].mapeoSugerido[t]);
      setPaso(2);
    } catch (e) { err(e, 'No pude leer el archivo'); }
    finally { setCargando(false); }
  };

  const cambiarTipo = (t) => { setTipo(t); if (hojaActual) setMapeo(hojaActual.mapeoSugerido[t]); };
  const cambiarHoja = (i) => { setHoja(i); setMapeo(analisis.hojas[i].mapeoSugerido[tipo]); };

  const body = () => ({ importacionId: analisis.importacionId, hoja, tipo, mapeo: tipo === 'movimientos' ? { ...mapeo, tipoPorDefecto: tipoDefecto } : mapeo, modo: (tipo === 'movimientos' || tipo === 'proveedores') ? 'agregar' : modo, excluir: [...excluir] });

  const previsualizar = async () => {
    const obligatorios = CAMPOS_MAPEO[tipo].filter((c) => c[2]).map((c) => c[0]);
    if (obligatorios.some((c) => mapeo[c] == null)) { toast.error(tipo === 'movimientos' ? 'Indicá qué columna es la fecha y cuál es el monto' : 'Indicá qué columna es el nombre y cuál es el precio'); return; }
    setCargando(true);
    try {
      const r = await api.post('/gestion/previsualizar', body());
      setVista(r.data); setExcluir(new Set()); setPaso(3);
    } catch (e) { err(e, 'No se pudo armar la vista previa'); }
    finally { setCargando(false); }
  };

  const confirmar = async () => {
    if (modo === 'reemplazar' && !window.confirm(`Esto borra tus ${ETIQUETAS[tipo].toLowerCase()} actuales y deja solo lo del archivo. ¿Seguro? (Después podés deshacerlo.)`)) return;
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
            <h3 className="text-lg font-semibold text-white">Importar {ETIQUETAS[tipo].toLowerCase()}</h3>
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
              {tipos.length > 1 && <span className="text-sm text-gray-400">El archivo tiene:</span>}
              {tipos.length > 1 && tipos.map((k) => (
                <button key={k} onClick={() => cambiarTipo(k)} className="text-sm px-3 py-1 rounded-full border"
                  style={tipo === k ? { color: 'var(--accent)', borderColor: 'rgba(0,232,123,0.4)', background: 'rgba(0,232,123,0.08)' } : { color: '#9ca3af', borderColor: 'rgba(255,255,255,0.12)' }}>{ETIQUETAS[k]}</button>
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
            {tipo === 'movimientos' && mapeo.tipo == null && (
              <div className="flex flex-wrap items-center gap-4 text-sm rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
                <span className="text-gray-400">Este archivo no tiene columna de tipo: todo lo que trae son…</span>
                <label className="flex items-center gap-1.5 text-gray-200 cursor-pointer"><input type="radio" checked={tipoDefecto === 'gasto'} onChange={() => setTipoDefecto('gasto')} /> Gastos</label>
                <label className="flex items-center gap-1.5 text-gray-200 cursor-pointer"><input type="radio" checked={tipoDefecto === 'ingreso'} onChange={() => setTipoDefecto('ingreso')} /> Ingresos</label>
                <span className="text-[11px] text-gray-500 w-full">Los montos negativos siempre se toman como gasto.</span>
              </div>
            )}
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
            {tipo === 'movimientos' || tipo === 'proveedores' ? (
              <p className="text-xs text-gray-500">{tipo === 'movimientos' ? 'En la Caja solo se suman movimientos nuevos: nunca se borra ni se pisa nada de lo que ya cargaste.' : 'Se suman los proveedores nuevos y se completan los datos de los que ya tenés con el mismo nombre. No se borra ninguno.'}</p>
            ) : (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer"><input type="radio" checked={modo === 'agregar'} onChange={() => setModo('agregar')} /> Sumar y actualizar lo que ya tengo</label>
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer"><input type="radio" checked={modo === 'reemplazar'} onChange={() => setModo('reemplazar')} /> Reemplazar todo por este archivo</label>
            </div>
            )}
            <div className="overflow-auto rounded-lg border border-white/10 max-h-[42vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#0b1017]"><tr className="text-gray-500 text-left"><th className="px-2 py-1.5 w-8"></th><th className="px-2 py-1.5">{tipo === 'movimientos' ? 'Fecha · Descripción' : 'Nombre'}</th><th className="px-2 py-1.5">{tipo === 'movimientos' ? 'Monto' : tipo === 'proveedores' ? 'Teléfono' : 'Precio'}</th><th className="px-2 py-1.5">{tipo === 'productos' ? 'Categoría · Stock' : tipo === 'servicios' ? 'Duración' : tipo === 'proveedores' ? 'Rubro · CUIT' : 'Tipo · Método'}</th><th className="px-2 py-1.5">Estado</th></tr></thead>
                <tbody>
                  {vista.filas.map((f) => {
                    const apagada = f.estado === 'error' || f.estado === 'duplicado' || excluir.has(f.fila);
                    return (
                      <tr key={f.fila} className={`border-t border-white/5 ${apagada ? 'opacity-50' : ''}`}>
                        <td className="px-2 py-1"><input type="checkbox" disabled={f.estado === 'error' || f.estado === 'duplicado'} checked={!apagada}
                          onChange={() => setExcluir((s) => { const n = new Set(s); n.has(f.fila) ? n.delete(f.fila) : n.add(f.fila); return n; })} /></td>
                        <td className="px-2 py-1 text-white">{tipo === 'movimientos' ? `${f.dato.fecha ? f.dato.fecha.split('-').reverse().join('/') : '—'} · ${f.dato.descripcion || f.dato.categoria}` : (f.dato.nombre || <em className="text-gray-500">(vacío)</em>)}</td>
                        <td className="px-2 py-1" style={{ color: tipo === 'movimientos' ? (f.dato.tipo === 'ingreso' ? '#6ee7b7' : '#fca5a5') : '#d1d5db' }}>{tipo === 'proveedores' ? (f.dato.telefono || '—') : (f.errores.length ? '—' : pesos(tipo === 'movimientos' ? f.dato.monto : f.dato.precio))}</td>
                        <td className="px-2 py-1 text-gray-400">{tipo === 'productos' ? `${f.dato.categoria || '—'} · ${f.dato.stock >= 0 ? f.dato.stock : 'sin control'}` : tipo === 'servicios' ? `${f.dato.duracion} min` : tipo === 'proveedores' ? `${f.dato.rubro || '—'} · ${f.dato.cuit || 'sin CUIT'}` : `${f.dato.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} · ${f.dato.metodo}`}</td>
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
                {cargando ? 'Importando…' : `Importar ${vista.resumen.nuevos + vista.resumen.actualizan - [...excluir].length > 0 ? vista.resumen.nuevos + vista.resumen.actualizan - [...excluir].length : ''} ${ETIQUETAS[tipo].toLowerCase()}`}
              </button>
            </div>
          </div>
        )}

        {paso === 4 && resultado && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
            <p className="text-white text-lg font-semibold">¡Listo! Ya lo usa tu bot</p>
            <p className="text-sm text-gray-400">{resultado.agregados} nuevos · {resultado.actualizados} actualizados{resultado.omitidos ? ` · ${resultado.omitidos} omitidos` : ''} · ahora tenés {resultado.total} {ETIQUETAS[tipo].toLowerCase()}.</p>
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

