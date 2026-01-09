import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy para backend local (evita CORS en desarrollo)
      "/generar-horario-general": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
