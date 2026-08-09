import { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AGENT_IDLE_TIMEOUT_MS, agentIdleTimeoutMessage, createAgentStream } from '../src/core/agent';
import { clampMaxAgents, DEFAULT_MAX_AGENTS } from '../src/core/queue';
import { buildPrompt, SYSTEM_PROMPT } from '../src/core/prompt';
import { extractHtml } from '../src/core/html';
import { applyChanges, isValidSourcePath, parseLLMOutput } from '../src/core/files';
import { applyDocs, hasDocChanges, splitDocs, toDocs } from '../src/core/docs';
import { bundle, ENTRY_FILE } from '../src/core/bundle';
import { extractLibs } from '../src/core/libs';
import { commitAll, countVersions, ensureRepo, listVersions, restoreTree } from '../src/core/gitstore';
import { loadAppFromDisk, readManifest, setManifestIcon, touchManifest, writeAppState, writeChat } from '../src/core/appstore';
import { validateIcon } from '../src/core/icon';
import { resolveWithin, runFs, runShellFs } from '../src/core/fsaccess';
import { FILE_SCHEME, parseRange, resolveFileRequest } from '../src/core/filelink';
import { streamMimeType } from '../src/core/preview';
import { FolderWatchers } from '../src/core/watch';
import { collectDiskUsage } from '../src/core/diskusage';
import { cleanSessions } from '../src/core/session';
import { cleanWallpapers } from '../src/core/wallpaper';
import { resolveLibs } from './libcache';
import type { PromptAttachment, PromptContext } from '../src/core/prompt';
import type {
  AgentEvent,
  AgentResult,
  AppData,
  AppDocs,
  AppSummary,
  Attachment,
  ChatMessage,
  DiskUsageResult,
  FolderResult,
  FsRequest,
  FsResponse,
  GenerateResult,
  IconPos,
  IconResult,
  SaveResult,
  Settings,
  ShellFsRequest,
  ShellFsResponse,
  SourceFile,
  VersionInfo,
  WatchResult,
} from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Die laufenden Ordner-Beobachtungen des Datei-Explorers (siehe core/watch). */
const folderWatchers = new FolderWatchers();
/** webContents, für die schon aufgeräumt wird, wenn sie verschwinden. */
const watchedSenders = new Set<number>();

// Von vite-plugin-electron gesetzt: URL des Dev-Servers bzw. Ausgabeverzeichnisse.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(__dirname, '../dist');

let mainWindow: BrowserWindow | null = null;

/**
 * Das eigene Schema für den Dateistrom der Vorschau (siehe core/filelink) — es
 * MUSS angemeldet sein, bevor Electron bereit ist, daher hier beim Laden.
 * `stream` erlaubt Teilanfragen: Video und Ton lassen sich spulen, ohne dass
 * die Datei je vollständig durch den Speicher wandert.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: FILE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

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
    const uiMode = parsed.uiMode === 'single' ? 'single' : 'windows';
    const maxAgents = clampMaxAgents(parsed.maxAgents);
    const iconPositions = cleanIconPositions(parsed.iconPositions);
    const sessions = cleanSessions(parsed.sessions);
    const wallpapers = cleanWallpapers(parsed.wallpapers);
    return { recentFolders: recent, accessRoots, permissions, libWhitelist, uiMode, maxAgents, iconPositions, sessions, wallpapers };
  } catch {
    return {
      recentFolders: [],
      accessRoots: {},
      permissions: {},
      libWhitelist: [],
      uiMode: 'windows',
      maxAgents: DEFAULT_MAX_AGENTS,
      iconPositions: {},
      sessions: {},
      wallpapers: {},
    };
  }
}

/**
 * Kachel-Positionen des Desktops auf reine Zahlenpaare eintüten — fremde oder
 * beschädigte Einträge fallen weg (dann ordnet das Raster diese Kachel an).
 */
function cleanIconPositions(raw: Settings['iconPositions']): Record<string, Record<string, IconPos>> {
  const out: Record<string, Record<string, IconPos>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, positions] of Object.entries(raw)) {
    if (!positions || typeof positions !== 'object') continue;
    const clean: Record<string, IconPos> = {};
    for (const [appId, pos] of Object.entries(positions)) {
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
      clean[appId] = { x: Math.round(pos.x), y: Math.round(pos.y) };
    }
    if (Object.keys(clean).length) out[folder] = clean;
  }
  return out;
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

// ---- Referenzdateien (Anhänge) ----

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const TEXT_EXTENSIONS = ['txt', 'md', 'json', 'csv', 'js', 'ts', 'html', 'css', 'xml', 'svg'];
const MAX_TEXT_ATTACHMENT_BYTES = 100_000;

// Nur Pfade, die der Anwender selbst im nativen Dialog gewählt hat, dürfen als
// Referenz gelesen werden — der Hauptprozess vertraut nicht dem Renderer allein.
const approvedAttachments = new Set<string>();

function attachmentKind(filePath: string): 'image' | 'text' | null {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (TEXT_EXTENSIONS.includes(ext)) return 'text';
  return null;
}

/** Bereitet die Anhänge für den Prompt vor: Text inline (mit Größendeckel), Bild als Pfad. */
function preparePromptAttachments(attachments: Attachment[]): { atts: PromptAttachment[]; error?: string } {
  const atts: PromptAttachment[] = [];
  for (const a of attachments) {
    if (!approvedAttachments.has(a.path)) {
      return { atts: [], error: `Diese Referenzdatei wurde nicht über den Dateidialog gewählt: ${a.name}` };
    }
    const kind = attachmentKind(a.path);
    if (!kind) return { atts: [], error: `Nicht unterstützter Dateityp: ${a.name}` };
    if (kind === 'text') {
      try {
        const stat = fs.statSync(a.path);
        if (stat.size > MAX_TEXT_ATTACHMENT_BYTES) {
          return { atts: [], error: `Die Referenzdatei ist zu groß (max. 100 KB Text): ${a.name}` };
        }
        atts.push({ name: a.name, kind, content: fs.readFileSync(a.path, 'utf8') });
      } catch (err) {
        return { atts: [], error: `Die Referenzdatei konnte nicht gelesen werden (${a.name}): ${err instanceof Error ? err.message : String(err)}` };
      }
    } else {
      atts.push({ name: a.name, kind, path: a.path });
    }
  }
  return { atts };
}

// ---- Claude CLI ----

/**
 * Die laufenden `claude`-Kindprozesse, nach Lauf-Id. Nur darüber lässt sich ein
 * Lauf gezielt abbrechen (morphos:cancelAgent) — die Warteschlange im Renderer
 * kennt nur die Id.
 */
const runningAgents = new Map<string, ReturnType<typeof spawn>>();

/**
 * Ruft die Claude CLI im Strom-Modus auf (stream-json): Sie meldet laufend,
 * was sie tut — jedes Ereignis geht über `onEvent` an den Chat und setzt
 * zugleich das Ruhe-Zeitbudget zurück. Ein langer Lauf läuft dadurch nicht
 * mehr in eine Zeitüberschreitung, solange der Agent arbeitet.
 */
function runClaude(
  prompt: string,
  extraArgs: string[] = [],
  onEvent: (event: AgentEvent) => void = () => {},
  runId = '',
): Promise<AgentResult> {
  return new Promise((resolve) => {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--append-system-prompt', SYSTEM_PROMPT,
      ...extraArgs,
    ];

    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    if (runId) runningAgents.set(runId, child);

    const stream = createAgentStream();
    let stderr = '';

    // Genau einmal auflösen — 'error' und 'close' können beide feuern,
    // und der Timeout darf ein bereits geliefertes Ergebnis nicht überschreiben.
    let settled = false;
    let timer: NodeJS.Timeout;
    const finish = (result: AgentResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (runId) runningAgents.delete(runId);
      resolve(result);
    };

    // Ruhe-Zeitbudget: Es zählt nur die Zeit OHNE Lebenszeichen der CLI.
    const keepAlive = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        child.kill();
        finish({ ok: false, error: agentIdleTimeoutMessage() });
      }, AGENT_IDLE_TIMEOUT_MS);
    };
    keepAlive();

    child.on('error', (err: NodeJS.ErrnoException) => {
      const hint =
        err.code === 'ENOENT'
          ? 'Der Befehl "claude" wurde nicht gefunden. Ist die Claude CLI installiert und im PATH?'
          : err.message;
      finish({ ok: false, error: hint });
    });

    child.stdout.on('data', (d: Buffer) => {
      keepAlive();
      for (const event of stream.push(d.toString())) onEvent(event);
    });
    child.stderr.on('data', (d: Buffer) => {
      keepAlive();
      stderr += d.toString();
    });

    child.on('close', (code) => {
      const result = stream.result();
      if (result) {
        finish(result);
        return;
      }
      finish({ ok: false, error: stderr.trim() || `Claude CLI endete mit Code ${code}.` });
    });

    // Schlägt der Spawn fehl (z. B. ENOENT), löst das Schreiben auf stdin einen
    // Stream-Fehler aus — ohne Listener würde er den Prozess crashen.
    child.stdin.on('error', () => { /* wird über das 'error'-Event des Kindprozesses gemeldet */ });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Eine Generierung: Prompt bauen (samt Dialog, Referenzen und den beiden
 * Dokumenten der App), Claude CLI aufrufen, Datei-Blöcke und Rückfrage lesen,
 * Dokumente von den Quellen trennen, Änderungen anwenden, Bibliotheken auflösen
 * (Whitelist + Cache) und zum Artefakt bündeln.
 * Eine reine Rückfrage kommt ohne files/html/docs zurück — es wird nichts
 * committet und auch kein Dokument angefasst.
 * `onEvent` meldet den Fortschritt des Laufs an das aufrufende Fenster,
 * `runId` macht ihn abbrechbar.
 */
async function generate(
  userRequest: string,
  current: SourceFile[],
  currentDocs: AppDocs,
  chat: ChatMessage[],
  attachments: Attachment[],
  onEvent: (event: AgentEvent) => void = () => {},
  runId = '',
): Promise<GenerateResult> {
  const whitelist = readSettings().libWhitelist ?? [];

  const prepared = preparePromptAttachments(attachments);
  if (prepared.error) return { ok: false, error: prepared.error };
  const context: PromptContext = { chat, attachments: prepared.atts, docs: currentDocs };

  // Bild-Referenzen liest die CLI selbst — Read nur für genau diese Pfade freigeben.
  const extraArgs = prepared.atts
    .filter((a) => a.kind === 'image' && a.path)
    .flatMap((a) => ['--allowedTools', `Read(${a.path})`]);

  const res = await runClaude(buildPrompt(userRequest, current, whitelist, context), extraArgs, onEvent, runId);
  if (!res.ok) return res;

  const changes = parseLLMOutput(res.text);
  // Die beiden Dokumente kommen im selben Dateisatz — sie gehören aber neben
  // die App, nicht in sie hinein.
  const { sources, docs: docChanges } = splitDocs(changes.files);

  // Reine Rückfrage: nichts anwenden, nichts bündeln, kein Dokument anfassen.
  if (sources.length === 0 && changes.deletions.length === 0 && !hasDocChanges(docChanges)) {
    if (changes.say) return { ok: true, say: changes.say };
    return { ok: false, error: 'Es wurden keine verwertbaren Dateien erzeugt. Bitte den Wunsch anders formulieren.' };
  }

  const files = applyChanges(current, { ...changes, files: sources });
  const entry = files.find((f) => f.path === ENTRY_FILE);
  if (!entry || !extractHtml(entry.content)) {
    return { ok: false, error: 'Die App hat kein gültiges src/index.html. Bitte den Wunsch anders formulieren.' };
  }

  const libRes = await resolveLibs(extractLibs(entry.content), whitelist, libCacheDir());
  if (!libRes.ok) return libRes;

  const html = bundle(files, libRes.libs);
  if (!html) return { ok: false, error: 'Das Bündeln der App ist fehlgeschlagen.' };
  return {
    ok: true,
    files,
    html,
    docs: applyDocs(currentDocs, docChanges),
    ...(changes.say ? { say: changes.say } : {}),
  };
}

// ---- Fenster ----

function createWindow(): void {
  const mac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0f1115',
    title: 'Morphos',
    // OS-abhängige Titelleiste: unter macOS bleibt die Titelzeile verborgen, die
    // nativen Ampel-Knöpfe (Schließen/Minimieren/Vollbild) bleiben aber erhalten
    // und werden auf die Höhe unserer Leiste ausgerichtet. Unter Windows/Linux ist
    // das Fenster komplett rahmenlos und der Renderer zeichnet eigene Knöpfe.
    ...(mac
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 15 } }
      : { frame: false }),
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

  // Maximierungszustand an die eigene Titelleiste melden (Icon umschalten).
  win.on('maximize', () => win.webContents.send('window:maximized', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized', false));

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// ---- IPC ----

ipcMain.handle('morphos:generate', async (
  event,
  payload: {
    prompt: string;
    files: SourceFile[];
    docs?: AppDocs;
    chat: ChatMessage[];
    attachments: Attachment[];
    runId?: string;
  },
): Promise<GenerateResult> => {
  if (!payload?.prompt?.trim()) return { ok: false, error: 'Bitte gib einen Wunsch ein.' };
  const current = Array.isArray(payload.files)
    ? payload.files.filter((f) => f && isValidSourcePath(f.path) && typeof f.content === 'string')
    : [];
  const docs = toDocs(payload.docs);
  const chat = Array.isArray(payload.chat)
    ? payload.chat.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    : [];
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments.filter((a) => a && typeof a.path === 'string' && typeof a.name === 'string')
    : [];
  // Der Fortschritt geht an genau das Fenster zurück, das den Lauf gestartet
  // hat — die Lauf-Id ordnet ihn dort dem richtigen App-Fenster zu.
  const runId = typeof payload.runId === 'string' ? payload.runId : '';
  const sender = event.sender;
  const onEvent = (agentEvent: AgentEvent): void => {
    if (sender.isDestroyed()) return;
    sender.send('morphos:agentEvent', runId, agentEvent);
  };
  return generate(payload.prompt, current, docs, chat, attachments, onEvent, runId);
});

// Abbruch eines laufenden Agenten: Der Kindprozess zu dieser Lauf-Id wird
// beendet — sein (Teil-)Ergebnis verwirft die Warteschlange im Renderer.
ipcMain.handle('morphos:cancelAgent', async (_e, runId: string): Promise<boolean> => {
  const child = typeof runId === 'string' ? runningAgents.get(runId) : undefined;
  if (!child) return false;
  runningAgents.delete(runId);
  child.kill();
  return true;
});

ipcMain.handle('morphos:chooseAttachment', async (): Promise<{ ok: boolean; attachment?: Attachment; error?: string }> => {
  const opts: OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      { name: 'Referenzen (Bilder & Text)', extensions: [...IMAGE_EXTENSIONS, ...TEXT_EXTENSIONS] },
      { name: 'Bilder', extensions: [...IMAGE_EXTENSIONS] },
      { name: 'Textdateien', extensions: [...TEXT_EXTENSIONS] },
    ],
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, opts) : await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return { ok: false };
  const filePath = result.filePaths[0];
  const kind = attachmentKind(filePath);
  if (!kind) return { ok: false, error: 'Dieser Dateityp wird nicht unterstützt.' };
  approvedAttachments.add(filePath);
  return { ok: true, attachment: { path: filePath, name: path.basename(filePath), kind } };
});

// Aus der Zwischenablage eingefügte Bilder (Cmd/Ctrl+V) landen als temporäre
// Referenzdateien; der Pfad gilt damit als vom Anwender gewählt (freigegeben).
// Die Zwischenablage wird NATIV gelesen (Electron nativeImage) und stets nach
// PNG gewandelt — unabhängig vom Ausgangsformat (auch TIFF, z. B. von Shottr).
const MAX_CLIPBOARD_IMAGE_BYTES = 15_000_000;

ipcMain.handle('morphos:readClipboardImage', async (): Promise<{ ok: boolean; attachment?: Attachment; error?: string }> => {
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) return { ok: false, error: 'Die Zwischenablage enthält kein Bild.' };
    const png = image.toPNG();
    if (png.length === 0) return { ok: false, error: 'Das Bild der Zwischenablage konnte nicht gelesen werden.' };
    if (png.length > MAX_CLIPBOARD_IMAGE_BYTES) return { ok: false, error: 'Das eingefügte Bild ist zu groß (max. 15 MB).' };
    const dir = path.join(app.getPath('temp'), 'morphos-refs');
    fs.mkdirSync(dir, { recursive: true });
    const name = `einfuegen-${Date.now()}.png`;
    const file = path.join(dir, name);
    fs.writeFileSync(file, png);
    approvedAttachments.add(file);
    return { ok: true, attachment: { path: file, name, kind: 'image' } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('morphos:saveChat', async (_e, folder: string, id: string, chat: ChatMessage[]): Promise<SaveResult> => {
  try {
    const clean = (Array.isArray(chat) ? chat : []).filter(
      (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string',
    );
    writeChat(appDir(folder, id), clean);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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
      uiMode: settings?.uiMode === 'single' ? 'single' : 'windows',
      maxAgents: clampMaxAgents(settings?.maxAgents),
      iconPositions: cleanIconPositions(settings?.iconPositions),
      sessions: cleanSessions(settings?.sessions),
      wallpapers: cleanWallpapers(settings?.wallpapers),
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

/**
 * Verwalten im Datenordner — anlegen, umbenennen, verschieben, kopieren und der
 * Papierkorb (core/fsaccess: runShellFs). Ein eigener Kanal, weil das keine
 * App-Anfrage ist: Die erzeugten Apps erreichen nur `morphos:fs`, und dort ist
 * der Papierkorb ausgenommen. Freigegebener Datenordner und Eingrenzung jedes
 * Pfades gelten hier genauso.
 */
ipcMain.handle(
  'morphos:shellFs',
  async (_e, root: string, req: ShellFsRequest): Promise<ShellFsResponse> => {
    if (!root || typeof root !== 'string') return { ok: false, error: 'Kein Datenordner festgelegt.' };
    if (!isApprovedRoot(root)) return { ok: false, error: 'Dieser Datenordner ist nicht freigegeben.' };
    return runShellFs(root, req);
  },
);

/**
 * Mitlaufende Beobachtung eines Ordners im Datenordner — für den
 * Datei-Explorer. Beobachtet wird allein hier (siehe core/watch), eingegrenzt
 * auf denselben freigegebenen Datenordner wie jeder Dateizugriff; im Renderer
 * kommt nur die Meldung an, dass neu zu lesen ist.
 */
ipcMain.handle('morphos:watch', (e, root: string, relPath: string): WatchResult => {
  if (!root || typeof root !== 'string') return { ok: false, error: 'Kein Datenordner festgelegt.' };
  if (!isApprovedRoot(root)) return { ok: false, error: 'Dieser Datenordner ist nicht freigegeben.' };

  const sender = e.sender;
  try {
    const id = folderWatchers.start(sender.id, root, String(relPath ?? ''), (watchId) => {
      if (!sender.isDestroyed()) sender.send('morphos:watchChanged', watchId);
    });
    if (id === null) return { ok: false, error: 'Zugriff außerhalb des Datenordners ist nicht erlaubt.' };
    // Kein Beobachter überlebt sein Fenster — auch nicht ohne Abmeldung.
    if (!watchedSenders.has(sender.id)) {
      watchedSenders.add(sender.id);
      sender.once('destroyed', () => {
        watchedSenders.delete(sender.id);
        folderWatchers.stopAll(sender.id);
      });
    }
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('morphos:unwatch', (_e, id: string): boolean => folderWatchers.stop(String(id)));

/**
 * Platzbedarf eines Arbeitsverzeichnisses (Telemetrie). Gemessen wird allein
 * hier im Hauptprozess und allein innerhalb der App-Ordner und des zugehörigen
 * Datenordners — beides muss in den gespeicherten Einstellungen stehen, ein
 * beliebiger Pfad aus dem Renderer wird nicht vermessen (Defense in depth).
 */
ipcMain.handle('morphos:diskUsage', async (_e, folder: string): Promise<DiskUsageResult> => {
  if (!folder || typeof folder !== 'string') return { ok: false, error: 'Kein Arbeitsverzeichnis geöffnet.' };
  const settings = readSettings();
  if (!settings.recentFolders.includes(folder)) {
    return { ok: false, error: 'Dieses Arbeitsverzeichnis ist nicht bekannt.' };
  }
  try {
    return { ok: true, usage: await collectDiskUsage(folder, settings.accessRoots[folder] ?? null) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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
      iconCustom: meta.iconCustom === true,
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
        // Ein selbst gesetztes Icon bleibt über jede Generierung hinweg erhalten.
        ...(appData.iconCustom ? { iconCustom: true } : {}),
        createdAt: appData.createdAt,
        updatedAt: Date.now(),
      },
      appData.files,
      appData.html,
      // Konzept und Anleitung liegen neben der App und wandern mit in den Commit.
      toDocs(appData.docs),
    );
    await ensureRepo(dir);
    await commitAll(dir, message || appData.name);
    return { ok: true };
  } catch (err) {
    console.error('[morphos] saveApp fehlgeschlagen:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Icon einer App setzen (Emoji oder Bild) bzw. mit null auf die Vorgabe des LLM
// zurücksetzen. Läuft allein über das Manifest — die App muss dafür nicht offen
// sein. Das Icon wird HIER nochmals geprüft (der Renderer allein zählt nicht).
ipcMain.handle('morphos:setAppIcon', async (_e, folder: string, id: string, icon: string | null): Promise<IconResult> => {
  try {
    let value: string | null = null;
    if (icon !== null) {
      const checked = validateIcon(typeof icon === 'string' ? icon : '');
      if (!checked.ok) return { ok: false, error: checked.error };
      value = checked.icon;
    }
    const dir = appDir(folder, id);
    const effective = setManifestIcon(dir, value);
    await ensureRepo(dir);
    await commitAll(dir, value === null ? 'Icon zurückgesetzt' : 'Icon geändert');
    return { ok: true, icon: effective };
  } catch (err) {
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

// Steuerung des rahmenlosen Programmfensters (aus der eigenen Titelleiste).
ipcMain.handle('window:minimize', () => { mainWindow?.minimize(); });
ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => { mainWindow?.close(); });
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

// Externe Links im Systembrowser öffnen; das leere Chat-Fenster (Portal aus dem
// Renderer, same-origin about:blank) zulassen. Die generierten Apps können hier
// nicht ankommen — ihre iframe-Sandbox hat kein allow-popups.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    if (url === 'about:blank' || url === '') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 440,
          height: 680,
          title: 'Morphos – Chat',
          backgroundColor: '#0f1115',
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    return { action: 'deny' };
  });
});

/**
 * Beantwortet die Stromanfragen der Vorschau (`morphos-file://`). Geprüft wird
 * genau wie bei jedem anderen Dateizugriff: freigegebener Datenordner, Pfad
 * eingegrenzt, kein Symlink hinaus (core/filelink + core/fsaccess). Ausgeliefert
 * wird gestreamt — nichts davon geht durch den IPC-Kanal.
 *
 * Die erzeugten Apps kommen hier nicht an: Ihre CSP lässt Ressourcen nur als
 * data:/blob: zu, dieses Schema also nicht. Der Strom gehört der Schale.
 */
function registerFileStream(): void {
  protocol.handle(FILE_SCHEME, (request) => {
    const target = resolveFileRequest(request.url, isApprovedRoot, resolveWithin);
    if (!target) {
      return new Response('Zugriff außerhalb des Datenordners ist nicht erlaubt.', { status: 403 });
    }
    try {
      return streamFile(target, request.headers.get('range'));
    } catch (err) {
      return new Response(err instanceof Error ? err.message : String(err), { status: 404 });
    }
  });
}

/**
 * Liefert eine Datei stückweise aus. Die Teilanfrage wird SELBST beantwortet
 * (206 samt Content-Range): Electrons file:-Loader kürzt zwar den Inhalt, meldet
 * aber 200 ohne Bereichsangabe — ein Abspieler hielte das Bruchstück dann für
 * die ganze Datei und könnte nicht spulen.
 */
function streamFile(target: string, rangeHeader: string | null): Response {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) return new Response('Ordner haben keinen Inhalt.', { status: 404 });

  const type = streamMimeType(path.basename(target));
  // nosniff: Was als octet-stream hinausgeht, darf Chromium nicht zu HTML erraten.
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  };

  const range = rangeHeader ? parseRange(rangeHeader, stat.size) : null;
  if (rangeHeader && !range) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${stat.size}` } });
  }
  if (stat.size === 0) return new Response(null, { status: 200, headers: { ...headers, 'Content-Length': '0' } });

  const start = range ? range.start : 0;
  const end = range ? range.end : stat.size - 1;
  const body = Readable.toWeb(fs.createReadStream(target, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      'Content-Length': String(end - start + 1),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}),
    },
  });
}

void app.whenReady().then(() => {
  registerFileStream();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
