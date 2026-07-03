import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppData,
  AppSummary,
  Attachment,
  ChatMessage,
  FolderResult,
  FsRequest,
  FsResponse,
  GenerateResult,
  SaveResult,
  Settings,
  SourceFile,
  VersionInfo,
} from '../src/types';

// Sichere, minimale Brücke zwischen Renderer und Hauptprozess (window.morphos).
contextBridge.exposeInMainWorld('morphos', {
  generate: (prompt: string, files: SourceFile[], chat: ChatMessage[], attachments: Attachment[]): Promise<GenerateResult> =>
    ipcRenderer.invoke('morphos:generate', { prompt, files, chat, attachments }),

  chooseFolder: (): Promise<FolderResult> => ipcRenderer.invoke('morphos:chooseFolder'),
  chooseAttachment: (): Promise<{ ok: boolean; attachment?: Attachment; error?: string }> =>
    ipcRenderer.invoke('morphos:chooseAttachment'),
  saveClipboardImage: (data: ArrayBuffer, mime: string): Promise<{ ok: boolean; attachment?: Attachment; error?: string }> =>
    ipcRenderer.invoke('morphos:saveClipboardImage', data, mime),

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

  listVersions: (folder: string, id: string): Promise<VersionInfo[]> =>
    ipcRenderer.invoke('morphos:listVersions', folder, id),
  revertApp: (folder: string, id: string, sha: string): Promise<SaveResult> =>
    ipcRenderer.invoke('morphos:revertApp', folder, id, sha),

  fs: (root: string, req: FsRequest): Promise<FsResponse> => ipcRenderer.invoke('morphos:fs', root, req),
});
