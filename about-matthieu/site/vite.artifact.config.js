import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// one JS + one CSS file, for publishing the game alone (see src/artifact.jsx)
export default defineConfig({
    plugins: [react()], base: './', publicDir: false,
    build: { outDir: 'dist-artifact', chunkSizeWarningLimit: 3000, rollupOptions: { input: 'artifact.html', output: { inlineDynamicImports: true, entryFileNames: 'game.js', assetFileNames: 'game.[ext]' } } },
});
