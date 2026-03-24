import axios from 'axios';

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
  return config;
});

// Interceptor — manejar errores globales
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('akira_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
