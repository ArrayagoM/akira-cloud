// La prueba gratis cuenta DÍAS DE USO (días en los que el bot atendió al menos un mensaje), no días de calendario.
// Misma regla que backend-desktop/lib/prueba.js (el servidor es el que manda; esto es solo para mostrarlo).
export const DIAS_USO = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

// "AAAA-MM-DD" en hora de Argentina (el día de uso cambia a la medianoche local)
export function hoyAR(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

// user = { plan, trialExpira, trialModeloUso, trialDiasUso, trialUltimoDiaUso } → { vigente, modelo, diasUso, diasMax, diasRestantes, hoyContado, texto }
export function vigenciaTrial(user, ahora = new Date()) {
  const exp = user?.trialExpira ? new Date(user.trialExpira) : null;
  if (!user?.trialModeloUso) {
    const dias = exp ? Math.max(0, Math.ceil((exp - ahora) / DIA_MS)) : 0;
    const vigente = !!exp && exp > ahora;
    return { vigente, modelo: 'calendario', diasUso: null, diasMax: null, diasRestantes: dias, hoyContado: false,
      texto: vigente ? `Tu prueba gratuita vence en ${dias} día${dias !== 1 ? 's' : ''}.` : 'Tu prueba gratuita venció.' };
  }
  const usados = Math.max(0, Number(user.trialDiasUso) || 0);
  const hoyContado = user.trialUltimoDiaUso === hoyAR(ahora);
  const vigente = !!exp && exp > ahora && !(usados >= DIAS_USO && !hoyContado);
  const restantes = Math.max(0, DIAS_USO - usados);
  let texto;
  if (!vigente) texto = 'Tu prueba gratuita terminó.';
  else if (usados === 0) texto = `Tu prueba gratuita son ${DIAS_USO} días de uso: todavía no gastaste ninguno, solo cuentan los días en que el bot atiende mensajes.`;
  else if (restantes === 0) texto = 'Hoy es tu último día de prueba gratuita.';
  else texto = `Te quedan ${restantes} de ${DIAS_USO} días de uso de tu prueba gratuita (solo cuentan los días en que el bot atiende mensajes).`;
  return { vigente, modelo: 'uso', diasUso: Math.min(usados, DIAS_USO), diasMax: DIAS_USO, diasRestantes: restantes, hoyContado, texto };
}
