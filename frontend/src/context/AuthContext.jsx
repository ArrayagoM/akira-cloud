import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { clasificarErrorSesion, esperaReintento } from '../lib/sesion';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  // Hay sesión guardada pero no se pudo confirmar con el servidor (sin internet, timeout, error 5xx): NO se cierra la
  // sesión; se reintenta con espera creciente. Ver lib/sesion.js.
  const [sinConexion, setSinConexion] = useState(false);
  const intentoRef = useRef(0);
  const timerRef = useRef(null);
  const vivoRef = useRef(true);

  // Verificar token al montar (y en cada reintento)
  const verificar = useCallback(() => {
    clearTimeout(timerRef.current);
    const token = localStorage.getItem('akira_token');
    if (!token) { setSinConexion(false); setLoading(false); return; }
    api.get('/auth/me')
      .then((r) => { if (!vivoRef.current) return; intentoRef.current = 0; setSinConexion(false); setUser(r.data.user); })
      .catch((err) => {
        if (!vivoRef.current) return;
        const tipo = clasificarErrorSesion(err);
        if (tipo === 'invalida') { localStorage.removeItem('akira_token'); setSinConexion(false); return; }
        if (tipo === 'rechazada') { setSinConexion(false); return; }
        setSinConexion(true);
        const espera = esperaReintento(intentoRef.current);
        intentoRef.current += 1;
        if (espera != null) timerRef.current = setTimeout(verificar, espera);
      })
      .finally(() => { if (vivoRef.current) setLoading(false); });
  }, []);

  useEffect(() => {
    vivoRef.current = true;
    verificar();
    return () => { vivoRef.current = false; clearTimeout(timerRef.current); };
  }, [verificar]);

  // Reintento inmediato (botón, o cuando vuelve internet / se vuelve a la ventana). Reinicia la cuenta de intentos.
  const reintentarConexion = useCallback(() => { intentoRef.current = 0; verificar(); }, [verificar]);
  useEffect(() => {
    if (!sinConexion) return undefined;
    const alVolver = () => { if (document.visibilityState !== 'hidden') reintentarConexion(); };
    window.addEventListener('online', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    return () => { window.removeEventListener('online', alVolver); document.removeEventListener('visibilitychange', alVolver); };
  }, [sinConexion, reintentarConexion]);

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
    // Datos del celular de la cuenta que sale (borrador de producto y último estado de la PC): que otra persona que use este mismo celular no los vea.
    try { localStorage.removeItem('akira.celular.borradorProducto'); localStorage.removeItem('akira.celular.ultimoEstado'); } catch { /* sin almacenamiento */ }
    setUser(null);
  }, []);

  const loginConToken = useCallback(async (token) => {
    localStorage.setItem('akira_token', token);
    try {
      const r = await api.get('/auth/me');
      setUser(r.data.user);
      return r.data.user;
    } catch (err) {
      // Solo se descarta el token si el servidor dijo que no sirve; ante un corte de red queda guardado y se reintenta al reabrir.
      if (clasificarErrorSesion(err) === 'invalida') localStorage.removeItem('akira_token');
      throw err;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.data.user);
    } catch (err) {
      // 401 real: la sesión terminó. Cualquier otro error (red, 5xx) no toca la sesión, solo le avisa al que llamó.
      if (clasificarErrorSesion(err) === 'invalida') { localStorage.removeItem('akira_token'); setUser(null); }
      throw err;
    }
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
    <AuthContext.Provider value={{ user, loading, sinConexion, reintentarConexion, login, register, logout, loginConToken, refreshUser, obtenerTokenFormulario, verificarEmail, reenviarCodigo }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
