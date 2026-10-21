import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// base relativa: funciona en https://usuario.github.io/<cualquier-repo>/ sin configurar nada.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        verify: resolve(import.meta.dirname, 'verify/index.html'),
      },
    },
  },
});
