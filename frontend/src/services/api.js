import axios from 'axios';
import { getPase, salirPerfil } from './perfil';

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

// Interceptor — manejar errores globales
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // El pase del perfil venció o falta: se vuelve a la pantalla de bloqueo (no se cierra la sesión de la cuenta)
    if (err.response?.status === 403 && err.response?.data?.codigo === 'PERFIL_REQUERIDO') salirPerfil();
    if (err.response?.status === 401) {
      localStorage.removeItem('akira_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
