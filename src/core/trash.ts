/**
 * Die Regeln des Papierkorbs und der Namensgebung beim Verwalten von Dateien —
 * rein, ohne Dateisystem. Ausgeführt wird das alles in core/fsaccess
 * (`runShellFs`), wo jeder Pfad zuvor auf den Datenordner eingegrenzt wird.
 *
 * Der Papierkorb ist ein verborgener Ordner IM Datenordner: `.trash/files`
 * nimmt das Gelöschte auf, `.trash/meta` merkt sich zu jedem Stück, wo es
 * herkam. Damit bleibt das Löschen ein Verschieben innerhalb desselben
 * Ordners — es verlässt den freigegebenen Bereich nie, und Wiederherstellen ist
 * nur der Weg zurück.
 */

import type { TrashEntry } from '@/types';
import { normalizeRelPath } from './dialog';

/** Der Papierkorb, relativ zum Datenordner — verborgen (führender Punkt). */
export const TRASH_DIR = '.trash';
/** Darin: das Gelöschte selbst … */
export const TRASH_FILES = `${TRASH_DIR}/files`;
/** … und je Eintrag ein kleiner Zettel, wo er herkam. */
export const TRASH_META = `${TRASH_DIR}/meta`;

/**
 * Gehört dieser Pfad zum Papierkorb? Geprüft wird der normalisierte Pfad, damit
 * weder `/.trash`, `.trash\files` noch `sub/../.trash` daran vorbeikommen — der
 * Papierkorb gehört der Schale, gewöhnliche Operationen haben dort nichts zu
 * suchen.
 */
export function isTrashPath(relPath: string): boolean {
  const rel = normalizeRelPath(relPath);
  if (rel === null) return false;
  return rel === TRASH_DIR || rel.startsWith(`${TRASH_DIR}/`);
}

/**
 * Taugt die Eingabe als Name einer Datei oder eines Ordners? Kein Pfadanteil,
 * kein Punkt-Name, nichts Verborgenes (das sähe der Anwender nie wieder, siehe
 * core/explorer) und nichts, woran ein Dateisystem sich stößt.
 */
export function isValidName(name: string): boolean {
  return nameError(name) === '';
}

/** Der Grund, warum ein Name nicht taugt — leer heißt: er taugt. */
export function nameError(name: string): string {
  const raw = String(name ?? '').trim();
  if (!raw) return 'Bitte einen Namen angeben.';
  if (raw.length > 255) return 'Der Name ist zu lang.';
  if (raw === '.' || raw === '..') return 'Dieser Name ist nicht erlaubt.';
  if (raw.startsWith('.')) return 'Ein Name mit führendem Punkt wäre verborgen.';
  // Pfadtrenner, was Dateisysteme sonst nicht mögen, und Steuerzeichen.
  // eslint-disable-next-line no-control-regex
  if (/[/\\:*?"<>|\u0000-\u001f\u007f]/.test(raw)) return 'Der Name enthält unerlaubte Zeichen.';
  return '';
}

/** Zerlegt einen Namen in Rumpf und (letzte) Endung: `archiv.tar.gz` → `.gz`. */
export function splitName(name: string): { base: string; ext: string } {
  const at = name.lastIndexOf('.');
  if (at <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, at), ext: name.slice(at) };
}

/**
 * Ein im Zielordner noch freier Name: `note.txt` → `note (2).txt` → `note (3).txt`.
 * So bekommt eine Kopie neben ihrem Original einen Platz, und im Papierkorb
 * verdrängt kein gleichnamiges Stück ein früheres.
 */
export function uniqueName(taken: Iterable<string>, name: string): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  const { base, ext } = splitName(name);
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Liest den Zettel zu einem Stück im Papierkorb. Was sich nicht als Herkunft
 * INNERHALB des Datenordners lesen lässt, gilt als kaputt (null) — ein von Hand
 * verbogener Zettel soll beim Wiederherstellen nirgendwo hinzeigen können.
 */
export function parseTrashMeta(raw: unknown, id: string): TrashEntry | null {
  if (!raw || typeof raw !== 'object' || !id) return null;
  const meta = raw as Record<string, unknown>;
  const from = normalizeRelPath(meta.from);
  if (!from) return null;
  const name = typeof meta.name === 'string' && meta.name ? meta.name : from.slice(from.lastIndexOf('/') + 1);
  const deletedAt = typeof meta.deletedAt === 'number' && Number.isFinite(meta.deletedAt) ? meta.deletedAt : 0;
  return { id, name, from, deletedAt, isDir: meta.isDir === true };
}
