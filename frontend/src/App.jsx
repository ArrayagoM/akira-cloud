import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

// Pages
import Landing           from './pages/Landing';
import Login             from './pages/Login';
import Register          from './pages/Register';
import OAuthCallback     from './pages/OAuthCallback';
import Dashboard         from './pages/Dashboard';
import ConfigPage        from './pages/ConfigPage';
import AgendaPage        from './pages/AgendaPage';
import AdminPanel        from './pages/AdminPanel';
import PlanesPage        from './pages/PlanesPage';
import NotFound          from './pages/NotFound';
import Privacidad        from './pages/Privacidad';
import Terminos          from './pages/Terminos';
import Documentacion     from './pages/Documentacion';
import ForgotPassword    from './pages/ForgotPassword';
import ResetPassword     from './pages/ResetPassword';
import SugerenciasPage   from './pages/SugerenciasPage';
import ChatsPage         from './pages/ChatsPage';
import ClientesPage      from './pages/ClientesPage';
import DocumentosPage    from './pages/DocumentosPage';
import CatalogoPage      from './pages/CatalogoPage';
import CajaPage          from './pages/CajaPage';
import DeudoresPage      from './pages/DeudoresPage';
import RespaldoPage      from './pages/RespaldoPage';
import ConocimientoPage  from './pages/ConocimientoPage';
import PedidosPage       from './pages/PedidosPage';
import ReportesPage      from './pages/ReportesPage';
import ComprobantesPage  from './pages/ComprobantesPage';
import EquipoPage        from './pages/EquipoPage';
import ProfesionalesPage from './pages/ProfesionalesPage';
import SucursalesPage    from './pages/SucursalesPage';
import IntegracionesPage from './pages/IntegracionesPage';
import AyudaPage         from './pages/AyudaPage';
import VenderPage        from './pages/VenderPage';
import PerfilGate        from './components/PerfilGate';
import AnalisisPage      from './pages/AnalisisPage';
import ProveedoresPage   from './pages/ProveedoresPage';
import Descargar         from './pages/Descargar';
import CuentaPanel       from './pages/CuentaPanel';
import PreLanzamiento, { LAUNCH_DATE } from './pages/PreLanzamiento';
// ── Páginas verticales por nicho (SEO) ─────────────────────
import Peluquerias       from './pages/Peluquerias';
import Consultorios      from './pages/Consultorios';
import Gimnasios         from './pages/Gimnasios';
import Alquileres        from './pages/Alquileres';
import Restaurantes      from './pages/Restaurantes';
// ── Blog ───────────────────────────────────────────────────
import Blog              from './pages/Blog';

// Versión de escritorio (build con VITE_DESKTOP=1)
const DESKTOP = !!import.meta.env.VITE_DESKTOP;

// ── Loading spinner ────────────────────────────────────────
function GlobalLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'var(--bg)' }}>
      <div className="relative">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(0,232,123,0.1)', border: '1px solid rgba(0,232,123,0.2)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00e87b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div className="absolute -inset-1 rounded-2xl border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'rgba(0,232,123,0.25)', borderTopColor: 'transparent' }} />
      </div>
      <p className="text-xs animate-pulse" style={{ color: 'var(--muted)' }}>Cargando...</p>
    </div>
  );
}

// ── ¿Debe ver la pantalla de pre-lanzamiento? ──────────────
// Sí: usuario normal (no admin, no tester) y la fecha de lanzamiento no llegó aún.
function estaEnPreLanzamiento(user) {
  if (!user || DESKTOP) return false;
  if (user.rol === 'admin' || user.plan === 'admin') return false;
  if (user.esTester) return false;
  return Date.now() < LAUNCH_DATE.getTime();
}

// ── Route guards ───────────────────────────────────────────
function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <GlobalLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.rol !== 'admin') return <Navigate to="/dashboard" replace />;
  // Usuarios normales en pre-lanzamiento → pantalla de cuenta regresiva
  if (estaEnPreLanzamiento(user)) return <Navigate to="/pre-lanzamiento" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

// ── App routes ─────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <PerfilGate>
      <Routes>
        {/* Públicas */}
        <Route path="/"               element={DESKTOP ? <Navigate to="/dashboard" replace /> : <Landing />} />
        <Route path="/login"          element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register"       element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/oauth-callback" element={<OAuthCallback />} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/reset-password"  element={<PublicRoute><ResetPassword /></PublicRoute>} />

        {/* Usuario autenticado */}
        <Route path="/dashboard"   element={<ProtectedRoute>{DESKTOP ? <Dashboard /> : <CuentaPanel />}</ProtectedRoute>} />
        <Route path="/agenda"      element={DESKTOP ? <ProtectedRoute><AgendaPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/config"      element={DESKTOP ? <ProtectedRoute><ConfigPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/planes"      element={<ProtectedRoute><PlanesPage /></ProtectedRoute>} />
        <Route path="/sugerencias" element={<ProtectedRoute><SugerenciasPage /></ProtectedRoute>} />
        <Route path="/chats"       element={DESKTOP ? <ProtectedRoute><ChatsPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/clientes"    element={DESKTOP ? <ProtectedRoute><ClientesPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/documentos" element={DESKTOP ? <ProtectedRoute><DocumentosPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/catalogo"   element={DESKTOP ? <ProtectedRoute><CatalogoPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/caja"       element={DESKTOP ? <ProtectedRoute><CajaPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/deudores"    element={DESKTOP ? <ProtectedRoute><DeudoresPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/respaldo"    element={DESKTOP ? <ProtectedRoute><RespaldoPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/conocimiento" element={DESKTOP ? <ProtectedRoute><ConocimientoPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/pedidos"      element={DESKTOP ? <ProtectedRoute><PedidosPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/reportes"     element={DESKTOP ? <ProtectedRoute><ReportesPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/comprobantes" element={DESKTOP ? <ProtectedRoute><ComprobantesPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/equipo"       element={DESKTOP ? <ProtectedRoute><EquipoPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/profesionales" element={DESKTOP ? <ProtectedRoute><ProfesionalesPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/sucursales"   element={DESKTOP ? <ProtectedRoute><SucursalesPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/integraciones" element={DESKTOP ? <ProtectedRoute><IntegracionesPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/ayuda"        element={DESKTOP ? <ProtectedRoute><AyudaPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/vender"       element={DESKTOP ? <ProtectedRoute><VenderPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/analisis"     element={DESKTOP ? <ProtectedRoute><AnalisisPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />
        <Route path="/proveedores" element={DESKTOP ? <ProtectedRoute><ProveedoresPage /></ProtectedRoute> : <Navigate to="/dashboard" replace />} />

        {/* Solo admin */}
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPanel /></ProtectedRoute>} />

        {/* Pre-lanzamiento — visible para todos, pero relevante para usuarios normales */}
        <Route path="/pre-lanzamiento" element={<PreLanzamiento />} />

        <Route path="/descargar" element={<Descargar />} />
        <Route path="/privacidad" element={<Privacidad />} />
        <Route path="/terminos"   element={<Terminos />} />
        <Route path="/documentacion" element={<Documentacion />} />

        {/* ── Páginas verticales por nicho (SEO) ── */}
        <Route path="/peluquerias"  element={<Peluquerias />} />
        <Route path="/consultorios" element={<Consultorios />} />
        <Route path="/gimnasios"    element={<Gimnasios />} />
        <Route path="/alquileres"   element={<Alquileres />} />
        <Route path="/restaurantes" element={<Restaurantes />} />

        {/* ── Blog ── */}
        <Route path="/blog"          element={<Blog />} />
        <Route path="/blog/:slug"    element={<Blog />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      </PerfilGate>
      {/* Vercel Analytics & Speed Insights — solo registran en producción.
          En dev son no-op, no contaminan datos. */}
      {!DESKTOP && <Analytics />}
      {!DESKTOP && <SpeedInsights />}
    </AuthProvider>
  );
}
