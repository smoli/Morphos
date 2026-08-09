/**
 * Rein: Einträge und Platzierung eines Kontextmenüs.
 *
 * Das Menü klappt dort auf, wo der Anwender mit der rechten Maustaste geklickt
 * hat. Nahe am rechten oder unteren Rand kippt es zur anderen Seite, damit kein
 * Eintrag abgeschnitten wird — und bleibt notfalls einfach innerhalb der Fläche.
 * Gemessen wird in Fensterkoordinaten (das Menü liegt fest über allem).
 */

/** Ein Eintrag eines Kontextmenüs. */
export interface MenuItem {
  /** Kennung, die beim Auswählen gemeldet wird. */
  id: string;
  label: string;
  /** Zeichen vor dem Text (nur Zier). */
  icon?: string;
  /** Rot einfärben — für Einträge, die etwas wegnehmen. */
  danger?: boolean;
  /** Eine Trennlinie über diesem Eintrag. */
  separator?: boolean;
}

/** Eine Stelle in Bildpunkten. */
export interface MenuPoint {
  x: number;
  y: number;
}

/** Eine Größe in Bildpunkten. */
export interface MenuSize {
  w: number;
  h: number;
}

/** Abstand, den das Menü zum Rand der Fläche hält. */
export const MENU_MARGIN = 8;

/** Wohin das Menü gehört: an die Maus, aber ganz innerhalb der Fläche. */
export function menuPos(at: MenuPoint, size: MenuSize, bounds: MenuSize): MenuPoint {
  return { x: axis(at.x, size.w, bounds.w), y: axis(at.y, size.h, bounds.h) };
}

function axis(at: number, size: number, bound: number): number {
  // Ungemessen (erster Anstrich, Tests) bleibt die Stelle, wie sie ist.
  if (!Number.isFinite(bound) || bound <= 0) return Math.max(0, Math.round(at));
  const max = Math.max(MENU_MARGIN, bound - size - MENU_MARGIN);
  const flipped = at + size + MENU_MARGIN > bound ? at - size : at;
  return Math.round(Math.min(Math.max(MENU_MARGIN, flipped), max));
}
