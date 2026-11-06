// lib/productoCelular.js
// Ayudantes de la pantalla "Productos" de la app del celular: reducir la foto antes de enviarla y leer códigos de barras con la cámara.
// Android/Chrome usa el lector del sistema (BarcodeDetector); iPhone y el resto usan una librería (ZXing) que se descarga solo si hace falta.

const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

export function mensajeDeCamara(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Permití el acceso a la cámara en tu navegador y probá de nuevo.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No encontré una cámara en este celular. Podés escribir el código a mano.';
  return 'No pude abrir la cámara. Podés escribir el código a mano.';
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
export async function iniciarEscaner(video, alLeer, alError) {
  let parado = false; let stream = null; let controles = null;
  const detener = () => {
    parado = true;
    try { if (controles) controles.stop(); } catch { /* ya estaba apagado */ }
    try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch { /* idem */ }
    try { video.srcObject = null; } catch { /* idem */ }
  };
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sin-camara');
    const restricciones = { video: { facingMode: { ideal: 'environment' } }, audio: false };
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
        return detener;
      }
    }
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const lector = new BrowserMultiFormatReader();
    controles = await lector.decodeFromConstraints(restricciones, video, (resultado) => { if (resultado && !parado) { detener(); alLeer(resultado.getText()); } });
    return detener;
  } catch (e) { detener(); if (alError) alError(mensajeDeCamara(e)); return detener; }
}

export const ESTADOS_PRODUCTO = {
  pendiente: { texto: 'Esperando a tu PC', color: '#f59e0b' },
  hecho: { texto: 'Ya está en tu Catálogo', color: '#00e87b' },
  fallo: { texto: 'No se pudo guardar', color: '#f43f5e' },
};
