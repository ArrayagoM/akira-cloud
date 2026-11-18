// lib/productoCelular.js
// Ayudantes de la pantalla "Productos" de la app del celular: reducir la foto antes de enviarla y leer códigos de barras con la cámara.
// Android/Chrome usa el lector del sistema (BarcodeDetector); iPhone y el resto usan una librería (ZXing) que se descarga solo si hace falta.

const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

// Qué falló al abrir el lector. 'lector' = no se pudo descargar la librería de lectura (casi siempre sin internet); 'permiso' = el usuario o el sistema
// negó la cámara; 'sin-camara' = el navegador no ofrece cámara (por ejemplo página sin https) o no hay ninguna; 'en-uso' = otra app la tiene; 'camara' = cualquier otro fallo.
export function clasificarErrorCamara(e) {
  const n = e && e.name; const m = e && e.message;
  if (n === 'LectorNoDescargado') return 'lector';
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'permiso';
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError' || m === 'sin-camara') return 'sin-camara';
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'en-uso';
  return 'camara';
}

export function mensajeDeCamara(e) {
  switch (clasificarErrorCamara(e)) {
    case 'lector': return 'No se pudo descargar el lector de códigos: revisá tu conexión y probá de nuevo. También podés escribir el código a mano.';
    case 'permiso': return 'No pude abrir la cámara: el permiso está denegado. Permití la cámara para este sitio en los ajustes del navegador y probá de nuevo, o escribí el código a mano.';
    case 'sin-camara': return 'No encontré una cámara que se pueda usar desde acá. Podés escribir el código a mano.';
    case 'en-uso': return 'No pude abrir la cámara: puede que otra app la esté usando. Cerrala y probá de nuevo, o escribí el código a mano.';
    default: return 'No pude abrir la cámara. Podés escribir el código a mano.';
  }
}

// Linterna: solo algunos celulares con Chrome la permiten (el iPhone no). Se pregunta a la pista de video si la soporta.
export function soportaLinterna(track) {
  try { return !!(track && typeof track.getCapabilities === 'function' && track.getCapabilities().torch); } catch { return false; }
}
export async function aplicarLinterna(track, encendida) {
  if (!soportaLinterna(track)) throw new Error('sin-linterna');
  await track.applyConstraints({ advanced: [{ torch: !!encendida }] });
}

// Pide la cámara trasera con una resolución que alcanza para leer códigos finos (1280 de ancho) sin exigir de más.
export const RESTRICCIONES_CAMARA = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false };

// ── Borrador del formulario (se guarda en el celular, nunca se envía ni lleva la foto) ──
// Sirve para no perder lo escrito si se corta internet, se recarga la página o el sistema cierra la app.
export const CLAVE_BORRADOR = 'akira.celular.borradorProducto';
const CAMPOS_BORRADOR = { nombre: 120, precio: 20, categoria: 60, stock: 10, descripcion: 500, codigo: 40 }; // mismos largos máximos que el formulario
const VIDA_BORRADOR_MS = 7 * 24 * 3600 * 1000;

// null si no hay nada que guardar (la categoría sola no cuenta: se conserva entre envíos y no es un borrador).
export function armarBorrador(form, ahoraMs = Date.now()) {
  const f = {};
  for (const [c, max] of Object.entries(CAMPOS_BORRADOR)) f[c] = String((form && form[c]) ?? '').slice(0, max);
  const hayAlgo = Object.entries(f).some(([c, v]) => c !== 'categoria' && v.trim() !== '');
  return hayAlgo ? { v: 1, en: ahoraMs, form: f } : null;
}

// Devuelve { form, en } o null si no sirve (formato raro, vacío o de hace más de 7 días).
export function leerBorrador(raw, ahoraMs = Date.now()) {
  let o = null;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!o || o.v !== 1 || !o.form || typeof o.form !== 'object' || !Number.isFinite(o.en)) return null;
  if (ahoraMs - o.en > VIDA_BORRADOR_MS || o.en - ahoraMs > 60 * 1000) return null;
  const b = armarBorrador(o.form, o.en);
  return b ? { form: b.form, en: b.en } : null;
}

// Foto del celular → JPEG chico en base64 (sin el encabezado "data:"). Lado máximo 1024 px y menos de ~900 KB, para que suba rápido con datos móviles.
export async function reducirFoto(archivo, { lado = 1024, calidad = 0.72, maxBytes = 900 * 1024 } = {}) {
  const bmp = await (typeof createImageBitmap === 'function'
    ? createImageBitmap(archivo)
    : new Promise((ok, mal) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => mal(new Error('imagen')); img.src = URL.createObjectURL(archivo); }));
  const ancho0 = bmp.width || bmp.naturalWidth; const alto0 = bmp.height || bmp.naturalHeight;
  if (!ancho0 || !alto0) throw new Error('imagen');
  let escala = Math.min(1, lado / Math.max(ancho0, alto0)); let q = calidad;
  for (let intento = 0; intento < 6; intento++) {
    const c = document.createElement('canvas'); c.width = Math.round(ancho0 * escala); c.height = Math.round(alto0 * escala);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', q);
    const base64 = url.slice(url.indexOf(',') + 1);
    if (base64.length * 0.75 <= maxBytes) { if (bmp.close) bmp.close(); return { base64, url }; }
    escala *= 0.8; q = Math.max(0.5, q - 0.06);
  }
  throw new Error('La foto es demasiado pesada. Probá con otra.');
}

// Abre la cámara trasera en `video` y avisa con el primer código que lee. Devuelve una función para apagar la cámara.
// alError(mensaje, motivo) se llama si no se pudo abrir (ver clasificarErrorCamara). alListo({ linterna, alternarLinterna }) se llama cuando la cámara ya está andando.
export async function iniciarEscaner(video, alLeer, alError, alListo) {
  let parado = false; let stream = null; let controles = null;
  const detener = () => {
    parado = true;
    try { if (controles) controles.stop(); } catch { /* ya estaba apagado */ }
    try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch { /* idem */ }
    try { video.srcObject = null; } catch { /* idem */ }
  };
  // Con la cámara andando: ¿tiene linterna? (la pista de video está en el <video> sea cual sea el lector que la abrió)
  const avisarListo = () => {
    if (parado || !alListo) return;
    const s = (stream || video.srcObject); const track = s && s.getVideoTracks && s.getVideoTracks()[0];
    alListo({ linterna: soportaLinterna(track), alternarLinterna: (on) => aplicarLinterna(track, on) });
  };
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sin-camara');
    const restricciones = RESTRICCIONES_CAMARA;
    if ('BarcodeDetector' in window) {
      let formatos = FORMATOS;
      try { const ok = await window.BarcodeDetector.getSupportedFormats(); formatos = FORMATOS.filter((f) => ok.includes(f)); } catch { /* usa la lista entera */ }
      if (formatos.length) {
        const detector = new window.BarcodeDetector({ formats: formatos });
        stream = await navigator.mediaDevices.getUserMedia(restricciones);
        video.srcObject = stream; await video.play();
        const ciclo = async () => {
          if (parado) return;
          try { const r = await detector.detect(video); if (r && r[0] && r[0].rawValue) { detener(); alLeer(r[0].rawValue); return; } } catch { /* sigue intentando */ }
          setTimeout(ciclo, 200);
        };
        ciclo();
        avisarListo();
        return detener;
      }
    }
    let zxing;
    try { zxing = await import('@zxing/browser'); } catch (err) { throw Object.assign(new Error('No se pudo descargar el lector'), { name: 'LectorNoDescargado', causa: err }); }
    const lector = new zxing.BrowserMultiFormatReader();
    controles = await lector.decodeFromConstraints(restricciones, video, (resultado) => { if (resultado && !parado) { detener(); alLeer(resultado.getText()); } });
    avisarListo();
    return detener;
  } catch (e) { detener(); if (alError) alError(mensajeDeCamara(e), clasificarErrorCamara(e)); return detener; }
}

export const ESTADOS_PRODUCTO = {
  pendiente: { texto: 'Esperando a tu PC', color: '#f59e0b' },
  hecho: { texto: 'Ya está en tu Catálogo', color: '#00e87b' },
  fallo: { texto: 'No se pudo guardar', color: '#f43f5e' },
};
