import { defineStore } from 'pinia';
import type { AppData, HistoryEntry } from '@/types';
import { getHost } from '@/services/host';
import { extractIcon, extractTitle } from '@/core/html';
import { DEFAULT_ICON, DEFAULT_NAME, makeAppId } from '@/core/app';

interface AppState {
  folder: string | null;
  id: string | null;
  name: string;
  icon: string;
  createdAt: number;
  history: HistoryEntry[];
  currentHtml: string;
  activeId: string | null;
  busy: boolean;
  error: string | null;
}

function makeVersionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Zustand genau EINER geöffneten App. Prompts beziehen sich stets auf diese App;
 * Änderungen werden in ihren Ordner im Arbeitsverzeichnis persistiert.
 */
export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    folder: null,
    id: null,
    name: '',
    icon: '',
    createdAt: 0,
    history: [],
    currentHtml: '',
    activeId: null,
    busy: false,
    error: null,
  }),

  getters: {
    hasApp: (s): boolean => s.currentHtml.length > 0,
    historyCount: (s): number => s.history.length,
    isDraft: (s): boolean => s.id === null,
  },

  actions: {
    clearError(): void {
      this.error = null;
    },

    /** Beginnt eine neue, noch nicht gespeicherte App im gewählten Verzeichnis. */
    newDraft(folder: string): void {
      this.$reset();
      this.folder = folder;
    },

    /**
     * Öffnet eine bestehende App aus dem Verzeichnis. Der Zustand wird erst nach
     * dem Laden gesetzt (kein Flackern) — die Platte ist die maßgebliche Quelle,
     * es wird also stets der zuletzt gespeicherte Stand geladen.
     */
    async open(folder: string, id: string): Promise<boolean> {
      try {
        const data = await getHost().loadApp(folder, id);
        if (!data) {
          this.$reset();
          this.folder = folder;
          this.error = 'Die App konnte nicht geladen werden.';
          return false;
        }
        const activeId = data.activeId ?? data.history[data.history.length - 1]?.id ?? null;
        const active = data.history.find((e) => e.id === activeId) ?? data.history[data.history.length - 1];
        this.folder = folder;
        this.id = data.id;
        this.name = data.name;
        this.icon = data.icon;
        this.createdAt = data.createdAt;
        this.history = data.history;
        this.activeId = activeId;
        this.currentHtml = active?.html ?? '';
        this.busy = false;
        this.error = null;
        return true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        return false;
      }
    },

    /** Erzeugt oder verändert die App anhand des Wunsches. */
    async generate(prompt: string): Promise<void> {
      if (this.busy) return;
      const text = prompt.trim();
      if (!text) {
        this.error = 'Bitte gib einen Wunsch ein.';
        return;
      }

      this.error = null;
      this.busy = true;
      try {
        const res = await getHost().generate(text, this.currentHtml);
        if (!res.ok) {
          this.error = res.error;
          return;
        }
        const entry: HistoryEntry = {
          id: makeVersionId(),
          prompt: text,
          html: res.html,
          time: Date.now(),
        };
        this.history.push(entry);
        this.currentHtml = res.html;
        this.activeId = entry.id;

        // Erste Version: Name und Icon aus der LLM-Ausgabe ableiten und Id/Ordner festlegen.
        if (this.id === null) {
          this.name = extractTitle(res.html) || DEFAULT_NAME;
          this.icon = extractIcon(res.html) || DEFAULT_ICON;
          this.id = makeAppId(this.name);
          this.createdAt = Date.now();
        }

        await this.persist();
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      } finally {
        this.busy = false;
      }
    },

    /** Springt zu einer früheren Version zurück. */
    revertTo(id: string): void {
      const entry = this.history.find((e) => e.id === id);
      if (!entry) return;
      this.currentHtml = entry.html;
      this.activeId = id;
      void this.persist();
    },

    async persist(): Promise<void> {
      if (!this.folder || this.id === null) return;
      // Als reines Objekt serialisieren: Pinia-State ist ein reaktiver Proxy, der
      // sich nicht über die Electron-IPC (structured clone) übertragen lässt.
      const data: AppData = JSON.parse(
        JSON.stringify({
          id: this.id,
          name: this.name,
          icon: this.icon,
          createdAt: this.createdAt,
          updatedAt: Date.now(),
          activeId: this.activeId,
          history: this.history,
        }),
      );
      try {
        const res = await getHost().saveApp(this.folder, data);
        if (!res.ok) this.error = res.error ?? 'Die App konnte nicht gespeichert werden.';
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
    },
  },
});
