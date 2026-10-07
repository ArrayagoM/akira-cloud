import { useState, useRef, useEffect, Fragment } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Bot, LayoutDashboard, Settings, Shield, LogOut, User,
  ChevronDown, CreditCard, CalendarDays, Lightbulb, MessageSquare, Users,
  BookOpen, Download, FileText, Package, Wallet, HandCoins, Truck, ShieldCheck, Brain, ShoppingBag, BarChart3, PieChart,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AkiraSupport from './AkiraSupport';
import DesktopSync from './DesktopSync';
import LicenciaAviso from './LicenciaAviso';
import ActualizacionAviso, { VersionApp } from './ActualizacionAviso';

// Versión de escritorio (Electron): sin Ideas/soporte, que dependen de la plataforma en la nube. El panel Admin sí (solo rol admin): habla con el servidor de licencias.
const DESKTOP = !!import.meta.env.VITE_DESKTOP;

// `grupo` ordena el menú de la app de escritorio en secciones (en la web no se muestran títulos).
const NAV_ITEMS_BASE = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard',  grupo: 'Atención' },
  { to: '/agenda',      icon: CalendarDays,    label: 'Agenda',     grupo: 'Atención' },
  { to: '/clientes',    icon: Users,           label: 'Clientes',   grupo: 'Atención' },
  { to: '/chats',       icon: MessageSquare,   label: 'Chats',      grupo: 'Atención' },
  { to: '/catalogo',    icon: Package,         label: 'Catálogo',   grupo: 'Ventas' },
  { to: '/pedidos',     icon: ShoppingBag,     label: 'Pedidos',    grupo: 'Ventas' },
  { to: '/caja',        icon: Wallet,          label: 'Caja',       grupo: 'Dinero' },
  { to: '/reportes',    icon: PieChart,        label: 'Reportes',   grupo: 'Dinero' },
  { to: '/deudores',    icon: HandCoins,       label: 'Deudores',   grupo: 'Dinero' },
  { to: '/proveedores', icon: Truck,           label: 'Proveedores', grupo: 'Dinero' },
  { to: '/documentos',  icon: FileText,        label: 'Documentos', grupo: 'Dinero' },
  { to: '/conocimiento', icon: Brain,          label: 'Conocimiento', grupo: 'Tu bot' },
  { to: '/analisis',    icon: BarChart3,       label: 'Qué preguntan', grupo: 'Tu bot' },
  { to: '/respaldo',    icon: ShieldCheck,     label: 'Respaldo',   grupo: 'Cuenta' },
  { to: '/config',      icon: Settings,        label: 'Config',     grupo: 'Cuenta' },
  { to: '/descargar',   icon: Download,        label: 'App',        grupo: 'Cuenta' },
  { to: '/planes',      icon: CreditCard,      label: 'Planes',     grupo: 'Cuenta' },
  { to: '/sugerencias', icon: Lightbulb,       label: 'Ideas',      grupo: 'Cuenta' },
];

const PLAN_BADGE = {
  trial:   'badge-yellow',
  basico:  'badge-gray',
  pro:     'badge-green',
  agencia: 'badge-green',
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location          = useLocation();
  const navigate          = useNavigate();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);

  // Documentos por revisar (solo escritorio): se consulta cada 30 s y al navegar.
  const [docsNuevos, setDocsNuevos] = useState(0);
  useEffect(() => {
    if (!DESKTOP || !user) return undefined;
    let vivo = true;
    const consultar = () => api.get('/bot/documentos?estado=nuevo').then((r) => vivo && setDocsNuevos(r.data.nuevos || 0)).catch(() => {});
    consultar();
    const iv = setInterval(consultar, 30000);
    return () => { vivo = false; clearInterval(iv); };
  }, [user, location.pathname]);

  const navItems = [
    ...NAV_ITEMS_BASE.filter((i) => (DESKTOP
      ? !(i.to === '/sugerencias' || i.to === '/descargar')
      : !['/agenda', '/clientes', '/chats', '/config', '/documentos', '/catalogo', '/caja', '/deudores', '/proveedores', '/respaldo', '/conocimiento', '/pedidos', '/analisis', '/reportes'].includes(i.to))), // en la web esas pantallas viven en la app de escritorio
    ...(user?.rol === 'admin' ? [{ to: '/admin', icon: Shield, label: 'Admin' }] : []),
  ];

  const isActive = (to) => location.pathname === to;

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  const handleLogout = async () => {
    setDropOpen(false);
    try {
      await logout();
      toast.success('Sesión cerrada');
    } catch {}
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Desktop Sidebar ──────────────────────────── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.2)' }}>
            <Bot size={17} style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 6px rgba(0,232,123,0.5))' }} />
          </div>
          <span className="font-bold text-sm text-white">Akira<span style={{ color: 'var(--accent)' }}> Cloud</span></span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item, i) => {
            const Icon  = item.icon;
            const active = isActive(item.to);
            const titulo = DESKTOP && item.grupo && item.grupo !== navItems[i - 1]?.grupo ? item.grupo : null;
            return (
              <Fragment key={item.to}>
              {titulo && <p className={`px-3 text-[10px] uppercase tracking-widest text-gray-600 ${i === 0 ? 'mt-0' : 'mt-3'} mb-0.5`}>{titulo}</p>}
              <Link to={item.to}
                className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  color: active ? 'var(--accent)' : 'var(--text2)',
                  background: active ? 'rgba(0,232,123,0.07)' : 'transparent',
                  border: active ? '1px solid rgba(0,232,123,0.18)' : '1px solid transparent',
                  animationDelay: `${i * 50}ms`,
                }}>
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                    style={{ background: 'var(--accent)', boxShadow: '0 0 8px rgba(0,232,123,0.7)' }} />
                )}
                <Icon size={17} />
                {item.label}
                {item.to === '/documentos' && docsNuevos > 0 && (
                  <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#000' }}>{docsNuevos}</span>
                )}
              </Link>
              </Fragment>
            );
          })}

          {/* Documentación — separada del resto: es consulta ocasional, no
              uso diario, así que no le saca lugar al bottom-nav en mobile
              (que renderiza navItems solo, sin esta). */}
          <Link to="/documentacion"
            className="flex items-center gap-3 px-3 py-2.5 mt-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{ color: 'var(--text2)', borderTop: '1px solid var(--border)', paddingTop: '0.875rem' }}>
            <BookOpen size={17} />
            Documentación
          </Link>
        </nav>

        {/* User + logout */}
        <div className="px-3 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="rounded-lg px-3 py-2.5 mb-2"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.22)' }}>
                {user?.avatar
                  ? <img src={user.avatar} className="w-7 h-7 rounded-full object-cover" alt="" />
                  : <User size={13} style={{ color: 'var(--accent)' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user?.nombre} {user?.apellido}</p>
                <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{user?.email}</p>
              </div>
            </div>
            <div className="mt-2">
              <span className={PLAN_BADGE[user?.plan] || 'badge-gray'}>{user?.plan || 'trial'}</span>
            </div>
          </div>

          {DESKTOP && <VersionApp />}
          {/* LOGOUT BUTTON — simple y directo */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors duration-150"
            style={{ color: 'var(--muted)' }}
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>

          <style>{`
            aside button[type="button"]:hover {
              color: #f43f5e !important;
              background: rgba(244,63,94,0.06);
            }
          `}</style>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="topbar justify-between">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 md:hidden">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.2)' }}>
              <Bot size={14} style={{ color: 'var(--accent)' }} />
            </div>
            <span className="font-bold text-sm text-white">
              Akira<span style={{ color: 'var(--accent)' }}> Cloud</span>
            </span>
          </div>
          <div className="hidden md:block" />

          {/* User dropdown */}
          <div className="relative" ref={dropRef}>
            <button
              type="button"
              onClick={() => setDropOpen(d => !d)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors duration-150"
              style={{ color: 'var(--text2)', border: '1px solid transparent' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden"
                style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.22)' }}>
                {user?.avatar
                  ? <img src={user.avatar} className="w-7 h-7 rounded-full object-cover" alt="" />
                  : <User size={13} style={{ color: 'var(--accent)' }} />}
              </div>
              <span className="hidden sm:block font-medium text-white text-sm">{user?.nombre}</span>
              <ChevronDown size={13}
                className="transition-transform duration-200"
                style={{ transform: dropOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            {dropOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-50"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  animation: 'scaleIn 0.18s ease-out',
                }}>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold text-white truncate">{user?.nombre} {user?.apellido}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{user?.email}</p>
                </div>
                <Link to="/config"
                  onClick={() => setDropOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-[var(--surface3)]"
                  style={{ color: 'var(--text2)' }}>
                  <Settings size={14} /> Configuración
                </Link>
                {/* DROPDOWN LOGOUT — simple y directo */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-red-500/5"
                  style={{ color: '#f43f5e' }}>
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-7 mobile-safe-bottom">
          {DESKTOP && <LicenciaAviso />}
          {DESKTOP && <ActualizacionAviso />}
          {DESKTOP && <DesktopSync />}
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ─────────────────────────── */}
      <nav className="bottom-nav">
        {navItems.map((item) => {
          const Icon   = item.icon;
          const active = isActive(item.to);
          return (
            <Link key={item.to} to={item.to}
              className={`bottom-nav-item ${active ? 'active' : ''}`}>
              <div className="bottom-nav-icon">
                <Icon size={20} />
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {!DESKTOP && <AkiraSupport />}
    </div>
  );
}
