import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Solo la web (no el programa de Windows): la tipografía deja de ser una hoja de estilos que bloquea la pantalla y se suma el
// aviso de "no pudo abrir" (public/boot-check.js, que además carga la tipografía sin bloquear). Ver ese archivo.
function arranqueWeb() {
  return {
    name: 'arranque-web',
    transformIndexHtml(html) {
      if (process.env.VITE_DESKTOP) return html;
      return html
        .replace(/<link\s+href="https:\/\/fonts\.googleapis\.com\/css2[\s\S]*?\/>/, '')
        .replace('<head>', '<head>\n  <script src="/boot-check.js"></script>');
    },
  };
}

export default defineConfig({
  plugins: [react(), arranqueWeb()],

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
