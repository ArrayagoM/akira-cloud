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
  });
});

router.get('/download', (_req, res) => {
  const u = urlInstalador();
  if (!u) return res.status(404).json({ error: 'El instalador todavía no está disponible' });
  res.redirect(302, `${u}${u.includes('?') ? '&' : '?'}download=1`);
});

module.exports = router;
