import { useState, useEffect } from 'react';

// Perfil con el que se está usando la app (PIN del equipo). El pase vive solo mientras la ventana está abierta (sessionStorage):
// al cerrar y volver a abrir Akira se pide el PIN de nuevo.
const K_PASE = 'akira_pase';
const K_PERFIL = 'akira_perfil';
const EVENTO = 'akira:perfil';

const leer = (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
export const getPase = () => leer(K_PASE);
export const getPerfil = () => { try { return JSON.parse(leer(K_PERFIL) || 'null'); } catch { return null; } };
export function setPerfil(token, perfil) {
  try { sessionStorage.setItem(K_PASE, token); sessionStorage.setItem(K_PERFIL, JSON.stringify(perfil)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENTO));
}
export function salirPerfil() {
  try { sessionStorage.removeItem(K_PASE); sessionStorage.removeItem(K_PERFIL); } catch { /* nada */ }
  window.dispatchEvent(new Event(EVENTO));
}
export function usePerfil() {
  const [p, setP] = useState(getPerfil());
  useEffect(() => { const f = () => setP(getPerfil()); window.addEventListener(EVENTO, f); return () => window.removeEventListener(EVENTO, f); }, []);
  return p;
}

// Menú permitido por rol (el servidor igual lo hace cumplir: esto es solo para no mostrar lo que no se puede usar)
const EMPLEADO = new Set(['/dashboard', '/agenda', '/clientes', '/chats', '/vender', '/catalogo', '/pedidos']);
const ENCARGADO_NO = new Set(['/respaldo', '/config', '/equipo', '/planes']);
export function puedeVerMenu(perfil, ruta) {
  if (!perfil || perfil.rol === 'propietario') return true;
  if (perfil.rol === 'empleado') return EMPLEADO.has(ruta);
  if (perfil.rol === 'encargado') return !ENCARGADO_NO.has(ruta);
  return false;
}
