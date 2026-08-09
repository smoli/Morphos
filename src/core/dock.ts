/**
 * Rein: was im Dock steht und in welcher Reihenfolge.
 *
 * Wie am Schreibtisch: ganz vorn die Ansichten der Schale (Dateien,
 * Einstellungen — siehe core/system), die immer dort stehen; dahinter die Apps,
 * die der Anwender dort behält (siehe core/favorites); zuletzt alles, was
 * gerade läuft und nicht ohnehin schon dort steht — jedes Fenster genau einmal.
 * Eine behaltene App, die läuft, rückt nicht ans Ende, sie bekommt nur ihren
 * Laufpunkt; dasselbe gilt für eine geöffnete Ansicht der Schale.
 *
 * Übrige Fenster ohne App (der frische Entwurf) stehen als laufende Fenster mit
 * dabei — sonst wäre ein minimiertes von ihnen nirgends mehr zu erreichen.
 * Behalten lassen sie sich nicht: Nur eine App im Verzeichnis kann ein Liebling
 * sein, und die Ansichten der Schale sind ohnehin immer da.
 *
 * Das feste ＋ („Neue App“) gehört nicht hierher — es ist kein Fenster und
 * keine App, der Desktop stellt es unverrückbar vor diese Liste.
 *
 * Am Ende steht dazu, ob das Dock sich **aus dem Weg legt** (c0062): das
 * Ausblenden, das je Arbeitsverzeichnis gemerkt wird (siehe stores/workspace),
 * und die Frage, ob die Leiste gerade zu sehen ist — und an welchem **Rand** sie
 * überhaupt steht (c0063).
 */

import type { DockEdge } from '@/types';

/** Was das Dock von einer App des Verzeichnisses wissen muss. */
export interface DockApp {
  id: string;
  name: string;
  icon: string;
}

/** Was das Dock von einer Ansicht der Schale wissen muss (siehe core/system). */
export interface DockSystem {
  id: string;
  title: string;
  icon: string;
}

/** Was das Dock von einem offenen Fenster wissen muss. */
export interface DockWindow {
  instanceId: string;
  /** Die gezeigte App — null bei einem Entwurf oder einem System-Fenster. */
  appId: string | null;
  /** Die gezeigte Ansicht der Schale — null bei einer App oder einem Entwurf. */
  systemId: string | null;
  title: string;
  icon: string;
  minimized: boolean;
}

/** Ein Platz im Dock. */
export interface DockEntry {
  /** Eindeutig in der Liste: die Ansicht (`sys:`…), die App-Id, sonst die Fenster-Id. */
  key: string;
  /** Die App dahinter — null bei einem Fenster ohne App. */
  appId: string | null;
  /** Die Ansicht der Schale dahinter — null bei einer App oder einem Entwurf. */
  systemId: string | null;
  /** Das offene Fenster; null, wenn der Platz nur wartet (behalten/fest, aber nicht offen). */
  instanceId: string | null;
  title: string;
  icon: string;
  running: boolean;
  /** Läuft, wartet aber minimiert (nur mit `running`). */
  minimized: boolean;
  /** Steht hier, weil der Anwender die App im Dock behält. */
  favorite: boolean;
}

/**
 * Die Plätze des Docks: die Ansichten der Schale, dahinter die Lieblinge in
 * ihrer Reihenfolge, dahinter die übrigen laufenden Fenster in ihrer. Titel und
 * Icon kommen aus dem Verzeichnis bzw. von der Schale, sofern sie den Platz
 * kennen — dort stehen sie am frischesten.
 */
export function dockEntries(
  apps: readonly DockApp[],
  windows: readonly DockWindow[],
  favorites: readonly string[],
  systems: readonly DockSystem[] = [],
): DockEntry[] {
  const byId = new Map(apps.map((a) => [a.id, a]));
  // Ein Fenster je App bzw. je Ansicht — mehr gibt es nicht (openApp/openSystem
  // holen das bestehende vor).
  const openOf = new Map<string, DockWindow>();
  const openSys = new Map<string, DockWindow>();
  for (const w of windows) {
    if (w.appId && !openOf.has(w.appId)) openOf.set(w.appId, w);
    if (w.systemId && !openSys.has(w.systemId)) openSys.set(w.systemId, w);
  }

  const entries: DockEntry[] = [];
  const placed = new Set<string>();
  // Fenster, die schon einen festen Platz haben, kommen unten nicht noch einmal.
  const placedWindows = new Set<string>();

  for (const sys of systems) {
    const win = openSys.get(sys.id) ?? null;
    if (win) placedWindows.add(win.instanceId);
    entries.push({
      // Eigener Namensraum: Eine App darf „explorer“ heißen, ohne zu kollidieren.
      key: `sys:${sys.id}`,
      appId: null,
      systemId: sys.id,
      instanceId: win?.instanceId ?? null,
      title: sys.title,
      icon: sys.icon,
      running: win !== null,
      minimized: win?.minimized ?? false,
      favorite: false,
    });
  }

  for (const appId of favorites) {
    const app = byId.get(appId);
    // Eine gelöschte App bleibt manchmal in den Einstellungen zurück.
    if (!app || placed.has(appId)) continue;
    placed.add(appId);
    entries.push(entry(appId, openOf.get(appId) ?? null, app, true));
  }

  for (const w of windows) {
    if (placedWindows.has(w.instanceId)) continue;
    const key = w.appId ?? w.instanceId;
    if (placed.has(key)) continue;
    placed.add(key);
    entries.push(entry(w.appId, w, w.appId ? byId.get(w.appId) ?? null : null, false));
  }
  return entries;
}

function entry(
  appId: string | null,
  win: DockWindow | null,
  app: DockApp | null,
  favorite: boolean,
): DockEntry {
  return {
    key: appId ?? win!.instanceId,
    appId,
    // Eine Ansicht, die die Schale nicht (mehr) führt, steht hier als bloßes
    // Fenster — ihre Kennung bleibt trotzdem sichtbar.
    systemId: win?.systemId ?? null,
    instanceId: win?.instanceId ?? null,
    title: app?.name ?? win!.title,
    icon: app?.icon ?? win!.icon,
    running: win !== null,
    minimized: win?.minimized ?? false,
    favorite,
  };
}

/**
 * Legt sich das Dock aus dem Weg, solange der Anwender es nicht ruft? Von Haus
 * aus nicht: Die Leiste steht, wie sie seit c0052 stand.
 */
export const DEFAULT_DOCK_AUTOHIDE = false;

/**
 * Tütet eine gemerkte Entscheidung ein: Zurück kommt nur ein Ja oder ein Nein —
 * sonst null (dann gilt die Vorgabe).
 */
export function cleanAutohide(raw: unknown): boolean | null {
  return typeof raw === 'boolean' ? raw : null;
}

/**
 * Die gemerkten Entscheidungen auf brauchbare Einträge eintüten — beschädigte
 * fallen weg (dort gilt dann die Vorgabe). Wird vom Hauptprozess beim Lesen und
 * Schreiben der Einstellungen angewandt.
 */
export function cleanAutohides(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = cleanAutohide(value);
    if (clean !== null) out[folder] = clean;
  }
  return out;
}

/**
 * Ist das Dock gerade zu sehen? Ohne Ausblenden immer. Mit ihm nur, solange der
 * Zeiger unten am Rand oder auf der Leiste steht (`near`) — oder solange etwas
 * darin die Aufmerksamkeit hält (`held`): die Tastatur ist hineingegangen, oder
 * das Kontextmenü eines Platzes steht offen. Sonst zöge die Leiste sich unter
 * dem eigenen Menü weg.
 */
export function dockRevealed(autohide: boolean, near: boolean, held: boolean): boolean {
  return !autohide || near || held;
}

/**
 * Wo das Dock stehen kann (c0063), in der Reihenfolge, in der die Einstellungen
 * die Ränder anbieten — mit der Aufschrift, unter der der Anwender sie kennt.
 * Der erste Eintrag ist die Vorgabe.
 */
export const DOCK_EDGES: readonly { id: DockEdge; label: string }[] = [
  { id: 'bottom', label: 'Unten' },
  { id: 'left', label: 'Links' },
  { id: 'right', label: 'Rechts' },
  { id: 'top', label: 'Oben' },
];

/** Wo das Dock steht, solange der Anwender nichts anderes sagt: unten (c0052). */
export const DEFAULT_DOCK_EDGE: DockEdge = 'bottom';

/**
 * Tütet einen gemerkten (oder gerade gewählten) Rand ein: Zurück kommt nur einer
 * der vier — sonst null (dann gilt die Vorgabe).
 */
export function cleanDockEdge(raw: unknown): DockEdge | null {
  return DOCK_EDGES.some((e) => e.id === raw) ? (raw as DockEdge) : null;
}

/**
 * Die gemerkten Ränder auf brauchbare Einträge eintüten — beschädigte fallen weg
 * (dort gilt dann die Vorgabe). Wird vom Hauptprozess beim Lesen und Schreiben
 * der Einstellungen angewandt.
 */
export function cleanDockEdges(raw: unknown): Record<string, DockEdge> {
  const out: Record<string, DockEdge> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = cleanDockEdge(value);
    if (clean !== null) out[folder] = clean;
  }
  return out;
}
