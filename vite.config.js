import { defineConfig } from 'vite';

export function createViteConfig(mode) {
  return {
  build: {
    emptyOutDir: mode === 'background',
    rollupOptions: {
      input: mode === 'page-bridge'
        ? 'src/content/page-bridge.js'
        : mode === 'content' ? 'src/content/index.js' : 'src/background/index.js',
      output: {
        entryFileNames: mode === 'page-bridge' ? 'page-bridge.js' : mode === 'content' ? 'content.js' : 'background.js',
        format: mode === 'content' || mode === 'page-bridge' ? 'iife' : 'es'
      }
    }
  }
  };
}

export default defineConfig(({ mode }) => createViteConfig(mode));
