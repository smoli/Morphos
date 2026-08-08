import { defineStore } from 'pinia';
import { useWorkspaceStore } from './workspace';
import { restorableSession, serializeSession } from '@/core/session';
import { systemWindow } from '@/core/system';

/**
 * Was ein Fenster zeigt: eine (erzeugte) App oder eine Ansicht der Schale
 * selbst — etwa den Datei-Explorer (siehe core/system).
 */
export type WindowKind = 'app' | 'system';

/** Ein Fenster auf dem Desktop. Trägt nur Geometrie/Stapel — die App-Daten
 *  liegen im zugehörigen Instanz-Store (useAppWindow(instanceId)). */
export interface DesktopWindow {
  instanceId: string;
  kind: WindowKind;
  /** Id der geöffneten App, oder null für einen Entwurf bzw. ein System-Fenster. */
  appId: string | null;
  /** Welche Ansicht der Schale — nur bei `kind: 'system'`, sonst null. */
  systemId: string | null;
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
  /** Verzeichnis, dessen Sitzung bereits wiederhergestellt wurde (einmal je Start). */
  restoredFolder: string | null;
}

const MIN_W = 240;
const MIN_H = 160;
const DEFAULT_W = 720;
const DEFAULT_H = 520;
const CASCADE = 28;

/** Ruhezeit, bevor ein Ziehen/Größenändern in die Einstellungen wandert (ms). */
const PERSIST_DELAY = 300;

// Der laufende Aufschub (nicht serialisierbar → außerhalb des States).
let persistTimer: ReturnType<typeof setTimeout> | null = null;
// Während des Wiederherstellens schreibt kein Zwischenschritt die Sitzung.
let restoring = false;

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
    restoredFolder: null,
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
    /**
     * Das aktive Fenster, sofern es eine App zeigt. Ein System-Fenster (der
     * Explorer) nimmt keine Wünsche entgegen — die Promptleiste legt dann eine
     * neue App an, statt an der Schale herumzuentwickeln.
     */
    activeAppId(): string | null {
      const id = this.activeId;
      const w = this.windows.find((win) => win.instanceId === id);
      return w && w.kind === 'app' ? id : null;
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

    /**
     * Öffnet eine Ansicht der Schale (Datei-Explorer) als Fenster: dieselben
     * Rechte wie ein App-Fenster, aber ohne App dahinter. Es gibt sie jeweils
     * nur einmal — ein zweites Öffnen holt das bestehende Fenster nach vorn.
     * Liefert null, wenn es die Ansicht nicht gibt.
     */
    openSystem(systemId: string): string | null {
      const info = systemWindow(systemId);
      if (!info) return null;
      const existing = this.windows.find((w) => w.systemId === systemId);
      if (existing) {
        this.focusWindow(existing.instanceId);
        return existing.instanceId;
      }
      return this.spawnWindow({
        kind: 'system',
        appId: null,
        systemId: info.id,
        title: info.title,
        icon: info.icon,
      });
    },

    /** Einzel-Modus: die laufende App verlassen und den Launcher zeigen. */
    showDesktop(): void {
      this.showingDesktop = true;
    },

    /** Legt ein App-Fenster an (Entwurf, wenn appId null ist). */
    spawn(appId: string | null, title: string, icon: string): string {
      return this.spawnWindow({ kind: 'app', appId, systemId: null, title, icon });
    },

    /** Ein neues Fenster: um eine Stufe versetzt, ganz vorn im Stapel. */
    spawnWindow(meta: Pick<DesktopWindow, 'kind' | 'appId' | 'systemId' | 'title' | 'icon'>): string {
      this.showingDesktop = false;
      this.seq += 1;
      const instanceId = `win-${this.seq}`;
      const step = (this.windows.length % 8) * CASCADE;
      this.windows.push({
        instanceId,
        ...meta,
        x: 40 + step,
        y: 40 + step,
        w: DEFAULT_W,
        h: DEFAULT_H,
        z: (this.nextZ += 1),
        minimized: false,
        maximized: false,
      });
      this.persistSession();
      return instanceId;
    },

    focusWindow(instanceId: string): void {
      const w = this.find(instanceId);
      if (!w) return;
      // Ein Fenster in den Vordergrund holen beendet die Desktop-Ansicht.
      this.showingDesktop = false;
      w.minimized = false;
      w.z = this.nextZ += 1;
      this.persistSession();
    },

    closeWindow(instanceId: string): void {
      this.windows = this.windows.filter((w) => w.instanceId !== instanceId);
      this.persistSession();
    },

    minimizeWindow(instanceId: string): void {
      const w = this.find(instanceId);
      if (!w) return;
      w.minimized = true;
      this.persistSession();
    },

    restoreWindow(instanceId: string): void {
      this.focusWindow(instanceId);
    },

    moveWindow(instanceId: string, x: number, y: number): void {
      const w = this.find(instanceId);
      if (!w) return;
      w.x = Math.max(0, Math.round(x));
      w.y = Math.max(0, Math.round(y));
      this.schedulePersistSession();
    },

    resizeWindow(instanceId: string, w: number, h: number): void {
      const win = this.find(instanceId);
      if (!win) return;
      win.w = Math.max(MIN_W, Math.round(w));
      win.h = Math.max(MIN_H, Math.round(h));
      this.schedulePersistSession();
    },

    /** Maximiert ein Fenster (füllt die Desktop-Fläche) bzw. stellt es wieder her. */
    toggleMaximize(instanceId: string): void {
      const w = this.find(instanceId);
      if (!w) return;
      w.maximized = !w.maximized;
      this.focusWindow(instanceId);
    },

    /** Zieht ein geändertes Icon in allen Fenstern dieser App nach (Titelleiste, Dock). */
    applyIcon(appId: string, icon: string): void {
      for (const w of this.windows) if (w.appId === appId) w.icon = icon;
    },

    /** Ein Entwurf wurde zur echten App: Id, Titel und Icon übernehmen. */
    setAppMeta(instanceId: string, appId: string, title: string, icon: string): void {
      const w = this.find(instanceId);
      if (!w) return;
      w.appId = appId;
      w.title = title;
      w.icon = icon;
      // Jetzt gibt es etwas zu merken: Der Entwurf liegt auf der Platte.
      this.persistSession();
    },

    /** Merkt die offenen Fenster für den nächsten Start (siehe core/session). */
    persistSession(): void {
      if (restoring) return;
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      useWorkspaceStore().saveSession(serializeSession(this.windows));
    },

    /**
     * Dasselbe nach kurzer Ruhe: Ziehen und Größenändern melden jeden
     * Mausschritt — gespeichert wird erst, wenn die Hand stillhält.
     */
    schedulePersistSession(): void {
      if (restoring) return;
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        persistTimer = null;
        this.persistSession();
      }, PERSIST_DELAY);
    },

    /**
     * Öffnet die gemerkte Sitzung des Verzeichnisses wieder: dieselben Fenster,
     * an derselben Stelle, in derselben Reihenfolge — der Fokus landet auf dem
     * zuletzt benutzten. Apps, die es nicht mehr gibt, bleiben weg; ohne
     * gemerkte Sitzung erscheint schlicht der Launcher.
     *
     * Geschieht einmal je Verzeichnis und erst, wenn dessen Apps gelesen sind —
     * vorher ließe sich nicht sagen, welche es noch gibt.
     */
    restoreSession(): void {
      const workspace = useWorkspaceStore();
      const folder = workspace.folder;
      if (!folder || this.restoredFolder === folder || workspace.apps.length === 0) return;
      this.restoredFolder = folder;

      const known = new Map(workspace.apps.map((a) => [a.id, a]));
      restoring = true;
      try {
        for (const saved of restorableSession(workspace.session, known.keys())) {
          const app = known.get(saved.appId)!;
          const instanceId = this.spawn(saved.appId, app.name, app.icon);
          const w = this.find(instanceId)!;
          w.x = saved.x;
          w.y = saved.y;
          w.w = Math.max(MIN_W, saved.w);
          w.h = Math.max(MIN_H, saved.h);
          w.maximized = saved.maximized;
          w.minimized = saved.minimized;
        }
      } finally {
        restoring = false;
      }
      // Einmal festhalten, was wirklich offen ist — verschwundene Apps sind
      // damit auch aus der gemerkten Sitzung heraus.
      this.persistSession();
    },
  },
});
