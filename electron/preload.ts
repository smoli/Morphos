import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentEvent,
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
  IconResult,
  SaveResult,
  Settings,
  SourceFile,
  VersionInfo,
  WatchResult,
} from '../src/types';

// Sichere, minimale Brücke zwischen Renderer und Hauptprozess (window.morphos).
contextBridge.exposeInMainWorld('morphos', {
  // Betriebssystem, damit die Titelleiste die Fensterknöpfe passend anordnet.
  platform: process.platform,

  generate: (
    prompt: string,
    files: SourceFile[],
    docs: AppDocs,
    chat: ChatMessage[],
    attachments: Attachment[],
    runId?: string,
  ): Promise<GenerateResult> =>
    ipcRenderer.invoke('morphos:generate', { prompt, files, docs, chat, attachments, runId }),

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
  saveApp: (folder: string, app: AppData, message: string): Promise<SaveResult> =>
    ipcRenderer.invoke('morphos:saveApp', folder, app, message),
  deleteApp: (folder: string, id: string): Promise<SaveResult> =>
    ipcRenderer.invoke('morphos:deleteApp', folder, id),
  setAppIcon: (folder: string, id: string, icon: string | null): Promise<IconResult> =>
    ipcRenderer.invoke('morphos:setAppIcon', folder, id, icon),

  listVersions: (folder: string, id: string): Promise<VersionInfo[]> =>
    ipcRenderer.invoke('morphos:listVersions', folder, id),
  revertApp: (folder: string, id: string, sha: string): Promise<SaveResult> =>
    ipcRenderer.invoke('morphos:revertApp', folder, id, sha),

  fs: (root: string, req: FsRequest): Promise<FsResponse> => ipcRenderer.invoke('morphos:fs', root, req),

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
