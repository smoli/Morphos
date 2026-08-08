/**
 * Framework-unabhängige Logik der Suchleiste („Startmenü“) des Launchers.
 *
 * Der Anwender tippt, die Liste schmilzt zusammen, ↑/↓ wandern durch die
 * Treffer. Hier steht nur, WAS bei einem Suchtext gefunden wird und in welcher
 * Reihenfolge — das Overlay selbst (components/LauncherOverlay) zeichnet es.
 *
 * „Neue App“ ist dabei ein Eintrag wie jeder andere: Sie lässt sich ertippen
 * und mit der Eingabetaste öffnen, bleibt unter gleich guten Treffern aber
 * hinten — gesucht wird in aller Regel eine vorhandene App.
 */

/**
 * Wofür ein Eintrag steht: eine App des Verzeichnisses, eine Ansicht der Schale
 * (etwa „Dateien“) oder ein neuer Entwurf.
 */
export type LauncherKind = 'app' | 'system' | 'new';

/** Ein Eintrag der Trefferliste. */
export interface LauncherItem {
  /** App-Id bzw. Kennung der Schalen-Ansicht — für „Neue App“ NEW_APP_ID. */
  id: string;
  name: string;
  icon: string;
  kind: LauncherKind;
}

/** Was der Launcher über eine App wissen muss (AppSummary passt darauf). */
export interface LauncherApp {
  id: string;
  name: string;
  icon: string;
}

export const NEW_APP_ID = '__neue-app__';
export const NEW_APP_NAME = 'Neue App';
export const NEW_APP_ICON = '＋';

/**
 * Die Apps des Verzeichnisses als Einträge, dahinter die Ansichten der Schale
 * (Dateien) und ganz am Ende „Neue App“.
 */
export function launcherItems(
  apps: readonly LauncherApp[],
  systems: readonly LauncherApp[] = [],
): LauncherItem[] {
  return [
    ...apps.map((a) => ({ id: a.id, name: a.name, icon: a.icon, kind: 'app' as const })),
    ...systems.map((s) => ({ id: s.id, name: s.name, icon: s.icon, kind: 'system' as const })),
    { id: NEW_APP_ID, name: NEW_APP_NAME, icon: NEW_APP_ICON, kind: 'new' as const },
  ];
}

/**
 * Vergleichsform eines Namens: kleingeschrieben, ohne Akzente, ohne Ränder —
 * „Übungsplan“ soll auch finden, wer „ubung“ tippt.
 */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Ein Zeichen, hinter dem ein neues Wort beginnt. */
const BOUNDARY = /[\s\-_/.:]/;

/**
 * Wie gut ein Name zum Suchtext passt — kleiner ist besser, `-1` heißt: passt
 * nicht. Gewertet wird die beste Fundstelle: Namensanfang (1) vor Wortanfang
 * (2) vor irgendwo mittendrin (3). Ohne Suchtext passt jeder Name (0).
 */
export function matchScore(name: string, query: string): number {
  const n = normalizeName(name);
  const q = normalizeName(query);
  if (!q) return 0;
  if (n === q) return 0;

  let best = -1;
  for (let at = n.indexOf(q); at >= 0; at = n.indexOf(q, at + 1)) {
    const score = at === 0 ? 1 : BOUNDARY.test(n[at - 1]) ? 2 : 3;
    if (best < 0 || score < best) best = score;
    if (best === 1) break;
  }
  return best;
}

/** „Neue App“ steht unter gleich guten Treffern hinter den echten Apps. */
function kindOrder(item: LauncherItem): number {
  return item.kind === 'new' ? 1 : 0;
}

/**
 * Die Treffer zum Suchtext, die besten zuerst. Ohne Suchtext bleibt die Liste,
 * wie sie ist; unter gleich guten Treffern gilt weiter die Reihenfolge des
 * Verzeichnisses.
 */
export function filterItems(items: readonly LauncherItem[], query: string): LauncherItem[] {
  if (!normalizeName(query)) return [...items];
  return items
    .map((item, index) => ({ item, index, score: matchScore(item.name, query) }))
    .filter((hit) => hit.score >= 0)
    .sort(
      (a, b) =>
        a.score - b.score || kindOrder(a.item) - kindOrder(b.item) || a.index - b.index,
    )
    .map((hit) => hit.item);
}

/** Der nächste Platz in der Liste — an den Enden geht es im Kreis weiter. */
export function nextIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}
