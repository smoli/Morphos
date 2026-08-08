/**
 * Regeln rund um das App-Icon.
 *
 * Ein Icon ist entweder ein EMOJI — die Vorgabe, die das LLM im Artefakt
 * hinterlegt — oder ein vom Anwender gewähltes BILD. Das Bild reist als
 * data:-URI im Manifest (app.json) mit: So bleibt die Kachelliste schnell
 * (listApps liest nur das Manifest, keine weiteren Dateien) und die App bleibt
 * für sich vollständig. Damit das Manifest klein bleibt, wird ein gewähltes
 * Bild vor dem Ablegen auf MAX_ICON_PX verkleinert und gerastert.
 */

/** Kantenlänge, auf die ein gewähltes Bild höchstens verkleinert wird. */
export const MAX_ICON_PX = 128;

/** Größendeckel des abgelegten Bildes (rohe Bytes, nach base64-Dekodierung). */
export const MAX_ICON_BYTES = 64 * 1024;

/** Bildtypen, die als Quelle gewählt werden dürfen — SVG wird dabei gerastert. */
export const ICON_FILE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

/**
 * Bildtypen, die als Icon ABGELEGT werden dürfen: bewusst nur Rasterformate.
 * Ein gespeichertes SVG käme als aktiver Inhalt zurück in die Oberfläche —
 * gerastert stellt sich die Frage gar nicht erst.
 */
const STORED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** data:<mime>;base64,<nutzlast> — nichts anderes wird als Bild-Icon abgelegt. */
const IMAGE_DATA_URI = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/i;

/** Ein Bild-Icon ist stets ein data:-URI — alles andere gilt als Emoji. */
export function isImageIcon(icon: string): boolean {
  return /^data:/i.test((icon ?? '').trim());
}

/** Ist dieser Dateityp als Bildquelle für ein Icon zugelassen? */
export function isIconFileType(mime: string): boolean {
  return ICON_FILE_TYPES.includes((mime ?? '').toLowerCase());
}

/**
 * Reduziert eine Eingabe auf GENAU EIN Zeichen — zusammengesetzte Emoji
 * (ZWJ-Ketten wie 👩‍💻, Hauttöne, Flaggen) bleiben dabei zusammen. Liefert null,
 * wenn nichts Brauchbares übrig bleibt (leer oder ein getarnter data:-URI).
 */
export function normalizeEmojiIcon(input: string): string | null {
  const text = (input ?? '').trim();
  if (!text || isImageIcon(text)) return null;
  return firstGrapheme(text) || null;
}

/** Erstes Graphem-Cluster einer Zeichenkette. */
function firstGrapheme(text: string): string {
  const segmenter = (Intl as { Segmenter?: new (l?: string, o?: { granularity: string }) => {
    segment(s: string): Iterable<{ segment: string }>;
  } }).Segmenter;
  if (typeof segmenter === 'function') {
    for (const part of new segmenter('de', { granularity: 'grapheme' }).segment(text)) return part.segment;
    return '';
  }
  return firstGraphemeFallback(text);
}

const ZWJ = 0x200d;
const isJoiner = (cp: number): boolean =>
  cp === ZWJ ||
  cp === 0xfe0f || cp === 0xfe0e || // Variantenwähler (Text-/Emoji-Darstellung)
  cp === 0x20e3 || // Keycap
  (cp >= 0x1f3fb && cp <= 0x1f3ff); // Hauttöne
const isRegional = (cp: number): boolean => cp >= 0x1f1e6 && cp <= 0x1f1ff;

/** Rückfall ohne Intl.Segmenter: Code-Punkte samt Verbindern zusammenfassen. */
function firstGraphemeFallback(text: string): string {
  const cps = [...text].map((c) => c.codePointAt(0) ?? 0);
  if (cps.length === 0) return '';
  let end = 1;
  // Eine Flagge sind genau zwei regionale Indikatoren.
  if (isRegional(cps[0]) && cps.length > 1 && isRegional(cps[1])) end = 2;
  while (end < cps.length) {
    if (isJoiner(cps[end])) end += 1;
    else if (cps[end - 1] === ZWJ) end += 1; // dem ZWJ folgt stets ein Zeichen
    else break;
  }
  return [...text].slice(0, end).join('');
}

/** Größe der base64-Nutzlast eines Bild-Icons in Bytes (0, wenn keines). */
export function iconImageBytes(dataUri: string): number {
  const match = (dataUri ?? '').trim().match(IMAGE_DATA_URI);
  if (!match) return 0;
  const payload = match[2];
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(payload.length / 4) * 3 - padding);
}

/**
 * Zielmaße eines Bildes: auf `max` Kantenlänge verkleinert, Seitenverhältnis
 * gewahrt. Vergrößert nie; unbrauchbare Maße fallen auf `max` zurück.
 */
export function fitIconSize(width: number, height: number, max = MAX_ICON_PX): { width: number; height: number } {
  const w = Number.isFinite(width) && width > 0 ? width : max;
  const h = Number.isFinite(height) && height > 0 ? height : max;
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Prüft ein Bild-Icon: Rasterformat, echte base64-Nutzlast, unter dem Deckel. */
export function validateIconImage(dataUri: string): { ok: true } | { ok: false; error: string } {
  const value = (dataUri ?? '').trim();
  const match = value.match(IMAGE_DATA_URI);
  if (!match) return { ok: false, error: 'Das Bild konnte nicht gelesen werden.' };
  if (!STORED_IMAGE_TYPES.includes(match[1].toLowerCase())) {
    return { ok: false, error: `Dieses Bildformat wird als Icon nicht unterstützt: ${match[1]}` };
  }
  const bytes = iconImageBytes(value);
  if (bytes === 0) return { ok: false, error: 'Das Bild ist leer.' };
  if (bytes > MAX_ICON_BYTES) {
    return { ok: false, error: `Das Bild ist zu groß (höchstens ${Math.round(MAX_ICON_BYTES / 1024)} KB).` };
  }
  return { ok: true };
}

/**
 * Prüft und normalisiert ein Icon vor dem Ablegen — Emoji wie Bild. Der
 * Hauptprozess ruft das ebenfalls auf: Er vertraut dem Renderer nicht allein.
 */
export function validateIcon(icon: string): { ok: true; icon: string } | { ok: false; error: string } {
  const value = (icon ?? '').trim();
  if (isImageIcon(value)) {
    const checked = validateIconImage(value);
    return checked.ok ? { ok: true, icon: value } : checked;
  }
  const emoji = normalizeEmojiIcon(value);
  if (!emoji) return { ok: false, error: 'Bitte gib ein Zeichen als Icon ein.' };
  return { ok: true, icon: emoji };
}
