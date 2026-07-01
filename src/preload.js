'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Sichere, minimale Brücke zwischen Renderer und Main-Prozess.
contextBridge.exposeInMainWorld('morphos', {
  /** Erzeugt/verändert die App. currentHtml = aktueller Stand (für Weiterentwicklung). */
  generate: (prompt, currentHtml) =>
    ipcRenderer.invoke('morphos:generate', { prompt, currentHtml }),

  /** Lädt die gespeicherte Versionshistorie. */
  loadState: () => ipcRenderer.invoke('morphos:loadState'),

  /** Speichert die Versionshistorie. */
  saveState: (state) => ipcRenderer.invoke('morphos:saveState', state),
});
