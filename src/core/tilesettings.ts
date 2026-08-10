/**
 * Was sich am Kachel-Modus einstellen lässt (c0072) — zwei Werte, beide je
 * Arbeitsverzeichnis gemerkt (siehe stores/workspace), wie beim Dock auch:
 *
 * - die **Fuge**: wie viel Luft zwischen zwei Kacheln steht (und ringsum zum
 *   Rand hin), von 0 (lückenlos) bis `MAX_TILE_GAP` Bildpunkten. Gerechnet wird
 *   damit in core/tiling, das die Fuge als Zahl entgegennimmt — den Wert reicht
 *   der Desktop-Store durch (`tileGap`);
 * - der **Fensterrahmen**: ob die Titelleiste einer Kachel stehen bleibt oder
 *   sich weglegt, bis der Zeiger den oberen Rand der Kachel erreicht
 *   (components/WindowFrame). Gekachelt zählt jeder Bildpunkt: Ohne Leiste
 *   endet das Fenster an der Fuge und sonst nirgends.
 *
 * Hier steckt nur die Prüfung: Was `cleanTileGap` bzw. `cleanChromeHide` nicht
 * annimmt, wird gar nicht erst gemerkt — dann gilt die Vorgabe.
 */

/**
 * Die Fuge, solange der Anwender keine gewählt hat: die 12 Bildpunkte, mit
 * denen der Verbund seit c0066 gezeichnet wurde.
 */
export const DEFAULT_TILE_GAP = 12;

/**
 * Weiter geht es nicht auseinander: Die Fuge bleibt schmaler als die
 * Mindestgröße einer Kachel (`MIN_TILE`), sonst zehrte sie beim Ziehen an ihr
 * die Kachel daneben auf.
 */
export const MAX_TILE_GAP = 40;

/** Schrittweite des Reglers in den Einstellungen (ein Bildpunkt). */
export const TILE_GAP_STEP = 1;

/**
 * Tütet eine gemerkte (oder gerade geschobene) Fuge ein: Zurück kommen nur
 * ganze Bildpunkte zwischen 0 und `MAX_TILE_GAP` — sonst null (dann gilt die
 * Vorgabe).
 */
export function cleanTileGap(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > MAX_TILE_GAP) return null;
  return Math.round(raw);
}

/**
 * Die gemerkten Fugen auf brauchbare Einträge eintüten — beschädigte fallen weg
 * (dort gilt dann die Vorgabe). Wird vom Hauptprozess beim Lesen und Schreiben
 * der Einstellungen angewandt.
 */
export function cleanTileGaps(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = cleanTileGap(value);
    if (clean !== null) out[folder] = clean;
  }
  return out;
}

/**
 * Legt der Rahmen seine Titelleiste weg, solange der Anwender sie nicht ruft?
 * Von Haus aus nicht: Die Kachel trägt ihre Leiste, wie sie es seit c0066 tut.
 */
export const DEFAULT_TILE_CHROME_HIDE = false;

/**
 * Tütet eine gemerkte Entscheidung ein: Zurück kommt nur ein Ja oder ein Nein —
 * sonst null (dann gilt die Vorgabe).
 */
export function cleanChromeHide(raw: unknown): boolean | null {
  return typeof raw === 'boolean' ? raw : null;
}

/**
 * Die gemerkten Entscheidungen auf brauchbare Einträge eintüten — beschädigte
 * fallen weg (dort gilt dann die Vorgabe). Wird vom Hauptprozess beim Lesen und
 * Schreiben der Einstellungen angewandt.
 */
export function cleanChromeHides(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = cleanChromeHide(value);
    if (clean !== null) out[folder] = clean;
  }
  return out;
}
