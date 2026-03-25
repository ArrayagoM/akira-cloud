# Akira Cloud — SaaS de WhatsApp con IA

Plataforma multi-tenant para automatizar la atención al cliente, gestión de turnos y pagos via WhatsApp, impulsada por LLaMA 3.3 (Groq).

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express |
| Base de datos | MongoDB + Mongoose |
| Autenticación | Passport.js — JWT + Google OAuth + Facebook OAuth |
| Cifrado | AES-256-GCM + PBKDF2 (crypto nativo de Node) |
| IA | Groq — LLaMA 3.3 70B |
| WhatsApp | whatsapp-web.js (Puppeteer) |
| Tiempo real | Socket.io |
| Calendario | Google Calendar API |
| Pagos | MercadoPago |
| Audio STT | Whisper (via Groq) |
| Audio TTS | Rime.ai |
| Frontend | React + Vite + Tailwind CSS |
| Deploy | Render (backend) + Vercel (frontend) |

---

## Estructura del proyecto

```
akira-cloud/
├── backend/
│   ├── config/
│   │   ├── db.js               ← Conexión MongoDB
│   │   ├── env.validator.js    ← Validación de .env al arrancar
│   │   ├── logger.js           ← Winston logger
│   │   └── passport.js         ← Estrategias OAuth
│   ├── middleware/
│   │   └── auth.js             ← requireAuth, requireAdmin, generarJWT
│   ├── models/
│   │   ├── User.js             ← Usuarios con OAuth, roles y planes
│   │   ├── Config.js           ← API Keys cifradas AES-256-GCM
│   │   └── Log.js              ← Auditoría con TTL automático (90 días)
│   ├── routes/
│   │   ├── auth.routes.js      ← Login, registro, OAuth
│   │   ├── bot.routes.js       ← Control del bot (start/stop/logs)
│   │   ├── config.routes.js    ← Gestión de API Keys y configuración
│   │   ├── admin.routes.js     ← Panel admin con botón de pánico
│   │   └── subscription.routes.js ← Checkout y webhooks de suscripciones
│   ├── services/
│   │   ├── akira.bot.js        ← Orquestador del bot (WhatsApp + IA)
│   │   ├── bot.manager.js      ← Gestor multi-tenant de instancias
│   │   ├── crypto.service.js   ← Cifrado/descifrado AES-256-GCM
│   │   └── bot/
│   │       ├── audio.service.js       ← STT Whisper + TTS Rime
│   │       ├── calendar.service.js    ← Google Calendar
│   │       ├── groq.service.js        ← LLM + manejo de rate-limit
│   │       ├── mercadopago.service.js ← Pagos y verificación MP
│   │       └── persistence.service.js ← I/O de memoria del bot
│   ├── scripts/
│   │   ├── seedAdmin.js        ← Crear admin inicial
│   │   └── limpiarSesiones.js  ← Limpiar sesiones de WhatsApp
│   ├── tests/
│   │   ├── crypto.service.test.js
│   │   ├── env.validator.test.js
│   │   └── persistence.service.test.js
│   └── server.js               ← Entrada principal
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Landing.jsx     ← Landing page
│       │   ├── Login.jsx       ← Auth + OAuth
│       │   ├── Register.jsx    ← Registro
│       │   ├── Dashboard.jsx   ← QR + logs en vivo + stats
│       │   ├── ConfigPage.jsx  ← API Keys cifradas + datos del negocio
│       │   ├── PlanesPage.jsx  ← Suscripciones y checkout
│       │   └── AdminPanel.jsx  ← Gestión de usuarios + botón de pánico
│       ├── components/
│       │   └── Layout.jsx
│       ├── context/
│       │   └── AuthContext.jsx
│       ├── hooks/
│       │   └── useSocket.js
│       └── services/
│           └── api.js
└── scripts/
    └── generar-vercel-json.js  ← Genera vercel.json con la URL del backend
```

---

## Instalación local

### Requisitos

- Node.js v18+
- MongoDB (local o Atlas)

### 1. Backend

```bash
cd backend
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores (ver sección Variables de entorno)

# Crear carpeta de sesiones y logs
mkdir -p sessions logs

# Crear el admin inicial
npm run seed:admin

# Correr tests (opcional)
npm test

# Iniciar en desarrollo
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend corre en `http://localhost:5173` y hace proxy al backend en `http://localhost:5000`.

---

## Variables de entorno

Copiá `backend/.env.example` a `backend/.env` y completá los valores:

### Obligatorias

| Variable | Descripción |
|---|---|
| `MONGO_URI` | URI de conexión a MongoDB |
| `JWT_SECRET` | Clave secreta JWT — mínimo 32 chars aleatorios |
| `ENCRYPTION_KEY` | Clave maestra AES-256 — mínimo 16 chars |

> Para generar claves seguras: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Importantes (sin esto algunos features no funcionan)

| Variable | Descripción |
|---|---|
| `BACKEND_URL` | URL pública del backend — necesaria para webhooks de MercadoPago |
| `FRONTEND_URL` | URL del frontend — necesaria para CORS y redirección OAuth |
| `MP_PLATFORM_ACCESS_TOKEN` | Access Token de MercadoPago — para cobrar suscripciones |
| `NGROK_AUTH_TOKEN` | Token de ngrok — para webhooks en desarrollo local |

### Opcionales

| Variable | Descripción |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth con Google |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | OAuth con Facebook |
| `MP_PLATFORM_WEBHOOK_SECRET` | Verificación de firma en webhooks de MP |
| `NGROK_DOMAIN` | Dominio fijo de ngrok (plan pago) |
| `WA_SESSIONS_PATH` | Ruta de sesiones de WhatsApp (default: `./sessions`) |

---

## Deploy en producción

### Backend — Render

1. Crear nuevo Web Service en [render.com](https://render.com)
2. Conectar el repositorio y apuntar a la carpeta `/backend`
3. Build command: `npm install`
4. Start command: `npm start`
5. Cargar las variables de entorno desde el dashboard
6. Para persistencia de sesiones de WhatsApp: activar un **Disk** en Render (`$7/mes`) y configurar `WA_SESSIONS_PATH=/data/sessions`

### Frontend — Vercel

1. Antes del primer deploy, generar `vercel.json` con la URL del backend:

```bash
BACKEND_URL=https://tu-app.onrender.com node scripts/generar-vercel-json.js
```

2. Deploy desde la carpeta `/frontend` en [vercel.com](https://vercel.com)

> Cada vez que cambie la URL del backend, volver a correr el script y commitear el nuevo `vercel.json`.

---

## Flujo de un usuario (primer uso)

1. Entra a la app → ve la landing page
2. Se registra con Google o email/contraseña
3. Va a **Configuración** → carga su Groq API Key (y opcionalmente MP, Calendar, Rime)
4. Va a **Dashboard** → hace clic en "Iniciar bot"
5. Escanea el QR con su WhatsApp Business
6. El bot está activo — los clientes ya pueden escribirle

---

## API endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Registro con email |
| POST | `/api/auth/login` | Login con email |
| GET | `/api/auth/me` | Perfil del usuario autenticado |
| GET | `/api/auth/google` | Iniciar OAuth con Google |
| GET | `/api/auth/facebook` | Iniciar OAuth con Facebook |
| PUT | `/api/auth/password` | Cambiar contraseña |
| GET | `/api/config` | Obtener configuración del usuario |
| PUT | `/api/config/negocio` | Guardar datos del negocio |
| PUT | `/api/config/keys` | Guardar API Key cifrada |
| POST | `/api/bot/start` | Iniciar bot |
| POST | `/api/bot/stop` | Detener bot |
| GET | `/api/bot/logs` | Logs del bot |
| GET | `/api/subscriptions/planes` | Listar planes y precios |
| POST | `/api/subscriptions/checkout` | Crear preferencia de pago MP |
| POST | `/api/subscriptions/webhook` | Webhook de notificaciones MP |
| GET | `/api/admin/dashboard` | Stats globales (admin) |
| GET | `/api/admin/users` | Listar usuarios (admin) |
| POST | `/api/admin/users/:id/block` | Bloquear usuario + detener bot (admin) |
| POST | `/api/admin/users/:id/unblock` | Desbloquear usuario (admin) |
| GET | `/api/health` | Health check |

---

## Seguridad

- **AES-256-GCM**: cada API Key del cliente se cifra con IV aleatorio. Sin la `ENCRYPTION_KEY` maestra es imposible recuperarlas.
- **PBKDF2**: la clave maestra se deriva antes de usarse (100.000 iteraciones, SHA-512).
- **bcrypt**: contraseñas hasheadas con 12 salt rounds.
- **JWT**: tokens con expiración configurable, verificados en cada request.
- **Bloqueo instantáneo**: al bloquear un usuario el bot se detiene, el socket se desconecta y el JWT queda inválido en tiempo real (sin esperar a que expire).
- **Rate limiting**: 300 req/15min global, 20 req/15min en rutas de auth.
- **Helmet + mongo-sanitize + HPP**: protección contra XSS, NoSQL injection y HTTP Parameter Pollution.
- **Auditoría**: cada acción sensible queda registrada con IP, userAgent y timestamp. Los logs se eliminan automáticamente a los 90 días (TTL index).
- **Validación de env**: el servidor no arranca si faltan variables críticas (`MONGO_URI`, `JWT_SECRET`, `ENCRYPTION_KEY`).

---

## Planes y límites

| Plan | Mensajes/mes | Bots | Calendar | MP | Audio |
|---|---|---|---|---|---|
| Trial | 100 | 1 | — | — | — |
| Básico | 500 | 1 | — | — | — |
| Pro | Ilimitado | 1 | ✅ | ✅ | ✅ |
| Agencia | Ilimitado | 5 | ✅ | ✅ | ✅ |

---

## Scripts disponibles

```bash
# Backend
npm run dev           # Desarrollo con hot-reload
npm start             # Producción
npm test              # Correr tests
npm run seed:admin    # Crear admin inicial
npm run clean:sessions # Limpiar sesiones de WhatsApp
npm run gen:vercel    # Generar vercel.json (requiere BACKEND_URL)

# Raíz del proyecto
BACKEND_URL=https://... node scripts/generar-vercel-json.js
```

---

Akira Cloud v1.1
