import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

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
import ForgotPassword    from './pages/ForgotPassword';
import ResetPassword     from './pages/ResetPassword';
import SugerenciasPage   from './pages/SugerenciasPage';
import ChatsPage         from './pages/ChatsPage';
import PreLanzamiento, { LAUNCH_DATE } from './pages/PreLanzamiento';

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
  if (!user) return false;
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
      <Routes>
        {/* Públicas */}
        <Route path="/"               element={<Landing />} />
        <Route path="/login"          element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register"       element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/oauth-callback" element={<OAuthCallback />} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/reset-password"  element={<PublicRoute><ResetPassword /></PublicRoute>} />

        {/* Usuario autenticado */}
        <Route path="/dashboard"   element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/agenda"      element={<ProtectedRoute><AgendaPage /></ProtectedRoute>} />
        <Route path="/config"      element={<ProtectedRoute><ConfigPage /></ProtectedRoute>} />
        <Route path="/planes"      element={<ProtectedRoute><PlanesPage /></ProtectedRoute>} />
        <Route path="/sugerencias" element={<ProtectedRoute><SugerenciasPage /></ProtectedRoute>} />
        <Route path="/chats"       element={<ProtectedRoute><ChatsPage /></ProtectedRoute>} />

        {/* Solo admin */}
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPanel /></ProtectedRoute>} />

        {/* Pre-lanzamiento — visible para todos, pero relevante para usuarios normales */}
        <Route path="/pre-lanzamiento" element={<PreLanzamiento />} />

        <Route path="/privacidad" element={<Privacidad />} />
        <Route path="/terminos"   element={<Terminos />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
