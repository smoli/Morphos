import { defineStore } from 'pinia';
import type { Attachment } from '@/types';
import { useAppWindow } from './app';
import { useWorkspaceStore } from './workspace';

/** Ein Fenster auf dem Desktop. Trägt nur Geometrie/Stapel — die App-Daten
 *  liegen im zugehörigen Instanz-Store (useAppWindow(instanceId)). */
export interface DesktopWindow {
  instanceId: string;
  /** Id der geöffneten App, oder null für einen noch nicht gespeicherten Entwurf. */
  appId: string | null;
  title: string;
  icon: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

interface DesktopState {
  windows: DesktopWindow[];
  seq: number;
  nextZ: number;
  /** Einzel-Modus: Der Desktop (Launcher) liegt vor der laufenden App. */
  showingDesktop: boolean;
}

const MIN_W = 240;
const MIN_H = 160;
const DEFAULT_W = 720;
const DEFAULT_H = 520;
const CASCADE = 28;

/**
 * Registry der offenen App-Fenster: Öffnen/Schließen, Stapelreihenfolge (z),
 * Fokus, Minimieren und Geometrie. Enthält bewusst KEINE App-Logik — jedes
 * Fenster hat seinen eigenen App-Instanz-Store (useAppWindow).
 */
export const useDesktopStore = defineStore('desktop', {
  state: (): DesktopState => ({
    windows: [],
    seq: 0,
    nextZ: 1,
    showingDesktop: false,
  }),

  getters: {
    /** Das oberste, nicht minimierte Fenster (oder null). */
    focusedId: (s): string | null => {
      const visible = s.windows.filter((w) => !w.minimized);
      if (visible.length === 0) return null;
      return visible.reduce((top, w) => (w.z > top.z ? w : top)).instanceId;
    },
    /**
     * Das Fenster, das den Anwender gerade bedient — also `focusedId`, außer im
     * Einzel-Modus, solange der Desktop davor liegt. Ziel der Promptleiste.
     */
    activeId(): string | null {
      if (this.showingDesktop && useWorkspaceStore().uiMode === 'single') return null;
      return this.focusedId;
    },
    /** Fenster von hinten nach vorn (aufsteigendes z) — stabile Renderreihenfolge. */
    stacked: (s): DesktopWindow[] => [...s.windows].sort((a, b) => a.z - b.z),
  },

  actions: {
    find(instanceId: string): DesktopWindow | undefined {
      return this.windows.find((w) => w.instanceId === instanceId);
    },

    /** Öffnet eine App: fokussiert ein bestehendes Fenster oder legt ein neues an. */
    openApp(appId: string, meta: { title: string; icon: string }): string {
      const existing = this.windows.find((w) => w.appId === appId);
      if (existing) {
        existing.title = meta.title;
        existing.icon = meta.icon;
        this.focusWindow(existing.instanceId);
        return existing.instanceId;
      }
      return this.spawn(appId, meta.title, meta.icon);
    },

    /** Öffnet ein Fenster für eine neue, noch nicht gespeicherte App. */
    openDraft(): string {
      return this.spawn(null, 'Neue App', '🧩');
    },

    /** Einzel-Modus: die laufende App verlassen und den Launcher zeigen. */
    showDesktop(): void {
      this.showingDesktop = true;
    },

    spawn(appId: string | null, title: string, icon: string): string {
      this.showingDesktop = false;
      this.seq += 1;
      const instanceId = `win-${this.seq}`;
      const step = (this.windows.length % 8) * CASCADE;
      this.windows.push({
        instanceId,
        appId,
        title,
        icon,
        x: 40 + step,
        y: 40 + step,
        w: DEFAULT_W,
        h: DEFAULT_H,
        z: (this.nextZ += 1),
        minimized: false,
        maximized: false,
      });
      return instanceId;
    },

    focusWindow(instanceId: string): void {
      const w = this.find(instanceId);
      if (!w) return;
      // Ein Fenster in den Vordergrund holen beendet die Desktop-Ansicht.
      this.showingDesktop = false;
      w.minimized = false;
      w.z = this.nextZ += 1;
    },

    closeWindow(instanceId: string): void {
      this.windows = this.windows.filter((w) => w.instanceId !== instanceId);
    },

    minimizeWindow(instanceId: string): void {
      const w = this.find(instanceId);
      if (w) w.minimized = true;
    },

    restoreWindow(instanceId: string): void {
      this.focusWindow(instanceId);
    },

    moveWindow(instanceId: string, x: number, y: number): void {
      const w = this.find(instanceId);
      if (!w) return;
      w.x = Math.max(0, Math.round(x));
      w.y = Math.max(0, Math.round(y));
    },

    resizeWindow(instanceId: string, w: number, h: number): void {
      const win = this.find(instanceId);
      if (!win) return;
      win.w = Math.max(MIN_W, Math.round(w));
      win.h = Math.max(MIN_H, Math.round(h));
    },

    /** Maximiert ein Fenster (füllt die Desktop-Fläche) bzw. stellt es wieder her. */
    toggleMaximize(instanceId: string): void {
      const w = this.find(instanceId);
      if (!w) return;
      w.maximized = !w.maximized;
      this.focusWindow(instanceId);
    },

    /** Ein Entwurf wurde zur echten App: Id, Titel und Icon übernehmen. */
    setAppMeta(instanceId: string, appId: string, title: string, icon: string): void {
      const w = this.find(instanceId);
      if (!w) return;
      w.appId = appId;
      w.title = title;
      w.icon = icon;
    },

    /**
     * Führt eine Generierung für das Fenster `instanceId` aus und gleicht danach
     * Titel/Icon (Entwurf → echte App) sowie die Desktop-Liste ab. Zentrale
     * Stelle für die globale Promptleiste UND den WelcomeScreen eines Fensters.
     */
    async runGenerate(instanceId: string, text: string, attachments: Attachment[] = []): Promise<void> {
      const app = useAppWindow(instanceId);
      const wasDraft = app.isDraft;
      await app.generate(text, attachments);
      if (!app.isDraft && app.id) {
        this.setAppMeta(instanceId, app.id, app.name, app.icon);
        if (wasDraft) await useWorkspaceStore().refresh();
      }
    },

    /**
     * Nimmt eine Eingabe der globalen Promptleiste entgegen und richtet sie an
     * das aktive Fenster. Ist keines offen, wird ein neuer Entwurf angelegt.
     */
    async submitToActive(text: string, attachments: Attachment[] = []): Promise<void> {
      const ws = useWorkspaceStore();
      if (!ws.folder) return;
      let id = this.activeId;
      if (!id) {
        id = this.openDraft();
        useAppWindow(id).newDraft(ws.folder);
      }
      await this.runGenerate(id, text, attachments);
    },
  },
});
