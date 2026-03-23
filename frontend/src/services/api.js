import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Adjuntar token en cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('akira_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Manejar 401 → limpiar sesión
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('akira_token');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
