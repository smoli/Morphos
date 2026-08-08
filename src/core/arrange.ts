/**
 * Framework-unabhängige Anordnung der App-Kacheln auf dem Desktop.
 *
 * Der Anwender darf jede Kachel frei ablegen; gemerkt wird sie je Workspace
 * (siehe stores/workspace). Alles, was keine gemerkte Position hat — frisch
 * erzeugte Apps etwa —, fällt auf das Raster zurück, und zwar auf einen Platz,
 * den keine frei abgelegte Kachel schon besetzt. Aufräumen heißt darum
 * schlicht: die gemerkten Positionen vergessen.
 */

import type { IconPos } from '@/types';

/** Kantenlänge einer Kachel (sie ist quadratisch). */
export const TILE_W = 128;
export const TILE_H = 128;
/** Luft zwischen zwei Kacheln und zum Rand der Fläche. */
export const GAP = 16;
export const PAD = 20;
/** Rasterweite = Kachel + Abstand. */
export const CELL_W = TILE_W + GAP;
export const CELL_H = TILE_H + GAP;

/** Spaltenzahl, solange die Fläche noch nicht gemessen ist (erster Anstrich, Tests). */
const DEFAULT_COLS = 6;

/** Ab so vielen Bildpunkten Mausweg ist es ein Ziehen und kein Klick. */
export const DRAG_THRESHOLD = 4;

/** Die Desktop-Fläche, auf der die Kacheln liegen. */
export interface Bounds {
  w: number;
  h: number;
}

/** Wieviele Kacheln nebeneinander auf die Fläche passen (mindestens eine). */
export function columns(bounds: Bounds): number {
  const w = bounds.w;
  if (!Number.isFinite(w) || w <= 0) return DEFAULT_COLS;
  // Der Abstand hinter der letzten Kachel wird nicht gebraucht.
  return Math.max(1, Math.floor((w - 2 * PAD + GAP) / CELL_W));
}

/** Position des n-ten Rasterplatzes — zeilenweise gefüllt, wie bisher das Grid. */
export function slotPos(index: number, cols: number): IconPos {
  const c = Math.max(1, cols);
  return { x: PAD + (index % c) * CELL_W, y: PAD + Math.floor(index / c) * CELL_H };
}

/**
 * Der Rasterplatz, auf dem eine (auch frei abgelegte) Kachel sitzt — sie belegt
 * ihn für die Auto-Anordnung. `-1`, wenn sie neben dem Raster liegt.
 */
export function slotIndex(pos: IconPos, cols: number): number {
  const c = Math.max(1, cols);
  const col = Math.round((pos.x - PAD) / CELL_W);
  const row = Math.round((pos.y - PAD) / CELL_H);
  if (col < 0 || col >= c || row < 0) return -1;
  return row * c + col;
}

/** Hält eine Position innerhalb der Fläche (nach einer Verkleinerung des Fensters). */
export function clampPos(pos: IconPos, bounds: Bounds): IconPos {
  return { x: clampAxis(pos.x, bounds.w, TILE_W), y: clampAxis(pos.y, bounds.h, TILE_H) };
}

function clampAxis(value: number, size: number, tile: number): number {
  const max = size - tile;
  if (!Number.isFinite(size) || max <= 0) return Math.max(0, Math.round(value));
  return Math.min(Math.max(0, Math.round(value)), Math.round(max));
}

/**
 * Die Positionen aller Kacheln: gemerkte (in die Fläche geholt) bleiben, alle
 * übrigen bekommen den nächsten freien Rasterplatz. `reserved` hält die ersten
 * Plätze frei — dort liegt die feste „Neue App“-Kachel.
 */
export function arrangeIcons(
  ids: readonly string[],
  saved: Readonly<Record<string, IconPos>>,
  bounds: Bounds,
  reserved = 0,
): Record<string, IconPos> {
  const cols = columns(bounds);
  const taken = new Set<number>();
  for (let i = 0; i < reserved; i += 1) taken.add(i);

  const layout: Record<string, IconPos> = {};
  for (const id of ids) {
    const pos = saved[id];
    if (!pos) continue;
    const clamped = clampPos(pos, bounds);
    layout[id] = clamped;
    const slot = slotIndex(clamped, cols);
    if (slot >= 0) taken.add(slot);
  }

  let next = 0;
  for (const id of ids) {
    if (layout[id]) continue;
    while (taken.has(next)) next += 1;
    taken.add(next);
    layout[id] = slotPos(next, cols);
  }
  return layout;
}

/** Höhe, welche die Fläche braucht, damit die tiefste Kachel ganz sichtbar ist. */
export function layoutHeight(layout: Readonly<Record<string, IconPos>>): number {
  const positions = Object.values(layout);
  if (positions.length === 0) return 0;
  return Math.max(...positions.map((p) => p.y)) + TILE_H + PAD;
}
