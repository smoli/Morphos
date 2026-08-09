/**
 * Rein: die Arbeitsfläche — was vom Bildschirm übrig bleibt, wenn das Dock
 * seinen Rand für sich behält (i0006).
 *
 * Ein Fenster, das die Fläche füllt, soll unter einer festen Leiste nicht
 * verschwinden: das maximierte, das im Einzel-Modus, und jede Kachel im
 * Verbund enden an ihr. Legt die Leiste sich dagegen aus dem Weg (c0062) oder
 * ist sie gar nicht da, gehört ihr kein Rand — dann füllt das Fenster den
 * ganzen Bildschirm, und die Leiste kommt beim Herankommen darüber.
 *
 * Frei liegende Fenster bleiben davon unberührt: Die schiebt der Anwender
 * selbst, und wie am Schreibtisch dürfen sie unter die Leiste rutschen.
 */

import type { DockEdge } from '@/types';
import type { Rect } from './tiling';

/** Was an jedem Rand des Bildschirms für die Schale reserviert ist. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Kein Rand ist vergeben — die Fläche gehört ganz den Fenstern. */
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Wie viel die Leiste an ihrem Rand wegnimmt: 48 px Glyphe, 2 × 6 px Polster,
 * ihr Rand und die 14 px Abstand vom Bildschirmrand — dieselben 76 px, mit
 * denen der Desktop seit c0063 die Icon-Fläche einrückt.
 */
export const DOCK_RESERVE = 76;

/**
 * Welcher Rand dem Dock gehört. `fixed` heißt: Die Leiste ist da und legt sich
 * nicht aus dem Weg — nur dann nimmt sie Platz weg.
 */
export function dockInsets(edge: DockEdge, fixed: boolean): Insets {
  if (!fixed) return { ...NO_INSETS };
  return { ...NO_INSETS, [edge]: DOCK_RESERVE };
}

/**
 * Die Arbeitsfläche in Koordinaten der Bühne: der Bildschirm, um die
 * reservierten Ränder eingerückt. Nie negativ — ein Bildschirm, der schmaler
 * ist als die Leiste (oder noch gar nicht gemessen), gibt ein leeres Rechteck.
 */
export function workArea(size: { w: number; h: number }, insets: Insets): Rect {
  return {
    x: insets.left,
    y: insets.top,
    w: Math.max(0, size.w - insets.left - insets.right),
    h: Math.max(0, size.h - insets.top - insets.bottom),
  };
}

/**
 * Dieselben Ränder für den Stil: Die Bühne schreibt sie an, und wer die Fläche
 * füllt — der vollflächige Rahmen, die eingerückte Icon-Fläche —, liest sie
 * dort ab. So steht die Zahl an einer Stelle statt zweimal.
 */
export function insetVars(insets: Insets): Record<string, string> {
  return {
    '--work-top': `${insets.top}px`,
    '--work-right': `${insets.right}px`,
    '--work-bottom': `${insets.bottom}px`,
    '--work-left': `${insets.left}px`,
  };
}
