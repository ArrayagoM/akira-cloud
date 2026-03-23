# 🤖 Akira Cloud — SaaS de WhatsApp con IA

Plataforma multi-tenant para gestión de turnos, pagos y atención automatizada vía WhatsApp.

---

## 🏗️ Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express |
| Base de datos | MongoDB + Mongoose |
| Autenticación | Passport.js (JWT + Google OAuth + Facebook OAuth) |
| Cifrado de keys | AES-256-GCM (crypto nativo) |
| IA | Groq — LLaMA 3.3 70B |
| WhatsApp | whatsapp-web.js |
| Tiempo real | Socket.io |
| Frontend | React + Vite + Tailwind CSS |
| Seguridad | Helmet, rate-limit, mongo-sanitize, HPP, bcrypt |

---

## 📁 Estructura

```
akira-cloud/
├── backend/
│   ├── models/
│   │   ├── User.js          ← Usuarios con OAuth, roles, planes
│   │   ├── Config.js        ← API Keys cifradas AES-256-GCM
│   │   └── Log.js           ← Auditoría con TTL automático
│   ├── services/
│   │   ├── crypto.service.js ← Cifrado/descifrado de API Keys
│   │   ├── bot.manager.js    ← Gestor multi-tenant de bots
│   │   └── akira.bot.js      ← Bot completo v3.0 cloud-ready
│   ├── routes/
│   │   ├── auth.routes.js   ← Login, register, OAuth
│   │   ├── config.routes.js ← Gestión de configuración
│   │   ├── bot.routes.js    ← Control del bot
│   │   └── admin.routes.js  ← Panel admin con botón de pánico
│   ├── middleware/
│   │   └── auth.js          ← requireAuth, requireAdmin, generarJWT
│   ├── config/
│   │   ├── db.js            ← Conexión MongoDB
│   │   ├── logger.js        ← Winston logger
│   │   └── passport.js      ← Estrategias OAuth
│   ├── scripts/
│   │   └── seedAdmin.js     ← Crear admin inicial
│   └── server.js            ← Entrada principal
└── frontend/
    └── src/
        ├── pages/
        │   ├── Landing.jsx   ← Landing page profesional
        │   ├── Login.jsx     ← Auth + OAuth
        │   ├── Register.jsx  ← Registro
        │   ├── Dashboard.jsx ← QR + logs en vivo + stats
        │   ├── ConfigPage.jsx ← Keys cifradas + datos negocio
        │   └── AdminPanel.jsx ← Gestión usuarios + botón pánico
        ├── components/
        │   └── Layout.jsx    ← Sidebar + topbar
        ├── context/
        │   └── AuthContext.jsx
        ├── hooks/
        │   └── useSocket.js
        └── services/
            └── api.js
```

---

## 🚀 Instalación y ejecución local

### Requisitos
- Node.js v18+
- MongoDB corriendo en localhost:27017

### Backend

```bash
cd backend
npm install

# Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Crear carpeta de logs
mkdir -p logs

# Crear admin inicial
npm run seed:admin

# Iniciar en desarrollo
npm run dev

# Iniciar en producción
npm start
```

### Frontend

```bash
cd frontend
npm install

# Iniciar en desarrollo
npm run dev

# Compilar para producción
npm run build
```

---

## ⚙️ Variables de entorno críticas

| Variable | Descripción | Obligatorio |
|---|---|---|
| `GROQ_API_KEY` | No se usa en el backend principal (es del usuario) | — |
| `MONGO_URI` | URI de conexión a MongoDB | ✅ |
| `JWT_SECRET` | Clave secreta JWT (64+ chars) | ✅ |
| `ENCRYPTION_KEY` | Clave maestra AES-256 (min 16 chars) | ✅ |
| `GOOGLE_CLIENT_ID` | Para OAuth de Google | Opcional |
| `GOOGLE_CLIENT_SECRET` | Para OAuth de Google | Opcional |
| `FACEBOOK_APP_ID` | Para OAuth de Facebook | Opcional |
| `ADMIN_EMAIL` | Email del admin inicial | Opcional |

---

## 🔐 Seguridad implementada

- **AES-256-GCM**: cada API Key del cliente se cifra con IV aleatorio. Imposible revertir sin la `ENCRYPTION_KEY` maestra.
- **PBKDF2**: la clave maestra se deriva antes de usarse (100.000 iteraciones, SHA-512).
- **bcrypt**: contraseñas de usuarios hasheadas con salt rounds 12.
- **JWT**: tokens con expiración configurable. Verificación en cada request.
- **Bloqueo instantáneo**: al bloquear un usuario, el bot se detiene, el socket se desconecta y el JWT queda inválido inmediatamente (verificación en tiempo real, no solo en expiración).
- **Rate limiting**: 300 req/15min global, 20 req/15min en rutas de auth.
- **Helmet + mongo-sanitize + HPP**: protección contra XSS, NoSQL injection, y HTTP Parameter Pollution.
- **Logging de auditoría**: cada acción sensible (login, logout, cambio de config, bloqueo) queda registrada con IP, userAgent y timestamp.
- **TTL automático**: logs de nivel info/warn se eliminan automáticamente a los 90 días.

---

## 🌐 Despliegue en producción

### Opción recomendada: Railway

```bash
# Backend: nuevo proyecto Railway + MongoDB plugin
# Variables de entorno: copiar desde .env
# Build command: npm install
# Start command: npm start

# Frontend: Vercel (desde la carpeta /frontend)
# Build command: npm run build
# Output dir: dist
# VITE_API_URL: https://tu-backend.railway.app/api
```

### Con Docker (alternativa)

```dockerfile
# Backend
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

---

## 🧪 Flujo de un usuario (primer uso)

1. Entra a `akiracloud.com` → ve la landing
2. Se registra con Google o email
3. Va a **Configuración** → carga su Groq API Key
4. Opcionalmente carga MP, Calendar, RIME
5. Va a **Dashboard** → hace clic en "Iniciar bot"
6. Escanea el QR con su WhatsApp
7. ¡Bot activo! Los clientes ya pueden escribirle

---

## 📡 API endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Registro con email |
| POST | `/api/auth/login` | Login con email |
| GET | `/api/auth/me` | Perfil actual |
| GET | `/api/auth/google` | OAuth Google |
| GET | `/api/config` | Config del usuario |
| PUT | `/api/config/negocio` | Guardar datos del negocio |
| PUT | `/api/config/keys` | Guardar API Key cifrada |
| POST | `/api/bot/start` | Iniciar bot |
| POST | `/api/bot/stop` | Detener bot |
| GET | `/api/bot/logs` | Logs del bot |
| GET | `/api/admin/dashboard` | Stats globales (admin) |
| GET | `/api/admin/users` | Listar usuarios (admin) |
| POST | `/api/admin/users/:id/block` | 🚨 Botón de pánico (admin) |
| POST | `/api/admin/users/:id/unblock` | Desbloquear usuario (admin) |

---

Desarrollado con ❤️ | Akira Cloud v1.0
