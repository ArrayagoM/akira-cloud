// ecosystem.config.js — PM2 config para Akira Cloud
// Corre backend + worker juntos en el mismo servidor (Railway o PC local)
//
// Uso local:     pm2 start ecosystem.config.js --only worker
// Uso Railway:   CMD en Dockerfile → pm2-runtime ecosystem.config.js

module.exports = {
  apps: [
    // ── Backend (API + Socket.io) ──────────────────────────────
    // NOTA: en producción local el backend corre en Render (cloud).
    // Solo incluir esta app si corrés el backend localmente también.
    {
      name: 'backend',
      cwd: './backend',
      script: 'server.js',
      node_args: '--no-deprecation',

      autorestart: true,
      max_restarts: 20,
      min_uptime: '15s',
      restart_delay: 3000,
      kill_timeout: 5000,        // esperar 5s al apagado graceful
      max_memory_restart: '512M',

      error_file: '../logs/backend-error.log',
      out_file:   '../logs/backend-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      watch: false,
      env: { NODE_ENV: 'production' },
    },

    // ── Worker (bots WhatsApp) ─────────────────────────────────
    {
      name: 'worker',
      cwd: './worker',
      script: 'worker.js',
      node_args: '--no-deprecation',

      autorestart: true,
      max_restarts: 50,          // más intentos — queremos 24/7
      min_uptime: '10s',
      restart_delay: 5000,       // esperar 5s entre reinicios
      kill_timeout: 8000,        // dar tiempo al graceful shutdown (detiene bots WA)
      max_memory_restart: '600M',
      // Reinicio limpio a las 4am para limpiar posibles memory leaks de Baileys.
      // kill_timeout evita el solapamiento de dos procesos activos simultáneamente.
      cron_restart: '0 4 * * *',

      error_file: '../logs/worker-error.log',
      out_file:   '../logs/worker-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      watch: false,
      env: { NODE_ENV: 'production' },
    },
  ],
};
