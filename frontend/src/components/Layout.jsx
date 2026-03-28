import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Bot, LayoutDashboard, Settings, Shield, LogOut, User,
  ChevronDown, CreditCard, CalendarDays, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AkiraSupport from './AkiraSupport';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location          = useLocation();
  const navigate          = useNavigate();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    toast.success('Sesión cerrada');
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/agenda',    icon: CalendarDays,    label: 'Agenda'    },
    { to: '/config',    icon: Settings,        label: 'Config'    },
    { to: '/planes',    icon: CreditCard,      label: 'Planes'    },
    ...(user?.rol === 'admin' ? [{ to: '/admin', icon: Shield, label: 'Admin' }] : []),
  ];

  const isActive = (to) => location.pathname === to;

  const planBadge = {
    trial:   'badge-yellow',
    basico:  'badge-gray',
    pro:     'badge-green',
    agencia: 'badge-green',
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <aside className="sidebar hidden md:flex">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.2)' }}>
            <Bot size={17} className="logo-glow" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="leading-none">
            <span className="font-bold text-white text-sm">Akira</span>
            <span className="font-bold text-sm ml-1" style={{ color: 'var(--accent)' }}>Cloud</span>
          </div>
          <div className="ml-auto">
            <Sparkles size={12} style={{ color: 'var(--accent)', opacity: 0.5 }} />
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-item animate-slide-left`}
                style={{ animationDelay: `${i * 50}ms` }}
                data-active={active}
                {...(active ? { 'data-active-class': true } : {})}
              >
                <span className={`nav-item ${active ? 'active' : ''}`}
                  style={{ display: 'contents' }}>
                </span>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-sm font-medium transition-all duration-200 relative border
                  ${active
                    ? 'border-[rgba(0,232,123,0.18)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface3)] hover:border-[var(--border)]'
                  }`}
                  style={active ? {
                    background: 'rgba(0,232,123,0.07)',
                    boxShadow: '0 0 16px rgba(0,232,123,0.07)',
                  } : {}}>
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                      style={{ background: 'var(--accent)', boxShadow: '0 0 8px rgba(0,232,123,0.6)' }} />
                  )}
                  <Icon size={17} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-3 pb-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
          <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{ background: 'rgba(0,232,123,0.15)', border: '1px solid rgba(0,232,123,0.25)' }}>
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
              <span className={planBadge[user?.plan] || 'badge-gray'}>{user?.plan || 'trial'}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 mt-1.5 rounded-lg text-sm transition-all duration-200"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f43f5e'; e.currentTarget.style.background = 'rgba(244,63,94,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = ''; }}
          >
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="topbar justify-between">
          {/* Mobile: logo */}
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.2)' }}>
              <Bot size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <span className="font-bold text-sm text-white">Akira<span style={{ color: 'var(--accent)' }}> Cloud</span></span>
          </div>
          {/* Desktop: page title (spacer) */}
          <div className="hidden md:block" />

          {/* User dropdown */}
          <div className="relative" ref={dropRef}>
            <button
              onClick={() => setDropOpen(d => !d)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-200 text-sm"
              style={{ color: 'var(--text2)', border: '1px solid transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = 'transparent'; }}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden"
                style={{ background: 'rgba(0,232,123,0.12)', border: '1px solid rgba(0,232,123,0.22)' }}>
                {user?.avatar
                  ? <img src={user.avatar} className="w-7 h-7 rounded-full object-cover" alt="" />
                  : <User size={13} style={{ color: 'var(--accent)' }} />}
              </div>
              <span className="hidden sm:block font-medium text-white">{user?.nombre}</span>
              <ChevronDown size={13} className={`transition-transform duration-200 ${dropOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden animate-scale-in z-50"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold text-white truncate">{user?.nombre} {user?.apellido}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{user?.email}</p>
                </div>
                <Link to="/config" onClick={() => setDropOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text2)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text2)'; }}>
                  <Settings size={14} /> Configuración
                </Link>
                <button
                  onClick={() => { setDropOpen(false); handleLogout(); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors"
                  style={{ color: '#f43f5e' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,63,94,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-7 mobile-safe-bottom page-transition">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom navigation ─────────────────────────── */}
      <nav className="bottom-nav md:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);
          return (
            <Link key={item.to} to={item.to} className={`bottom-nav-item ${active ? 'active' : ''}`}>
              <div className="bottom-nav-icon">
                <Icon size={20} />
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Akira Support */}
      <AkiraSupport />
    </div>
  );
}
