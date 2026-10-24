import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // Verificar token al montar
  useEffect(() => {
    const token = localStorage.getItem('akira_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then(r => setUser(r.data.user))
      .catch(() => { localStorage.removeItem('akira_token'); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    localStorage.setItem('akira_token', r.data.token);
    setUser(r.data.user);
    return r.data.user;
  }, []);

  // El alta crea la cuenta y manda un código al email: NO hay sesión hasta confirmarlo (verificarEmail).
  const register = useCallback(async (datos) => {
    const r = await api.post('/auth/register', datos);
    if (r.data.token) { localStorage.setItem('akira_token', r.data.token); setUser(r.data.user); return { user: r.data.user }; }
    return { requiereVerificacion: true, email: r.data.email };
  }, []);

  const obtenerTokenFormulario = useCallback(async () => (await api.get('/auth/form-token')).data, []);

  const verificarEmail = useCallback(async (email, codigo) => {
    const r = await api.post('/auth/verificar-email', { email, codigo });
    localStorage.setItem('akira_token', r.data.token);
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const reenviarCodigo = useCallback(async (email) => (await api.post('/auth/reenviar-codigo', { email })).data, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('akira_token');
    setUser(null);
  }, []);

  const loginConToken = useCallback(async (token) => {
    localStorage.setItem('akira_token', token);
    const r = await api.get('/auth/me');
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const refreshUser = useCallback(async () => {
    const r = await api.get('/auth/me');
    setUser(r.data.user);
  }, []);

  // Auto-genera el código de referido si la cuenta no tiene uno — cubre
  // cuentas creadas antes de que existiera esta función, o por caminos
  // que no lo generaban (admin seedeado por script, alta por Google/
  // Facebook). Corre solo, en segundo plano, para cualquier usuario
  // logueado sin código; si falla no molesta — simplemente reintenta
  // la próxima vez que cargue la sesión.
  useEffect(() => {
    if (!user || user.codigoReferido) return;
    api.post('/auth/generar-codigo')
      .then(({ data }) => setUser((u) => (u ? { ...u, codigoReferido: data.codigoReferido } : u)))
      .catch(() => {});
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, loginConToken, refreshUser, obtenerTokenFormulario, verificarEmail, reenviarCodigo }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
