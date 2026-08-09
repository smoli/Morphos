/**
 * Rein: welche Darstellungen der Desktop kennt — überlappende Fenster, eine App
 * zur Zeit, oder lückenlose Kacheln (c0066).
 *
 * Die Wahl wird gespeichert (siehe stores/workspace, electron/main); was aus den
 * Einstellungen kommt, kann alles Mögliche sein. Darum steht hier die eine
 * Stelle, die Gelesenes auf eine bekannte Darstellung zurechtstutzt.
 */

import type { UiMode } from '@/types';

/** Alle Darstellungen, in der Reihenfolge des Umschalters in der Kopfleiste. */
export const UI_MODES: readonly UiMode[] = ['windows', 'single', 'tiles'];

/** Womit der Desktop beginnt, solange nichts anderes gemerkt ist. */
export const DEFAULT_UI_MODE: UiMode = 'windows';

/** Eine gelesene Darstellung — Unbekanntes fällt auf die Vorgabe zurück. */
export function cleanUiMode(value: unknown): UiMode {
  return UI_MODES.includes(value as UiMode) ? (value as UiMode) : DEFAULT_UI_MODE;
}
