import { defineStore } from 'pinia';
import type { AppData, SourceFile, VersionInfo } from '@/types';
import { getHost } from '@/services/host';
import { extractIcon, extractTitle } from '@/core/html';
import { DEFAULT_ICON, DEFAULT_NAME, makeAppId } from '@/core/app';

interface AppState {
  folder: string | null;
  id: string | null;
  name: string;
  icon: string;
  createdAt: number;
  /** Der aktuelle Quelldatei-Satz der App (src/…). */
  files: SourceFile[];
  /** Das gebündelte Artefakt für die Anzeige im Canvas. */
  currentHtml: string;
  /** Git-Historie, neueste zuerst (HEAD = aktiver Stand). */
  versions: VersionInfo[];
  busy: boolean;
  error: string | null;
}

/**
 * Zustand genau EINER geöffneten App. Prompts beziehen sich stets auf diese App;
 * jeder Stand wird als Git-Commit in ihrem Ordner persistiert (Botschaft = Wunsch).
 */
export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    folder: null,
    id: null,
    name: '',
    icon: '',
    createdAt: 0,
    files: [],
    currentHtml: '',
    versions: [],
    busy: false,
    error: null,
  }),

  getters: {
    hasApp: (s): boolean => s.currentHtml.length > 0,
    versionCount: (s): number => s.versions.length,
    isDraft: (s): boolean => s.id === null,
    /** Der aktive Stand ist immer der neueste Commit (HEAD). */
    activeSha: (s): string | null => s.versions[0]?.sha ?? null,
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
     * es wird also stets der zuletzt committete Stand geladen.
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
        this.folder = folder;
        this.id = data.id;
        this.name = data.name;
        this.icon = data.icon;
        this.createdAt = data.createdAt;
        this.files = data.files;
        this.currentHtml = data.html;
        this.busy = false;
        this.error = null;
        await this.loadVersions();
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
        // Reine Werte übergeben (kein reaktiver Proxy) — Electron-IPC nutzt structured clone.
        const plainFiles = this.files.map((f) => ({ path: f.path, content: f.content }));
        const res = await getHost().generate(text, plainFiles);
        if (!res.ok) {
          this.error = res.error;
          return;
        }
        this.files = res.files;
        this.currentHtml = res.html;

        // Erste Version: Name und Icon aus dem Artefakt ableiten und Id/Ordner festlegen.
        if (this.id === null) {
          this.name = extractTitle(res.html) || DEFAULT_NAME;
          this.icon = extractIcon(res.html) || DEFAULT_ICON;
          this.id = makeAppId(this.name);
          this.createdAt = Date.now();
        }

        await this.persist(text);
        await this.loadVersions();
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      } finally {
        this.busy = false;
      }
    },

    /** Springt zu einer früheren Version zurück (neuer Commit mit dem alten Stand). */
    async revertTo(sha: string): Promise<void> {
      if (!this.folder || this.id === null) return;
      try {
        const res = await getHost().revertApp(this.folder, this.id, sha);
        if (!res.ok) {
          this.error = res.error ?? 'Die Version konnte nicht wiederhergestellt werden.';
          return;
        }
        // Wiederhergestellten Stand von der Platte übernehmen.
        await this.open(this.folder, this.id);
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
    },

    /** Lädt die Git-Historie der geöffneten App. */
    async loadVersions(): Promise<void> {
      if (!this.folder || this.id === null) return;
      try {
        this.versions = await getHost().listVersions(this.folder, this.id);
      } catch {
        this.versions = [];
      }
    },

    async persist(message: string): Promise<void> {
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
          files: this.files,
          html: this.currentHtml,
        }),
      );
      try {
        const res = await getHost().saveApp(this.folder, data, message);
        if (!res.ok) this.error = res.error ?? 'Die App konnte nicht gespeichert werden.';
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
    },
  },
});
