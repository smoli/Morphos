import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPrompt, SYSTEM_PROMPT } from '../src/core/prompt';
import { extractHtml } from '../src/core/html';
import { applyChanges, isValidSourcePath, parseLLMOutput } from '../src/core/files';
import { bundle, ENTRY_FILE } from '../src/core/bundle';
import { extractLibs } from '../src/core/libs';
import { commitAll, countVersions, ensureRepo, listVersions, restoreTree } from '../src/core/gitstore';
import { loadAppFromDisk, readManifest, touchManifest, writeAppState } from '../src/core/appstore';
import { runFs } from '../src/core/fsaccess';
import { resolveLibs } from './libcache';
import type {
  AppData,
  AppSummary,
  FolderResult,
  FsRequest,
  FsResponse,
  GenerateResult,
  SaveResult,
  Settings,
  SourceFile,
  VersionInfo,
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

function libCacheDir(): string {
  return path.join(app.getPath('userData'), 'lib-cache');
}

/** Liest die gespeicherten Einstellungen; bei Fehlern die leere Vorgabe. */
function readSettings(): Settings {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as Partial<Settings>;
    const recent = Array.isArray(parsed.recentFolders) ? parsed.recentFolders.filter((f) => typeof f === 'string') : [];
    const accessRoots = parsed.accessRoots && typeof parsed.accessRoots === 'object' ? parsed.accessRoots : {};
    const permissions = parsed.permissions && typeof parsed.permissions === 'object' ? parsed.permissions : {};
    const libWhitelist = Array.isArray(parsed.libWhitelist)
      ? parsed.libWhitelist.filter((p) => typeof p === 'string')
      : [];
    return { recentFolders: recent, accessRoots, permissions, libWhitelist };
  } catch {
    return { recentFolders: [], accessRoots: {}, permissions: {}, libWhitelist: [] };
  }
}

/**
 * Nur vom Anwender freigegebene Datenordner (accessRoots in den gespeicherten
 * Einstellungen) sind als fs-Wurzel zulässig — der Hauptprozess vertraut nicht
 * dem vom Renderer mitgeschickten Pfad allein (Defense in depth).
 */
function isApprovedRoot(root: string): boolean {
  return Object.values(readSettings().accessRoots).includes(root);
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

// ---- Claude CLI ----

const CLAUDE_TIMEOUT_MS = 5 * 60 * 1000;

/** Ruft die Claude CLI im Print-Modus auf und liefert deren Roh-Ausgabe zurück. */
function runClaude(prompt: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const args = ['-p', '--output-format', 'json', '--append-system-prompt', SYSTEM_PROMPT];

    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    // Genau einmal auflösen — 'error' und 'close' können beide feuern,
    // und der Timeout darf ein bereits geliefertes Ergebnis nicht überschreiben.
    let settled = false;
    const finish = (result: { ok: true; text: string } | { ok: false; error: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: 'Zeitüberschreitung: Die Claude CLI hat nicht innerhalb von 5 Minuten geantwortet.' });
    }, CLAUDE_TIMEOUT_MS);

    child.on('error', (err: NodeJS.ErrnoException) => {
      const hint =
        err.code === 'ENOENT'
          ? 'Der Befehl "claude" wurde nicht gefunden. Ist die Claude CLI installiert und im PATH?'
          : err.message;
      finish({ ok: false, error: hint });
    });

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code !== 0 && !stdout) {
        finish({ ok: false, error: stderr.trim() || `Claude CLI endete mit Code ${code}.` });
        return;
      }
      let text = '';
      try {
        const parsed = JSON.parse(stdout) as { subtype?: string; result?: string };
        if (parsed.subtype && parsed.subtype !== 'success') {
          finish({ ok: false, error: parsed.result || `Claude-Ergebnis: ${parsed.subtype}` });
          return;
        }
        text = parsed.result ?? '';
      } catch {
        text = stdout;
      }
      finish({ ok: true, text });
    });

    // Schlägt der Spawn fehl (z. B. ENOENT), löst das Schreiben auf stdin einen
    // Stream-Fehler aus — ohne Listener würde er den Prozess crashen.
    child.stdin.on('error', () => { /* wird über das 'error'-Event des Kindprozesses gemeldet */ });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Eine Generierung: Prompt bauen, Claude CLI aufrufen, Datei-Blöcke lesen,
 * auf den Dateisatz anwenden, Bibliotheken auflösen (Whitelist + Cache) und
 * zum Artefakt bündeln.
 */
async function generate(userRequest: string, current: SourceFile[]): Promise<GenerateResult> {
  const whitelist = readSettings().libWhitelist ?? [];
  const res = await runClaude(buildPrompt(userRequest, current, whitelist));
  if (!res.ok) return res;

  const changes = parseLLMOutput(res.text);
  if (changes.files.length === 0 && changes.deletions.length === 0) {
    return { ok: false, error: 'Es wurden keine verwertbaren Dateien erzeugt. Bitte den Wunsch anders formulieren.' };
  }

  const files = applyChanges(current, changes);
  const entry = files.find((f) => f.path === ENTRY_FILE);
  if (!entry || !extractHtml(entry.content)) {
    return { ok: false, error: 'Die App hat kein gültiges src/index.html. Bitte den Wunsch anders formulieren.' };
  }

  const libRes = await resolveLibs(extractLibs(entry.content), whitelist, libCacheDir());
  if (!libRes.ok) return libRes;

  const html = bundle(files, libRes.libs);
  if (!html) return { ok: false, error: 'Das Bündeln der App ist fehlgeschlagen.' };
  return { ok: true, files, html };
}

// ---- Fenster ----

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0f1115',
    title: 'Morphos',
    webPreferences: {
      // Das Preload wird als CommonJS (.cjs) gebaut — nur so kann der Renderer
      // im Chromium-Sandbox-Modus laufen (sandboxte Preloads können kein ESM).
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

ipcMain.handle('morphos:generate', async (_e, payload: { prompt: string; files: SourceFile[] }): Promise<GenerateResult> => {
  if (!payload?.prompt?.trim()) return { ok: false, error: 'Bitte gib einen Wunsch ein.' };
  const current = Array.isArray(payload.files)
    ? payload.files.filter((f) => f && isValidSourcePath(f.path) && typeof f.content === 'string')
    : [];
  return generate(payload.prompt, current);
});

ipcMain.handle('morphos:chooseFolder', async (): Promise<FolderResult> => {
  const opts: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, opts)
    : await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return { ok: false };
  return { ok: true, path: result.filePaths[0] };
});

ipcMain.handle('morphos:loadSettings', async (): Promise<Settings> => readSettings());

ipcMain.handle('morphos:saveSettings', async (_e, settings: Settings): Promise<SaveResult> => {
  try {
    const clean: Settings = {
      recentFolders: (settings?.recentFolders ?? []).slice(0, 12),
      accessRoots: settings?.accessRoots ?? {},
      permissions: settings?.permissions ?? {},
      libWhitelist: (settings?.libWhitelist ?? []).filter((p) => typeof p === 'string' && p.trim()).slice(0, 100),
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
  if (!isApprovedRoot(root)) return { ok: false, error: 'Dieser Datenordner ist nicht freigegeben.' };
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
    const dir = path.join(folder, entry.name);
    const meta = readManifest(dir);
    if (!meta) continue;
    const versions = Array.isArray(meta.history) ? meta.history.length : await countVersions(dir);
    summaries.push({
      id: meta.id ?? entry.name,
      name: meta.name ?? entry.name,
      icon: meta.icon ?? '🧩',
      createdAt: meta.createdAt ?? 0,
      updatedAt: meta.updatedAt ?? 0,
      versions,
    });
  }
  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return summaries;
});

ipcMain.handle('morphos:loadApp', async (_e, folder: string, id: string): Promise<AppData | null> => {
  try {
    return await loadAppFromDisk(appDir(folder, id));
  } catch (err) {
    console.error('[morphos] loadApp fehlgeschlagen:', err);
    return null;
  }
});

ipcMain.handle('morphos:saveApp', async (_e, folder: string, appData: AppData, message: string): Promise<SaveResult> => {
  try {
    const dir = appDir(folder, appData.id);
    writeAppState(
      dir,
      {
        id: appData.id,
        name: appData.name,
        icon: appData.icon,
        createdAt: appData.createdAt,
        updatedAt: Date.now(),
      },
      appData.files,
      appData.html,
    );
    await ensureRepo(dir);
    await commitAll(dir, message || appData.name);
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

ipcMain.handle('morphos:listVersions', async (_e, folder: string, id: string): Promise<VersionInfo[]> => {
  try {
    return await listVersions(appDir(folder, id));
  } catch {
    return [];
  }
});

ipcMain.handle('morphos:revertApp', async (_e, folder: string, id: string, sha: string): Promise<SaveResult> => {
  try {
    const dir = appDir(folder, id);
    const versions = await listVersions(dir);
    const target = versions.find((v) => v.sha === sha);
    if (!target) return { ok: false, error: 'Diese Version existiert nicht.' };
    await restoreTree(dir, sha);
    // Manifest-Zeitstempel aktualisieren (Desktop-Sortierung), dann EIN Commit.
    touchManifest(dir, Date.now());
    await commitAll(dir, `Zurück zu: ${target.prompt}`);
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
