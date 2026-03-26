FROM node:20-alpine

# Baileys usa WebSocket puro — no necesita Chromium ni Puppeteer
RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

COPY . .

RUN mkdir -p logs sessions

EXPOSE 5000

CMD ["node", "--no-deprecation", "server.js"]
