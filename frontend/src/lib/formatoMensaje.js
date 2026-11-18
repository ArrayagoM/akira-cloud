// lib/formatoMensaje.js
// Formato simple (negrita, cursiva, código, saltos de línea) para las respuestas del asistente de soporte. El texto viene de un
// modelo de IA y se inserta como HTML: por eso se ESCAPA primero y recién después se agregan las pocas etiquetas permitidas
// (strong, em, code, br). Nada de lo que escriba el modelo (o un usuario que lo manipule) puede crear otra etiqueta ni un atributo.
// Función pura: probada en desktop/tests/formato-mensaje.test.js.

export function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMensaje(texto) {
  return escaparHtml(texto)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(0,232,123,0.1);padding:1px 5px;border-radius:4px;font-size:0.75rem;color:#00e87b;">$1</code>')
    .replace(/\r?\n/g, '<br/>');
}
