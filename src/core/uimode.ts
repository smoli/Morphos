/**
 * Rein: welche Darstellungen der Desktop kennt — überlappende Fenster, eine App
 * zur Zeit, oder lückenlose Kacheln (c0066).
 *
 * Die Wahl wird gespeichert (siehe stores/workspace, electron/main); was aus den
 * Einstellungen kommt, kann alles Mögliche sein. Darum steht hier die eine
 * Stelle, die Gelesenes auf eine bekannte Darstellung zurechtstutzt.
 *
 * Und die eine Stelle, die sagt, wie eine Darstellung heißt: Gewählt wird sie in
 * den Einstellungen (c0069), Bereich „Darstellung“ — der Umschalter baut sich
 * aus dieser Liste.
 */

import type { UiMode } from '@/types';

/** Wie eine Darstellung im Umschalter der Einstellungen auftritt. */
export interface UiModeOption {
  id: UiMode;
  /** Ihr Name. */
  label: string;
  /** Ein Zeichen davor. */
  icon: string;
  /** Ein Satz, was sie bedeutet. */
  hint: string;
}

/** Alle Darstellungen, in der Reihenfolge des Umschalters. */
export const UI_MODE_OPTIONS: readonly UiModeOption[] = [
  {
    id: 'windows',
    label: 'Fenster',
    icon: '▦',
    hint: 'Frei verschiebbare Fenster, die einander überlappen dürfen.',
  },
  {
    id: 'single',
    label: 'Einzeln',
    icon: '▢',
    hint: 'Immer nur eine App, bildfüllend — die übrigen warten im Dock.',
  },
  {
    id: 'tiles',
    label: 'Kacheln',
    icon: '⊞',
    hint: 'Alle Fenster teilen sich die Fläche lückenlos, ohne Überlappung.',
  },
];

/** Alle Darstellungen, in derselben Reihenfolge. */
export const UI_MODES: readonly UiMode[] = UI_MODE_OPTIONS.map((o) => o.id);

/** Womit der Desktop beginnt, solange nichts anderes gemerkt ist. */
export const DEFAULT_UI_MODE: UiMode = 'windows';

/** Eine gelesene Darstellung — Unbekanntes fällt auf die Vorgabe zurück. */
export function cleanUiMode(value: unknown): UiMode {
  return UI_MODES.includes(value as UiMode) ? (value as UiMode) : DEFAULT_UI_MODE;
}
