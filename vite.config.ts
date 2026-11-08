import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages project-site path: /Another-world/
  // Keep the existing static Pages deployment unchanged until migration is complete.
  base: '/Another-world/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  },
  server: {
    host: true
  }
});
