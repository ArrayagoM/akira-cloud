// lib/avisoRespaldo.js
// ¿Hay que avisarle al usuario que su respaldo no está al día? Lee el estado que da la app de escritorio en GET /api/app/respaldo
// (desktop/main/respaldo-servicio.js, función estado()): { activo, carpeta, tieneClave, ultimo: { ok, enMs, error? } | null, ... }.
// Solo avisa: no activa nada ni escribe archivos. Funciones puras: probadas en desktop/tests/aviso-respaldo.test.js.

export const DIAS_MAXIMOS_SIN_RESPALDO = 3;
const DIA_MS = 24 * 60 * 60 * 1000;

// Devuelve null (no avisar) o { tipo, titulo, detalle }.
export function avisoDeRespaldo(estado, ahoraMs = Date.now()) {
  if (!estado || typeof estado !== 'object') return null; // sin dato (la consulta falló): no se muestra nada

  const configurado = estado.activo === true && !!estado.carpeta && estado.tieneClave === true;
  if (!configurado) {
    return {
      tipo: 'sin_configurar',
      titulo: 'Tus datos todavía no tienen respaldo automático',
      detalle: 'Clientes, turnos, caja y catálogo viven en esta PC. Si se rompe o se formatea, no hay copia para recuperarlos. Activarlo lleva un minuto: elegís una carpeta y una contraseña.',
    };
  }

  const ultimo = estado.ultimo;
  if (ultimo && ultimo.ok === false) {
    return {
      tipo: 'fallo',
      titulo: 'El último respaldo no se pudo completar',
      detalle: 'Entrá a Respaldo para ver el motivo y volver a intentarlo.',
    };
  }

  const enMs = Number(ultimo?.enMs);
  if (ultimo && Number.isFinite(enMs) && enMs > 0) {
    const transcurrido = ahoraMs - enMs;
    if (transcurrido > DIAS_MAXIMOS_SIN_RESPALDO * DIA_MS) {
      const dias = Math.floor(transcurrido / DIA_MS);
      return {
        tipo: 'desactualizado',
        titulo: `Hace ${dias} días que no se hace un respaldo`,
        detalle: 'El respaldo automático tendría que correr cada día. Entrá a Respaldo para revisar la carpeta y hacer uno ahora.',
      };
    }
  }
  return null; // al día, o recién activado y todavía no corrió (la app lo hace sola a los pocos minutos de abrir)
}
