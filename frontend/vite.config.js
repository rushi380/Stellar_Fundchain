import { defineConfig } from 'vite';

export default defineConfig({
  root:      '.',
  publicDir: 'public',

  build: {
    outDir:    'dist',
    sourcemap: true,
  },

  server: {
    port: 3000,
    open: true,
    host: true,
  },

  // Some Stellar SDK internals reference Node globals
  define: {
    global: 'globalThis',
  },

  resolve: {
    alias: { '@': '/src' },
  },
});