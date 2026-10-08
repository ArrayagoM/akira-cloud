import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard, ArrowRight, MessageSquare, Monitor, Download, Smartphone, BookOpen, Lightbulb, LifeBuoy,
  Sparkles, TrendingUp, TrendingDown, Calendar, HandCoins, Truck, Users, FileText, Power,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import InstalarApp from '../components/InstalarApp';
import AppCelularCard from '../components/AppCelularCard';
import ReferralCard from '../components/ReferralCard';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { pesos } from '../utils/archivos';
import { NOVEDADES } from '../data/novedades';

// Panel de la versión web. El bot, la agenda, los clientes y la configuración viven en la app de
// escritorio (en la PC del negocio); la web es para la cuenta: plan, equipos, uso, novedades,
// ayuda y —si el usuario lo activa en la app— un resumen del negocio para mirar desde el celular.

const EN_LINEA_MS = 30 * 60 * 1000;
const hace = (f) => {
  if (!f) return '—';
  const min = Math.floor((Date.now() - new Date(f).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};

function Mosaico({ icono: I, titulo, valor, color = '#e5e7eb', detalle, children }) {
  return (
    <div className="card py-3">
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}><I size={14} style={{ color }} />{titulo}</div>
      <p className="text-xl font-bold mt-1" style={{ color }}>{valor}</p>
      {detalle && <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{detalle}</p>}
      {children}
    </div>
  );
}

export default function CuentaPanel() {
  const { user } = useAuth();
  const [sub, setSub] = useState(null);
  const [uso, setUso] = useState(null);
  const [equipos, setEquipos] = useState(null); // { devices, limite }
  const [ultima, setUltima] = useState(null);

  const cargarEquipos = useCallback(() => api.get('/licenses/mine').then((r) => setEquipos(r.data)).catch(() => setEquipos({ devices: [], limite: 1 })), []);
  useEffect(() => {
    api.get('/subscriptions/mi-suscripcion').then((r) => setSub(r.data)).catch(() => {});
    api.get('/bot/uso').then((r) => setUso(r.data)).catch(() => {});
    api.get('/desktop/latest').then((r) => setUltima(r.data)).catch(() => {});
    cargarEquipos();
    const t = setInterval(cargarEquipos, 60_000);
    return () => clearInterval(t);
  }, [cargarEquipos]);

  const desactivar = async (d) => {
    if (!window.confirm(`¿Desactivar "${d.nombre || 'este equipo'}"? Libera su lugar en tu plan y el bot de ese equipo se pausa.`)) return;
    try { await api.post('/licenses/deactivate', { deviceId: d.deviceId }); toast.success('Equipo desactivado'); cargarEquipos(); }
    catch (e) { toast.error(e.response?.data?.error || 'No se pudo desactivar'); }
  };

  const nombre = (user?.nombre || '').split(' ')[0];
  const esAdmin = sub?.esAdmin;
  const etiquetaPlan = sub ? (sub.planBase === 'trial' ? 'Prueba gratis' : `Plan ${sub.planBase}`) : '';
  const devices = equipos?.devices || [];
  const enLinea = devices.filter((d) => Date.now() - new Date(d.ultimoHeartbeat).getTime() < EN_LINEA_MS).length;
  const conResumen = devices.filter((d) => d.resumen).sort((a, b) => new Date(b.resumenEn) - new Date(a.resumenEn))[0];
  const rs = conResumen?.resumen;
  const pctUso = uso && uso.limite ? Math.min(100, Math.round((uso.usados / uso.limite) * 100)) : 0;
  const versionEquipo = devices.map((d) => d.version).filter(Boolean).sort().pop();
  const desactualizada = ultima?.version && versionEquipo && versionEquipo !== ultima.version;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5 animate-page-in">
        <div>
          <h1 className="text-2xl font-bold text-white">{nombre ? `¡Hola, ${nombre}!` : '¡Hola!'}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Acá ves el estado de tu cuenta. Tu bot y tu gestión se manejan desde la app en tu PC.</p>
        </div>

        {sub && !esAdmin && (
          <div className="card flex items-center gap-4 flex-wrap">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,232,123,0.1)' }}><CreditCard size={18} style={{ color: '#00e87b' }} /></div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-semibold text-white">{etiquetaPlan}</p>
              <p className="text-xs" style={{ color: sub.planVigente ? 'var(--text2)' : '#f43f5e' }}>
                {sub.planVigente ? `Te quedan ${sub.diasRestantes} día${sub.diasRestantes === 1 ? '' : 's'}.` : 'Tu plan venció — elegí uno para reactivar el bot.'}
              </p>
            </div>
            <Link to="/planes" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: '#00e87b' }}>
              {sub.planVigente && sub.planBase !== 'trial' ? 'Ver planes' : 'Elegir plan'} <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* Estado de la cuenta */}
        <div className="grid sm:grid-cols-3 gap-3">
          <Mosaico icono={MessageSquare} titulo="Mensajes este mes" color="#00e87b"
            valor={uso ? (uso.limite ? `${uso.usados.toLocaleString('es-AR')} de ${uso.limite.toLocaleString('es-AR')}` : uso.usados.toLocaleString('es-AR')) : '—'}
            detalle={uso ? (uso.limite ? `${pctUso}% del cupo de tu plan` : 'Sin límite en tu plan') : ''}>
            {uso?.limite ? <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(3, pctUso)}%`, background: pctUso > 85 ? '#f43f5e' : '#00e87b' }} /></div> : null}
          </Mosaico>
          <Mosaico icono={Monitor} titulo="Equipos" color={enLinea ? '#00e87b' : '#e5e7eb'}
            valor={equipos ? `${devices.length}${equipos.limite < 90 ? ` de ${equipos.limite}` : ''}` : '—'}
            detalle={equipos ? (devices.length ? `${enLinea} en línea ahora` : 'Todavía no instalaste la app') : ''} />
          <Mosaico icono={Download} titulo="Versión de la app" color={desactualizada ? '#fbbf24' : '#e5e7eb'}
            valor={ultima?.version ? `v${ultima.version}` : '—'}
            detalle={desactualizada ? `Tu equipo tiene v${versionEquipo}: se actualiza sola` : versionEquipo ? 'Tu equipo está al día' : 'Última disponible'} />
        </div>

        {/* Tu negocio hoy (opcional) */}
        {rs ? (
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="text-sm font-semibold text-white flex items-center gap-2"><Smartphone size={15} style={{ color: '#00e87b' }} />Tu negocio hoy</p>
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Actualizado {hace(conResumen.resumenEn)} · {conResumen.nombre || 'tu PC'}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                [MessageSquare, 'Mensajes hoy', rs.mensajesHoy, '#00e87b'], [Calendar, 'Turnos hoy', rs.turnosHoy, '#7dd3fc'],
                [TrendingUp, 'Ingresos del mes', pesos(rs.ingresosMes), '#34d399'], [TrendingDown, 'Gastos del mes', pesos(rs.gastosMes), '#f87171'],
                [TrendingUp, 'Resultado del mes', `${(rs.ingresosMes - rs.gastosMes) < 0 ? '-' : ''}${pesos(Math.abs(rs.ingresosMes - rs.gastosMes))}`, (rs.ingresosMes - rs.gastosMes) >= 0 ? '#34d399' : '#f87171'],
                [HandCoins, 'Te deben', pesos(rs.teDeben), '#fbbf24'], [Truck, 'Debés', pesos(rs.debes), '#f87171'], [Users, 'Clientes', rs.clientes, '#e5e7eb'],
              ].map(([I, t, v, c]) => (
                <div key={t} className="rounded-lg border border-white/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text2)' }}><I size={12} style={{ color: c }} />{t}</div>
                  <p className="text-lg font-bold mt-0.5" style={{ color: c }}>{v ?? '—'}</p>
                </div>
              ))}
            </div>
            {rs.documentosPendientes > 0 && <p className="text-xs mt-3 flex items-center gap-1.5" style={{ color: '#fbbf24' }}><FileText size={13} />Tenés {rs.documentosPendientes} documento(s) sin revisar en la app.</p>}
            <p className="text-[11px] mt-3" style={{ color: 'var(--muted)' }}>Son solo números que tu PC envía mientras tenga activado "Ver tu negocio desde el celular". Podés apagarlo cuando quieras desde el Dashboard de la app y se borra de acá.</p>
          </div>
        ) : devices.length > 0 ? (
          <div className="card flex items-center gap-4 flex-wrap">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,232,123,0.1)' }}><Smartphone size={18} style={{ color: '#00e87b' }} /></div>
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-semibold text-white">Mirá tu negocio desde el celular</p>
              <p className="text-xs" style={{ color: 'var(--text2)' }}>Activá "Ver tu negocio desde el celular" en el Dashboard de la app y acá vas a ver cómo viene el día: mensajes, turnos, ingresos, gastos y lo que te deben. Solo números, nunca datos de tus clientes.</p>
            </div>
          </div>
        ) : null}

        {/* Equipos */}
        {devices.length > 0 && (
          <div className="card">
            <p className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Monitor size={15} style={{ color: '#00e87b' }} />Mis equipos</p>
            <div className="divide-y divide-white/5">
              {devices.map((d) => {
                const on = Date.now() - new Date(d.ultimoHeartbeat).getTime() < EN_LINEA_MS;
                return (
                  <div key={d.deviceId} className="flex items-center gap-3 py-2.5 flex-wrap">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: on ? '#00e87b' : '#4b5563', boxShadow: on ? '0 0 6px #00e87b' : 'none' }} />
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-sm text-white">{d.nombre || 'Equipo sin nombre'}</p>
                      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{on ? 'En línea' : `Última señal ${hace(d.ultimoHeartbeat)}`}{d.version ? ` · v${d.version}` : ''}</p>
                    </div>
                    <button className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-red-500/10" style={{ color: '#f87171' }} onClick={() => desactivar(d)}><Power size={12} />Desactivar</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Instalar: solo si todavía no hay ningún equipo */}
        {devices.length === 0 && <InstalarApp />}
        <AppCelularCard />

        {/* Novedades */}
        <div className="card">
          <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Sparkles size={15} style={{ color: '#00e87b' }} />Novedades</p>
          <div className="space-y-4">
            {NOVEDADES.map((n) => (
              <div key={n.version} className="pl-3" style={{ borderLeft: '2px solid rgba(0,232,123,0.5)' }}>
                <p className="text-xs font-semibold text-white">v{n.version} <span className="font-normal" style={{ color: 'var(--muted)' }}>· {n.fecha}</span></p>
                <ul className="mt-1 space-y-1">{n.items.map((i) => <li key={i} className="text-xs" style={{ color: 'var(--text2)' }}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>

        {/* Ayuda y atajos */}
        <div className="grid sm:grid-cols-4 gap-3">
          {[
            [Download, 'Descargar la app', 'Instalador para Windows', '/descargar'],
            [BookOpen, 'Documentación', 'Guías paso a paso', '/documentacion'],
            [Lightbulb, 'Ideas', 'Proponé mejoras', '/sugerencias'],
            [LifeBuoy, 'Soporte', 'Escribinos por el chat', null],
          ].map(([I, t, d, a]) => {
            const cont = (<><I size={18} style={{ color: '#00e87b' }} /><p className="text-sm font-semibold text-white mt-2">{t}</p><p className="text-[11px]" style={{ color: 'var(--muted)' }}>{d}</p></>);
            return a ? <Link key={t} to={a} className="card hover:border-[var(--accent)]/30 transition">{cont}</Link>
              : <div key={t} className="card"><LifeBuoy size={18} style={{ color: '#00e87b' }} /><p className="text-sm font-semibold text-white mt-2">{t}</p><p className="text-[11px]" style={{ color: 'var(--muted)' }}>Tocá el botón de chat, abajo a la derecha</p></div>;
          })}
        </div>

        <ReferralCard />
      </div>
    </Layout>
  );
}
