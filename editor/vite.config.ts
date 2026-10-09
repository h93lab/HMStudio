import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// One SPA for the whole studio (projects, editor, clients, review…). The editor reuses the real Remotion
// engine (../src) inside @remotion/player, so the preview is the render.
const api = 'http://localhost:4777';
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  base: '/',
  plugins: [tailwindcss()],
  build: {outDir: path.resolve(import.meta.dirname, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 4000},
  resolve: {dedupe: ['react', 'react-dom', 'remotion'], alias: {'@': path.resolve(import.meta.dirname, 'src')}},
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  server: {proxy: Object.fromEntries(['/api', '/jobs/', '/music/', '/sfx/', '/clients/', '/files/'].map((p) => [p, {target: api, changeOrigin: true, headers: {origin: api}}]))},
});
