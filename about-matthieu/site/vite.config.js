import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' so the build works from any sub-path (GitHub Pages, or embedded as an "about" page in an app)
export default defineConfig({ plugins: [react()], base: './', build: { chunkSizeWarningLimit: 1500 } });
