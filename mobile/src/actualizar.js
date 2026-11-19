// src/actualizar.js — piezas puras (sin React Native) de la actualización automática del .apk, para poder probarlas con Node.
// La app consulta al servidor cuál es la última versión (GET /api/mobile/android). Si hay una más nueva:
//  · si la instalada y la nueva están firmadas con la clave fija de Akira → se baja y se instala ENCIMA (un toque de confirmación de Android);
//  · si no (versiones de prueba, firmadas con una clave que cambiaba en cada armado) Android no deja instalar encima: hay que desinstalar una vez.
// Android no permite instalar en silencio una app fuera de Google Play: siempre pide una confirmación del usuario.
'use strict';

const MIN_ENTRE_CONSULTAS_MS = 30 * 60 * 1000; // no se consulta más seguido que cada 30 minutos
const MIN_APK_BYTES = 5 * 1024 * 1024;         // un .apk de Akira pesa decenas de MB: algo más chico es una descarga cortada o una página de error

// Versión de la app instalada, a partir de lo que trae embebido (expo-constants → expoConfig).
function versionInstalada(expoConfig) {
  const cfg = expoConfig || {};
  const code = Number(cfg.android && cfg.android.versionCode);
  return {
    versionCode: Number.isInteger(code) && code > 0 ? code : 0,
    versionName: String(cfg.version || ''),
    firmaEstable: !!(cfg.extra && cfg.extra.firmaEstable === true),
  };
}

// Qué hacer con lo que informa el servidor: 'al-dia' | 'actualizar' (se instala encima) | 'reinstalar' (hay que desinstalar la anterior) | 'no-aplica'
function decidir({ instalada, ultima, plataforma }) {
  if (plataforma !== 'android') return { estado: 'no-aplica' };
  if (!ultima || ultima.disponible !== true || !Number.isInteger(ultima.versionCode)) return { estado: 'al-dia' };
  if (!instalada || ultima.versionCode <= instalada.versionCode) return { estado: 'al-dia' };
  const encima = instalada.firmaEstable === true && ultima.firmaEstable === true;
  return { estado: encima ? 'actualizar' : 'reinstalar', versionName: ultima.versionName || '', notas: ultima.notas || '', sizeMB: ultima.sizeMB || null, url: ultima.url || '' };
}

// Texto para el aviso. Sin emojis ni jerga.
function textoAviso(d) {
  if (!d || (d.estado !== 'actualizar' && d.estado !== 'reinstalar')) return null;
  const v = d.versionName ? ` ${d.versionName}` : '';
  if (d.estado === 'actualizar') {
    return { titulo: `Hay una versión nueva de Akira${v}`, detalle: (d.notas ? d.notas + '. ' : '') + 'Se descarga y Android te pide confirmar la instalación. Tus datos y tu sesión se mantienen.', boton: 'Actualizar ahora' };
  }
  return {
    titulo: `Hay una versión nueva de Akira${v}`,
    detalle: 'Esta instalación es una versión de prueba y Android no permite actualizarla encima. Una sola vez: desinstalá Akira, descargá la versión nueva desde akiracloud.lat/descargar e iniciá sesión de nuevo. Desde esa versión se actualiza sola.',
    boton: 'Abrir la descarga',
  };
}

// ¿Toca volver a consultar? (ultimaConsulta: ms de la última vez, o 0/null si nunca)
function tocaConsultar(ultimaConsulta, ahora = Date.now(), minimo = MIN_ENTRE_CONSULTAS_MS) {
  return !ultimaConsulta || ahora - ultimaConsulta >= minimo;
}

// Solo se instala un archivo que llegó completo y con un tamaño razonable.
function descargaValida({ status, size }) { return status === 200 && Number.isFinite(size) && size >= MIN_APK_BYTES; }

// Mensajes de error pensados para el usuario.
const ERRORES = {
  descarga: 'No se pudo descargar la actualización. Revisá tu internet y probá de nuevo.',
  incompleta: 'La descarga quedó incompleta. Probá de nuevo con mejor conexión.',
  instalar: 'No se pudo abrir el instalador de Android. Probá de nuevo; si sigue igual, descargá la app desde akiracloud.lat/descargar.',
};

module.exports = { MIN_ENTRE_CONSULTAS_MS, MIN_APK_BYTES, versionInstalada, decidir, textoAviso, tocaConsultar, descargaValida, ERRORES };
