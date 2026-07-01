import { contextBridge, ipcRenderer } from 'electron';
import type { GenerateResult, PersistedState, SaveResult } from '../src/types';

// Sichere, minimale Brücke zwischen Renderer und Hauptprozess (window.morphos).
contextBridge.exposeInMainWorld('morphos', {
  generate: (prompt: string, currentHtml: string): Promise<GenerateResult> =>
    ipcRenderer.invoke('morphos:generate', { prompt, currentHtml }),

  loadState: (): Promise<PersistedState> => ipcRenderer.invoke('morphos:loadState'),

  saveState: (state: PersistedState): Promise<SaveResult> =>
    ipcRenderer.invoke('morphos:saveState', state),
});
