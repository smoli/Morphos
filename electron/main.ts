import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPrompt, SYSTEM_PROMPT } from '../src/core/prompt';
import { extractHtml } from '../src/core/html';
import { runFs } from '../src/core/fsaccess';
import type {
  AppData,
  AppSummary,
  FolderResult,
  FsRequest,
  FsResponse,
  GenerateResult,
  SaveResult,
  Settings,
} from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Von vite-plugin-electron gesetzt: URL des Dev-Servers bzw. Ausgabeverzeichnisse.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(__dirname, '../dist');

let mainWindow: BrowserWindow | null = null;

// ---- Persistenz: Einstellungen (userData) + Apps (frei gewähltes Verzeichnis) ----

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'morphos-settings.json');
}

/** Stellt sicher, dass eine App-Id keinen Pfadwechsel erlaubt (Traversal-Schutz). */
function safeId(id: string): string {
  const base = path.basename(id);
  if (!base || base === '.' || base === '..' || !/^[A-Za-z0-9._-]+$/.test(base)) {
    throw new Error(`Ungültige App-Id: ${id}`);
  }
  return base;
}

function appDir(folder: string, id: string): string {
  return path.join(folder, safeId(id));
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

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
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

ipcMain.handle('morphos:chooseFolder', async (): Promise<FolderResult> => {
  const opts: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, opts)
    : await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return { ok: false };
  return { ok: true, path: result.filePaths[0] };
});

ipcMain.handle('morphos:loadSettings', async (): Promise<Settings> => {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as Partial<Settings>;
    const recent = Array.isArray(parsed.recentFolders) ? parsed.recentFolders.filter((f) => typeof f === 'string') : [];
    const accessRoots = parsed.accessRoots && typeof parsed.accessRoots === 'object' ? parsed.accessRoots : {};
    const permissions = parsed.permissions && typeof parsed.permissions === 'object' ? parsed.permissions : {};
    return { recentFolders: recent, accessRoots, permissions };
  } catch {
    return { recentFolders: [], accessRoots: {}, permissions: {} };
  }
});

ipcMain.handle('morphos:saveSettings', async (_e, settings: Settings): Promise<SaveResult> => {
  try {
    const clean: Settings = {
      recentFolders: (settings?.recentFolders ?? []).slice(0, 12),
      accessRoots: settings?.accessRoots ?? {},
      permissions: settings?.permissions ?? {},
    };
    fs.writeFileSync(settingsFile(), JSON.stringify(clean, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Dateisystem-Zugriff der erzeugten Apps — strikt auf den freigegebenen
// Zugriffsordner (root) eingegrenzt (siehe core/fsaccess: confineWithin).
ipcMain.handle('morphos:fs', async (_e, root: string, req: FsRequest): Promise<FsResponse> => {
  if (!root || typeof root !== 'string') return { ok: false, error: 'Kein Datenordner festgelegt.' };
  return runFs(root, req);
});

ipcMain.handle('morphos:listApps', async (_e, folder: string): Promise<AppSummary[]> => {
  const summaries: AppSummary[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = fs.readFileSync(path.join(folder, entry.name, 'app.json'), 'utf8');
      const data = JSON.parse(raw) as AppData;
      summaries.push({
        id: data.id ?? entry.name,
        name: data.name ?? entry.name,
        icon: data.icon ?? '🧩',
        createdAt: data.createdAt ?? 0,
        updatedAt: data.updatedAt ?? 0,
        versions: Array.isArray(data.history) ? data.history.length : 0,
      });
    } catch {
      /* Ordner ohne gültige app.json überspringen */
    }
  }
  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return summaries;
});

ipcMain.handle('morphos:loadApp', async (_e, folder: string, id: string): Promise<AppData | null> => {
  try {
    const raw = fs.readFileSync(path.join(appDir(folder, id), 'app.json'), 'utf8');
    return JSON.parse(raw) as AppData;
  } catch {
    return null;
  }
});

ipcMain.handle('morphos:saveApp', async (_e, folder: string, appData: AppData): Promise<SaveResult> => {
  try {
    const dir = appDir(folder, appData.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(appData, null, 2), 'utf8');
    // Aktive Version zusätzlich als index.html spiegeln — so ist jede App ein
    // eigenständiges Artefakt, das sich auch außerhalb von Morphos öffnen lässt.
    const active = appData.history.find((h) => h.id === appData.activeId) ?? appData.history[appData.history.length - 1];
    if (active) fs.writeFileSync(path.join(dir, 'index.html'), active.html, 'utf8');
    return { ok: true };
  } catch (err) {
    console.error('[morphos] saveApp fehlgeschlagen:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('morphos:deleteApp', async (_e, folder: string, id: string): Promise<SaveResult> => {
  try {
    fs.rmSync(appDir(folder, id), { recursive: true, force: true });
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
