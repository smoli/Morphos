import { defineStore } from 'pinia';

/**
 * Zustand der Schale, den mehrere Stellen teilen. Bislang ist das nur der
 * Einstellungsdialog: Die Kopfleiste öffnet ihn per Knopf, der Desktop per
 * Tastenkürzel (Strg/⌘ + ,) — gezeichnet wird er einmal in App.vue.
 */
export const useShellStore = defineStore('shell', {
  state: (): { settingsOpen: boolean } => ({ settingsOpen: false }),

  actions: {
    openSettings(): void {
      this.settingsOpen = true;
    },
    closeSettings(): void {
      this.settingsOpen = false;
    },
  },
});
