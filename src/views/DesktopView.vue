<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useDesktopStore } from '@/stores/desktop';
import { useAgentsStore } from '@/stores/agents';
import { useNotificationsStore } from '@/stores/notifications';
import { useAppWindow } from '@/stores/app';
import { useSetAppIcon } from '@/composables/useSetAppIcon';
import AppWindow from '@/components/AppWindow.vue';
import SystemWindow from '@/components/SystemWindow.vue';
import BusyDot from '@/components/BusyDot.vue';
import AppIcon from '@/components/AppIcon.vue';
import IconDialog from '@/components/IconDialog.vue';
import ImportAppDialog from '@/components/ImportAppDialog.vue';
import PublishAppDialog from '@/components/PublishAppDialog.vue';
import GitLogo from '@/components/GitLogo.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import LauncherOverlay from '@/components/LauncherOverlay.vue';
import TileGaps from '@/components/TileGaps.vue';
import SwitcherOverlay from '@/components/SwitcherOverlay.vue';
import {
  isSwitcherChord,
  isSwitcherRelease,
  isTypingTarget,
  matchShortcut,
  shortcutKeys,
  type ShortcutId,
} from '@/core/shortcuts';
import { canSwitch, cycleSelection, switcherOrder } from '@/core/switcher';
import { SETTINGS_ID, SYSTEM_WINDOWS } from '@/core/system';
import { wallpaperCss } from '@/core/wallpaper';
import { dockBackgroundCss, dockBlurCss } from '@/core/transparency';
import { dockEntries, dockRevealed, type DockEntry } from '@/core/dock';
import { dockInsets, insetVars, workArea } from '@/core/workarea';
import type { MenuItem } from '@/core/menu';
import { remoteBadge, syncState, type RemoteBadge } from '@/core/remote';
import type { DesktopWindow } from '@/stores/desktop';
import {
  arrangeIcons,
  CELL_H,
  clampPos,
  DRAG_THRESHOLD,
  layoutHeight,
  PAD,
  TILE_H,
  TILE_W,
  type Bounds,
} from '@/core/arrange';
import type { Rect } from '@/core/tiling';
import type { AppSummary, IconPos, ImportChoice, ImportCollision, ImportResult } from '@/types';

const workspace = useWorkspaceStore();
const desktop = useDesktopStore();
const agents = useAgentsStore();
const notifications = useNotificationsStore();
const setAppIcon = useSetAppIcon();

const singleMode = computed(() => workspace.uiMode === 'single');
// Kachel-Modus (c0066): Die Fenster liegen lückenlos nebeneinander, ihr
// Zuschnitt kommt aus dem Teilungsbaum (stores/desktop → core/tiling).
const tilesMode = computed(() => workspace.uiMode === 'tiles');

// Im Einzel-Modus wird nur das aktive Fenster (Vollbild) gezeigt — oder gar
// keines, solange der Anwender über „← Desktop“ beim Launcher ist.
const activeWindow = computed(() =>
  desktop.windows.find((w) => w.instanceId === desktop.activeId) ?? null,
);

/** Womit ein Fenster gezeichnet wird — eine erzeugte App oder eine Ansicht der Schale. */
function surfaceFor(w: DesktopWindow) {
  return w.kind === 'system' ? SystemWindow : AppWindow;
}

/**
 * Ist dieses Fenster gerade zu sehen? Im Einzel-Modus nur das aktive, sonst
 * jedes, das nicht minimiert wartet.
 *
 * Ausgeblendet heißt hier ausdrücklich NICHT abgebaut: Ein Fenster, das den
 * Renderer verlässt (oder auch nur im DOM umgehängt wird), nimmt sein iframe
 * mit — und ein wieder eingehängtes iframe lädt sein Dokument von vorn. Die
 * laufende App verlöre damit bei jedem Fensterwechsel ihren Zustand (i0005).
 * Darum steht jedes Fenster fest an seinem Platz; den Stapel macht der
 * z-index des Rahmens (siehe components/WindowFrame).
 */
function visible(w: DesktopWindow): boolean {
  return singleMode.value ? w.instanceId === desktop.activeId : !w.minimized;
}

// Das Dock: die festen Knöpfe (Suchen, ＋, aus Git holen) und dahinter, was
// core/dock aufstellt — die Ansichten
// der Schale (Dateien, Einstellungen), die behaltenen Apps und die laufenden
// Fenster. Im Einzel-Modus verdeckt es die Vollbild-App nicht: Dort erscheint
// es nur auf dem Desktop selbst.
const dock = computed<DockEntry[]>(() =>
  dockEntries(workspace.apps, desktop.windows, workspace.favoriteIds, SYSTEM_WINDOWS),
);
const dockVisible = computed(() => !singleMode.value || !activeWindow.value);
// Die festen Plätze stehen vorn; dahinter setzt ein Strich die Apps ab.
const systemCount = SYSTEM_WINDOWS.length;

// An welchem Rand die Leiste steht (c0063) — unten wie am Mac, oder an einer
// Seite bzw. oben. Der Rand steht als Klasse an der Leiste und an ihrem
// Randstreifen; alles Weitere ist Sache des Stylesheets.
const dockEdge = computed(() => workspace.dockEdge);

/**
 * Steht die Leiste fest im Bild? Nur dann gehört ihr ein Rand: Ausgeblendet
 * (c0062) legt sie sich beim Herankommen über die Fenster, und im Einzel-Modus
 * ist sie vor der Vollbild-App gar nicht da.
 */
const dockFixed = computed(() => dockVisible.value && !workspace.dockAutohide);

/**
 * Was die feste Leiste vom Bildschirm wegnimmt (i0006) — und was den Fenstern
 * bleibt, die die Fläche füllen: die Kacheln (unten) und der vollflächige
 * Rahmen, der die Ränder als angeschriebene Werte der Bühne liest
 * (components/WindowFrame).
 */
const insets = computed(() => dockInsets(dockEdge.value, dockFixed.value));
const work = computed<Rect>(() => workArea(stageSize.value, insets.value));
const workVars = computed(() => insetVars(insets.value));

/**
 * Die Icon-Kacheln fangen oben links an — eine Leiste links oder oben verdeckte
 * darum sofort die ersten. Steht das Dock nicht unten (dort lag es seit c0052
 * über den Icons und liegt es weiterhin) und legt es sich auch nicht aus dem
 * Weg, rückt die Icon-Fläche an diesem Rand um die Breite der Leiste ein.
 */
const deskReserve = computed(() =>
  dockFixed.value && dockEdge.value !== 'bottom' ? `reserve-${dockEdge.value}` : null,
);

// Ausblenden (c0062): Sagen die Einstellungen es, liegt das Dock unter dem
// unteren Rand und kommt erst hervor, wenn der Zeiger dort ankommt — auf dem
// Randstreifen (.dock-zone) oder auf der Leiste selbst. Aufgebaut bleibt es
// dabei; es rückt nur aus dem Bild.
const dockNear = ref(false);
const dockFocus = ref(false);
const dockShown = computed(() =>
  dockRevealed(
    workspace.dockAutohide,
    dockNear.value,
    // Was die Leiste festhält: die Tastatur darin — oder das Menü eines Platzes,
    // das sonst über einer weggezogenen Leiste stünde.
    dockFocus.value || menu.value?.fromDock === true,
  ),
);

/** Arbeitet ein Agent für diesen Dock-Platz (für seine App oder sein Fenster)? */
function dockBusy(entry: DockEntry): boolean {
  if (entry.appId) return agents.isBusy(entry.appId);
  return entry.instanceId ? agents.isWindowBusy(entry.instanceId, null) : false;
}

/**
 * Klick auf einen Dock-Platz: Das Fenster kommt nach vorn (und zurück, wenn es
 * minimiert wartet); eine behaltene App oder eine Ansicht der Schale, die nicht
 * läuft, wird geöffnet. Ein zweiter Klick minimiert bewusst NICHT — hier ist
 * nur der Weg hin.
 */
function openDockEntry(entry: DockEntry): void {
  if (entry.instanceId) {
    desktop.focusWindow(entry.instanceId);
    return;
  }
  if (entry.systemId) {
    openSystem(entry.systemId);
    return;
  }
  const app = workspace.apps.find((a) => a.id === entry.appId);
  if (app) launchApp(app);
}

/**
 * Chat und Entwurf gehören dem Fenster, nicht dem Desktop (siehe
 * components/AppWindow) — hier gibt es nur die beiden Wege, die von außen
 * kommen: das Tastenkürzel des aktiven Fensters und Escape.
 */
const activeStore = computed(() => (desktop.activeAppId ? useAppWindow(desktop.activeAppId) : null));

/**
 * Escape räumt das ab, was über der App des aktiven Fensters liegt — zuerst der
 * Entwurf, dann der Chat, immer nur eines je Druck (von oben nach unten).
 * Meldet, ob es etwas abzuräumen gab.
 */
function closeActiveOverlay(): boolean {
  const store = activeStore.value;
  if (store?.designOpen) {
    store.closeDesign();
    return true;
  }
  if (store?.composerOpen) {
    store.closeComposer();
    return true;
  }
  return false;
}

// ---- Anordnung der Kacheln (frei abgelegt, sonst Raster — siehe core/arrange) ----

const stage = ref<HTMLElement | null>(null);
const launcher = ref<HTMLElement | null>(null);
/** Die Bühne — der ganze Bildschirm, aus dem die Arbeitsfläche geschnitten wird. */
const stageSize = ref<Bounds>({ w: 0, h: 0 });
/**
 * Die Icon-Fläche: Ihre Größe begrenzt, wohin eine Kachel gezogen werden darf.
 * Sie ist bereits um ein Dock eingerückt, das links, rechts oder oben steht
 * (`deskReserve`) — unten liegt die Leiste über ihr wie seit c0052.
 */
const bounds = ref<Bounds>({ w: 0, h: 0 });

/**
 * Die Flächen messen: die Bühne (daraus wird die Arbeitsfläche der Fenster) und
 * die Icon-Fläche. Dazu, wo die Bühne im Programmfenster liegt: Die Maus meldet
 * ihre Punkte dort, der Kachel-Baum rechnet aber in der Bühne (c0067 zieht an
 * der Fuge und tauscht Kacheln).
 */
function measure(): void {
  const el = launcher.value;
  const stageEl = stage.value;
  stageSize.value = stageEl ? { w: stageEl.clientWidth, h: stageEl.clientHeight } : { w: 0, h: 0 };
  if (!el) {
    bounds.value = { w: 0, h: 0 };
    desktop.setStageOrigin({ x: 0, y: 0 });
    return;
  }
  bounds.value = { w: el.clientWidth, h: el.clientHeight };
  const box = el.getBoundingClientRect();
  desktop.setStageOrigin({ x: box.left - el.offsetLeft, y: box.top - el.offsetTop });
}

/**
 * Worauf gekachelt wird: die Arbeitsfläche, ringsum um eine Fuge eingerückt —
 * so steht zwischen zwei Kacheln genau so viel Luft wie zum Rand hin. Wie weit
 * die Fuge ist, sagen die Einstellungen (c0072); wird sie geschoben, rückt
 * darum auch der Rand mit.
 */
const tileArea = computed<Rect>(() => ({
  x: work.value.x + desktop.tileGap,
  y: work.value.y + desktop.tileGap,
  w: Math.max(0, work.value.w - 2 * desktop.tileGap),
  h: Math.max(0, work.value.h - 2 * desktop.tileGap),
}));

// Der Baum rechnet in dieser Fläche: Sie ändert sich mit dem Programmfenster
// und mit dem Dock, und die Kacheln rücken dann nach.
watch(tileArea, (area) => desktop.setTileArea(area), { immediate: true });

// Beim Wechsel in den Kachel-Modus kommt, was schon offen ist, in den Verbund;
// alles Weitere treiben die Fenster-Aktionen selbst (stores/desktop).
watch(() => workspace.uiMode, () => desktop.syncTiles());

// Die Fläche gehört ganz den Apps — das ＋ steht im Dock, kein Rasterplatz ist
// mehr vergeben.
const layout = computed(() =>
  arrangeIcons(workspace.apps.map((a) => a.id), workspace.iconLayout, bounds.value),
);
// Beim Ziehen folgt die Kachel der Maus, bevor die Position gemerkt ist.
const positions = computed<Record<string, IconPos>>(() =>
  dragId.value && dragPos.value ? { ...layout.value, [dragId.value]: dragPos.value } : layout.value,
);
// Die Fläche reicht bis unter die tiefste Kachel (sonst fehlt der Rollbereich).
const surfaceHeight = computed(() => `${layoutHeight(positions.value)}px`);
const hintTop = computed(() => `${PAD + CELL_H}px`);

function tileStyle(pos: IconPos | undefined) {
  return {
    left: `${pos?.x ?? 0}px`,
    top: `${pos?.y ?? 0}px`,
    width: `${TILE_W}px`,
    height: `${TILE_H}px`,
  };
}

// Die Kachel unter dem Mauszeiger (oder mit der Tastatur angesteuert): Nur sie
// zeigt ihre Nebensachen — die Versionszahl —, sonst bleibt das Icon ein Icon.
const hoverId = ref<string | null>(null);

function leaveTile(appId: string): void {
  if (hoverId.value === appId) hoverId.value = null;
}

const dragId = ref<string | null>(null);
const dragPos = ref<IconPos | null>(null);
let dragStart: { x: number; y: number; base: IconPos } | null = null;
let moved = false;
// Nach einem Ziehen kommt noch der Klick des Loslassens — er darf die App nicht
// öffnen. Das nächste Drücken auf eine Kachel setzt die Sperre wieder zurück,
// damit sie nicht hängen bleibt, wenn der Klick woanders landet.
let swallowClick = false;

function startTileDrag(e: MouseEvent, appId: string): void {
  if (e.button !== 0) return;
  swallowClick = false;
  moved = false;
  dragId.value = appId;
  dragStart = { x: e.clientX, y: e.clientY, base: layout.value[appId] ?? { x: 0, y: 0 } };
  window.addEventListener('mousemove', onTileDrag);
  window.addEventListener('mouseup', endTileDrag);
}

function onTileDrag(e: MouseEvent): void {
  if (!dragStart) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  // Ein Wackler beim Klicken ist noch kein Ziehen.
  if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
  moved = true;
  dragPos.value = clampPos({ x: dragStart.base.x + dx, y: dragStart.base.y + dy }, bounds.value);
}

function endTileDrag(): void {
  window.removeEventListener('mousemove', onTileDrag);
  window.removeEventListener('mouseup', endTileDrag);
  const appId = dragId.value;
  const pos = dragPos.value;
  dragId.value = null;
  dragPos.value = null;
  dragStart = null;
  swallowClick = moved;
  if (moved && appId && pos) workspace.setIconPosition(appId, pos);
  moved = false;
}

/** Aufräumen: alle Kacheln dieses Verzeichnisses zurück ins Raster. */
function tidy(): void {
  workspace.resetIconPositions();
}

// Die Fläche ändert sich nicht nur mit dem Programmfenster, darum beobachten
// wir sie, wo der Browser es anbietet.
let observer: ResizeObserver | null = null;

onMounted(async () => {
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', closeSwitcher);
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(measure);
    // Beide Flächen: Die Bühne wächst mit dem Programmfenster, die Icon-Fläche
    // rückt zusätzlich ein, wenn das Dock den Rand wechselt.
    if (stage.value) observer.observe(stage.value);
    if (launcher.value) observer.observe(launcher.value);
  }
  await workspace.refresh();
  // Erst mit den gelesenen Apps lässt sich die Sitzung wiederherstellen: Nur
  // Fenster, deren App es noch gibt, kommen zurück.
  desktop.restoreSession();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('resize', measure);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', closeSwitcher);
  window.removeEventListener('mousemove', onTileDrag);
  window.removeEventListener('mouseup', endTileDrag);
});

function openApp(app: AppSummary): void {
  if (swallowClick) {
    swallowClick = false;
    return;
  }
  launchApp(app);
}
function launchApp(app: AppSummary): void {
  desktop.openApp(app.id, { title: app.name, icon: app.icon });
}
function newApp(): void {
  desktop.openDraft();
}
/** Eine Ansicht der Schale öffnen (Dateien, Einstellungen) — jeweils nur einmal. */
function openSystem(systemId: string): void {
  desktop.openSystem(systemId);
}
/**
 * Schreibt die Titelseite einer App in ihren Ordner (c0077) — Icon, Name, ein
 * Satz aus ihrem Konzept, ihre Dokumente, der Morphos-Stand. Nur, wenn noch
 * keine dasteht: Ein vorhandenes Readme bleibt unangetastet, das sagt ein
 * Hinweis (c0080).
 */
async function createReadme(id: string, name: string): Promise<void> {
  const res = await workspace.createReadme(id);
  if (res.existed) notifications.info(`„${name}“ hat schon ein Readme — es bleibt, wie es ist.`);
  else if (res.ok) notifications.success(`Readme für „${name}“ geschrieben.`);
  else notifications.error(res.error ?? 'Das Readme konnte nicht geschrieben werden.');
}

// ---- Abgleich mit der Gegenstelle (c0082) ----

/**
 * Schiebt die neuen Versionen einer App zur Gegenstelle. Was dabei nicht geht —
 * die Gegenstelle ist weiter, kein Zugang, kein Netz —, sagt eine Meldung; das
 * Repository bleibt in jedem Fall, wie es war.
 */
async function pushApp(app: AppSummary): Promise<void> {
  const res = await workspace.pushApp(app.id);
  if (res.ok) notifications.success(`„${app.name}“ steht jetzt so auf der Gegenstelle.`);
  else notifications.error(`„${app.name}“: ${res.error ?? 'Das Schieben ist nicht gelungen.'}`);
}

/**
 * Holt den Stand der Gegenstelle und spult die App darauf vor. Zwei Dinge
 * gehören dazu:
 *
 * - Arbeitet gerade ein Agent für diese App, wird NICHT gezogen: Er schreibt in
 *   denselben Ordner und committet am Ende — ein Vorspulen mittendrin brächte
 *   beide durcheinander. (Die Warteschlange steht hier in der Schale, darum
 *   fragt die Schale und nicht der Hauptprozess.)
 * - Danach steht etwas anderes auf der Platte, als das offene Fenster zeigt:
 *   Es lädt den neuen Stand nach — wie nach einem Lauf ohne Fenster
 *   (stores/agents afterRun).
 */
async function pullApp(app: AppSummary): Promise<void> {
  if (agents.isBusy(app.id)) {
    notifications.error(`Für „${app.name}“ arbeitet gerade ein Agent — erst danach ziehen.`);
    return;
  }
  const res = await workspace.pullApp(app.id);
  if (!res.ok) {
    notifications.error(`„${app.name}“: ${res.error ?? 'Das Ziehen ist nicht gelungen.'}`);
    return;
  }
  notifications.success(`„${app.name}“ ist auf dem Stand der Gegenstelle.`);
  await reloadOpenWindows(app.id);
}

// ---- Eine eigene App veröffentlichen (c0083) ----

// Eine App ohne Gegenstelle lässt sich nicht teilen. Veröffentlichen heißt:
// einmalig ein `origin` eintragen und die Historie hinüberschieben. Die Adresse
// eines LEEREN Repositories gibt der Anwender an — angelegt wird es dort von
// ihm, nicht von Morphos (kein API-Schlüssel im Haus).
const publishTarget = ref<AppSummary | null>(null);
const publishBusy = ref(false);
const publishError = ref<string | null>(null);

function openPublish(app: AppSummary): void {
  publishTarget.value = app;
  publishBusy.value = false;
  publishError.value = null;
}

function closePublish(): void {
  if (publishBusy.value) return;
  publishTarget.value = null;
  publishError.value = null;
}

/**
 * Trägt die Gegenstelle ein und schiebt zum ersten Mal. Gelingt es, ist die App
 * von nun an eine ganz gewöhnliche mit Gegenstelle (Push/Pull, c0082) und der
 * Dialog verschwindet. Gelingt es nicht, bleibt er stehen und sagt, woran es
 * lag — die App ist dann unverändert ohne Gegenstelle.
 */
async function submitPublish(url: string): Promise<void> {
  const app = publishTarget.value;
  if (!app) return;
  publishBusy.value = true;
  publishError.value = null;
  const res = await workspace.publishApp(app.id, url);
  publishBusy.value = false;
  if (!res.ok) {
    publishError.value = res.error ?? 'Das Veröffentlichen ist nicht gelungen.';
    return;
  }
  publishTarget.value = null;
  notifications.success(`„${app.name}“ ist veröffentlicht — ab jetzt geht es mit Push und Pull.`);
}

/** Lädt die offenen Fenster einer App neu — auf der Platte steht ein neuer Stand. */
async function reloadOpenWindows(appId: string): Promise<void> {
  const folder = workspace.folder;
  if (!folder) return;
  for (const w of desktop.windows.filter((win) => win.appId === appId)) {
    const store = useAppWindow(w.instanceId);
    if (await store.open(folder, appId)) {
      desktop.setAppMeta(w.instanceId, appId, store.name, store.icon);
    }
  }
}

async function removeApp(id: string, name: string): Promise<void> {
  if (!confirm(`App „${name}“ wirklich löschen?`)) return;
  const open = desktop.windows.find((w) => w.appId === id);
  if (open) desktop.closeWindow(open.instanceId);
  await workspace.removeApp(id);
}

// ---- Tastatur: Kürzel und Fensterwechsler (siehe core/shortcuts, core/switcher) ----

// Die Auswahl des Wechslers, eingefroren beim Öffnen; null heißt: zu.
const switcherList = ref<DesktopWindow[]>([]);
const switcherIndex = ref<number | null>(null);

function onKeyDown(e: KeyboardEvent): void {
  // Escape bricht den Wechsler ab — auch aus einem Eingabefeld heraus.
  if (switcherIndex.value !== null && e.key === 'Escape') {
    e.preventDefault();
    closeSwitcher();
    return;
  }
  // Escape schließt Entwurf bzw. Chat des aktiven Fensters — auch aus seinem
  // Eingabefeld heraus. Ist das Startmenü offen, gehört Escape zuerst ihm.
  if (e.key === 'Escape' && !searchOpen.value && closeActiveOverlay()) {
    e.preventDefault();
    return;
  }
  // Wo getippt wird (Chat, Suchfeld, laufende App), gilt kein Kürzel.
  if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;

  if (isSwitcherChord(e)) {
    e.preventDefault();
    stepSwitcher(e.shiftKey ? -1 : 1);
    return;
  }
  const id = matchShortcut(e);
  if (!id) return;
  e.preventDefault();
  runShortcut(id);
}

function onKeyUp(e: KeyboardEvent): void {
  if (switcherIndex.value === null || !isSwitcherRelease(e)) return;
  pickFromSwitcher(switcherList.value[switcherIndex.value]?.instanceId);
}

function runShortcut(id: ShortcutId): void {
  const active = desktop.activeId;
  switch (id) {
    case 'launcher':
      searchOpen.value = true;
      break;
    case 'new-app':
      newApp();
      break;
    case 'settings':
      openSystem(SETTINGS_ID);
      break;
    case 'close-window':
      if (active) desktop.closeWindow(active);
      break;
    case 'minimize-window':
      if (active) desktop.minimizeWindow(active);
      break;
    case 'maximize-window':
      if (active) desktop.toggleMaximize(active);
      break;
    case 'composer':
      // Ohne App im Vordergrund gibt es nichts zu bereden — dafür gibt es „Neue App“.
      activeStore.value?.toggleComposer();
      break;
    case 'design':
      // Der Entwurf gehört einer App; ohne eine im Vordergrund gibt es keinen.
      void activeStore.value?.toggleDesign();
      break;
  }
}

/**
 * Ein Tab bei gehaltener Strg/⌘-Taste: Beim ersten Mal öffnet sich die Auswahl
 * beim aktuellen Fenster (0) und rückt sofort eine Stelle weiter — genau wie am
 * Schreibtisch landet man damit beim zuletzt benutzten anderen Fenster.
 */
function stepSwitcher(delta: number): void {
  if (switcherIndex.value === null) {
    const list = switcherOrder(desktop.windows);
    if (!canSwitch(list.length)) return;
    switcherList.value = list;
    switcherIndex.value = 0;
  }
  switcherIndex.value = cycleSelection(switcherIndex.value, delta, switcherList.value.length);
}

function closeSwitcher(): void {
  switcherIndex.value = null;
  switcherList.value = [];
}

/** Loslassen (oder Klick): das gewählte Fenster nach vorn holen. */
function pickFromSwitcher(instanceId: string | undefined): void {
  closeSwitcher();
  if (instanceId) desktop.focusWindow(instanceId);
}

// ---- Startmenü: eine App tippend finden (siehe components/LauncherOverlay) ----

const searchOpen = ref(false);

// Die Ansichten der Schale stehen im Startmenü neben den Apps.
const systemItems = computed(() =>
  SYSTEM_WINDOWS.map((s) => ({ id: s.id, name: s.title, icon: s.icon })),
);

/** Aus der Suche heraus öffnen: laufende Apps kommen nur nach vorn (openApp). */
function openFromSearch(appId: string): void {
  searchOpen.value = false;
  const app = workspace.apps.find((a) => a.id === appId);
  if (app) desktop.openApp(app.id, { title: app.name, icon: app.icon });
}

function systemFromSearch(systemId: string): void {
  searchOpen.value = false;
  openSystem(systemId);
}

function newFromSearch(): void {
  searchOpen.value = false;
  newApp();
}

// ---- App aus einem Git-Repository holen (c0074) ----

// Jede Morphos-App ist ein Repository: Teilen heißt pushen, Holen heißt
// klonen. Der Dialog fragt nur nach der Adresse und — wenn die Id hier schon
// vergeben ist — nach dem Weg; geklont, geprüft und eingeordnet wird im
// Hauptprozess (core/appimport).
const importOpen = ref(false);
const importBusy = ref(false);
const importError = ref<string | null>(null);
const importCollision = ref<ImportCollision | null>(null);

function openImport(): void {
  importOpen.value = true;
  importBusy.value = false;
  importError.value = null;
  importCollision.value = null;
}

function closeImport(): void {
  importOpen.value = false;
  importCollision.value = null;
  importError.value = null;
}

/** Ist die App da, verschwindet der Dialog und der Desktop meldet sie. */
function afterImport(res: ImportResult): void {
  importBusy.value = false;
  if (res.ok) {
    closeImport();
    notifications.success(`„${res.name}“ wurde geholt.`);
    return;
  }
  if (res.cancelled) {
    closeImport();
    return;
  }
  importCollision.value = res.collision ?? null;
  importError.value = res.error ?? null;
}

async function startImport(url: string): Promise<void> {
  importBusy.value = true;
  importError.value = null;
  afterImport(await workspace.importApp(url));
}

/** Die Antwort auf eine belegte Id — Ersetzen ist unwiederbringlich, also mit Rückfrage. */
async function chooseImport(choice: ImportChoice): Promise<void> {
  const pending = importCollision.value;
  if (!pending) return;
  if (
    choice === 'replace' &&
    !confirm(`App „${pending.existingName}“ samt ihrer Historie durch „${pending.name}“ ersetzen?`)
  ) {
    return;
  }
  importBusy.value = true;
  importError.value = null;
  afterImport(await workspace.resolveImport(pending.token, choice));
}

// ---- Icon einer App ändern (Dialog von der Kachel aus) ----
const iconAppId = ref<string | null>(null);
const iconApp = computed<AppSummary | null>(
  () => workspace.apps.find((a) => a.id === iconAppId.value) ?? null,
);

async function applyIcon(icon: string | null): Promise<void> {
  const id = iconAppId.value;
  if (!id) return;
  if (await setAppIcon(id, icon)) iconAppId.value = null;
}

// ---- Das Zeichen der Gegenstelle an der Kachel (c0082) ----

/**
 * Was an der Kachel steht: `⇅`, solange nicht nachgesehen wurde, sonst die
 * Zählung des LETZTEN Holens (`↑2`, `↓3`, `↑2↓3`, `✓`). Nachgesehen wird beim
 * Aufklappen des Kachelmenüs und vor jedem Schieben und Ziehen — nie von
 * selbst. Eine App ohne Gegenstelle trägt gar nichts.
 */
function tileBadge(app: AppSummary): RemoteBadge | null {
  if (!app.hasRemote) return null;
  return remoteBadge(workspace.remoteOf(app.id) ?? { hasRemote: true });
}

/** Der Tooltip dazu, um den Zeitpunkt des letzten Holens ergänzt. */
function tileBadgeTitle(app: AppSummary): string {
  const badge = tileBadge(app);
  if (!badge) return '';
  const fetchedAt = workspace.remoteOf(app.id)?.fetchedAt;
  if (!fetchedAt) return badge.title;
  return `${badge.title} (Stand: ${new Date(fetchedAt).toLocaleTimeString()})`;
}

// ---- Kontextmenü: die Aktionen einer App (siehe components/ContextMenu) ----

// Was gerade aufgeklappt ist: die Stelle, die Einträge und die gemeinte App.
// `fromDock` merkt sich, dass es am Dock hängt — ein ausgeblendetes Dock bleibt
// so stehen, solange sein Menü offen ist (c0062).
const menu = ref<
  { x: number; y: number; appId: string; items: MenuItem[]; fromDock?: boolean } | null
>(null);

/** Der Eintrag „im Dock behalten“ — er kennt beide Richtungen. */
function dockItem(appId: string): MenuItem {
  return workspace.isFavorite(appId)
    ? { id: 'undock', label: 'Aus dem Dock entfernen', icon: '📌' }
    : { id: 'dock', label: 'Im Dock behalten', icon: '📌' };
}

/**
 * Rechtsklick auf eine Kachel: alles, was sich mit dieser App tun lässt. Eine
 * App mit Gegenstelle bekommt zusätzlich „Push" und „Pull" (c0082) — und beim
 * Aufklappen wird dort nachgesehen, wie sie zur Gegenstelle steht. Das ist eine
 * der wenigen Stellen, an denen Morphos von sich aus ans Netz geht; im
 * Hintergrund tut es das nie. Eine App OHNE Gegenstelle bekommt stattdessen das
 * Veröffentlichen (c0083): Sie hat noch keine, also gibt es dort auch nichts
 * nachzusehen — geholt wird für sie nicht.
 */
function openIconMenu(e: MouseEvent, app: AppSummary): void {
  const sync: MenuItem[] = app.hasRemote
    ? [
        { id: 'push', label: 'Push', icon: '↑', separator: true },
        { id: 'pull', label: 'Pull', icon: '↓' },
      ]
    : [{ id: 'publish', label: 'App veröffentlichen…', icon: '⇪', separator: true }];
  menu.value = {
    x: e.clientX,
    y: e.clientY,
    appId: app.id,
    items: [
      { id: 'open', label: 'Öffnen', icon: '↗' },
      { id: 'icon', label: 'Icon ändern', icon: '⚙' },
      { id: 'readme', label: 'Readme erstellen', icon: '📄' },
      ...sync,
      { ...dockItem(app.id), separator: sync.length > 0 },
      { id: 'delete', label: 'Löschen', icon: '🗑', danger: true, separator: true },
    ],
  };
  if (app.hasRemote) void workspace.refreshRemote(app.id);
}

/**
 * Rechtsklick im Dock: dort geht es nur ums Behalten. Ein Platz ohne App — der
 * Entwurf, die Ansichten der Schale — hat nichts zu behalten und bekommt kein
 * Menü: Dateien und Einstellungen stehen ohnehin immer im Dock.
 */
function openDockMenu(e: MouseEvent, entry: DockEntry): void {
  if (!entry.appId) return;
  menu.value = {
    x: e.clientX,
    y: e.clientY,
    appId: entry.appId,
    items: [dockItem(entry.appId)],
    fromDock: true,
  };
}

function onMenuPick(id: string): void {
  const picked = menu.value;
  menu.value = null;
  if (!picked) return;
  const app = workspace.apps.find((a) => a.id === picked.appId) ?? null;
  switch (id) {
    case 'open':
      if (app) launchApp(app);
      break;
    case 'icon':
      iconAppId.value = picked.appId;
      break;
    case 'readme':
      if (app) void createReadme(app.id, app.name);
      break;
    case 'push':
      if (app) void pushApp(app);
      break;
    case 'pull':
      if (app) void pullApp(app);
      break;
    case 'publish':
      if (app) openPublish(app);
      break;
    case 'dock':
    case 'undock':
      workspace.toggleFavorite(picked.appId);
      break;
    case 'delete':
      if (app) void removeApp(app.id, app.name);
      break;
  }
}
</script>

<template>
  <div class="desktop">
    <!-- Die Bühne schreibt an, welche Ränder die feste Leiste für sich behält
         (i0006) — daran hält sich, was die Fläche füllt. -->
    <div ref="stage" class="stage" :style="workVars">
      <!-- Der Hintergrund: liegt unter allem und nimmt keine Klicks an. -->
      <div class="wallpaper" :style="{ background: wallpaperCss(workspace.wallpaper) }" aria-hidden="true"></div>

      <!-- Launcher: Icons der Apps (liegt hinter den Fenstern). Jede Kachel
           liegt dort, wo der Anwender sie abgelegt hat — sonst im Raster. -->
      <div ref="launcher" class="launcher" :class="deskReserve">
        <div class="desk-tools">
          <button
            v-if="workspace.hasIconLayout"
            type="button"
            class="tool tidy"
            title="Kacheln wieder ins Raster legen"
            @click="tidy"
          >
            ⌗ Aufräumen
          </button>
        </div>

        <div class="icons" :style="{ minHeight: surfaceHeight }">
          <div
            v-for="app in workspace.apps"
            :key="app.id"
            class="tile-wrap"
            :class="{ dragging: dragId === app.id }"
            :style="tileStyle(positions[app.id])"
            @mouseenter="hoverId = app.id"
            @mouseleave="leaveTile(app.id)"
            @focusin="hoverId = app.id"
            @focusout="leaveTile(app.id)"
          >
            <button
              type="button"
              class="tile"
              @mousedown="startTileDrag($event, app.id)"
              @click="openApp(app)"
              @contextmenu.prevent="openIconMenu($event, app)"
              :title="app.name"
            >
              <AppIcon class="icon" :icon="app.icon" :size="48" />
              <span class="name">{{ app.name }}</span>
              <span v-if="hoverId === app.id" class="meta">{{ app.versions }} Version(en)</span>
            </button>
            <!-- Der Stand gegenüber der Gegenstelle, vom letzten Holen (c0082). -->
            <span
              v-if="tileBadge(app)"
              class="tile-remote"
              :class="`state-${syncState(workspace.remoteOf(app.id))}`"
              :title="tileBadgeTitle(app)"
            >{{ tileBadge(app)!.text }}</span>
            <BusyDot v-if="agents.isBusy(app.id)" class="tile-busy" />
          </div>
          <p v-if="!workspace.loading && workspace.apps.length === 0" class="hint" :style="{ top: hintTop }">
            Noch keine Apps in diesem Verzeichnis. Klick auf das ＋ im Dock — im Chat des neuen
            Fensters beschreibst du dann, was deine erste App sein soll.
          </p>
        </div>
      </div>

      <!-- Fenster-Ebene: jedes offene Fenster steht hier, ein Leben lang an
           derselben Stelle im DOM. Was gerade nicht zu sehen ist — minimiert,
           oder im Einzel-Modus nicht das aktive —, wird nur ausgeblendet. -->
      <div class="windows-layer">
        <component
          :is="surfaceFor(w)"
          v-for="w in desktop.windows"
          v-show="visible(w)"
          :key="w.instanceId"
          :win="w"
          :single="singleMode"
          :tiled="tilesMode"
        />
      </div>

      <!-- Die Griffe an den Fugen zwischen den Kacheln (c0067) — sie liegen
           über den Fenstern, nehmen aber nur an den Fugen selbst Klicks an. -->
      <TileGaps v-if="tilesMode" />

      <!-- Startmenü: liegt über allem auf der Bühne, auch über den Fenstern. -->
      <LauncherOverlay
        v-if="searchOpen"
        :apps="workspace.apps"
        :systems="systemItems"
        @close="searchOpen = false"
        @open="openFromSearch"
        @system="systemFromSearch"
        @new="newFromSearch"
      />

      <!-- Fensterwechsler, solange Strg/⌘ + Tab gehalten wird. -->
      <SwitcherOverlay
        v-if="switcherIndex !== null"
        :windows="switcherList"
        :index="switcherIndex"
        @pick="pickFromSwitcher"
      />

      <!-- Der Randstreifen, an dem ein ausgeblendetes Dock hervorkommt. Er ist
           nur da, wenn er gebraucht wird, und liegt unter der Leiste. -->
      <div
        v-if="dockVisible && workspace.dockAutohide"
        class="dock-zone"
        :class="`edge-${dockEdge}`"
        aria-hidden="true"
        @mouseenter="dockNear = true"
        @mouseleave="dockNear = false"
      ></div>

      <!-- Das Dock: Suchen, ＋, aus Git holen, die Ansichten der Schale, die
           behaltenen Apps und was gerade läuft (core/dock). -->
      <div
        v-if="dockVisible"
        class="dock"
        :class="[`edge-${dockEdge}`, { hidden: !dockShown }]"
        :style="{
          background: dockBackgroundCss(workspace.dockTransparency),
          '--dock-blur': dockBlurCss(workspace.dockBlur),
        }"
        @mouseenter="dockNear = true"
        @mouseleave="dockNear = false"
        @focusin="dockFocus = true"
        @focusout="dockFocus = false"
      >
        <!-- Ganz vorn das Startmenü (c0076): Apps tippend finden gehört ins
             Dock, nicht als fester Knopf auf die Fläche. -->
        <button
          type="button"
          class="dock-item search"
          :title="`Apps suchen (${shortcutKeys('launcher')})`"
          @click="searchOpen = true"
        >
          <span class="dock-glyph">🔍</span>
        </button>
        <button
          type="button"
          class="dock-item new"
          :title="`Neue App (${shortcutKeys('new-app')})`"
          @click="newApp"
        >
          <span class="dock-glyph">＋</span>
        </button>
        <!-- Neben dem ＋: eine App, die es schon gibt, aus ihrem Repository
             holen (c0074) — geteilt wird eine App, indem sie gepusht wird. -->
        <button
          type="button"
          class="dock-item import"
          title="App aus Git laden…"
          @click="openImport"
        >
          <!-- Das Git-Logo selbst, nicht ein Pfeil: Der Platz ist an dem zu
               erkennen, woher die App kommt (c0078). -->
          <GitLogo class="dock-glyph" :size="28" />
        </button>
        <span v-if="dock.length" class="dock-sep" aria-hidden="true"></span>
        <template v-for="(entry, i) in dock" :key="entry.key">
          <!-- Ein Strich zwischen den festen Plätzen und den Apps. -->
          <span v-if="i === systemCount" class="dock-sep" aria-hidden="true"></span>
          <button
            type="button"
            class="dock-item"
            :class="{ running: entry.running, system: !!entry.systemId }"
            :title="entry.title"
            @click="openDockEntry(entry)"
            @contextmenu.prevent="openDockMenu($event, entry)"
          >
            <AppIcon class="dock-glyph" :icon="entry.icon" :size="34" />
            <span class="dock-name">{{ entry.title }}</span>
            <BusyDot v-if="dockBusy(entry)" class="dock-busy" />
            <span v-if="entry.running" class="dock-dot" aria-hidden="true"></span>
          </button>
        </template>
      </div>
    </div>

    <!-- „App aus Git laden…“ — Adresse, Fortschritt und die Rückfrage bei
         belegter Id (c0074). -->
    <ImportAppDialog
      v-if="importOpen"
      :busy="importBusy"
      :error="importError"
      :collision="importCollision"
      @close="closeImport"
      @submit="startImport"
      @choose="chooseImport"
    />

    <!-- „App veröffentlichen…“ — die Adresse eines leeren Repositories für eine
         App, die bisher nur hier liegt (c0083). -->
    <PublishAppDialog
      v-if="publishTarget"
      :app-name="publishTarget.name"
      :busy="publishBusy"
      :error="publishError"
      @close="closePublish"
      @submit="submitPublish"
    />

    <IconDialog
      v-if="iconApp"
      :name="iconApp.name"
      :icon="iconApp.icon"
      :custom="iconApp.iconCustom"
      @close="iconAppId = null"
      @apply="applyIcon"
    />

    <!-- Das Kontextmenü einer Kachel bzw. eines Dock-Eintrags — über allem. -->
    <ContextMenu
      v-if="menu"
      :items="menu.items"
      :x="menu.x"
      :y="menu.y"
      @pick="onMenuPick"
      @close="menu = null"
    />
  </div>
</template>

<style scoped>
/* Die Fläche gehört ganz dem Desktop — der Chat sitzt in seinem Fenster. */
.desktop {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
/* Der gewählte Hintergrund — hinter Kacheln und Fenstern, ohne sie zu stören. */
.wallpaper {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.launcher {
  position: absolute;
  inset: 0;
  overflow: auto;
}
/*
 * Platz für ein Dock, das nicht unten steht (c0063): Die Kacheln fangen oben
 * links an, eine Leiste links oder oben verdeckte darum sofort die ersten. Wie
 * viel Platz sie nimmt, steht an der Bühne (core/workarea) — dieselbe Zahl, an
 * die sich auch die Fenster halten. Am unteren Rand bleibt es für die Icons beim
 * Alten: Dort liegt das Dock seit c0052 über ihrer Fläche.
 */
.launcher.reserve-left {
  left: var(--work-left);
}
.launcher.reserve-right {
  right: var(--work-right);
}
.launcher.reserve-top {
  top: var(--work-top);
}
/* Die Fläche, auf der die Kacheln liegen — jede an ihrer eigenen Stelle. */
.icons {
  position: relative;
  min-height: 100%;
}
.windows-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
/* Werkzeuge des Desktops — Aufräumen, sobald es etwas aufzuräumen gibt. Das
   Suchen steht seit c0076 im Dock, nicht mehr fest auf der Fläche. */
.desk-tools {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 3;
  display: flex;
  gap: 8px;
}
.tool {
  background: rgba(20, 22, 28, 0.8);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 10px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}
.tool:hover {
  border-color: var(--accent);
  color: var(--text);
}
.tile-wrap {
  position: absolute;
}
/* Die gezogene Kachel liegt über den anderen. */
.tile-wrap.dragging {
  z-index: 2;
}
.tile-wrap.dragging .tile {
  cursor: grabbing;
  opacity: 0.75;
}
/*
 * Ein Schreibtisch-Symbol, kein Kärtchen: kein Rahmen, kein Grund — nur die
 * Glyphe mit dem Namen darunter (c0055).
 */
.tile {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  background: none;
  border: none;
  color: var(--text);
  border-radius: 12px;
  cursor: grab;
  padding: 14px 4px;
  /* Beim Ziehen soll kein Text markiert werden. */
  user-select: none;
}
.tile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.icon {
  font-size: 48px;
  line-height: 1;
  /* Auch eine helle Glyphe hebt sich so von jedem Hintergrund ab. */
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.55));
}
/*
 * Der Name liegt ohne Kachel direkt auf dem Hintergrund — über einem hellen
 * Bild bliebe heller Text sonst unlesbar. Ein schmaler dunkler Schleier plus
 * harter Schatten trägt ihn über jedem Hintergrund (c0041).
 */
.name {
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(10, 12, 16, 0.55);
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
/* Nebensache, nur beim Überfahren — und außerhalb des Flusses, damit beim
   Erscheinen nichts springt. */
.meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  font-size: 11px;
  color: var(--muted);
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
/*
 * Der Stand gegenüber der Gegenstelle (c0082) — rechts oben an der Kachel,
 * gegenüber der Arbeitsanzeige. Er ist Auskunft, kein Knopf: Geschoben und
 * gezogen wird über das Kontextmenü.
 */
.tile-remote {
  position: absolute;
  top: 8px;
  right: 6px;
  padding: 1px 5px;
  border-radius: 8px;
  background: rgba(10, 12, 16, 0.6);
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
  pointer-events: auto;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
.tile-remote.state-ahead,
.tile-remote.state-behind {
  color: var(--accent);
}
.tile-remote.state-diverged {
  color: #f0a35e;
}
/* Arbeitsanzeige der Kachel — links oben, neben der Glyphe. */
.tile-busy {
  position: absolute;
  top: 10px;
  left: 10px;
}
.hint {
  position: absolute;
  left: 24px;
  right: 24px;
  color: var(--muted);
  text-align: center;
  font-size: 14px;
}
/*
 * Das Dock wie am Mac: eine schwebende Leiste, so groß wie ihr Inhalt, mittig
 * an einem Rand. Es trägt nur Glyphen — der Name kommt beim Überfahren.
 *
 * An welchem Rand sie steht, sagen die Einstellungen (c0063): unten wie seit
 * c0052, an einer der beiden Seiten oder oben. Was der Rand ändert, steht
 * gebündelt in den `.edge-…`-Regeln weiter unten — hier steht nur, was überall
 * gilt.
 *
 * Farbe und Schleier hier sind nur der Rückfall: Wie durchsichtig die Leiste ist
 * und wie dicht ihr Milchglas, sagen die Einstellungen (core/transparency) —
 * oben als `background` und als `--dock-blur` angeschrieben.
 */
.dock {
  position: absolute;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(20, 22, 28, 0.5);
  backdrop-filter: var(--dock-blur, blur(14px));
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  z-index: 10000;
  /*
   * Nicht rollen: Die Namensblasen liegen unsichtbar über den Icons und ragen
   * aus der Leiste heraus — eine rollbare Leiste zeigte dafür dauerhaft einen
   * Balken, selbst wenn nur das ＋ dasteht (i0004). Wird es eng, bricht das
   * Dock stattdessen in eine zweite Reihe um.
   */
  overflow: visible;
  transition: transform 0.18s ease, opacity 0.18s ease;
}
/*
 * Ausgeblendet (c0062): Die Leiste zieht sich über ihren Rand hinaus und nimmt
 * dort keine Klicks mehr an — anzufassen ist nur noch der Randstreifen. Sie
 * bleibt aber aufgebaut: So findet die Tastatur hinein (focusin holt sie
 * hervor), und ihre Fenster behalten ihren Zustand. Wohin sie sich legt, sagt
 * der jeweilige Rand (die `transform` unten).
 */
.dock.hidden {
  opacity: 0;
  pointer-events: none;
}
/* Unten (die Vorgabe): quer, mittig, die Glyphen auf der Grundlinie. */
.dock.edge-bottom {
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  align-items: flex-end;
  max-width: 92%;
}
.dock.edge-bottom.hidden {
  transform: translate(-50%, calc(100% + 20px));
}
/* Oben: dieselbe quere Leiste, nur hängt sie unter dem oberen Rand. */
.dock.edge-top {
  left: 50%;
  top: 14px;
  transform: translateX(-50%);
  align-items: flex-start;
  max-width: 92%;
}
.dock.edge-top.hidden {
  transform: translate(-50%, calc(-100% - 20px));
}
/*
 * An den Seiten steht die Leiste hochkant: Die Glyphen stapeln sich, und was
 * nicht mehr in die Höhe passt, bricht in eine zweite Spalte um (darum begrenzt
 * hier die Höhe, nicht die Breite).
 */
.dock.edge-left,
.dock.edge-right {
  top: 50%;
  transform: translateY(-50%);
  flex-direction: column;
  align-items: center;
  max-height: 92%;
}
.dock.edge-left {
  left: 14px;
}
.dock.edge-left.hidden {
  transform: translate(calc(-100% - 20px), -50%);
}
.dock.edge-right {
  right: 14px;
}
.dock.edge-right.hidden {
  transform: translate(calc(100% + 20px), -50%);
}
/*
 * Der Streifen, an dem das ausgeblendete Dock hervorkommt — am selben Rand wie
 * die Leiste. Er überlappt sie um ein paar Bildpunkte (sie sitzt 14 px vom Rand)
 * — sonst gäbe es dazwischen eine Lücke, in der sie sich sofort wieder hinlegte.
 * Die Leiste liegt darüber, ihr z-index ist höher.
 */
.dock-zone {
  position: absolute;
  z-index: 9999;
}
.dock-zone.edge-bottom,
.dock-zone.edge-top {
  left: 0;
  right: 0;
  height: 18px;
}
.dock-zone.edge-bottom {
  bottom: 0;
}
.dock-zone.edge-top {
  top: 0;
}
.dock-zone.edge-left,
.dock-zone.edge-right {
  top: 0;
  bottom: 0;
  width: 18px;
}
.dock-zone.edge-left {
  left: 0;
}
.dock-zone.edge-right {
  right: 0;
}
/* Das feste ＋ steht vor den Apps, abgesetzt durch einen Strich. */
.dock-sep {
  align-self: stretch;
  width: 1px;
  margin: 4px 2px;
  background: var(--border);
  flex: none;
}
.dock-item {
  position: relative;
  flex: none;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text);
  border-radius: 12px;
  padding: 0;
  cursor: pointer;
  /* Wie am Mac wächst das Icon unter dem Zeiger — von unten her. */
  transition: transform 0.12s ease;
  transform-origin: bottom center;
}
.dock-item:hover,
.dock-item:focus-visible {
  transform: scale(1.18);
  outline: none;
}
/* Die Lupe steht so groß da wie die Icons neben ihr (c0076). */
.dock-item.search .dock-glyph {
  font-size: 26px;
  line-height: 1;
}
.dock-item.new .dock-glyph {
  font-size: 30px;
  line-height: 1;
  color: var(--muted);
}
.dock-item.new:hover .dock-glyph {
  color: var(--text);
}
/* Der Name schwebt beim Überfahren über dem Icon — sonst ist er nicht da. */
.dock-name {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  max-width: 180px;
  padding: 3px 8px;
  border-radius: 8px;
  background: rgba(10, 12, 16, 0.92);
  border: 1px solid var(--border);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.1s ease;
}
.dock-item:hover .dock-name,
.dock-item:focus-visible .dock-name {
  opacity: 1;
}
/* Der Laufpunkt: Diese App ist offen (auch, wenn sie minimiert wartet). */
.dock-dot {
  position: absolute;
  bottom: 1px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}
/* Die Arbeitsanzeige sitzt oben rechts auf dem Icon. */
.dock-busy {
  position: absolute;
  top: 2px;
  right: 2px;
}
/*
 * Was der Rand an den Plätzen ändert (c0063): Alles, was am unteren Rand nach
 * oben zeigt — der wachsende Platz, die Namensblase, der Laufpunkt —, dreht
 * sich mit der Leiste zum Bild hin. Sonst wüchse ein Icon aus dem Bild heraus
 * und seine Blase stünde außerhalb.
 */
.dock.edge-top .dock-item {
  transform-origin: top center;
}
.dock.edge-left .dock-item {
  transform-origin: center left;
}
.dock.edge-right .dock-item {
  transform-origin: center right;
}
/* Hochkant trennt ein Strich quer, nicht längs. */
.dock.edge-left .dock-sep,
.dock.edge-right .dock-sep {
  width: auto;
  height: 1px;
}
.dock.edge-top .dock-name {
  bottom: auto;
  top: 100%;
  margin-bottom: 0;
  margin-top: 8px;
}
.dock.edge-left .dock-name,
.dock.edge-right .dock-name {
  bottom: auto;
  top: 50%;
  transform: translateY(-50%);
  margin-bottom: 0;
}
.dock.edge-left .dock-name {
  left: 100%;
  margin-left: 8px;
}
.dock.edge-right .dock-name {
  left: auto;
  right: 100%;
  margin-right: 8px;
}
/* Der Laufpunkt bleibt am Rand des Bildschirms — wie unten auch. */
.dock.edge-top .dock-dot {
  bottom: auto;
  top: 1px;
}
.dock.edge-left .dock-dot,
.dock.edge-right .dock-dot {
  bottom: auto;
  top: 50%;
  transform: translateY(-50%);
}
.dock.edge-left .dock-dot {
  left: 1px;
}
.dock.edge-right .dock-dot {
  left: auto;
  right: 1px;
}
</style>
