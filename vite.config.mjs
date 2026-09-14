import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) })],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT || 3000}` }
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    sourcemap: false
  }
});
