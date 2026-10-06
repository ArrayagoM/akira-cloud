// bot-engine/gcal-proxy.js
// google.calendar.service.js crea un cliente OAuth2 que renueva los tokens
// de Google con el client secret de la aplicación. Ese secreto no puede
// estar en la PC del cliente: acá se reemplaza SOLO el paso de renovación
// por una llamada al servidor de licencias (que sí lo tiene). El resto del
// servicio —y el archivo original— quedan igual.
'use strict';

const { google } = require('googleapis');

function instalar({ request }) {
  // El servicio se desactiva si estas variables no existen; son marcadores:
  // la renovación real la hace el servidor con las credenciales verdaderas.
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'akira-desktop';
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'renovado-por-el-servidor';

  google.auth.OAuth2.prototype.refreshTokenNoCache = async function (refreshToken) {
    if (!refreshToken) throw new Error('No hay refresh_token para renovar el acceso a Google');
    const tokens = await request(refreshToken);
    if (tokens.expires_in) {
      tokens.expiry_date = Date.now() + tokens.expires_in * 1000;
      delete tokens.expires_in;
    }
    this.emit('tokens', tokens);
    return { tokens, res: { data: tokens } };
  };
}

module.exports = { instalar };
