import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // ── Build optimizado para producción ─────────────────────
  build: {
    target: 'es2020',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Code splitting por rutas — lazy loading automático
        manualChunks: {
          vendor:  ['react', 'react-dom', 'react-router-dom'],
          icons:   ['lucide-react'],
          socket:  ['socket.io-client'],
          ui:      ['react-hot-toast', 'qrcode.react'],
        },
      },
    },
    // Comprimir assets
    chunkSizeWarningLimit: 600,
  },

  // ── Dev server con proxy ──────────────────────────────────
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },

  // ── Optimizaciones de dependencias ───────────────────────
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios'],
  },
});
