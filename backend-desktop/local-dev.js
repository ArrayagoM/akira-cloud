// local-dev.js — arranque con `node local-dev.js` / `npm run dev` para
// probar backend-desktop en la máquina local antes de deployar a Vercel
// (Vercel en sí usa api/index.js, esto NO se usa en producción).
'use strict';

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`[backend-desktop] escuchando en http://localhost:${PORT}`);
});
