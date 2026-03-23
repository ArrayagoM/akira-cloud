#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Akira Cloud — Setup automático
#  Instala dependencias, configura el .env y arranca el proyecto
# ─────────────────────────────────────────────────────────────

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🤖 Akira Cloud — Instalación automática${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Verificar Node.js ─────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js no encontrado. Instalalo desde https://nodejs.org${NC}"
  exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}❌ Se requiere Node.js v18 o superior. Versión actual: $(node -v)${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v) detectado${NC}"

# ── Verificar MongoDB ─────────────────────────────────────────
if ! command -v mongod &> /dev/null && ! command -v mongosh &> /dev/null; then
  echo -e "${YELLOW}⚠️  MongoDB no detectado. Asegurate de tenerlo corriendo en localhost:27017${NC}"
  echo -e "   Descargalo en: https://www.mongodb.com/try/download/community"
else
  echo -e "${GREEN}✅ MongoDB detectado${NC}"
fi

# ── Configurar .env del backend ───────────────────────────────
if [ ! -f "backend/.env" ]; then
  echo ""
  echo -e "${CYAN}📝 Configurando variables de entorno del backend...${NC}"
  cp backend/.env.example backend/.env

  # Generar JWT_SECRET aleatorio
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  # Generar ENCRYPTION_KEY de exactamente 32 chars
  ENC_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

  # Reemplazar valores en el .env
  sed -i.bak "s/cambia_esto_por_una_cadena_secreta_muy_larga_y_random_de_64_chars/${JWT_SECRET}/" backend/.env
  sed -i.bak "s/cambia_esto_32_chars_exactamente!!/${ENC_KEY}/" backend/.env
  rm -f backend/.env.bak

  echo -e "${GREEN}✅ backend/.env creado con claves generadas automáticamente${NC}"
  echo ""
  echo -e "${YELLOW}⚠️  IMPORTANTE: Abrí backend/.env y completá:${NC}"
  echo -e "   - GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (si querés OAuth de Google)"
  echo -e "   - FACEBOOK_APP_ID y FACEBOOK_APP_SECRET (si querés OAuth de Facebook)"
  echo -e "   - ADMIN_EMAIL y ADMIN_PASSWORD (tu usuario administrador)"
  echo ""
else
  echo -e "${GREEN}✅ backend/.env ya existe${NC}"
fi

# ── Instalar dependencias del backend ─────────────────────────
echo ""
echo -e "${CYAN}📦 Instalando dependencias del backend...${NC}"
cd backend
npm install
echo -e "${GREEN}✅ Backend listo${NC}"

# ── Crear admin inicial ───────────────────────────────────────
echo ""
echo -e "${CYAN}👤 Creando usuario administrador...${NC}"
npm run seed:admin || echo -e "${YELLOW}⚠️  No se pudo crear el admin (¿MongoDB corriendo?)${NC}"
cd ..

# ── Instalar dependencias del frontend ────────────────────────
echo ""
echo -e "${CYAN}📦 Instalando dependencias del frontend...${NC}"
cd frontend
npm install
echo -e "${GREEN}✅ Frontend listo${NC}"
cd ..

# ── Resumen final ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ ¡Instalación completada!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Para arrancar el proyecto, abrí ${YELLOW}dos terminales${NC}:"
echo ""
echo -e "  ${CYAN}Terminal 1 (Backend):${NC}"
echo -e "  cd backend && npm run dev"
echo ""
echo -e "  ${CYAN}Terminal 2 (Frontend):${NC}"
echo -e "  cd frontend && npm run dev"
echo ""
echo -e "Luego abrí ${GREEN}http://localhost:3000${NC} en tu navegador."
echo ""
echo -e "Admin: usa las credenciales de ${YELLOW}backend/.env${NC} (ADMIN_EMAIL / ADMIN_PASSWORD)"
echo ""
