import { defineStore } from 'pinia';
import { useWorkspaceStore } from './workspace';
import { restorableSession, serializeSession } from '@/core/session';
import { restoreTiles, serializeTiles } from '@/core/tilelayout';
import { systemWindow } from '@/core/system';
import {
  computeRects,
  DEFAULT_GAP,
  hasLeaf,
  hitLeaf,
  insertLeaf,
  leafIds,
  ratioAtPoint,
  removeLeaf,
  setRatio,
  swapLeaves,
  type NodePath,
  type Point,
  type Rect,
  type TileTree,
} from '@/core/tiling';

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
  /**
   * Der Kachel-Baum je Arbeitsverzeichnis (siehe core/tiling). Gemerkt wird er
   * unter App bzw. Ansicht, nicht unter der Fenster-Id (siehe core/tilelayout).
   */
  tiles: Record<string, TileTree | null>;
  /** Die Fläche, auf der gekachelt wird — vom Desktop gemessen (Bühnen-Koordinaten). */
  tileArea: Rect;
  /** Wo die Bühne im Programmfenster liegt — damit werden Mauspunkte umgerechnet. */
  stageOrigin: Point;
  /** Das Fenster, das gerade an der Titelleiste auf eine andere Kachel getragen wird. */
  tileSwap: TileSwap | null;
}

/** Ein laufendes Tauschen: Wer getragen wird, und auf welcher Kachel er gerade schwebt. */
export interface TileSwap {
  id: string;
  targetId: string | null;
}

const MIN_W = 240;
const MIN_H = 160;
const DEFAULT_W = 720;
const DEFAULT_H = 520;
const CASCADE = 28;

/** Die Fuge zwischen zwei Kacheln (c0066 nimmt den Vorschlag aus core/tiling). */
export const TILE_GAP = DEFAULT_GAP;

/** Ohne gemessene Fläche gibt es nichts zu kacheln. */
const NO_AREA: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** Ruhezeit, bevor ein Ziehen/Größenändern in die Einstellungen wandert (ms). */
const PERSIST_DELAY = 300;

/** Unter welchem Schlüssel der Kachel-Baum liegt — je Arbeitsverzeichnis einer. */
function tileKey(): string {
  return useWorkspaceStore().folder ?? '';
}

// Der laufende Aufschub (nicht serialisierbar → außerhalb des States).
let persistTimer: ReturnType<typeof setTimeout> | null = null;
// Derselbe Aufschub für die Kachel-Anordnung (an der Fuge ziehen, c0067).
let tilesTimer: ReturnType<typeof setTimeout> | null = null;
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
    tiles: {},
    tileArea: { ...NO_AREA },
    stageOrigin: { x: 0, y: 0 },
    tileSwap: null,
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
     * Einzel-Modus, solange der Desktop davor liegt. Ziel der Fenster-Kürzel.
     */
    activeId(): string | null {
      if (this.showingDesktop && useWorkspaceStore().uiMode === 'single') return null;
      return this.focusedId;
    },
    /**
     * Das aktive Fenster, sofern es eine App zeigt. Ein System-Fenster (der
     * Explorer) nimmt keine Wünsche entgegen — es trägt gar keinen Chat, an der
     * Schale wird nicht herumentwickelt.
     */
    activeAppId(): string | null {
      const id = this.activeId;
      const w = this.windows.find((win) => win.instanceId === id);
      return w && w.kind === 'app' ? id : null;
    },

    /** Wird gerade gekachelt? Dann gibt der Baum die Geometrie vor, nicht die Maus. */
    tiling: (): boolean => useWorkspaceStore().uiMode === 'tiles',

    /** Der Kachel-Baum dieses Verzeichnisses — außerhalb des Kachel-Modus keiner. */
    tileTree(): TileTree | null {
      return this.tiling ? this.tiles[tileKey()] ?? null : null;
    },

    /**
     * Wohin jedes gekachelte Fenster gehört. Rein aus dem Baum gerechnet: Wer
     * hier steht, steht überschneidungsfrei und lückenlos in der Fläche — und
     * jede Änderung am Baum (oder an der Fläche) zeichnet die Fenster neu.
     */
    tileRects(): Record<string, Rect> {
      return computeRects(this.tileTree, this.tileArea, TILE_GAP);
    },
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
      // Wer den Brennpunkt hatte, gibt im Kachel-Modus seine Kachel her — das
      // muss vor dem Anlegen feststehen, das neue Fenster kommt ja nach vorn.
      const splitting = this.focusedId;
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
      this.syncTiles(splitting);
      this.persistSession();
      return instanceId;
    },

    focusWindow(instanceId: string): void {
      const w = this.find(instanceId);
      if (!w) return;
      // Ein minimiertes Fenster kommt zurück in den Verbund — und zwar dort
      // hinein, wo der Anwender gerade war.
      const splitting = this.focusedId;
      // Ein Fenster in den Vordergrund holen beendet die Desktop-Ansicht.
      this.showingDesktop = false;
      w.minimized = false;
      w.z = this.nextZ += 1;
      this.syncTiles(splitting);
      this.persistSession();
    },

    closeWindow(instanceId: string): void {
      this.windows = this.windows.filter((w) => w.instanceId !== instanceId);
      this.syncTiles();
      this.persistSession();
    },

    minimizeWindow(instanceId: string): void {
      const w = this.find(instanceId);
      if (!w) return;
      w.minimized = true;
      this.syncTiles();
      this.persistSession();
    },

    restoreWindow(instanceId: string): void {
      this.focusWindow(instanceId);
    },

    moveWindow(instanceId: string, x: number, y: number): void {
      // Im Kachel-Modus gibt der Baum den Platz vor — kein freies Verschieben.
      if (this.tiling) return;
      const w = this.find(instanceId);
      if (!w) return;
      w.x = Math.max(0, Math.round(x));
      w.y = Math.max(0, Math.round(y));
      this.schedulePersistSession();
    },

    resizeWindow(instanceId: string, w: number, h: number): void {
      // Dasselbe für die Größe: Sie fällt aus dem Baum ab (c0067 zieht an der Fuge).
      if (this.tiling) return;
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

    /**
     * Die Fläche melden, auf der gekachelt wird — der Desktop misst sie und
     * rechnet Dock und Fuge heraus. Ändert sie sich, rücken alle Kacheln nach.
     */
    setTileArea(area: Rect): void {
      const next = {
        x: Math.round(area.x),
        y: Math.round(area.y),
        w: Math.max(0, Math.round(area.w)),
        h: Math.max(0, Math.round(area.h)),
      };
      const a = this.tileArea;
      if (a.x === next.x && a.y === next.y && a.w === next.w && a.h === next.h) return;
      this.tileArea = next;
    },

    /**
     * Wo die Bühne im Programmfenster liegt. Die Maus meldet ihre Punkte im
     * Programmfenster, der Kachel-Baum rechnet in der Bühne — gemessen wird das
     * an einer Stelle (views/DesktopView), umgerechnet mit `stagePoint`.
     */
    setStageOrigin(origin: Point): void {
      const next = { x: Math.round(origin.x), y: Math.round(origin.y) };
      if (this.stageOrigin.x === next.x && this.stageOrigin.y === next.y) return;
      this.stageOrigin = next;
    },

    /** Ein Mauspunkt in Bühnen-Koordinaten — so, wie der Baum ihn versteht. */
    stagePoint(e: { clientX: number; clientY: number }): Point {
      return { x: e.clientX - this.stageOrigin.x, y: e.clientY - this.stageOrigin.y };
    },

    /**
     * An einer Fuge ziehen (c0067): Die Teilung am Pfad bekommt das Verhältnis,
     * das der Zeiger meint — begrenzt auf die Mindestgröße einer Kachel. Alle
     * Nachkommen rücken von selbst nach, denn ihre Rechtecke fallen aus dem Baum.
     */
    dragGap(path: NodePath, point: Point): void {
      const tree = this.tileTree;
      if (!tree) return;
      const ratio = ratioAtPoint(tree, path, point, this.tileArea, TILE_GAP);
      const next = setRatio(tree, path, ratio, this.tileArea, TILE_GAP);
      if (next === tree) return;
      this.tiles[tileKey()] = next;
      this.schedulePersistTiles();
    },

    /**
     * Ein Fenster an der Titelleiste aufnehmen, um es auf eine andere Kachel zu
     * tragen. Meldet, ob daraus etwas werden kann — außerhalb des Kachel-Modus
     * und ohne Platz im Baum gibt es nichts zu tauschen.
     */
    startTileSwap(id: string): boolean {
      if (!hasLeaf(this.tileTree, id)) return false;
      this.tileSwap = { id, targetId: null };
      return true;
    },

    /** Zielen: die Kachel unter dem Zeiger — die eigene zählt nicht als Ziel. */
    aimTileSwap(point: Point): void {
      const swap = this.tileSwap;
      if (!swap) return;
      const hit = hitLeaf(this.tileTree, point, this.tileArea, TILE_GAP);
      swap.targetId = hit && hit !== swap.id ? hit : null;
    },

    /** Loslassen: über einer fremden Kachel tauschen die beiden die Plätze. */
    dropTileSwap(): void {
      const swap = this.tileSwap;
      this.tileSwap = null;
      if (!swap?.targetId) return;
      const tree = this.tileTree;
      const next = swapLeaves(tree, swap.id, swap.targetId);
      if (next === tree) return;
      this.tiles[tileKey()] = next;
      this.persistTiles();
    },

    /** Abbrechen, ohne zu tauschen (das Fenster geht mitten im Zug fort). */
    cancelTileSwap(): void {
      this.tileSwap = null;
    },

    /**
     * Bringt den Kachel-Baum mit den offenen Fenstern zur Deckung: Was fehlt,
     * kommt hinein — es teilt die Kachel mit dem Brennpunkt (`splitting`, sonst
     * die gerade vorderste) —, was nicht mehr da ist (geschlossen oder ins Dock
     * minimiert), fällt heraus und seine Schwester erbt den Platz.
     *
     * Das ist der einzige Weg, auf dem der Baum sich ändert: Öffnen, Schließen,
     * Minimieren und Wiederherstellen rufen ihn selbst; der Desktop tut es beim
     * Wechsel in den Kachel-Modus, um die schon offenen Fenster zu kacheln.
     * Außerhalb des Kachel-Modus geschieht nichts — der Baum eines Verzeichnisses
     * bleibt liegen, bis der Anwender zurückwechselt.
     */
    syncTiles(splitting: string | null = null): void {
      if (!this.tiling) return;
      const open = this.windows.filter((w) => !w.minimized).map((w) => w.instanceId);
      let tree = this.tiles[tileKey()] ?? null;
      for (const id of leafIds(tree)) if (!open.includes(id)) tree = removeLeaf(tree, id);
      let focus = splitting ?? this.focusedId;
      for (const id of open) {
        if (hasLeaf(tree, id)) continue;
        tree = insertLeaf(tree, focus, id, this.tileArea, TILE_GAP);
        // Reihenweise Aufnahme (beim Wechsel in den Modus): Jedes weitere
        // Fenster teilt das zuletzt aufgenommene — daraus wird die Spirale.
        focus = id;
      }
      this.tiles[tileKey()] = tree;
      this.persistTiles();
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
     * Merkt die Kachel-Anordnung für den nächsten Start (siehe core/tilelayout):
     * denselben Baum, aber unter App bzw. Ansicht statt unter der Fenster-Id.
     * Ein Entwurf, der noch keine App ist, fällt dabei heraus.
     */
    persistTiles(): void {
      if (restoring) return;
      if (tilesTimer) {
        clearTimeout(tilesTimer);
        tilesTimer = null;
      }
      useWorkspaceStore().saveTileLayout(serializeTiles(this.tiles[tileKey()] ?? null, this.windows));
    },

    /** Dasselbe nach kurzer Ruhe — das Ziehen an der Fuge meldet jeden Mausschritt. */
    schedulePersistTiles(): void {
      if (restoring) return;
      if (tilesTimer) clearTimeout(tilesTimer);
      tilesTimer = setTimeout(() => {
        tilesTimer = null;
        this.persistTiles();
      }, PERSIST_DELAY);
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
     * zuletzt benutzten. Auch die Ansichten der Schale (Dateien, Einstellungen)
     * kommen so zurück. Apps, die es nicht mehr gibt, bleiben weg; ohne
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
          const instanceId = saved.appId
            ? this.spawn(saved.appId, known.get(saved.appId)!.name, known.get(saved.appId)!.icon)
            : this.openSystem(saved.systemId!)!;
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
      // Erst die gemerkte Anordnung auf die zurückgeholten Fenster legen …
      this.restoreTileLayout();
      // … dann den Kachel-Verbund geradeziehen: Die Fenster kamen mit ihrem
      // gemerkten Zustand zurück — auch minimierte, die dabei am
      // Fenstermanager vorbei gesetzt wurden —, und was in der Anordnung fehlt,
      // wird jetzt aufgenommen.
      this.syncTiles();
      // Einmal festhalten, was wirklich offen ist — verschwundene Apps sind
      // damit auch aus der gemerkten Sitzung und aus der Anordnung heraus.
      this.persistSession();
      this.persistTiles();
    },

    /**
     * Legt die gemerkte Kachel-Anordnung auf die wiederhergestellten Fenster:
     * Aus jedem Schlüssel wird das Fenster, das ihn trägt. Eine App, die es
     * nicht mehr gibt, fällt heraus — ihre Schwester erbt den Platz, es bleibt
     * also keine leere Kachel. Der Baum wird auch außerhalb des Kachel-Modus
     * gelegt: Wechselt der Anwender später auf Kacheln, steht die Anordnung.
     */
    restoreTileLayout(): void {
      const saved = useWorkspaceStore().tileLayout;
      if (!saved) return;
      this.tiles[tileKey()] = restoreTiles(saved, this.windows);
    },
  },
});
