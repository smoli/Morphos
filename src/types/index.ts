/** Ergebnis einer Generierung durch das LLM. */
export type GenerateResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

/** Eine Stufe in der Versionshistorie. */
export interface HistoryEntry {
  id: string;
  prompt: string;
  html: string;
  time: number;
}

/** Persistierter Zustand (Historie + aktive Version). */
export interface PersistedState {
  history: HistoryEntry[];
  activeId: string | null;
}

/** Ergebnis eines Speichervorgangs. */
export interface SaveResult {
  ok: boolean;
  error?: string;
}

/**
 * Die vom Electron-Hauptprozess bereitgestellte Brücke. Im Renderer als
 * `window.morphos`; in Tests durch eine Attrappe ersetzbar.
 */
export interface MorphosHost {
  generate(prompt: string, currentHtml: string): Promise<GenerateResult>;
  loadState(): Promise<PersistedState>;
  saveState(state: PersistedState): Promise<SaveResult>;
}
