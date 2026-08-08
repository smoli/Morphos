import { defineStore } from 'pinia';
import type { AppSummary, FsOp, FsPermissions, IconPos, PermDecision, PermMode, SessionWindow, UiMode } from '@/types';
import { getHost } from '@/services/host';
import { decideOutcome, effectivePermission } from '@/core/permissions';
import { clampMaxAgents, DEFAULT_MAX_AGENTS } from '@/core/queue';
import { cleanSessions, sameSession } from '@/core/session';

interface PendingPermission {
  op: FsOp;
  path: string;
}

interface WorkspaceState {
  folder: string | null;
  recentFolders: string[];
  /** Zugriffsordner der Apps, je Workspace-Pfad. */
  accessRoots: Record<string, string>;
  /** Dateisystem-Berechtigungen je Operation, je Workspace-Pfad. */
  permissions: Record<string, FsPermissions>;
  /** Freigegebene Bibliotheks-Quellen (global, siehe core/libs). */
  libWhitelist: string[];
  /** Desktop-Darstellung: überlappende Fenster oder eine App zur Zeit. */
  uiMode: UiMode;
  /** Wie viele Agentenläufe gleichzeitig arbeiten dürfen (global). */
  maxAgents: number;
  /** Frei abgelegte Kachel-Positionen, je Workspace-Pfad, je App-Id. */
  iconPositions: Record<string, Record<string, IconPos>>;
  /** Die zuletzt offenen Fenster, je Workspace-Pfad (siehe core/session). */
  sessions: Record<string, SessionWindow[]>;
  /** Aktuell zur Genehmigung anstehende Anfrage (für den Dialog). */
  pendingPermission: PendingPermission | null;
  apps: AppSummary[];
  loading: boolean;
  error: string | null;
}

const MAX_RECENT = 10;

// Offene Berechtigungsanfragen (Resolver sind nicht serialisierbar → außerhalb des States).
const permissionQueue: { req: PendingPermission; resolve: (d: PermDecision) => void }[] = [];

/**
 * Verwaltet das aktive Arbeitsverzeichnis, die Liste zuletzt genutzter Ordner
 * und die darin enthaltenen Apps (Desktop-Übersicht).
 */
export const useWorkspaceStore = defineStore('workspace', {
  state: (): WorkspaceState => ({
    folder: null,
    recentFolders: [],
    accessRoots: {},
    permissions: {},
    libWhitelist: [],
    uiMode: 'windows',
    maxAgents: DEFAULT_MAX_AGENTS,
    iconPositions: {},
    sessions: {},
    pendingPermission: null,
    apps: [],
    loading: false,
    error: null,
  }),

  getters: {
    hasFolder: (s): boolean => s.folder !== null,
    appCount: (s): number => s.apps.length,
    /** Der für das aktuelle Verzeichnis freigegebene Zugriffsordner (oder null). */
    accessRoot: (s): string | null => (s.folder ? s.accessRoots[s.folder] ?? null : null),
    /** Effektive Berechtigung einer Operation im aktuellen Verzeichnis. */
    permissionFor: (s) => (op: FsOp): PermMode =>
      effectivePermission(s.folder ? s.permissions[s.folder] : undefined, op),
    /** Die gemerkten Kachel-Positionen des aktuellen Verzeichnisses. */
    iconLayout: (s): Record<string, IconPos> => (s.folder ? s.iconPositions[s.folder] ?? {} : {}),
    /** Hat der Anwender hier überhaupt schon eine Kachel abgelegt? */
    hasIconLayout(): boolean {
      return Object.keys(this.iconLayout).length > 0;
    },
    /** Die gemerkte Sitzung des aktuellen Verzeichnisses (hinten → vorn). */
    session: (s): SessionWindow[] => (s.folder ? s.sessions[s.folder] ?? [] : []),
  },

  actions: {
    /** Lädt die zuletzt genutzten Ordner (Startbildschirm). */
    async init(): Promise<void> {
      try {
        const settings = await getHost().loadSettings();
        this.recentFolders = Array.isArray(settings?.recentFolders) ? settings.recentFolders : [];
        this.accessRoots = settings?.accessRoots && typeof settings.accessRoots === 'object' ? settings.accessRoots : {};
        this.permissions = settings?.permissions && typeof settings.permissions === 'object' ? settings.permissions : {};
        this.libWhitelist = Array.isArray(settings?.libWhitelist) ? settings.libWhitelist : [];
        this.uiMode = settings?.uiMode === 'single' ? 'single' : 'windows';
        this.maxAgents = clampMaxAgents(settings?.maxAgents);
        this.iconPositions =
          settings?.iconPositions && typeof settings.iconPositions === 'object' ? settings.iconPositions : {};
        this.sessions = cleanSessions(settings?.sessions);
      } catch {
        this.recentFolders = [];
        this.accessRoots = {};
        this.permissions = {};
        this.libWhitelist = [];
        this.uiMode = 'windows';
        this.maxAgents = DEFAULT_MAX_AGENTS;
        this.iconPositions = {};
        this.sessions = {};
      }
    },

    /** Legt (per Dialog) den Zugriffsordner für das aktuelle Verzeichnis fest. */
    async setAccessFolder(): Promise<boolean> {
      if (!this.folder) return false;
      this.error = null;
      try {
        const res = await getHost().chooseFolder();
        if (!res.ok || !res.path) return false;
        this.accessRoots = { ...this.accessRoots, [this.folder]: res.path };
        // Erst speichern, dann freigeben: Der Hauptprozess akzeptiert nur
        // Zugriffsordner, die in den gespeicherten Einstellungen stehen.
        await this.persistSettings();
        return true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        return false;
      }
    },

    /** Öffnet den nativen Auswahldialog; bei Erfolg wird der Ordner geöffnet. */
    async chooseFolder(): Promise<boolean> {
      this.error = null;
      try {
        const res = await getHost().chooseFolder();
        if (!res.ok || !res.path) return false;
        await this.openFolder(res.path);
        return true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        return false;
      }
    },

    /** Öffnet ein Verzeichnis, merkt es vor und lädt seine Apps. */
    async openFolder(path: string): Promise<void> {
      // Etwaige offene Berechtigungsanfragen eines anderen Workspace einmalig
      // ablehnen — die wartenden Promises dürfen nicht ewig hängen bleiben.
      while (permissionQueue.length) permissionQueue.shift()!.resolve('deny-once');
      this.pendingPermission = null;
      this.folder = path;
      this.recentFolders = [path, ...this.recentFolders.filter((f) => f !== path)].slice(0, MAX_RECENT);
      void this.persistSettings();
      await this.refresh();
    },

    /** Schaltet den Desktop-Modus um (überlappende Fenster ⇄ eine App zur Zeit). */
    setUiMode(mode: UiMode): void {
      this.uiMode = mode;
      void this.persistSettings();
    },

    /** Legt fest, wie viele Agentenläufe gleichzeitig arbeiten dürfen. */
    setMaxAgents(count: number): void {
      this.maxAgents = clampMaxAgents(count);
      void this.persistSettings();
    },

    /** Merkt, wo der Anwender eine Kachel abgelegt hat (für dieses Verzeichnis). */
    setIconPosition(appId: string, pos: IconPos): void {
      if (!this.folder) return;
      const current = this.iconPositions[this.folder] ?? {};
      this.iconPositions = {
        ...this.iconPositions,
        [this.folder]: { ...current, [appId]: { x: pos.x, y: pos.y } },
      };
      void this.persistSettings();
    },

    /** Aufräumen: Die Kacheln dieses Verzeichnisses fallen zurück ins Raster. */
    resetIconPositions(): void {
      if (!this.folder || !this.iconPositions[this.folder]) return;
      const { [this.folder]: _weg, ...rest } = this.iconPositions;
      this.iconPositions = rest;
      void this.persistSettings();
    },

    /** Vergisst die gemerkte Position einer App (sie gibt es nicht mehr). */
    forgetIconPosition(appId: string): void {
      if (!this.folder) return;
      const current = this.iconPositions[this.folder];
      if (!current || !(appId in current)) return;
      const { [appId]: _weg, ...rest } = current;
      this.iconPositions = { ...this.iconPositions, [this.folder]: rest };
      void this.persistSettings();
    },

    /**
     * Merkt die offenen Fenster dieses Verzeichnisses für den nächsten Start.
     * Eine leere Sitzung wird vergessen — der Desktop öffnet dann schlicht den
     * Launcher.
     */
    saveSession(windows: SessionWindow[]): void {
      if (!this.folder) return;
      const current = this.sessions[this.folder];
      if (windows.length === 0) {
        if (!current) return;
        const { [this.folder]: _weg, ...rest } = this.sessions;
        this.sessions = rest;
      } else {
        if (current && sameSession(current, windows)) return;
        this.sessions = { ...this.sessions, [this.folder]: windows };
      }
      void this.persistSettings();
    },

    /** Gibt eine Bibliotheks-Quelle frei (Hostname oder https-URL-Präfix). */
    addLibPattern(pattern: string): void {
      const p = pattern.trim();
      if (!p || this.libWhitelist.includes(p)) return;
      this.libWhitelist = [...this.libWhitelist, p];
      void this.persistSettings();
    },

    /** Entzieht einer Bibliotheks-Quelle die Freigabe. */
    removeLibPattern(pattern: string): void {
      this.libWhitelist = this.libWhitelist.filter((p) => p !== pattern);
      void this.persistSettings();
    },

    /** Setzt die Berechtigung einer Operation für das aktuelle Verzeichnis. */
    setPermission(op: FsOp, mode: PermMode): void {
      if (!this.folder) return;
      const current = this.permissions[this.folder] ?? {};
      this.permissions = { ...this.permissions, [this.folder]: { ...current, [op]: mode } };
      void this.persistSettings();
    },

    /**
     * Klärt, ob eine Operation ausgeführt werden darf: bei 'allow'/'deny' sofort,
     * bei 'ask' über den Berechtigungsdialog. Ein "immer"-Entscheid wird gemerkt.
     */
    async authorizeFs(op: FsOp, path: string): Promise<boolean> {
      const mode = this.permissionFor(op);
      if (mode === 'allow') return true;
      if (mode === 'deny') return false;
      const decision = await this.requestPermission(op, path);
      const { allowed, remember } = decideOutcome(decision);
      if (remember) this.setPermission(op, remember);
      return allowed;
    },

    /** Reiht eine Anfrage in die Dialog-Warteschlange ein und wartet auf die Entscheidung. */
    requestPermission(op: FsOp, path: string): Promise<PermDecision> {
      return new Promise<PermDecision>((resolve) => {
        permissionQueue.push({ req: { op, path }, resolve });
        if (!this.pendingPermission) this.pendingPermission = permissionQueue[0].req;
      });
    },

    /** Beantwortet die aktuell angezeigte Anfrage und rückt zur nächsten vor. */
    answerPermission(decision: PermDecision): void {
      const head = permissionQueue.shift();
      if (head) head.resolve(decision);
      this.pendingPermission = permissionQueue.length ? permissionQueue[0].req : null;
    },

    /** Liest die Apps des aktuellen Verzeichnisses neu ein. */
    async refresh(): Promise<void> {
      if (!this.folder) return;
      this.loading = true;
      try {
        this.apps = await getHost().listApps(this.folder);
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        this.apps = [];
      } finally {
        this.loading = false;
      }
    },

    /**
     * Setzt das Icon einer App auf der Platte — `null` stellt die Vorgabe des
     * LLM wieder her. Die Kachel wird sofort nachgezogen (kein erneutes
     * Einlesen des Verzeichnisses). Liefert das wirksame Icon oder null bei
     * einem Fehler.
     */
    async setAppIcon(id: string, icon: string | null): Promise<string | null> {
      if (!this.folder) return null;
      try {
        const res = await getHost().setAppIcon(this.folder, id, icon);
        if (!res.ok || !res.icon) {
          this.error = res.error ?? 'Das Icon konnte nicht gesetzt werden.';
          return null;
        }
        const effective = res.icon;
        this.apps = this.apps.map((a) =>
          a.id === id ? { ...a, icon: effective, iconCustom: icon !== null } : a,
        );
        return effective;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        return null;
      }
    },

    /** Löscht eine App aus dem Verzeichnis. */
    async removeApp(id: string): Promise<void> {
      if (!this.folder) return;
      try {
        await getHost().deleteApp(this.folder, id);
        this.forgetIconPosition(id);
        await this.refresh();
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
    },

    /** Verlässt das Verzeichnis (zurück zum Startbildschirm). */
    closeFolder(): void {
      this.folder = null;
      this.apps = [];
    },

    async persistSettings(): Promise<void> {
      // Reine Werte (kein reaktiver Proxy) für die Electron-IPC.
      const recentFolders = [...this.recentFolders];
      const accessRoots = { ...this.accessRoots };
      const permissions = JSON.parse(JSON.stringify(this.permissions)) as Record<string, FsPermissions>;
      const libWhitelist = [...this.libWhitelist];
      const uiMode = this.uiMode;
      const maxAgents = this.maxAgents;
      const iconPositions = JSON.parse(JSON.stringify(this.iconPositions)) as Record<string, Record<string, IconPos>>;
      const sessions = JSON.parse(JSON.stringify(this.sessions)) as Record<string, SessionWindow[]>;
      try {
        await getHost().saveSettings({
          recentFolders,
          accessRoots,
          permissions,
          libWhitelist,
          uiMode,
          maxAgents,
          iconPositions,
          sessions,
        });
      } catch {
        /* nicht kritisch */
      }
    },
  },
});
