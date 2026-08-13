import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentEvent,
  AppData,
  AppSummary,
  Attachment,
  ChatMessage,
  DiskUsageResult,
  ElementRef,
  FolderResult,
  Framework,
  FsRequest,
  FsResponse,
  GenerateResult,
  IconResult,
  ImportChoice,
  ImportResult,
  ReadmeResult,
  RemoteResult,
  RemoteStatus,
  SaveResult,
  Settings,
  ShellFsRequest,
  ShellFsResponse,
  VersionInfo,
  WatchResult,
} from '../src/types';

// Sichere, minimale Brücke zwischen Renderer und Hauptprozess (window.morphos).
contextBridge.exposeInMainWorld('morphos', {
  // Betriebssystem, damit die Titelleiste die Fensterknöpfe passend anordnet.
  platform: process.platform,

  // Der Agent arbeitet im Ordner der App: Es gehen nur der Wunsch und die
  // Anschrift der App hinüber, keine Dateiinhalte mehr (c0087).
  generate: (
    prompt: string,
    folder: string,
    id: string | null,
    chat: ChatMessage[],
    attachments: Attachment[],
    runId?: string,
    framework?: Framework,
    elements?: ElementRef[],
  ): Promise<GenerateResult> =>
    ipcRenderer.invoke('morphos:generate', { prompt, folder, id, chat, attachments, runId, framework, elements }),

  // Fortschritt eines laufenden Agentenlaufs (Strom der Claude CLI).
  onAgentEvent: (cb: (runId: string, event: AgentEvent) => void): (() => void) => {
    const handler = (_e: unknown, runId: string, event: AgentEvent): void => cb(runId, event);
    ipcRenderer.on('morphos:agentEvent', handler);
    return () => ipcRenderer.removeListener('morphos:agentEvent', handler);
  },

  // Bricht einen laufenden Agentenlauf ab (beendet seinen claude-Kindprozess).
  cancelAgent: (runId: string): Promise<boolean> => ipcRenderer.invoke('morphos:cancelAgent', runId),

  chooseFolder: (): Promise<FolderResult> => ipcRenderer.invoke('morphos:chooseFolder'),
  chooseAttachment: (): Promise<{ ok: boolean; attachment?: Attachment; error?: string }> =>
    ipcRenderer.invoke('morphos:chooseAttachment'),
  readClipboardImage: (): Promise<{ ok: boolean; attachment?: Attachment; error?: string }> =>
    ipcRenderer.invoke('morphos:readClipboardImage'),

  saveChat: (folder: string, id: string, chat: ChatMessage[]): Promise<SaveResult> =>
    ipcRenderer.invoke('morphos:saveChat', folder, id, chat),

  loadSettings: (): Promise<Settings> => ipcRenderer.invoke('morphos:loadSettings'),
  saveSettings: (settings: Settings): Promise<SaveResult> =>
    ipcRenderer.invoke('morphos:saveSettings', settings),

  listApps: (folder: string): Promise<AppSummary[]> => ipcRenderer.invoke('morphos:listApps', folder),
  loadApp: (folder: string, id: string): Promise<AppData | null> =>
    ipcRenderer.invoke('morphos:loadApp', folder, id),
  deleteApp: (folder: string, id: string): Promise<SaveResult> =>
    ipcRenderer.invoke('morphos:deleteApp', folder, id),
  setAppIcon: (folder: string, id: string, icon: string | null): Promise<IconResult> =>
    ipcRenderer.invoke('morphos:setAppIcon', folder, id, icon),

  // Titelseite der App (README.md) schreiben und committen — sie reist mit,
  // wenn der App-Ordner auf eine Gegenstelle geschoben wird. Nur, wenn noch
  // keine dasteht: ein vorhandenes Readme bleibt, wie es ist (c0080).
  createReadme: (folder: string, id: string): Promise<ReadmeResult> =>
    ipcRenderer.invoke('morphos:createReadme', folder, id),

  // App aus einem Git-Repository holen: klonen, prüfen, einordnen. Bei belegter
  // Id kommt eine Rückfrage zurück, die der Anwender mit resolveImport beantwortet.
  importApp: (folder: string, url: string): Promise<ImportResult> =>
    ipcRenderer.invoke('morphos:importApp', folder, url),
  resolveImport: (token: string, choice: ImportChoice): Promise<ImportResult> =>
    ipcRenderer.invoke('morphos:resolveImport', token, choice),

  // Abgleich mit der Gegenstelle (c0082): nachsehen, schieben, vorspulen.
  // Geholt wird nur auf Geheiß — es gibt keinen Kanal, der das im Hintergrund
  // täte.
  remoteStatus: (folder: string, id: string, fetch?: boolean): Promise<RemoteStatus> =>
    ipcRenderer.invoke('morphos:remoteStatus', folder, id, fetch === true),
  pushApp: (folder: string, id: string): Promise<RemoteResult> =>
    ipcRenderer.invoke('morphos:pushApp', folder, id),
  pullApp: (folder: string, id: string): Promise<RemoteResult> =>
    ipcRenderer.invoke('morphos:pullApp', folder, id),

  listVersions: (folder: string, id: string): Promise<VersionInfo[]> =>
    ipcRenderer.invoke('morphos:listVersions', folder, id),
  revertApp: (folder: string, id: string, sha: string): Promise<SaveResult> =>
    ipcRenderer.invoke('morphos:revertApp', folder, id, sha),

  fs: (root: string, req: FsRequest): Promise<FsResponse> => ipcRenderer.invoke('morphos:fs', root, req),

  // Verwalten im Datenordner auf Geheiß des Anwenders (Datei-Explorer):
  // anlegen, umbenennen, verschieben, kopieren, Papierkorb. Eigener Kanal, weil
  // das keine App-Anfrage ist — erreichbar nur aus der Schale.
  shellFs: (root: string, req: ShellFsRequest): Promise<ShellFsResponse> =>
    ipcRenderer.invoke('morphos:shellFs', root, req),

  // Mitlaufende Beobachtung eines Ordners im Datenordner (Datei-Explorer): Der
  // Hauptprozess beobachtet, hier kommt nur „da hat sich etwas getan“ an.
  // Zurück kommt die Abmeldefunktion; scheitert die Anmeldung, ist sie leer.
  watchFolder: async (root: string, path: string, onChange: () => void): Promise<() => void> => {
    const res: WatchResult = await ipcRenderer.invoke('morphos:watch', root, path);
    if (!res.ok) return () => {};
    const handler = (_e: unknown, id: string): void => {
      if (id === res.id) onChange();
    };
    ipcRenderer.on('morphos:watchChanged', handler);
    return () => {
      ipcRenderer.removeListener('morphos:watchChanged', handler);
      void ipcRenderer.invoke('morphos:unwatch', res.id);
    };
  },

  // Platzbedarf der Apps und des Datenordners — gerechnet wird im Hauptprozess.
  diskUsage: (folder: string): Promise<DiskUsageResult> => ipcRenderer.invoke('morphos:diskUsage', folder),

  // Das Arbeitsverzeichnis dort öffnen, wo der Anwender selbst damit arbeitet:
  // im Dateimanager des Systems bzw. in einem Terminal.
  revealFolder: (folder: string): Promise<SaveResult> => ipcRenderer.invoke('morphos:revealFolder', folder),
  openTerminal: (folder: string): Promise<SaveResult> => ipcRenderer.invoke('morphos:openTerminal', folder),

  // Steuerung des rahmenlosen Programmfensters.
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: (): Promise<void> => ipcRenderer.invoke('window:toggleMaximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximize: (cb: (maximized: boolean) => void): (() => void) => {
    const handler = (_e: unknown, maximized: boolean): void => cb(maximized);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
});
