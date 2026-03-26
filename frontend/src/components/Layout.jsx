import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bot, LayoutDashboard, Settings, Shield, LogOut, Menu, X, User, ChevronDown, CreditCard, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import AkiraSupport from './AkiraSupport';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location         = useLocation();
  const navigate         = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Sesión cerrada');
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
    { to: '/agenda',    icon: <CalendarDays size={18} />,    label: 'Agenda' },
    { to: '/config',    icon: <Settings size={18} />,        label: 'Configuración' },
    { to: '/planes',    icon: <CreditCard size={18} />,      label: 'Planes' },
    ...(user?.rol === 'admin' ? [{ to: '/admin', icon: <Shield size={18} />, label: 'Admin' }] : []),
  ];

  const isActive = (to) => location.pathname === to;

  const planColors = { trial: 'badge-yellow', basico: 'badge-gray', pro: 'badge-green', agencia: 'badge-green' };

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      {/* Overlay mobile */}
      {sideOpen && <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setSideOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed md:relative z-30 w-56 h-full bg-gray-950 border-r border-gray-800 flex flex-col transition-transform duration-300 ${sideOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-800">
          <Bot size={22} className="text-green-400" />
          <span className="font-bold text-white">Akira <span className="text-green-400">Cloud</span></span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} onClick={() => setSideOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive(item.to) ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>

        {/* User info */}
        <div className="px-3 py-4 border-t border-gray-800">
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-white truncate">{user?.nombre} {user?.apellido}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            <span className={`mt-1.5 inline-block ${planColors[user?.plan] || 'badge-gray'}`}>{user?.plan}</span>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2.5 w-full px-3 py-2 mt-1 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-colors">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="bg-gray-950 border-b border-gray-800 px-5 h-14 flex items-center justify-between flex-shrink-0">
          <button onClick={() => setSideOpen(true)} className="md:hidden text-gray-400 hover:text-white">
            <Menu size={22} />
          </button>
          <div className="hidden md:block" />
          {/* User menu */}
          <div className="relative">
            <button onClick={() => setDropOpen(!dropOpen)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
              <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center">
                {user?.avatar
                  ? <img src={user.avatar} className="w-7 h-7 rounded-full object-cover" alt="" />
                  : <User size={14} className="text-green-400" />}
              </div>
              <span className="hidden sm:block">{user?.nombre}</span>
              <ChevronDown size={14} />
            </button>
            {dropOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-gray-900 border border-gray-800 rounded-xl shadow-xl z-50">
                <Link to="/config" onClick={() => setDropOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 rounded-t-xl">
                  <Settings size={14} /> Configuración
                </Link>
                <button onClick={() => { setDropOpen(false); handleLogout(); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-800 rounded-b-xl">
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-5 md:p-7">
          {children}
        </main>
      </div>

      {/* Akira Support Widget */}
      <AkiraSupport />
    </div>
  );
}
