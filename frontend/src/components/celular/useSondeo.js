import { useCallback, useEffect, useRef } from 'react';
import { intervaloSondeo } from '../../lib/estadoMovil';

// Consulta al servidor con ritmo adaptativo (ver intervaloSondeo en lib/estadoMovil.js):
// rápido solo si hay una orden esperando o el usuario está mirando, lento en reposo, más lento con cada error seguido y
// totalmente quieto con la pestaña oculta. Al volver a verse la pestaña (o volver internet) consulta de inmediato, para no mostrar datos viejos.
//
//   tarea()     función async; devuelve false (o tira un error) si falló, para que se espere más antes del próximo intento.
//   opciones()  se lee en cada vuelta y devuelve { pendiente?, mirando?, edadPendienteMs? }.
//   clave       si cambia, el sondeo arranca de nuevo (consulta ya).
// Devuelve refrescar(): consulta ahora mismo y recalcula la espera (para el botón de actualizar o después de mandar algo).
export default function useSondeo(tarea, { activo = true, opciones, clave } = {}) {
  const tareaRef = useRef(tarea); tareaRef.current = tarea;
  const opcionesRef = useRef(opciones); opcionesRef.current = opciones;
  const cicloRef = useRef(null);

  useEffect(() => {
    if (!activo) return undefined;
    let vivo = true; let t = null; let errores = 0; let enCurso = false; let pendienteDesde = null;
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const programar = () => {
      clearTimeout(t); t = null;
      if (!vivo) return;
      const o = (opcionesRef.current && opcionesRef.current()) || {};
      if (o.pendiente) { if (pendienteDesde === null) pendienteDesde = Date.now(); } else pendienteDesde = null;
      const ms = intervaloSondeo({ visible: visible(), pendiente: !!o.pendiente, mirando: o.mirando !== false, errores, edadPendienteMs: o.edadPendienteMs != null ? o.edadPendienteMs : (pendienteDesde === null ? 0 : Date.now() - pendienteDesde) });
      if (ms === null) return; // pestaña oculta: no se consulta; el evento visibilitychange la reanuda
      t = setTimeout(ciclo, ms);
    };
    const ciclo = async () => {
      clearTimeout(t); t = null;
      if (!vivo || enCurso) return;
      if (!visible()) return;
      enCurso = true; let ok = true;
      try { ok = (await tareaRef.current()) !== false; } catch { ok = false; }
      enCurso = false;
      errores = ok ? 0 : errores + 1;
      programar();
    };
    cicloRef.current = ciclo;
    const alCambiarVisibilidad = () => { if (visible()) ciclo(); else { clearTimeout(t); t = null; } };
    const alReconectar = () => { errores = 0; if (visible()) ciclo(); };

    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('online', alReconectar);
    ciclo();
    return () => { vivo = false; clearTimeout(t); document.removeEventListener('visibilitychange', alCambiarVisibilidad); window.removeEventListener('online', alReconectar); };
  }, [activo, clave]);
  return useCallback(() => (cicloRef.current ? cicloRef.current() : undefined), []);
}
