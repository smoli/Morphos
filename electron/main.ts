import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPrompt, SYSTEM_PROMPT } from '../src/core/prompt';
import { extractHtml } from '../src/core/html';
import type { GenerateResult, PersistedState, SaveResult } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Von vite-plugin-electron gesetzt: URL des Dev-Servers bzw. Ausgabeverzeichnisse.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(__dirname, '../dist');

function stateFile(): string {
  return path.join(app.getPath('userData'), 'morphos-state.json');
}

/**
 * Ruft die Claude CLI im Print-Modus auf und liefert das erzeugte HTML zurück.
 * Der zusammengesetzte Prompt (Core: buildPrompt) geht über stdin, das Ergebnis
 * wird über extractHtml (Core) bereinigt.
 */
function runClaude(userRequest: string, currentHtml: string): Promise<GenerateResult> {
  return new Promise((resolve) => {
    const prompt = buildPrompt(userRequest, currentHtml);
    const args = ['-p', '--output-format', 'json', '--append-system-prompt', SYSTEM_PROMPT];

    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.on('error', (err: NodeJS.ErrnoException) => {
      const hint =
        err.code === 'ENOENT'
          ? 'Der Befehl "claude" wurde nicht gefunden. Ist die Claude CLI installiert und im PATH?'
          : err.message;
      resolve({ ok: false, error: hint });
    });

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code !== 0 && !stdout) {
        resolve({ ok: false, error: stderr.trim() || `Claude CLI endete mit Code ${code}.` });
        return;
      }

      let resultText = '';
      try {
        const parsed = JSON.parse(stdout) as { subtype?: string; result?: string };
        if (parsed.subtype && parsed.subtype !== 'success') {
          resolve({ ok: false, error: parsed.result || `Claude-Ergebnis: ${parsed.subtype}` });
          return;
        }
        resultText = parsed.result ?? '';
      } catch {
        resultText = stdout;
      }

      const html = extractHtml(resultText);
      if (!html) {
        resolve({ ok: false, error: 'Es wurde kein HTML-Dokument erzeugt. Bitte den Wunsch anders formulieren.' });
        return;
      }
      resolve({ ok: true, html });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0f1115',
    title: 'Morphos',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// ---- IPC ----

ipcMain.handle('morphos:generate', async (_e, payload: { prompt: string; currentHtml: string }): Promise<GenerateResult> => {
  if (!payload?.prompt?.trim()) return { ok: false, error: 'Bitte gib einen Wunsch ein.' };
  return runClaude(payload.prompt, payload.currentHtml ?? '');
});

ipcMain.handle('morphos:loadState', async (): Promise<PersistedState> => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as PersistedState;
  } catch {
    return { history: [], activeId: null };
  }
});

ipcMain.handle('morphos:saveState', async (_e, state: PersistedState): Promise<SaveResult> => {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Externe Links im Systembrowser öffnen.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
});

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
