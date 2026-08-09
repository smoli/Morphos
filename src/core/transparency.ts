/**
 * Wie durchsichtig die Schale ist — heute die schwebende Leiste am unteren Rand
 * (das Dock, c0052). Gemerkt wird der Wert je Arbeitsverzeichnis (siehe
 * stores/workspace), wie der Hintergrund auch.
 *
 * Ein Wert ist ein Anteil zwischen 0 (ganz deckend) und 1 (ganz durchsichtig);
 * die Leiste behält dabei ihren Milchglas-Schleier, es geht allein um die
 * Deckkraft ihrer Farbe. `dockBackgroundCss` ist die einzige Stelle, an der aus
 * dem gemerkten Wert eine CSS-Angabe wird — und sie baut sie ausschließlich aus
 * einer geprüften Zahl: Was `cleanTransparency` nicht annimmt, wird gar nicht
 * erst gemalt, sondern durch die Vorgabe ersetzt.
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

/** Der Anteil als ganze Prozent — für die Anzeige neben dem Regler. */
export function transparencyPercent(level: number): number {
  return Math.round(level * 100);
}
