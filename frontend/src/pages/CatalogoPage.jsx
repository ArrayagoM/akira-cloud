import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import ImportarAsistente from '../components/ImportarAsistente';
import FotoProducto from '../components/FotoProducto';
import { bajarArchivo } from '../utils/archivos';
import { Package, Scissors, Plus, Upload, Download, Trash2, Search, Loader2, ChevronDown, Save } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Catálogo: productos y servicios del negocio. Es la MISMA lista que usa el bot
// para cotizar y agendar. Se puede editar a mano, importar (Excel, CSV, PDF o
// foto de una lista de precios) y exportar. Todo queda en esta PC.
// ─────────────────────────────────────────────────────────────

const TIPOS = {
  productos: { label: 'Productos', icon: Package, vacio: { nombre: '', precio: 0, categoria: '', stock: -1, descripcion: '', disponible: true, fuente: 'manual' }, singular: 'producto' },
  servicios: { label: 'Servicios', icon: Scissors, vacio: { nombre: '', precio: 0, duracion: 60, intervaloRecordatorioDias: 0, mensajeRecordatorio: '' }, singular: 'servicio' },
};

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
                  {tipo === 'productos' ? (<><th className="px-3 py-2 font-medium w-20" title="El bot manda esta foto cuando el cliente pregunta por el producto">Foto</th><th className="px-3 py-2 font-medium w-40">Categoría</th><th className="px-3 py-2 font-medium w-24" title="Vacío = sin control de stock">Stock</th><th className="px-3 py-2 font-medium w-20 text-center">Se ofrece</th></>)
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
                      <td className="px-3 py-1.5"><FotoProducto valor={x.imagen} onCambio={(ref) => cambiar(i, 'imagen', ref)} /></td>
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

      {importando && <ImportarAsistente tipoInicial={tipo} tipos={['productos', 'servicios']} onClose={() => setImportando(false)} onListo={cargar} />}
    </Layout>
  );
}
