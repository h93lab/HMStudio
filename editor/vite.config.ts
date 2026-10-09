import {defineConfig} from 'vite';
import path from 'node:path';

// The editor reuses the real Remotion engine (../src) inside @remotion/player, so the preview is the render.
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  base: '/edit/',
  build: {outDir: path.resolve(import.meta.dirname, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 4000},
  resolve: {dedupe: ['react', 'react-dom', 'remotion']},
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  server: {proxy: {'/api': 'http://localhost:4777', '/jobs': 'http://localhost:4777', '/music': 'http://localhost:4777', '/sfx': 'http://localhost:4777', '/files': 'http://localhost:4777'}},
});
