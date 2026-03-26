import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Save, Key, Eye, EyeOff, CheckCircle, XCircle, Upload, Trash2, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

function SeccionCollapsible({ titulo, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left">
        <span className="font-semibold text-white text-sm">{titulo}</span>
        {open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>
      {open && <div className="mt-5 pt-5 border-t border-gray-800">{children}</div>}
    </div>
  );
}

function KeyField({ campo, label, placeholder, keys, onSave, onDelete }) {
  const [valor, setValor]     = useState('');
  const [show, setShow]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const cargada = keys[campo.replace('key','').replace('id','').replace('Key','').toLowerCase()] ||
                  keys[campo === 'idCalendar' ? 'calendar' : campo === 'keyRime' ? 'rime' : campo === 'keyNgrok' ? 'ngrok' : campo === 'credentialsGoogleB64' ? 'credentialsGoogle' : campo.replace('key','').toLowerCase()];

  const save = async () => {
    if (!valor.trim()) return;
    setSaving(true);
    try {
      await onSave(campo, valor.trim());
      setValor('');
      toast.success(`${label} guardada`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Key size={11} /> {label}
        </label>
        {cargada
          ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle size={11} /> Configurada</span>
          : <span className="flex items-center gap-1 text-xs text-gray-600"><XCircle size={11} /> No configurada</span>}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={valor}
            onChange={e => setValor(e.target.value)}
            placeholder={cargada ? '••••••••••••••• (no se muestra por seguridad)' : placeholder}
            className="input-base pr-10"
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <button onClick={save} disabled={!valor.trim() || saving} className="btn-primary px-4 py-2 text-xs">
          {saving ? <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Save size={13} />}
        </button>
        {cargada && (
          <button onClick={() => onDelete(campo)} className="btn-danger px-3 py-2 text-xs">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const [config, setConfig]   = useState({});
  const [keys,   setKeys]     = useState({});
  const [form,   setForm]     = useState({
    miNombre: '', negocio: '', servicios: '', precioTurno: '1000',
    horasCancelacion: '24', promptPersonalizado: '', dominioNgrok: '', mpWebhookUrl: '',
    aliasTransferencia: '', cbuTransferencia: '', bancoTransferencia: '',
    serviciosList: [],
  });
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: '', precio: '', duracion: '60' });
  const [mostrarFormServicio, setMostrarFormServicio] = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    api.get('/config').then(r => {
      setConfig(r.data.config);
      setKeys(r.data.keys);
      const c = r.data.config;
      setForm({
        miNombre:            c.miNombre || '',
        negocio:             c.negocio  || '',
        servicios:           c.servicios || 'turnos y reservas',
        precioTurno:         String(c.precioTurno || 1000),
        horasCancelacion:    String(c.horasCancelacion || 24),
        promptPersonalizado: c.promptPersonalizado || '',
        dominioNgrok:        c.dominioNgrok || '',
        mpWebhookUrl:        c.mpWebhookUrl || '',
        aliasTransferencia:  c.aliasTransferencia  || '',
        cbuTransferencia:    c.cbuTransferencia    || '',
        bancoTransferencia:  c.bancoTransferencia  || '',
        serviciosList:       Array.isArray(c.serviciosList) ? c.serviciosList : [],
      });
    }).catch(() => toast.error('Error cargando configuración'));
  }, []);

  const handleForm = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const agregarServicio = () => {
    if (!nuevoServicio.nombre.trim() || !nuevoServicio.precio) return;
    const servicio = {
      nombre:   nuevoServicio.nombre.trim(),
      precio:   parseFloat(nuevoServicio.precio),
      duracion: parseInt(nuevoServicio.duracion) || 60,
    };
    setForm(f => ({ ...f, serviciosList: [...f.serviciosList, servicio] }));
    setNuevoServicio({ nombre: '', precio: '', duracion: '60' });
    setMostrarFormServicio(false);
  };

  const eliminarServicio = (idx) => {
    setForm(f => ({ ...f, serviciosList: f.serviciosList.filter((_, i) => i !== idx) }));
  };

  const saveNegocio = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put('/config/negocio', {
        ...form,
        precioTurno:    parseFloat(form.precioTurno),
        horasCancelacion: parseInt(form.horasCancelacion),
        serviciosList:  form.serviciosList,
      });
      setConfig(r.data.config);
      toast.success('Configuración guardada');
    } catch (err) {
      toast.error(err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveKey = async (campo, valor) => {
    const r = await api.put('/config/keys', { campo, valor });
    setKeys(r.data.keys);
  };

  const deleteKey = async (campo) => {
    if (!confirm('¿Seguro que querés eliminar esta key?')) return;
    const r = await api.delete(`/config/keys/${campo}`);
    setKeys(r.data.keys);
    toast.success('Key eliminada');
  };

  const uploadCredentials = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text); // validar que es JSON válido
      await saveKey('credentialsGoogleB64', text);
      toast.success('credentials.json importado correctamente');
    } catch {
      toast.error('El archivo no es un JSON válido');
    }
    e.target.value = '';
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuración</h1>
          <p className="text-gray-500 text-sm mt-1">Personalizá tu bot y conectá tus servicios.</p>
        </div>

        {/* Datos del negocio */}
        <SeccionCollapsible titulo="🏢 Datos del negocio" defaultOpen>
          <form onSubmit={saveNegocio} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Tu nombre *</label>
                <input name="miNombre" value={form.miNombre} onChange={handleForm} required className="input-base" placeholder="Martín" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Negocio *</label>
                <input name="negocio" value={form.negocio} onChange={handleForm} required className="input-base" placeholder="Peluquería Estilo" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Servicios</label>
              <input name="servicios" value={form.servicios} onChange={handleForm} className="input-base" placeholder="cortes, coloración, depilación" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Precio por hora (ARS)</label>
                <input name="precioTurno" type="number" value={form.precioTurno} onChange={handleForm} min="0" className="input-base" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Horas mín. para cancelar</label>
                <input name="horasCancelacion" type="number" value={form.horasCancelacion} onChange={handleForm} min="0" className="input-base" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Instrucciones extra para la IA</label>
              <textarea name="promptPersonalizado" value={form.promptPersonalizado} onChange={handleForm} rows={3}
                className="input-base resize-none" placeholder="Ej: No atender los domingos. El precio incluye IVA. Solo para mayores de 18 años." />
              <p className="text-xs text-gray-600 mt-1">{form.promptPersonalizado.length}/2000 caracteres</p>
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Guardando...</> : <><Save size={15} />Guardar</>}
            </button>
          </form>
        </SeccionCollapsible>

        {/* Groq */}
        <SeccionCollapsible titulo="🤖 Groq API (IA) — REQUERIDO" defaultOpen={!keys.groq}>
          <p className="text-xs text-gray-500 mb-4">
            Conseguí tu API Key gratis en <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">console.groq.com</a> → API Keys.
          </p>
          <KeyField campo="keyGroq" label="Groq API Key" placeholder="gsk_..." keys={keys} onSave={saveKey} onDelete={deleteKey} />
        </SeccionCollapsible>

        {/* MercadoPago */}
        <SeccionCollapsible titulo="💳 Pagos (MercadoPago o Transferencia)">
          <div className="space-y-5">
            {/* MercadoPago */}
            <div>
              <p className="text-xs font-semibold text-gray-300 mb-1">Opción A — MercadoPago (link automático)</p>
              <p className="text-xs text-gray-500 mb-3">El bot genera links de pago automáticos. Si configurás esto, tiene prioridad sobre la transferencia.</p>
              <div className="space-y-3">
                <KeyField campo="keyMP" label="Access Token" placeholder="APP_USR-..." keys={keys} onSave={saveKey} onDelete={deleteKey} />
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">URL del Webhook</label>
                  <div className="flex gap-2">
                    <input name="mpWebhookUrl" value={form.mpWebhookUrl} onChange={handleForm} className="input-base" placeholder="https://tu-dominio.com/webhook" />
                    <button onClick={saveNegocio} className="btn-secondary px-4 py-2 text-xs whitespace-nowrap"><Save size={13} /></button>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-4">
              <p className="text-xs font-semibold text-gray-300 mb-1">Opción B — Transferencia bancaria (alias / CBU / CVU)</p>
              <p className="text-xs text-gray-500 mb-3">Si no usás MercadoPago, el bot usará estos datos cuando un cliente pida pagar por transferencia.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Alias de transferencia</label>
                  <div className="flex gap-2">
                    <input name="aliasTransferencia" value={form.aliasTransferencia} onChange={handleForm} className="input-base" placeholder="ejemplo: mi.alias.mp" />
                    <button onClick={saveNegocio} className="btn-secondary px-3 py-2 text-xs"><Save size={13} /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">CBU / CVU</label>
                  <div className="flex gap-2">
                    <input name="cbuTransferencia" value={form.cbuTransferencia} onChange={handleForm} className="input-base" placeholder="0000000000000000000000" />
                    <button onClick={saveNegocio} className="btn-secondary px-3 py-2 text-xs"><Save size={13} /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Banco (opcional)</label>
                  <div className="flex gap-2">
                    <input name="bancoTransferencia" value={form.bancoTransferencia} onChange={handleForm} className="input-base" placeholder="Ej: Banco Galicia, Mercado Pago, etc." />
                    <button onClick={saveNegocio} className="btn-secondary px-3 py-2 text-xs"><Save size={13} /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SeccionCollapsible>

        {/* Servicios */}
        <SeccionCollapsible titulo="🛠️ Servicios">
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Agregá los servicios que ofrecés. El bot los usará para informar precios y duraciones.</p>

            {/* Lista de servicios */}
            {form.serviciosList.length > 0 ? (
              <div className="space-y-2">
                {form.serviciosList.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-sm font-medium text-white truncate">{s.nombre}</span>
                      <span className="text-xs text-green-400 flex-shrink-0">${s.precio.toLocaleString('es-AR')}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">{s.duracion} min</span>
                    </div>
                    <button onClick={() => eliminarServicio(idx)} className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 ml-2">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-gray-700 rounded-lg">
                <p className="text-gray-600 text-sm">No hay servicios cargados</p>
              </div>
            )}

            {/* Formulario inline para nuevo servicio */}
            {mostrarFormServicio ? (
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-300">Nuevo servicio</p>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Nombre *</label>
                  <input
                    value={nuevoServicio.nombre}
                    onChange={e => setNuevoServicio(s => ({ ...s, nombre: e.target.value }))}
                    className="input-base"
                    placeholder="Ej: Corte de cabello"
                    onKeyDown={e => e.key === 'Enter' && agregarServicio()}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Precio (ARS) *</label>
                    <input
                      type="number"
                      min="0"
                      value={nuevoServicio.precio}
                      onChange={e => setNuevoServicio(s => ({ ...s, precio: e.target.value }))}
                      className="input-base"
                      placeholder="1500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Duración (minutos)</label>
                    <input
                      type="number"
                      min="1"
                      value={nuevoServicio.duracion}
                      onChange={e => setNuevoServicio(s => ({ ...s, duracion: e.target.value }))}
                      className="input-base"
                      placeholder="60"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={agregarServicio} disabled={!nuevoServicio.nombre.trim() || !nuevoServicio.precio} className="btn-primary text-xs px-4 py-2">
                    <Plus size={13} /> Agregar
                  </button>
                  <button onClick={() => { setMostrarFormServicio(false); setNuevoServicio({ nombre: '', precio: '', duracion: '60' }); }} className="btn-secondary text-xs px-4 py-2">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setMostrarFormServicio(true)} className="btn-secondary text-xs flex items-center gap-1.5">
                <Plus size={13} /> Agregar servicio
              </button>
            )}

            {/* Guardar servicios */}
            {form.serviciosList.length > 0 && (
              <button onClick={saveNegocio} disabled={saving} className="btn-primary text-xs">
                {saving ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Guardando...</> : <><Save size={13} />Guardar servicios</>}
              </button>
            )}
          </div>
        </SeccionCollapsible>

        {/* Google Calendar */}
        <SeccionCollapsible titulo="📅 Google Calendar (agenda)">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">credentials.json</label>
                {keys.credentialsGoogle
                  ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle size={11} /> Configurado</span>
                  : <span className="flex items-center gap-1 text-xs text-gray-600"><XCircle size={11} /> No configurado</span>}
              </div>
              <label className="flex items-center gap-3 cursor-pointer btn-secondary w-full justify-center py-3">
                <Upload size={15} /> Subir credentials.json
                <input type="file" accept=".json" onChange={uploadCredentials} className="hidden" />
              </label>
              <p className="text-xs text-gray-600 mt-1.5">Generá el archivo en Google Cloud Console → Cuenta de servicio → Claves.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Calendar ID</label>
              <div className="flex gap-2">
                <input name="idCalendar" placeholder="tu-email@gmail.com" className="input-base flex-1"
                  defaultValue={config.idCalendar || ''}
                  onBlur={e => e.target.value && saveKey('idCalendar', e.target.value)} />
              </div>
              <p className="text-xs text-gray-600 mt-1">Es tu email de Gmail o el ID del calendario en Google Calendar.</p>
            </div>
          </div>
        </SeccionCollapsible>

        {/* RIME TTS */}
        <SeccionCollapsible titulo="🔊 RIME AI (respuestas por audio)">
          <p className="text-xs text-gray-500 mb-4">
            Permite que Akira responda con voz. Conseguí tu key en <a href="https://rime.ai" target="_blank" rel="noreferrer" className="text-green-400 hover:underline">rime.ai</a>.
          </p>
          <KeyField campo="keyRime" label="RIME API Key" placeholder="rime_..." keys={keys} onSave={saveKey} onDelete={deleteKey} />
        </SeccionCollapsible>

        {/* Ngrok */}
        <SeccionCollapsible titulo="🌐 Ngrok (webhook local)">
          <p className="text-xs text-gray-500 mb-4">Solo necesario si tu servidor es local y no tenés dominio propio.</p>
          <div className="space-y-4">
            <KeyField campo="keyNgrok" label="Ngrok Auth Token" placeholder="de dashboard.ngrok.com" keys={keys} onSave={saveKey} onDelete={deleteKey} />
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Dominio fijo (opcional)</label>
              <div className="flex gap-2">
                <input name="dominioNgrok" value={form.dominioNgrok} onChange={handleForm} className="input-base flex-1" placeholder="tu-nombre.ngrok-free.app" />
                <button onClick={saveNegocio} className="btn-secondary px-4 text-xs"><Save size={13} /></button>
              </div>
            </div>
          </div>
        </SeccionCollapsible>
      </div>
    </Layout>
  );
}
