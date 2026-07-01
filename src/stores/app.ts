import { defineStore } from 'pinia';
import type { HistoryEntry, PersistedState } from '@/types';
import { getHost } from '@/services/host';

interface AppState {
  history: HistoryEntry[];
  currentHtml: string;
  activeId: string | null;
  busy: boolean;
  error: string | null;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    history: [],
    currentHtml: '',
    activeId: null,
    busy: false,
    error: null,
  }),

  getters: {
    hasApp: (s): boolean => s.currentHtml.length > 0,
    historyCount: (s): number => s.history.length,
  },

  actions: {
    clearError(): void {
      this.error = null;
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
          id: makeId(),
          prompt: text,
          html: res.html,
          time: Date.now(),
        };
        this.history.push(entry);
        this.currentHtml = res.html;
        this.activeId = entry.id;
        void this.persist();
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

    /** Lädt den gespeicherten Zustand vom Host. */
    async loadFromHost(): Promise<void> {
      try {
        const state = await getHost().loadState();
        if (!state || !Array.isArray(state.history) || state.history.length === 0) return;
        this.history = state.history;
        this.activeId = state.activeId ?? state.history[state.history.length - 1].id;
        const active = this.history.find((e) => e.id === this.activeId) ?? state.history[state.history.length - 1];
        this.currentHtml = active.html;
      } catch {
        /* frischer Start */
      }
    },

    async persist(): Promise<void> {
      const state: PersistedState = { history: this.history, activeId: this.activeId };
      try {
        await getHost().saveState(state);
      } catch {
        /* nicht kritisch */
      }
    },
  },
});
