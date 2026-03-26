import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import Landing       from './pages/Landing';
import Login         from './pages/Login';
import Register      from './pages/Register';
import OAuthCallback from './pages/OAuthCallback';
import Dashboard     from './pages/Dashboard';
import ConfigPage    from './pages/ConfigPage';
import AgendaPage    from './pages/AgendaPage';
import AdminPanel    from './pages/AdminPanel';
import PlanesPage    from './pages/PlanesPage';
import NotFound      from './pages/NotFound';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.rol !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Públicas */}
        <Route path="/"              element={<Landing />} />
        <Route path="/login"         element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register"      element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/oauth-callback" element={<OAuthCallback />} />

        {/* Usuario autenticado */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/agenda"    element={<ProtectedRoute><AgendaPage /></ProtectedRoute>} />
        <Route path="/config"    element={<ProtectedRoute><ConfigPage /></ProtectedRoute>} />
        <Route path="/planes"    element={<ProtectedRoute><PlanesPage /></ProtectedRoute>} />

        {/* Solo admin */}
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPanel /></ProtectedRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
