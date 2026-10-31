FROM node:20-alpine

RUN apk add --no-cache ca-certificates python3 make g++

# PM2 global para correr backend + worker juntos
RUN npm install -g pm2

WORKDIR /app

# ── Instalar dependencias del backend ─────────────────────────
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev || npm install --omit=dev

# ── Instalar dependencias del worker ─────────────────────────
COPY worker/package*.json ./worker/
RUN cd worker && npm ci --omit=dev || npm install --omit=dev

# ── Copiar todo el código ─────────────────────────────────────
COPY backend/ ./backend/
COPY worker/  ./worker/
COPY ecosystem.config.js ./

# ── Crear carpetas necesarias ─────────────────────────────────
RUN mkdir -p logs sessions

# Puerto del backend
EXPOSE 5000

# pm2-runtime: corre PM2 en foreground (necesario en Docker)
CMD ["pm2-runtime", "ecosystem.config.js"]
