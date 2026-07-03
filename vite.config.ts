import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import { fileURLToPath } from 'node:url';

// Baut Renderer (Vue) + Electron-Haupt- und Preload-Prozess.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    vue(),
    electron({
      main: { entry: 'electron/main.ts' },
      preload: {
        input: 'electron/preload.ts',
        // Als echtes ESM bauen: Die Datei heißt .mjs (package.json: type=module),
        // also muss ihr Inhalt ESM sein — sonst schlägt `require` im Preload fehl
        // und window.morphos wird nie bereitgestellt.
        vite: {
          build: {
            rollupOptions: {
              output: { format: 'es' },
            },
          },
        },
      },
    }),
    renderer(),
  ],
});
