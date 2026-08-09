/**
 * Der gemerkte Kachel-Baum eines Arbeitsverzeichnisses (c0068).
 *
 * Der laufende Baum (core/tiling) trägt in seinen Blättern Fenster-Ids
 * („win-3“) — die gelten nur für diesen Lauf. Gemerkt wird darum ein Baum
 * derselben Gestalt, dessen Blätter den Schlüssel des Fensters tragen: die App
 * oder die Ansicht der Schale, genau wie in der Sitzung (core/session). Beim
 * nächsten Start werden aus den Schlüsseln wieder die Fenster, die die Sitzung
 * geöffnet hat — die Kacheln kommen also in derselben Anordnung und mit
 * denselben Verhältnissen zurück.
 *
 * Was sich nicht auflösen lässt, fällt aus dem Baum, und seine Schwester erbt
 * den Platz: ein Entwurf ohne App-Id beim Merken, eine verschwundene App beim
 * Wiederherstellen. Eine leere Kachel bleibt dabei nie zurück.
 */

import { sessionKey } from './session';
import { mapLeaves, type Orientation, type TileTree } from './tiling';

/**
 * Ein gemerkter Baum. Gebaut wie ein Kachel-Baum — nur heißen seine Blätter
 * nach App bzw. Ansicht, nicht nach dem Fenster.
 */
export type SavedTileTree = TileTree;

/** So tief darf ein gelesener Baum sein — was tiefer liegt, ist beschädigt. */
export const MAX_TILE_DEPTH = 32;

/** Was ein offenes Fenster beiträgt (siehe stores/desktop: DesktopWindow). */
export interface TileWindow {
  instanceId: string;
  /** null = Entwurf oder Fenster der Schale. */
  appId: string | null;
  /** Ansicht der Schale (siehe core/system) — null bei App und Entwurf. */
  systemId?: string | null;
}

/**
 * Der Baum, wie er gemerkt wird: dieselbe Gestalt, aber Schlüssel statt
 * Fenster-Ids. Blätter ohne Schlüssel — ein Entwurf, ein Fenster, das es nicht
 * mehr gibt — fallen heraus.
 */
export function serializeTiles(
  tree: TileTree | null,
  windows: readonly TileWindow[],
): SavedTileTree | null {
  const keys = new Map(windows.map((w) => [w.instanceId, sessionKey(w.appId, w.systemId ?? null)]));
  return mapLeaves(tree, (id) => keys.get(id) ?? null);
}

/**
 * Der gemerkte Baum, auf die offenen Fenster gelegt: Jeder Schlüssel wird zu
 * dem Fenster, das ihn trägt. Schlüssel ohne Fenster (die App ist von der
 * Platte verschwunden) fallen heraus; Fenster ohne Schlüssel im Baum bleiben
 * außen vor — der Fenstermanager nimmt sie danach auf (stores/desktop:
 * syncTiles).
 */
export function restoreTiles(
  saved: SavedTileTree | null,
  windows: readonly TileWindow[],
): TileTree | null {
  const ids = new Map<string, string>();
  for (const w of windows) {
    const key = sessionKey(w.appId, w.systemId ?? null);
    if (key && !ids.has(key)) ids.set(key, w.instanceId);
  }
  return mapLeaves(saved, (key) => ids.get(key) ?? null);
}

/**
 * Sind zwei Bäume derselbe? Ein Zug an der Fuge, der nichts verschiebt, soll
 * auch nichts schreiben (vgl. core/session: sameSession).
 */
export function sameTree(a: TileTree | null, b: TileTree | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'leaf') return a.id === (b as Extract<TileTree, { kind: 'leaf' }>).id;
  const other = b as Extract<TileTree, { kind: 'split' }>;
  return (
    a.orientation === other.orientation &&
    a.ratio === other.ratio &&
    sameTree(a.a, other.a) &&
    sameTree(a.b, other.b)
  );
}

/**
 * Gemerkte Bäume auf brauchbare Knoten eintüten — je Arbeitsverzeichnis einer.
 * Wird vom Hauptprozess beim Lesen und Schreiben der Einstellungen angewandt.
 */
export function cleanTileTrees(raw: unknown): Record<string, SavedTileTree> {
  const out: Record<string, SavedTileTree> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, tree] of Object.entries(raw as Record<string, unknown>)) {
    const clean = cleanTileTree(tree);
    if (clean) out[folder] = clean;
  }
  return out;
}

/**
 * Ein gelesener Baum: Ein beschädigter Ast fällt weg und sein Bruder erbt den
 * Platz, ein doppeltes Blatt zählt nur einmal, ein unbrauchbares Verhältnis
 * wird zur Hälfte. Bleibt nichts Heiles, kommt null zurück — dann kachelt der
 * Fenstermanager dieses Verzeichnis eben von vorn.
 */
export function cleanTileTree(raw: unknown): SavedTileTree | null {
  // Ein Blatt, das zweimal vorkommt, hat nur einmal ein Fenster: `mapLeaves`
  // wirft das zweite heraus (das Umbenennen ist hier keines).
  return mapLeaves(readNode(raw, 0), (id) => id);
}

function readNode(raw: unknown, depth: number): SavedTileTree | null {
  if (!raw || typeof raw !== 'object' || depth >= MAX_TILE_DEPTH) return null;
  const node = raw as Record<string, unknown>;
  if (node.kind === 'leaf') {
    return typeof node.id === 'string' && node.id ? { kind: 'leaf', id: node.id } : null;
  }
  if (node.kind !== 'split') return null;
  const a = readNode(node.a, depth + 1);
  const b = readNode(node.b, depth + 1);
  if (!a || !b) return a ?? b;
  if (node.orientation !== 'row' && node.orientation !== 'column') return null;
  return {
    kind: 'split',
    orientation: node.orientation as Orientation,
    ratio: cleanRatio(node.ratio),
    a,
    b,
  };
}

/** Ein gelesenes Verhältnis: ein Anteil zwischen 0 und 1, sonst die Hälfte. */
function cleanRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
