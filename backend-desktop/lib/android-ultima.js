// lib/android-ultima.js
// Última versión de la app de Android (.apk). El armado de GitHub (.github/workflows/android.yml) deja SIEMPRE en una release de nombre fijo
// ("android-actual") el .apk y un android-version.json con los datos de esa versión. Así las direcciones nunca cambian: la página de descarga
// y la propia app consultan acá cuál es la última sin que nadie tenga que actualizar una variable de entorno a mano.
// Solo se aceptan archivos del repositorio oficial (si alguien tocara la release, no se puede mandar a la gente a otra dirección).
'use strict';

const REPO_RELEASES = 'https://github.com/ArrayagoM/akira-cloud/releases/download/';
const URL_VERSION = `${REPO_RELEASES}android-actual/android-version.json`;
const URL_APK = `${REPO_RELEASES}android-actual/Akira-android.apk`;
const VIGENCIA_MS = 10 * 60 * 1000;   // se vuelve a consultar cada 10 minutos
const PACIENCIA_MS = 24 * 3600 * 1000; // si GitHub no responde, se sigue usando lo último que se supo hasta por un día

const textoCorto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Valida el android-version.json. Devuelve null si algo no cierra (nunca se publica una versión a medias).
function normalizarVersion(j, { urlApk = URL_APK } = {}) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const versionCode = Number(j.versionCode);
  if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2e9) return null;
  const versionName = String(j.versionName || '');
  if (!/^\d{1,3}(\.\d{1,4}){1,3}$/.test(versionName)) return null;
  const sha256 = /^[a-f0-9]{64}$/i.test(String(j.sha256 || '')) ? String(j.sha256).toLowerCase() : null;
  const sizeMB = Number(j.sizeMB);
  return {
    versionCode, versionName, sha256,
    sizeMB: Number.isFinite(sizeMB) && sizeMB > 0 && sizeMB < 2000 ? Math.round(sizeMB * 10) / 10 : null,
    notas: textoCorto(j.notas, 300),
    // true: el .apk está firmado con la clave fija de Akira y se puede instalar encima de la versión anterior (también firmada con ella).
    firmaEstable: j.firmaEstable === true,
    urlApk,
  };
}

// Consulta con memoria: mientras la información es reciente no sale a internet; si falla, devuelve lo último que supo (hasta un día).
function crearConsulta({ fetchFn = (typeof fetch === 'function' ? fetch : null), url = URL_VERSION, urlApk = URL_APK, ahora = () => Date.now(), vigenciaMs = VIGENCIA_MS, pacienciaMs = PACIENCIA_MS, timeoutMs = 5000 } = {}) {
  let memoria = null; let cuando = 0; let enCurso = null;

  async function traer() {
    if (!fetchFn) return null;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const r = await fetchFn(url, { headers: { Accept: 'application/json' }, redirect: 'follow', signal: ctl ? ctl.signal : undefined });
      if (!r.ok) return null;
      return normalizarVersion(await r.json(), { urlApk });
    } catch { return null; } finally { if (timer) clearTimeout(timer); }
  }

  return async function ultima() {
    const t = ahora();
    if (memoria && t - cuando < vigenciaMs) return memoria;
    if (!enCurso) enCurso = traer().finally(() => { enCurso = null; });
    const v = await enCurso;
    if (v) { memoria = v; cuando = ahora(); return v; }
    if (memoria && t - cuando < pacienciaMs) return memoria;
    return null;
  };
}

// Instancia compartida. fijarConsulta existe para que las pruebas no salgan a internet.
let consultaActual = crearConsulta();
const ultimaAndroid = () => consultaActual();
const fijarConsulta = (fn) => { consultaActual = fn; };

module.exports = { REPO_RELEASES, URL_VERSION, URL_APK, normalizarVersion, crearConsulta, ultimaAndroid, fijarConsulta };
