/**
 * Fährt die Messung (index.html) im Selbstlauf in genau der Hülle hoch, in der
 * Morphos steckt — Electron —, und schreibt den Bericht als JSON auf die
 * Standardausgabe. Für den Plattformboden auf einer fremden Maschine:
 *
 *   npx electron tools/audio-latency/measure.mjs > messung.json
 *
 * Der Selbstlauf erzeugt die Tastendrücke selbst. Das misst alles ab dem
 * JS-Ereignis richtig, lässt aber den Weg des Betriebssystems bis dorthin weg
 * (Abschnitt `input`) — wer den mitmessen will, öffnet index.html und drückt
 * von Hand. Gehört zur Karte c0081.
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hits = process.argv.find((a) => a.startsWith('--hits='))?.slice(7) ?? '15';

// Ohne Geste keine Wiedergabe: Im Selbstlauf gibt es keine Geste, also weg mit
// der Regel. Sie beeinflusst nur, OB gespielt wird, nicht wie schnell.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Der einzige Hebel, den die Hülle selbst hat: Chromiums Puffergröße in
// Bildern (`--audio-buffer-size=128`). Er gilt für den ganzen Prozess und
// übersteuert den latencyHint der Seite — darum nur auf Zuruf.
const bufferSize = process.argv.find((a) => a.startsWith('--audio-buffer-size='))?.split('=')[1];
if (bufferSize) app.commandLine.appendSwitch('audio-buffer-size', bufferSize);

// Jeder weitere Chromium-Schalter zum Ausprobieren, mehrfach erlaubt:
// `--switch=enable-exclusive-audio`, `--switch=enable-features=AllowIAudioClient3`.
// Damit lassen sich die Windows-Wege (WASAPI exclusive, IAudioClient3) messen,
// ohne dieses Werkzeug für jeden Versuch anzufassen (c0085).
for (const arg of process.argv.filter((a) => a.startsWith('--switch='))) {
  const [name, ...rest] = arg.slice('--switch='.length).split('=');
  if (name) app.commandLine.appendSwitch(name, rest.length ? rest.join('=') : undefined);
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 980,
    height: 800,
    show: !process.argv.includes('--hidden'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  win.webContents.on('console-message', (_event, _level, message) => {
    if (!message.startsWith('MORPHOS_LATENCY_JSON ')) return;
    process.stdout.write(message.slice('MORPHOS_LATENCY_JSON '.length) + '\n');
    app.exit(0);
  });

  void win.loadFile(path.join(here, 'index.html'), { search: `?auto=1&hits=${hits}` });

  // Sicherheitsnetz: Wenn die Messung hängt, soll der Lauf trotzdem enden.
  setTimeout(() => {
    process.stderr.write('Zeitüberschreitung: kein Bericht innerhalb von 120 s.\n');
    app.exit(1);
  }, 120_000);
});
