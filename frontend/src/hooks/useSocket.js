import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

let socketInstance = null;

// En producción: VITE_SOCKET_URL apunta al backend de Render
// En desarrollo: proxy de Vite maneja la conexión
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '/';

export function useSocket(userId) {
  const connected = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (!socketInstance || !socketInstance.connected) {
      socketInstance = io(SOCKET_URL, {
        auth:                { token: localStorage.getItem('akira_token') },
        transports:          ['websocket', 'polling'],
        reconnection:        true,
        reconnectionDelay:   2000,
        reconnectionAttempts: 10,
        path:                '/socket.io',
      });

      socketInstance.on('connect', () => {
        console.log('[Socket] ✅ Conectado:', socketInstance.id);
      });
      socketInstance.on('connect_error', (err) => {
        console.warn('[Socket] ❌ Error:', err.message);
      });
      socketInstance.on('disconnect', (reason) => {
        console.warn('[Socket] Desconectado:', reason);
      });
    }

    socketInstance.emit('join-room', userId);
    connected.current = true;

    return () => {};
  }, [userId]);

  const on = useCallback((evento, handler) => {
    if (!socketInstance) return () => {};
    socketInstance.on(evento, handler);
    return () => socketInstance.off(evento, handler);
  }, []);

  const off = useCallback((evento, handler) => {
    socketInstance?.off(evento, handler);
  }, []);

  return { on, off, socket: socketInstance };
}
