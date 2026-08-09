/**
 * Die Anzeige-Regeln des Datei-Explorers: was der Anwender im Datenordner zu
 * sehen bekommt und in welcher Reihenfolge.
 *
 * Bewusst getrennt von core/dialog (dort geht es um Auswahl samt Endungsfilter)
 * und rein — das Lesen selbst macht der Host (`getHost().fs`), eingegrenzt auf
 * den Datenordner.
 */

import type { FsEntry } from '@/types';

/** Sortierrichtung der Namensspalte. */
export type SortOrder = 'asc' | 'desc';

/**
 * Verborgen ist, was mit einem Punkt beginnt — Systemkram wie `.DS_Store`
 * ebenso wie der Papierkorb `.trash/` (c0050). Solche Einträge gehören nicht in
 * die gewöhnliche Liste.
 */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

/**
 * Die anzuzeigenden Einträge eines Ordners: ohne Verborgenes, Ordner vor
 * Dateien, innerhalb der Gruppe nach Namen. `order` dreht nur die Namensfolge —
 * Ordner bleiben oben, damit die Liste beim Umsortieren nicht kippt.
 */
export function explorerEntries(entries: FsEntry[], order: SortOrder = 'asc'): FsEntry[] {
  const dir = order === 'desc' ? -1 : 1;
  return entries
    .filter((e) => !isHiddenName(e.name))
    .slice()
    .sort((a, b) =>
      a.isDir === b.isDir ? dir * a.name.localeCompare(b.name, 'de') : a.isDir ? -1 : 1,
    );
}
