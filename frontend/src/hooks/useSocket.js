import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

let socketInstance = null;

export function useSocket(userId) {
  const connected = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (!socketInstance || !socketInstance.connected) {
      // En dev: Vite proxea /socket.io → localhost:5000 automáticamente
      // En prod: nginx hace lo mismo desde el mismo origen
      socketInstance = io('/', {
        auth: { token: localStorage.getItem('akira_token') },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 10,
        path: '/socket.io',
      });

      socketInstance.on('connect', () => {
        console.log('[Socket] ✅ Conectado:', socketInstance.id);
      });
      socketInstance.on('connect_error', (err) => {
        console.warn('[Socket] ❌ Error:', err.message);
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
