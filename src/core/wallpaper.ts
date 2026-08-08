/**
 * Der Hintergrund der Desktop-Fläche: eine Farbe, ein Verlauf oder ein Bild.
 *
 * Gemerkt wird der Hintergrund je Arbeitsverzeichnis (siehe stores/workspace),
 * ein Bild reist dabei als data:-URI mit — so ist es beim nächsten Start ohne
 * Netz und ohne die Quelldatei wieder da. Damit die Einstellungen nicht
 * zerlaufen, wird ein gewähltes Bild vorher verkleinert (MAX_WALLPAPER_PX) und
 * muss unter MAX_WALLPAPER_BYTES bleiben.
 *
 * `wallpaperCss` ist die einzige Stelle, an der aus einem gemerkten Hintergrund
 * eine CSS-Angabe wird — und sie baut sie ausschließlich aus geprüften Teilen:
 * Was `cleanWallpaper` nicht annimmt, wird gar nicht erst gemalt, sondern durch
 * die Vorgabe ersetzt.
 */

import { iconImageBytes } from './icon';
import type { Wallpaper } from '@/types';

/** Kantenlänge, auf die ein gewähltes Bild höchstens verkleinert wird. */
export const MAX_WALLPAPER_PX = 1920;

/** Größendeckel des abgelegten Bildes (rohe Bytes, nach base64-Dekodierung). */
export const MAX_WALLPAPER_BYTES = 1_500_000;

/** Bildtypen, die als Quelle gewählt werden dürfen — SVG wird dabei gerastert. */
export const WALLPAPER_FILE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

/**
 * Bildtypen, die als Hintergrund ABGELEGT werden dürfen: bewusst nur
 * Rasterformate (wie beim Icon — ein gespeichertes SVG käme als aktiver Inhalt
 * zurück in die Oberfläche).
 */
const STORED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** data:<mime>;base64,<nutzlast> — nichts anderes wird als Bild abgelegt. */
const IMAGE_DATA_URI = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/i;

/** #rgb oder #rrggbb — mehr lässt die Oberfläche als Farbe nicht zu. */
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Neigung eines Verlaufs, wenn keine angegeben ist. */
const DEFAULT_ANGLE = 160;

/** Die Grundfarbe der Schale (style.css: --bg) — Anfang der Vorgabe und Grund unter einem Bild. */
const BASE_COLOR = '#0f1115';

/** Der Hintergrund, solange der Anwender keinen gewählt hat (das dunkle Grundbild). */
export const DEFAULT_WALLPAPER: Wallpaper = {
  kind: 'gradient',
  from: BASE_COLOR,
  to: '#1b2030',
  angle: DEFAULT_ANGLE,
};

/** Ein Hintergrund zur Auswahl in den Einstellungen. */
export interface WallpaperPreset {
  id: string;
  label: string;
  wallpaper: Wallpaper;
}

/** Die angebotenen Hintergründe — der erste ist die Vorgabe. */
export const WALLPAPER_PRESETS: readonly WallpaperPreset[] = [
  { id: 'default', label: 'Standard', wallpaper: DEFAULT_WALLPAPER },
  { id: 'ink', label: 'Tinte', wallpaper: { kind: 'color', color: '#0b0d12' } },
  { id: 'slate', label: 'Schiefer', wallpaper: { kind: 'color', color: '#232833' } },
  { id: 'dusk', label: 'Dämmerung', wallpaper: { kind: 'gradient', from: '#1a1030', to: '#2b1b4d', angle: 160 } },
  { id: 'deep-sea', label: 'Tiefsee', wallpaper: { kind: 'gradient', from: '#05202e', to: '#0d3f4f', angle: 200 } },
  { id: 'ember', label: 'Glut', wallpaper: { kind: 'gradient', from: '#2b1410', to: '#4a2118', angle: 140 } },
  { id: 'moss', label: 'Moos', wallpaper: { kind: 'gradient', from: '#0e1f16', to: '#1c3b28', angle: 180 } },
  { id: 'aurora', label: 'Polarlicht', wallpaper: { kind: 'gradient', from: '#101a3a', to: '#3a2a6b', angle: 120 } },
];

/**
 * Eine Farbangabe auf `#rrggbb` bringen (Kurzform wird ausgeschrieben);
 * alles andere ist null — nur so kann nichts Fremdes in die CSS-Angabe geraten.
 */
export function normalizeColor(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!HEX_COLOR.test(text)) return null;
  if (text.length === 7) return text;
  const [, r, g, b] = text;
  return `#${r}${r}${g}${g}${b}${b}`;
}

/** Prüft ein Bild als Hintergrund: Rasterformat, echte base64-Nutzlast, unter dem Deckel. */
export function validateWallpaperImage(dataUri: string): { ok: true } | { ok: false; error: string } {
  const match = (dataUri ?? '').trim().match(IMAGE_DATA_URI);
  if (!match) return { ok: false, error: 'Das Bild konnte nicht gelesen werden.' };
  if (!STORED_IMAGE_TYPES.includes(match[1].toLowerCase())) {
    return { ok: false, error: `Dieses Bildformat wird als Hintergrund nicht unterstützt: ${match[1]}` };
  }
  // Dieselbe Rechnung wie beim Icon — nur der Deckel ist ein anderer.
  const bytes = iconImageBytes(dataUri);
  if (bytes === 0) return { ok: false, error: 'Das Bild ist leer.' };
  if (bytes > MAX_WALLPAPER_BYTES) {
    return { ok: false, error: `Das Bild ist zu groß (höchstens ${Math.round(MAX_WALLPAPER_BYTES / 1024)} KB).` };
  }
  return { ok: true };
}

/**
 * Tütet einen gemerkten (oder gerade gewählten) Hintergrund ein: Zurück kommt
 * nur, was sich gefahrlos malen lässt — sonst null (dann gilt die Vorgabe).
 */
export function cleanWallpaper(raw: unknown): Wallpaper | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  if (w.kind === 'color') {
    const color = normalizeColor(w.color);
    return color ? { kind: 'color', color } : null;
  }
  if (w.kind === 'gradient') {
    const from = normalizeColor(w.from);
    const to = normalizeColor(w.to);
    if (!from || !to) return null;
    return { kind: 'gradient', from, to, angle: cleanAngle(w.angle) };
  }
  if (w.kind === 'image') {
    const image = typeof w.image === 'string' ? w.image.trim() : '';
    return validateWallpaperImage(image).ok ? { kind: 'image', image } : null;
  }
  return null;
}

/** Ein Winkel in Grad, in den Kreis gedreht; ohne Angabe die Vorgabe. */
function cleanAngle(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ANGLE;
  return ((Math.round(value) % 360) + 360) % 360;
}

/**
 * Die gemerkten Hintergründe auf brauchbare Einträge eintüten — beschädigte
 * fallen weg (dort gilt dann die Vorgabe). Wird vom Hauptprozess beim Lesen und
 * Schreiben der Einstellungen angewandt.
 */
export function cleanWallpapers(raw: unknown): Record<string, Wallpaper> {
  const out: Record<string, Wallpaper> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = cleanWallpaper(value);
    if (clean) out[folder] = clean;
  }
  return out;
}

/** Sind zwei Hintergründe derselbe? (Für die Anzeige der aktiven Auswahl.) */
export function sameWallpaper(a: Wallpaper | null | undefined, b: Wallpaper | null | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'color' && b.kind === 'color') return a.color === b.color;
  if (a.kind === 'gradient' && b.kind === 'gradient') {
    return a.from === b.from && a.to === b.to && a.angle === b.angle;
  }
  if (a.kind === 'image' && b.kind === 'image') return a.image === b.image;
  return false;
}

/**
 * Die CSS-Angabe für die `background`-Eigenschaft der Desktop-Fläche. Der
 * Hintergrund wird zuvor geprüft: Was nicht durchkommt, wird zur Vorgabe.
 */
export function wallpaperCss(wallpaper: Wallpaper | null | undefined): string {
  const w = cleanWallpaper(wallpaper) ?? DEFAULT_WALLPAPER;
  switch (w.kind) {
    case 'color':
      return w.color;
    case 'gradient':
      return `linear-gradient(${w.angle}deg, ${w.from}, ${w.to})`;
    case 'image':
      // Die Grundfarbe füllt, was ein Bild mit anderem Seitenverhältnis frei lässt.
      return `${BASE_COLOR} url("${w.image}") center / cover no-repeat`;
  }
}
