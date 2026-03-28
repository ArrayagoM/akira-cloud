// ecosystem.config.js — Configuración de PM2 para producción
//
// Uso:
//   pm2 start ecosystem.config.js          → arrancar
//   pm2 reload ecosystem.config.js         → reload sin downtime
//   pm2 stop akira-backend                 → detener
//   pm2 logs akira-backend                 → ver logs en vivo
//   pm2 monit                              → monitor interactivo
//   pm2 save && pm2 startup                → auto-inicio al reiniciar el servidor

module.exports = {
  apps: [
    {
      name: 'akira-backend',
      script: 'server.js',
      args: '--no-deprecation',

      // ── Modo ──────────────────────────────────────────────
      // 'fork' = 1 proceso (necesario porque usamos global.io y Map en memoria)
      // NO usar 'cluster' — los bots viven en memoria y no se pueden compartir
      instances: 1,
      exec_mode: 'fork',

      // ── Auto-restart en crash ─────────────────────────────
      autorestart: true,
      max_restarts: 10,        // máximo 10 reinicios antes de parar
      min_uptime: '10s',       // si muere antes de 10s, no cuenta como "arranque exitoso"
      restart_delay: 3000,     // esperar 3s antes de reiniciar

      // ── Límite de memoria ─────────────────────────────────
      // Si supera 1.4GB, PM2 reinicia el proceso antes de que el SO lo mate
      max_memory_restart: '1400M',

      // ── Entorno ───────────────────────────────────────────
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },

      // ── Logs ─────────────────────────────────────────────
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // ── Watch (desactivado en producción) ─────────────────
      watch: false,
      ignore_watch: ['node_modules', 'sessions', 'logs', '*.log'],

      // ── Variables de señal ────────────────────────────────
      kill_timeout: 10000,     // PM2 espera 10s el graceful shutdown antes de SIGKILL
      listen_timeout: 10000,   // tiempo máximo para que el proceso quede "online"
    },
  ],
};
