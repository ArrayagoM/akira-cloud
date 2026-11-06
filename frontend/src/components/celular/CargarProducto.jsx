import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ScanLine, X, Loader2, Sparkles } from 'lucide-react';
import api from '../../services/api';
import { reducirFoto, iniciarEscaner, ESTADOS_PRODUCTO } from '../../lib/productoCelular';
import { versionAlcanza, VERSION_MIN_PRODUCTOS } from '../../lib/versionPc';

// Pestaña "Productos" de la app del celular: foto del producto + código de barras con la cámara + nombre, precio y datos para editar.
// Se envía a la PC (por el mismo canal opcional del control remoto), que lo guarda en el Catálogo con su foto para que el bot lo use.

const VACIO = { nombre: '', precio: '', categoria: '', stock: '', descripcion: '', codigo: '' };
const SUB = { color: 'var(--text2, #9aa8b8)' };

function Escaner({ alLeer, alCerrar }) {
  const video = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let detener = null; let vivo = true;
    iniciarEscaner(video.current, (c) => { if (vivo) alLeer(c); }, (m) => { if (vivo) setError(m); }).then((d) => { detener = d; if (!vivo && d) d(); });
    return () => { vivo = false; if (detener) detener(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <p className="font-bold text-white">Apuntá al código de barras</p>
        <button onClick={alCerrar} aria-label="Cerrar la cámara" className="p-2 -mr-2 text-white"><X size={22} /></button>
      </div>
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video ref={video} playsInline muted className="w-full h-full object-cover" />
        <div className="absolute rounded-xl pointer-events-none" style={{ width: '78%', height: 130, border: '3px solid #00e87b', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
      </div>
      <div className="px-5 py-4 text-center" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {error ? <p className="text-sm" style={{ color: '#f87171' }} role="alert">{error}</p> : <p className="text-sm text-white/80">Se lee solo: no hace falta tocar nada. Con poca luz cuesta más.</p>}
        <button className="btn-secondary mt-3 w-full justify-center" onClick={alCerrar}>Escribir el código a mano</button>
      </div>
    </div>
  );
}

export default function CargarProducto({ estado }) {
  const pcs = (estado && estado.pcs) || [];
  const usables = pcs.filter((p) => p.controlRemoto);
  const [deviceId, setDeviceId] = useState('');
  const [form, setForm] = useState(VACIO);
  const [foto, setFoto] = useState(null);
  const [escaneando, setEscaneando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [sugeridos, setSugeridos] = useState({}); // lo que completó la IA (si el dueño lo edita, deja de figurar como sugerido)
  const lectura = useRef(0);
  const sugeridosRef = useRef({});
  const [nota, setNota] = useState({ texto: '', tipo: 'info' });
  const [lista, setLista] = useState([]);
  const inputFoto = useRef(null);
  const hayPendientes = useRef(false);

  useEffect(() => { if (!usables.some((p) => p.deviceId === deviceId)) setDeviceId(usables[0] ? usables[0].deviceId : ''); }, [pcs.length, usables.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pc = usables.find((p) => p.deviceId === deviceId) || null;

  const cargarLista = useCallback(async () => {
    if (!deviceId) return;
    try { const { data } = await api.get('/mobile/productos', { params: { deviceId } }); setLista(data.productos || []); hayPendientes.current = (data.productos || []).some((x) => x.estado === 'pendiente'); } catch { /* sin conexión: reintenta */ }
  }, [deviceId]);
  useEffect(() => {
    if (!deviceId) return undefined;
    let t; let vivo = true;
    const ciclo = async () => { if (!vivo) return; if (document.visibilityState !== 'hidden') await cargarLista(); if (vivo) t = setTimeout(ciclo, hayPendientes.current ? 5000 : 20000); };
    ciclo();
    return () => { vivo = false; clearTimeout(t); };
  }, [deviceId, cargarLista]);

  const poner = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const esSug = (campo) => !!sugeridos[campo] && form[campo] === sugeridos[campo]; // sigue tal cual lo sugirió la IA (si lo edita, se saca la marca)
  const avisar = (texto, tipo = 'info') => setNota({ texto, tipo });

  const alCodigo = async (codigo) => {
    setEscaneando(false);
    setForm((f) => ({ ...f, codigo }));
    setBuscando(true); avisar('');
    try {
      const { data } = await api.get(`/mobile/codigo/${encodeURIComponent(codigo)}`);
      if (data && data.encontrado) {
        setForm((f) => ({ ...f, codigo, nombre: f.nombre || data.nombre || '', categoria: f.categoria || data.categoria || '' }));
        avisar('Leí el código y completé el nombre con datos de una base pública (Open Food Facts). Revisalo y ponele el precio.');
      } else avisar('Leí el código. No lo encontré en la base pública, completá los datos a mano.');
    } catch { avisar('Leí el código. No pude buscar el nombre ahora: completá los datos a mano.'); }
    finally { setBuscando(false); }
  };

  // La IA lee la foto ANTES de enviar y completa nombre, categoría y descripción para que el dueño los revise y edite. Nunca el precio.
  // Solo completa campos vacíos o que ella misma había sugerido y el dueño no tocó: lo que escribió el dueño no se pisa.
  const leerFoto = async (f) => {
    if (!f) return;
    const turno = ++lectura.current;
    setLeyendo(true); avisar('');
    try {
      const { data } = await api.post('/mobile/productos/analizar', { foto: f.base64 });
      if (turno !== lectura.current) return; // sacó otra foto o la quitó mientras tanto
      if (!data || !data.ok) return avisar((data && data.motivo) || 'No pude leer la foto. Escribí el nombre a mano.', 'info');
      setForm((actual) => {
        const nuevo = { ...actual }; const marcados = {};
        for (const c of ['nombre', 'categoria', 'descripcion']) {
          const sug = String(data[c] || '').trim(); if (!sug) continue;
          if (!actual[c].trim() || (sugeridosRef.current[c] && actual[c] === sugeridosRef.current[c])) { nuevo[c] = sug; marcados[c] = sug; }
        }
        sugeridosRef.current = { ...sugeridosRef.current, ...marcados }; setSugeridos(sugeridosRef.current);
        return nuevo;
      });
      avisar('Leí la foto y completé los datos. Revisalos: la IA puede equivocarse. Ponele el precio y guardá.', 'ok');
    } catch (err) {
      if (turno === lectura.current) avisar(err.response?.status === 429 ? (err.response.data?.error || 'Esperá un momento antes de leer otra foto.') : 'No pude leer la foto ahora. Escribí el nombre a mano.', 'info');
    } finally { if (turno === lectura.current) setLeyendo(false); }
  };

  const alFoto = async (e) => {
    const archivo = e.target.files && e.target.files[0]; e.target.value = '';
    if (!archivo) return;
    try { const f = await reducirFoto(archivo); setFoto(f); avisar(''); leerFoto(f); }
    catch (err) { avisar(err.message === 'imagen' ? 'No pude leer esa foto. Probá con otra.' : err.message, 'error'); }
  };
  const quitarFoto = () => { lectura.current++; setLeyendo(false); setFoto(null); };

  const enviar = async (e) => {
    e.preventDefault();
    const sinNombre = !form.nombre.trim();
    if (sinNombre && !foto) return avisar('Escribí el nombre del producto o sacale una foto: tu PC lo lee de la foto.', 'error');
    if (!/\d/.test(form.precio)) return avisar('Poné el precio (por ejemplo 2500).', 'error');
    setEnviando(true); avisar('');
    try {
      await api.post('/mobile/productos', { deviceId, producto: form, foto: foto ? foto.base64 : '' });
      avisar(sinNombre ? 'Enviado sin nombre. Tu PC va a intentar leer la foto (con tu clave de Groq); si no puede, queda como “Producto sin nombre” para que lo nombres en el Catálogo.' : 'Enviado. Tu PC lo guarda en el Catálogo en menos de 1 minuto.', 'ok');
      setForm((f) => ({ ...VACIO, categoria: f.categoria })); quitarFoto(); sugeridosRef.current = {}; setSugeridos({}); hayPendientes.current = true; cargarLista();
    } catch (err) {
      avisar(err.response?.data?.codigo === 'CELULAR_DESACTIVADO' ? 'Primero activalo en Akira (PC) → Inicio → “Controlar desde la app del celular”.' : (err.response?.data?.error || 'No se pudo enviar. Revisá tu internet y probá de nuevo.'), 'error');
    } finally { setEnviando(false); }
  };

  if (!estado) return <div className="flex justify-center mt-10"><Loader2 className="animate-spin" style={{ color: '#00e87b' }} /></div>;
  if (pcs.length === 0) return <div className="card"><p className="font-bold">Todavía no hay ninguna PC</p><p className="text-sm mt-1.5" style={SUB}>Instalá Akira en tu computadora con Windows (<Link to="/descargar" style={{ color: '#00e87b' }}>akiracloud.lat/descargar</Link>) e iniciá sesión con esta misma cuenta. Después vas a poder cargar productos desde acá.</p></div>;
  if (!pc) {
    const vieja = pcs.find((p) => !versionAlcanza(p.version, VERSION_MIN_PRODUCTOS));
    return (
      <div>
        <h2 className="text-xl font-bold">Cargar productos</h2>
        <p className="text-sm mb-4" style={SUB}>Acá sacás una foto o escaneás el código de barras y el producto aparece en el Catálogo de tu PC. Para que se habilite, tu PC tiene que estar lista:</p>
        {vieja && <div className="card mb-3" style={{ borderColor: '#f59e0b88' }}><p className="font-bold">Tu Akira de la PC está desactualizada (v{vieja.version})</p><p className="text-sm mt-1.5" style={SUB}>Esta función necesita la versión {VERSION_MIN_PRODUCTOS} o más nueva. Bajá la última desde <Link to="/descargar" style={{ color: '#00e87b' }}>akiracloud.lat/descargar</Link> e instalala encima. La copia de Microsoft Store puede tardar más en actualizarse.</p></div>}
        <div className="card"><p className="font-bold">Falta un paso en tu PC</p><p className="text-sm mt-1.5" style={SUB}>En Akira (PC) → Inicio, activá “Controlar desde la app del celular”. Es opcional y lo podés apagar cuando quieras. Cuando lo actives, esta pantalla se habilita sola.</p></div>
      </div>
    );
  }

  const colorNota = nota.tipo === 'error' ? '#f87171' : nota.tipo === 'ok' ? '#00e87b' : undefined;
  return (
    <div>
      {escaneando && <Escaner alLeer={alCodigo} alCerrar={() => setEscaneando(false)} />}
      <h2 className="text-xl font-bold">Cargar productos</h2>
      <p className="text-sm mb-4" style={SUB}>Sacá una foto y la IA completa el nombre, la categoría y la descripción para que los revises y edites. Escaneá el código de barras si lo tiene y ponele el precio: eso siempre lo ponés vos.</p>

      {usables.length > 1 && (
        <select className="input-base mb-3" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="PC de destino">
          {usables.map((p) => <option key={p.deviceId} value={p.deviceId}>{p.nombre}</option>)}
        </select>
      )}
      {!versionAlcanza(pc.version, VERSION_MIN_PRODUCTOS) && <p className="text-xs mb-3" style={{ color: '#f59e0b' }}>Tu Akira de la PC es la v{pc.version}: todavía no recibe productos del celular (necesita la {VERSION_MIN_PRODUCTOS} o más nueva). Actualizala en <Link to="/descargar" style={{ color: '#00e87b' }}>akiracloud.lat/descargar</Link>.</p>}
      {!pc.online && <p className="text-xs mb-3" style={{ color: '#f59e0b' }}>Tu PC está sin señal. Podés cargar igual: los productos esperan (hasta 7 días) a que se prenda.</p>}

      <form onSubmit={enviar} className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn-secondary justify-center" onClick={() => inputFoto.current && inputFoto.current.click()}><Camera size={16} />{foto ? 'Cambiar foto' : 'Sacar foto'}</button>
          <button type="button" className="btn-secondary justify-center" onClick={() => setEscaneando(true)}><ScanLine size={16} />Escanear código</button>
        </div>
        <input ref={inputFoto} type="file" accept="image/*" capture="environment" className="hidden" onChange={alFoto} />
        {foto && (
          <div className="relative">
            <img src={foto.url} alt="Foto del producto" className="w-full rounded-xl object-cover" style={{ maxHeight: 220 }} />
            <button type="button" onClick={quitarFoto} aria-label="Quitar la foto" className="absolute top-2 right-2 rounded-full p-1.5" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}><X size={16} /></button>
          </div>
        )}
        {foto && (
          <button type="button" className="btn-secondary w-full justify-center" disabled={leyendo} onClick={() => leerFoto(foto)}>
            {leyendo ? <><Loader2 size={16} className="animate-spin" />Leyendo la foto…</> : <><Sparkles size={16} />{Object.keys(sugeridos).length ? 'Volver a leer la foto' : 'Completar con IA desde la foto'}</>}
          </button>
        )}

        <div>
          <label className="block text-xs uppercase tracking-wide mb-1.5" style={SUB}>Nombre{esSug('nombre') && <span className="normal-case ml-2" style={{ color: '#00e87b' }}>· sugerido por IA, revisalo</span>}</label>
          <input className="input-base" value={form.nombre} onChange={poner('nombre')} maxLength={120} placeholder="Ej.: Yerba mate 500 g" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={SUB}>Precio ($)</label>
            <input className="input-base" inputMode="decimal" value={form.precio} onChange={poner('precio')} placeholder="2500" required />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={SUB}>Stock (opcional)</label>
            <input className="input-base" inputMode="numeric" value={form.stock} onChange={poner('stock')} placeholder="Sin control" />
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide mb-1.5" style={SUB}>Código de barras {buscando && <Loader2 size={12} className="inline animate-spin ml-1" />}</label>
          <input className="input-base" value={form.codigo} onChange={poner('codigo')} maxLength={40} inputMode="text" placeholder="Escanealo o escribilo" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide mb-1.5" style={SUB}>Categoría (opcional){esSug('categoria') && <span className="normal-case ml-2" style={{ color: '#00e87b' }}>· sugerido por IA</span>}</label>
          <input className="input-base" value={form.categoria} onChange={poner('categoria')} maxLength={60} placeholder="Ej.: Almacén" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide mb-1.5" style={SUB}>Descripción (opcional){esSug('descripcion') && <span className="normal-case ml-2" style={{ color: '#00e87b' }}>· sugerido por IA</span>}</label>
          <textarea className="input-base" rows={2} value={form.descripcion} onChange={poner('descripcion')} maxLength={500} placeholder="Lo que el bot le cuenta al cliente" />
        </div>
        {!!nota.texto && <p className="text-sm" style={{ color: colorNota || SUB.color }} role="status">{nota.texto}</p>}
        <button type="submit" disabled={enviando || leyendo} className="btn-primary w-full justify-center">{enviando ? <Loader2 size={16} className="animate-spin" /> : leyendo ? 'Leyendo la foto…' : 'Guardar en mi PC'}</button>
        <p className="text-xs" style={SUB}>La foto y los datos pasan por la nube solo hasta que tu PC los recibe; la foto se borra de la nube en ese momento (la lectura con IA no guarda la foto). El precio lo ponés vos: la IA nunca lo inventa.</p>
      </form>

      {lista.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-bold mb-2" style={SUB}>ÚLTIMOS ENVIADOS</h3>
          <div className="space-y-2">
            {lista.map((p) => {
              const e = ESTADOS_PRODUCTO[p.estado] || ESTADOS_PRODUCTO.pendiente;
              return (
                <div key={p.id} className="card flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="font-semibold truncate">{p.nombre || 'Producto con foto'}</p>{!!p.detalle && p.estado !== 'pendiente' && <p className="text-xs" style={{ color: p.estado === 'fallo' ? '#f87171' : SUB.color }}>{p.detalle}</p>}</div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: e.color + '22', color: e.color }}>{e.texto}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
