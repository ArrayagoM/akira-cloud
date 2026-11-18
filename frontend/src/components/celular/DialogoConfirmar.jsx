import { useId } from 'react';
import { createPortal } from 'react-dom';
import useDialogo from './useDialogo';

// Diálogo de confirmación propio (no window.confirm): accesible (role=dialog + aria-modal, foco adentro, Escape cancela) y con botones de 44 px como mínimo.
// El foco arranca en "Cancelar": un toque de más nunca ejecuta la acción.
export default function DialogoConfirmar({ titulo, children, textoConfirmar, textoCancelar = 'Cancelar', peligro = false, alConfirmar, alCancelar }) {
  const ref = useDialogo(alCancelar);
  const idTitulo = useId(); const idDetalle = useId();
  // Va al <body> para que ningún contenedor de la pantalla (con transformaciones o recortes) lo corte o lo mueva.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }} onClick={(e) => { if (e.target === e.currentTarget) alCancelar(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={idTitulo} aria-describedby={idDetalle} tabIndex={-1} className="card w-full max-w-sm" style={{ background: 'var(--surface, #0f1620)', color: 'var(--text, #e8f0f8)', borderColor: peligro ? 'rgba(244,63,94,0.5)' : undefined }}>
        <h2 id={idTitulo} className="text-lg font-bold">{titulo}</h2>
        <div id={idDetalle} className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text2, #9aa8b8)' }}>{children}</div>
        <div className="mt-5 grid gap-3">
          <button type="button" data-foco-inicial className="btn-secondary w-full justify-center" style={{ minHeight: 44 }} onClick={alCancelar}>{textoCancelar}</button>
          <button type="button" className="btn-primary w-full justify-center" style={{ minHeight: 44, ...(peligro ? { background: '#f43f5e', color: '#fff' } : {}) }} onClick={alConfirmar}>{textoConfirmar}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
