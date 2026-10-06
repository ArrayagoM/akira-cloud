// local-api/routes/sync.routes.js
// Importación manual desde la nube (la primera vez corre sola, ver server.js).
'use strict';

const { obtenerDeviceId } = require('../../device');
const { importarTodo } = require('../importador');

module.exports = function crearRouter({ requerirSesion, userDataDir, estadoImport, ejecutarImport }) {
  const router = require('express').Router();
  router.use(requerirSesion);

  router.get('/estado', (_req, res) => res.json(estadoImport()));

  router.post('/importar', async (req, res) => {
    if (estadoImport().corriendo) return res.status(409).json({ error: 'Ya hay una importación en curso' });
    try {
      const resumen = await ejecutarImport(req.user._id);
      res.json({ ok: true, resumen });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
