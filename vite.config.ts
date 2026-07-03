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
        // Als CommonJS (.cjs) bauen: Der Renderer läuft mit sandbox:true, und
        // sandboxte Preloads unterstützen kein ESM. Die Endung .cjs stellt klar,
        // dass die Datei trotz package.json type=module CommonJS ist.
        vite: {
          build: {
            rollupOptions: {
              output: { format: 'cjs', entryFileNames: '[name].cjs' },
            },
          },
        },
      },
    }),
    renderer(),
  ],
});
