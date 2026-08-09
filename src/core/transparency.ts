/**
 * Wie das Glas der Schale aussieht — heute die schwebende Leiste am unteren
 * Rand (das Dock, c0052). Zwei Werte, beide je Arbeitsverzeichnis gemerkt
 * (siehe stores/workspace), wie der Hintergrund auch:
 *
 * - die **Durchsichtigkeit** (c0060): ein Anteil zwischen 0 (ganz deckend) und
 *   1 (ganz durchsichtig) — die Deckkraft der Farbe;
 * - der **Milchglas-Schleier** (c0061): wie stark die Leiste verwischt, was
 *   hinter ihr liegt, in Bildpunkten von 0 (klares Glas) bis `MAX_DOCK_BLUR`.
 *
 * `dockBackgroundCss` und `dockBlurCss` sind die einzigen Stellen, an denen aus
 * einem gemerkten Wert eine CSS-Angabe wird — und sie bauen sie ausschließlich
 * aus einer geprüften Zahl: Was `cleanTransparency` bzw. `cleanBlur` nicht
 * annimmt, wird gar nicht erst gemalt, sondern durch die Vorgabe ersetzt.
 */

/** Die Grundfarbe der Leiste (DesktopView: `.dock`) — nur ihre Deckkraft ändert sich. */
const DOCK_COLOR = '20, 22, 28';

/**
 * Die Durchsichtigkeit des Docks, solange der Anwender keine gewählt hat: halb
 * durchsichtig — der Hintergrund scheint sichtbar durch, die Glyphen stehen mit
 * dem Milchglas-Schleier darunter aber noch klar (c0060; vorher: 0,28).
 */
export const DEFAULT_DOCK_TRANSPARENCY = 0.5;

/** Schrittweite des Reglers in den Einstellungen (5 %). */
export const TRANSPARENCY_STEP = 0.05;

/**
 * Der Milchglas-Schleier des Docks, solange der Anwender keinen gewählt hat —
 * der Wert, mit dem die Leiste seit c0052 gemalt wurde (14 Bildpunkte).
 */
export const DEFAULT_DOCK_BLUR = 14;

/**
 * Dichter als das wird das Glas nicht: Ab hier ist vom Hintergrund ohnehin nur
 * noch ein Farbschimmer übrig.
 */
export const MAX_DOCK_BLUR = 30;

/** Schrittweite des Reglers in den Einstellungen (ein Bildpunkt). */
export const BLUR_STEP = 1;

/**
 * Tütet einen gemerkten (oder gerade geschobenen) Wert ein: Zurück kommt nur
 * ein Anteil zwischen 0 und 1, auf ganze Prozent gerundet — sonst null (dann
 * gilt die Vorgabe).
 */
export function cleanTransparency(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 1) return null;
  return Math.round(raw * 100) / 100;
}

/**
 * Die gemerkten Werte auf brauchbare Einträge eintüten — beschädigte fallen weg
 * (dort gilt dann die Vorgabe). Wird vom Hauptprozess beim Lesen und Schreiben
 * der Einstellungen angewandt.
 */
export function cleanTransparencies(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = cleanTransparency(value);
    if (clean !== null) out[folder] = clean;
  }
  return out;
}

/**
 * Die CSS-Angabe für die `background`-Eigenschaft des Docks. Der Wert wird
 * zuvor geprüft: Was nicht durchkommt, wird zur Vorgabe.
 */
export function dockBackgroundCss(level: number | null | undefined): string {
  const value = cleanTransparency(level) ?? DEFAULT_DOCK_TRANSPARENCY;
  // Runden, damit aus 1 - 0.28 keine 0.7199999999999999 wird.
  const alpha = Math.round((1 - value) * 100) / 100;
  return `rgba(${DOCK_COLOR}, ${alpha})`;
}

/**
 * Tütet einen gemerkten (oder gerade geschobenen) Schleier ein: Zurück kommen
 * nur ganze Bildpunkte zwischen 0 und `MAX_DOCK_BLUR` — sonst null (dann gilt
 * die Vorgabe).
 */
export function cleanBlur(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > MAX_DOCK_BLUR) return null;
  return Math.round(raw);
}

/**
 * Die gemerkten Schleier auf brauchbare Einträge eintüten — beschädigte fallen
 * weg (dort gilt dann die Vorgabe). Wird vom Hauptprozess beim Lesen und
 * Schreiben der Einstellungen angewandt.
 */
export function cleanBlurs(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = cleanBlur(value);
    if (clean !== null) out[folder] = clean;
  }
  return out;
}

/**
 * Die CSS-Angabe für die `backdrop-filter`-Eigenschaft des Docks. Der Wert wird
 * zuvor geprüft: Was nicht durchkommt, wird zur Vorgabe.
 */
export function dockBlurCss(blur: number | null | undefined): string {
  const value = cleanBlur(blur) ?? DEFAULT_DOCK_BLUR;
  return `blur(${value}px)`;
}

/** Der Anteil als ganze Prozent — für die Anzeige neben dem Regler. */
export function transparencyPercent(level: number): number {
  return Math.round(level * 100);
}
