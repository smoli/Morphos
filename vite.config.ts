import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Der Commit, aus dem gebaut wurde. Er steht später im Readme einer App
 * (c0077): Wer sie aus einem Repository holt, soll wissen, welcher
 * Morphos-Stand sie geschrieben hat. Ohne Git (Quellabzug ohne .git) bleibt er
 * leer — dann nennt das Readme nur die Fassung.
 */
function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const buildDefines = { __MORPHOS_COMMIT__: JSON.stringify(gitCommit()) };

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
      // Der Hauptprozess wird eigenständig gebaut — die Build-Konstanten muss
      // er darum ausdrücklich mitbekommen.
      main: { entry: 'electron/main.ts', vite: { define: buildDefines } },
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
