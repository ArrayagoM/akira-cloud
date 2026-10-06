// tests/gcal-proxy.test.js — la renovación de tokens de Google pasa por el
// servidor y el client secret nunca está en la app.
'use strict';

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[gcal-proxy] Tests:');
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
  const llamadas = [];
  require('../main/bot-engine/gcal-proxy').instalar({
    request: async (rt) => { llamadas.push(rt); return { access_token: 'nuevo-access', expires_in: 3600, scope: 'calendar', token_type: 'Bearer' }; },
  });
  assert(!!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET, 'se definen marcadores para que el servicio de Calendar no se desactive');
  assert(process.env.GOOGLE_CLIENT_SECRET === 'renovado-por-el-servidor', 'el secret real NO está en la app (solo un marcador)');

  const { google } = require('googleapis');
  const cli = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  let evento = null; cli.on('tokens', (t) => { evento = t; });
  cli.setCredentials({ access_token: 'viejo', refresh_token: 'rt-del-usuario', expiry_date: Date.now() - 1000 });

  const { token } = await cli.getAccessToken();
  assert(token === 'nuevo-access', 'con el access token vencido, googleapis renueva y usa el token que dio el servidor');
  assert(llamadas.length === 1 && llamadas[0] === 'rt-del-usuario', 'al servidor solo viaja el refresh_token del propio usuario');
  assert(evento && evento.access_token === 'nuevo-access', 'se emite el evento "tokens" (así el bot guarda los tokens nuevos)');
  assert(cli.credentials.refresh_token === 'rt-del-usuario', 'el refresh_token se conserva');

  console.log('\n✅ Todos los tests de gcal-proxy pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message, e.stack); process.exit(1); });
