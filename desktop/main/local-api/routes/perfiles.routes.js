// local-api/routes/perfiles.routes.js
// Perfiles del equipo (ver main/perfiles.js): pantalla de bloqueo (estado / entrar), "quién soy" y administración (solo el dueño).
'use strict';

const express = require('express');
const perfiles = require('../../perfiles');

// verificarClave(email, password) → Promise<boolean>: confirma la contraseña de la cuenta (para "olvidé mi PIN")
module.exports = function crearRouter({ requerirSesion, userDataDir, verificarClave }) {
  const router = express.Router();
  const soloDueno = (req, res, next) => (!perfiles.activo(userDataDir) || req.perfil?.rol === 'propietario' ? next() : res.status(403).json({ error: 'Solo el dueño puede hacer esto.', codigo: 'SIN_PERMISO' }));

  // Sin sesión de perfil: lo que necesita la pantalla de bloqueo
  router.get('/estado', (_req, res) => res.json(perfiles.publico(userDataDir)));
  router.post('/entrar', (req, res) => {
    const r = perfiles.entrar(userDataDir, { id: String(req.body?.id || ''), pin: String(req.body?.pin || '') });
    if (!r.ok) return res.status(r.bloqueadoHasta ? 429 : 400).json({ error: r.error, bloqueadoHasta: r.bloqueadoHasta });
    res.json({ token: r.token, perfil: r.perfil });
  });

  router.get('/yo', requerirSesion, (req, res) => res.json({ activo: perfiles.activo(userDataDir), perfil: req.perfil || { id: 'propietario', nombre: 'Dueño', rol: 'propietario' } }));

  // Administración
  router.get('/admin', requerirSesion, soloDueno, (_req, res) => res.json({ activo: perfiles.activo(userDataDir), perfiles: perfiles.listaAdmin(userDataDir), roles: perfiles.ROLES }));
  router.post('/pin-propietario', requerirSesion, soloDueno, (req, res) => {
    const r = perfiles.definirPinPropietario(userDataDir, String(req.body?.pin || ''));
    if (!r.ok) return res.status(400).json({ error: r.error });
    // el dueño recién puso el PIN: se lo deja adentro (si no, quedaría bloqueado de su propia pantalla)
    const e = perfiles.entrar(userDataDir, { id: 'propietario', pin: String(req.body.pin) });
    res.json({ ok: true, token: e.token, perfil: e.perfil });
  });
  router.delete('/pin-propietario', requerirSesion, soloDueno, (req, res) => {
    if (perfiles.activo(userDataDir)) {
      const e = perfiles.entrar(userDataDir, { id: 'propietario', pin: String(req.body?.pin || '') });
      if (!e.ok) return res.status(400).json({ error: e.error });
    }
    res.json(perfiles.desactivar(userDataDir));
  });
  router.post('/perfil', requerirSesion, soloDueno, (req, res) => {
    const r = perfiles.crear(userDataDir, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });
  router.put('/perfil/:id', requerirSesion, soloDueno, (req, res) => {
    const r = perfiles.actualizar(userDataDir, req.params.id, req.body || {});
    res.status(r.ok ? 200 : (/no encontrado/i.test(r.error) ? 404 : 400)).json(r);
  });
  router.delete('/perfil/:id', requerirSesion, soloDueno, (req, res) => {
    const r = perfiles.eliminar(userDataDir, req.params.id);
    res.status(r.ok ? 200 : 404).json(r);
  });

  // "Olvidé el PIN": se confirma con la contraseña de la cuenta y se desactivan los perfiles (después se vuelven a activar con un PIN nuevo)
  router.post('/recuperar', requerirSesion, async (req, res) => {
    try {
      const password = String(req.body?.password || '');
      if (!password) return res.status(400).json({ error: 'Escribí la contraseña de tu cuenta.' });
      if (!(await verificarClave?.(req.user.email, password))) return res.status(400).json({ error: 'La contraseña no es correcta.' });
      res.json(perfiles.desactivar(userDataDir));
    } catch { res.status(400).json({ error: 'No se pudo confirmar la contraseña. Probá de nuevo.' }); }
  });

  return router;
};
