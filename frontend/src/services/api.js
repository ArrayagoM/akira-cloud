import axios from 'axios';
import { getPase, salirPerfil } from './perfil';
import { clasificarErrorSesion } from '../lib/sesion';

// En producción (Vercel) apunta al backend de Render
// En desarrollo apunta a localhost via el proxy de Vite
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor — agregar JWT a cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('akira_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const pase = getPase();
  if (pase) config.headers['X-Akira-Perfil'] = pase; // perfil del equipo (PIN) con el que se está usando la app
  return config;
});

let verificando = null; // una sola verificación a la vez, aunque fallen varias llamadas juntas
function verificarSesionTrasUn401() {
  const token = localStorage.getItem('akira_token');
  if (!token || verificando) return;
  verificando = axios.get(`${BASE_URL}/auth/me`, { timeout: 15000, headers: { Authorization: `Bearer ${token}` } })
    .then(() => {}, (e) => {
      if (clasificarErrorSesion(e) === 'invalida' && localStorage.getItem('akira_token') === token) {
        localStorage.removeItem('akira_token');
        window.location.href = '/login';
      }
    })
    .finally(() => { verificando = null; });
}

// Interceptor — manejar errores globales
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // El pase del perfil venció o falta: se vuelve a la pantalla de bloqueo (no se cierra la sesión de la cuenta)
    if (err.response?.status === 403 && err.response?.data?.codigo === 'PERFIL_REQUERIDO') salirPerfil();
    // Un 401 NO siempre significa "tu sesión terminó" (contraseña actual incorrecta, código inválido, un servicio externo que
    // rechaza una clave...). Antes de cerrar la sesión se le pregunta al servidor por el token: solo si /auth/me también
    // responde 401 se borra y se vuelve al login. Si no hay conexión o el servidor falla, la sesión se conserva.
    if (err.response?.status === 401 && !String(err.config?.url || '').includes('/auth/me')) verificarSesionTrasUn401();
    return Promise.reject(err);
  }
);

export default api;
