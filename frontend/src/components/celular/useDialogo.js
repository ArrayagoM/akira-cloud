import { useEffect, useRef } from 'react';

// Foco de un diálogo modal: al abrir, el foco entra (al elemento con data-foco-inicial o al primero que se pueda tocar), Tab y Shift+Tab
// quedan adentro, Escape cierra y al cerrar el foco vuelve a lo que lo tenía antes. Mientras está abierto, la página de atrás no se desplaza.
const FOCALIZABLES = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function useDialogo(alCerrar) {
  const ref = useRef(null);
  const cerrarRef = useRef(alCerrar); cerrarRef.current = alCerrar;

  useEffect(() => {
    const previo = typeof document !== 'undefined' ? document.activeElement : null;
    const raiz = ref.current;
    const lista = () => (raiz ? Array.from(raiz.querySelectorAll(FOCALIZABLES)).filter((el) => el.getClientRects().length > 0) : []);
    const inicial = raiz && (raiz.querySelector('[data-foco-inicial]') || lista()[0] || raiz);
    if (inicial && inicial.focus) inicial.focus();
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const alTeclear = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (cerrarRef.current) cerrarRef.current(); return; }
      if (e.key !== 'Tab') return;
      const l = lista();
      if (!l.length) { e.preventDefault(); return; }
      const primero = l[0]; const ultimo = l[l.length - 1];
      if (!raiz.contains(document.activeElement)) { e.preventDefault(); primero.focus(); }
      else if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', alTeclear, true);
    return () => {
      document.removeEventListener('keydown', alTeclear, true);
      document.body.style.overflow = overflow;
      if (previo && previo.focus && document.contains(previo)) previo.focus();
    };
  }, []);
  return ref;
}
