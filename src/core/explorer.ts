/**
 * Die Anzeige-Regeln des Datei-Explorers: was der Anwender im Datenordner zu
 * sehen bekommt und in welcher Reihenfolge.
 *
 * Bewusst getrennt von core/dialog (dort geht es um Auswahl samt Endungsfilter)
 * und rein — das Lesen selbst macht der Host (`getHost().fs`), eingegrenzt auf
 * den Datenordner.
 */

import type { FsEntry } from '@/types';
import { formatBytes } from './bytes';

/** Sortierrichtung der Spalte. */
export type SortOrder = 'asc' | 'desc';

/** Wonach sortiert wird — die Spalten der Liste (c0051). */
export type SortKey = 'name' | 'size' | 'modified' | 'created';

/**
 * Verborgen ist, was mit einem Punkt beginnt — Systemkram wie `.DS_Store`
 * ebenso wie der Papierkorb `.trash/` (c0050). Solche Einträge gehören nicht in
 * die gewöhnliche Liste.
 */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

/** Eine Zahlenspalte eines Eintrags; Fehlendes zählt als 0. */
function value(entry: FsEntry, key: Exclude<SortKey, 'name'>): number {
  const n = entry[key];
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Die anzuzeigenden Einträge eines Ordners: ohne Verborgenes, Ordner vor
 * Dateien, innerhalb der Gruppe nach der gewählten Spalte. `order` dreht nur
 * diese Spalte — Ordner bleiben oben, damit die Liste beim Umsortieren nicht
 * kippt. Bei Gleichstand (und fehlenden Angaben) entscheidet der Name, damit
 * die Reihenfolge nicht zufällig wird.
 */
export function explorerEntries(
  entries: FsEntry[],
  order: SortOrder = 'asc',
  key: SortKey = 'name',
): FsEntry[] {
  const dir = order === 'desc' ? -1 : 1;
  const byName = (a: FsEntry, b: FsEntry) => a.name.localeCompare(b.name, 'de');
  return entries
    .filter((e) => !isHiddenName(e.name))
    .slice()
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (key === 'name') return dir * byName(a, b);
      const diff = value(a, key) - value(b, key);
      return diff === 0 ? byName(a, b) : dir * diff;
    });
}

/** Wo nichts zu sagen ist, steht ein Strich — kein „0 B“, kein „1.1.1970“. */
const NOTHING = '—';

/**
 * Die Größe eines Eintrags, wie ein Mensch sie liest. Ein Ordner bekommt keine:
 * Was das Dateisystem für ihn meldet, ist die Größe seines Verzeichniseintrags,
 * nicht die seines Inhalts — das wäre eine Zahl, die in die Irre führt.
 */
export function sizeLabel(entry: FsEntry): string {
  if (entry.isDir || typeof entry.size !== 'number' || !Number.isFinite(entry.size)) return NOTHING;
  return formatBytes(entry.size);
}

/**
 * Ein Zeitpunkt (ms seit Epoch), kurz und lesbar. 0 heißt „nicht bekannt“ —
 * etliche Dateisysteme kennen kein Erstellungsdatum — und wird zum Strich,
 * statt den Anwender in die Nacht des 1.1.1970 zu schicken.
 */
export function formatWhen(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return NOTHING;
  return new Date(ms).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}
