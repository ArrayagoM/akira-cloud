// hooks/useScrollReveal.js
// Activa clases de animación cuando el elemento entra al viewport
import { useEffect, useRef } from 'react';

/**
 * @param {string} visibleClass  clase a agregar cuando entra al viewport (default: 'is-visible')
 * @param {object} options       IntersectionObserver options
 */
export function useScrollReveal(visibleClass = 'is-visible', options = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(visibleClass);
            observer.unobserve(entry.target); // solo una vez
          }
        });
      },
      { threshold: options.threshold ?? 0.12, rootMargin: options.rootMargin ?? '0px', ...options }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleClass]);

  return ref;
}

/**
 * Versión para múltiples hijos dentro de un contenedor:
 * aplica la clase visible a cada hijo con stagger delay
 */
export function useScrollRevealGroup(visibleClass = 'is-visible', options = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const children = Array.from(container.children);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            children.forEach((child, i) => {
              setTimeout(() => child.classList.add(visibleClass), i * 80);
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: options.threshold ?? 0.1, ...options }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [visibleClass]);

  return ref;
}
