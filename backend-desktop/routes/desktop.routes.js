// routes/desktop.routes.js
// Datos públicos del instalador vigente de la app de escritorio. La web
// (panel y página /descargar) lo consulta para mostrar el botón de descarga;
// cambiar de versión o de lugar de alojamiento es cambiar variables de
// entorno en Vercel, sin tocar código ni volver a publicar la web.
'use strict';

const router = require('express').Router();

const urlInstalador = () => {
  const u = (process.env.DESKTOP_DOWNLOAD_URL || '').trim();
  return /^https:\/\//i.test(u) ? u : null;
};

// Versión de prueba para Mac (sin firma de Apple). Dos archivos según el chip de la Mac.
const urlMac = (arch) => {
  const u = (process.env[arch === 'x64' ? 'DESKTOP_MAC_X64_URL' : 'DESKTOP_MAC_ARM64_URL'] || '').trim();
  return /^https:\/\//i.test(u) ? u : null;
};

// App nativa de Android (.apk), versión de prueba.
const urlAndroid = () => {
  const u = (process.env.DESKTOP_ANDROID_URL || '').trim();
  return /^https:\/\//i.test(u) ? u : null;
};

router.get('/latest', (_req, res) => {
  const base = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    disponible: !!urlInstalador(),
    version: (process.env.DESKTOP_VERSION || '').trim() || null,
    // El enlace público es de nuestro dominio (estable y de confianza); desde
    // acá se redirige al archivo, que puede cambiar de lugar sin avisar a nadie.
    url: urlInstalador() ? `${base}/api/desktop/download` : null,
    sizeMB: parseInt(process.env.DESKTOP_SIZE_MB, 10) || null,
    plataforma: 'windows',
    // Mac: solo se ofrece lo que ya está subido (cada enlace sale de una variable de entorno).
    android: {
      disponible: !!urlAndroid(),
      url: urlAndroid() ? `${base}/api/desktop/download-android` : null,
      sizeMB: parseInt(process.env.DESKTOP_ANDROID_SIZE_MB, 10) || null,
    },
    mac: {
      disponible: !!(urlMac('arm64') || urlMac('x64')),
      arm64: urlMac('arm64') ? `${base}/api/desktop/download-mac?arch=arm64` : null,
      x64: urlMac('x64') ? `${base}/api/desktop/download-mac?arch=x64` : null,
      sizeMB: parseInt(process.env.DESKTOP_MAC_SIZE_MB, 10) || null,
    },
  });
});

router.get('/download-android', (_req, res) => {
  const u = urlAndroid();
  if (!u) return res.status(404).json({ error: 'La app de Android todavía no está disponible' });
  res.redirect(302, u);
});

router.get('/download-mac', (req, res) => {
  const u = urlMac(req.query.arch === 'x64' ? 'x64' : 'arm64');
  if (!u) return res.status(404).json({ error: 'La versión para Mac todavía no está disponible' });
  res.redirect(302, `${u}${u.includes('?') ? '&' : '?'}download=1`);
});

router.get('/download', (_req, res) => {
  const u = urlInstalador();
  if (!u) return res.status(404).json({ error: 'El instalador todavía no está disponible' });
  res.redirect(302, `${u}${u.includes('?') ? '&' : '?'}download=1`);
});

module.exports = router;
