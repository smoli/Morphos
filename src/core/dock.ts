/**
 * Rein: was im Dock steht und in welcher Reihenfolge.
 *
 * Wie am Schreibtisch: zuerst die Apps, die der Anwender dort behält (siehe
 * core/favorites), dahinter alles, was gerade läuft und nicht ohnehin schon
 * dort steht — jedes Fenster genau einmal. Eine behaltene App, die läuft, rückt
 * nicht ans Ende, sie bekommt nur ihren Laufpunkt.
 *
 * Fenster ohne App (der frische Entwurf, der Datei-Explorer) stehen als
 * laufende Fenster mit dabei — sonst wäre ein minimiertes von ihnen nirgends
 * mehr zu erreichen. Behalten lassen sie sich nicht: Nur eine App im
 * Verzeichnis kann ein Liebling sein.
 *
 * Das feste ＋ („Neue App“) gehört nicht hierher — es ist kein Fenster und
 * keine App, der Desktop stellt es unverrückbar vor diese Liste.
 */

/** Was das Dock von einer App des Verzeichnisses wissen muss. */
export interface DockApp {
  id: string;
  name: string;
  icon: string;
}

/** Was das Dock von einem offenen Fenster wissen muss. */
export interface DockWindow {
  instanceId: string;
  /** Die gezeigte App — null bei einem Entwurf oder einem System-Fenster. */
  appId: string | null;
  title: string;
  icon: string;
  minimized: boolean;
}

/** Ein Platz im Dock. */
export interface DockEntry {
  /** Eindeutig in der Liste: die App-Id, sonst die Fenster-Id. */
  key: string;
  /** Die App dahinter — null bei einem Fenster ohne App. */
  appId: string | null;
  /** Das offene Fenster; null, wenn die App nur wartet (behalten, aber nicht offen). */
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
 * Die Plätze des Docks: Lieblinge in ihrer Reihenfolge, dahinter die übrigen
 * laufenden Fenster in ihrer. Titel und Icon kommen aus dem Verzeichnis, sofern
 * es die App kennt — dort stehen sie am frischesten.
 */
export function dockEntries(
  apps: readonly DockApp[],
  windows: readonly DockWindow[],
  favorites: readonly string[],
): DockEntry[] {
  const byId = new Map(apps.map((a) => [a.id, a]));
  // Ein Fenster je App — mehr gibt es nicht (openApp holt das bestehende vor).
  const openOf = new Map<string, DockWindow>();
  for (const w of windows) if (w.appId && !openOf.has(w.appId)) openOf.set(w.appId, w);

  const entries: DockEntry[] = [];
  const placed = new Set<string>();

  for (const appId of favorites) {
    const app = byId.get(appId);
    // Eine gelöschte App bleibt manchmal in den Einstellungen zurück.
    if (!app || placed.has(appId)) continue;
    placed.add(appId);
    entries.push(entry(appId, openOf.get(appId) ?? null, app, true));
  }

  for (const w of windows) {
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
    instanceId: win?.instanceId ?? null,
    title: app?.name ?? win!.title,
    icon: app?.icon ?? win!.icon,
    running: win !== null,
    minimized: win?.minimized ?? false,
    favorite,
  };
}
