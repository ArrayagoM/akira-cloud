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

  const register = useCallback(async (datos) => {
    const r = await api.post('/auth/register', datos);
    localStorage.setItem('akira_token', r.data.token);
    setUser(r.data.user);
    return r.data.user;
  }, []);

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

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, loginConToken, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
