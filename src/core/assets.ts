import { extensionOf } from './preview';

/**
 * Die Beigaben einer App (e16): Bilder, Schriften, Datendateien — alles, was
 * kein Text ist, den das LLM schreibt.
 *
 *   <app>/assets/…   die Dateien selbst — im Wurzelverzeichnis der App,
 *                    neben concept.md, also NICHT unter src/
 *
 * Der Ort ist Absicht: src/ ist reiner Text, den der Agent besitzt —
 * `readSourceFiles` liest ihn als UTF-8 und `syncSourceFiles` wischt den Ordner
 * vor jedem Schreiben leer (core/appstore). Eine Binärdatei ginge dort beim
 * Lesen kaputt und beim nächsten Lauf verloren. Unter assets/ liegt sie
 * außerhalb dieses Abgleichs und überlebt jede Generierung, die sie nicht
 * erwähnt.
 *
 * Ein Asset ist darum auch KEINE `SourceFile`: Es gibt zwei Typen, und der
 * Unterschied ist der Besitzer. `SourceFile` ist Text des Agenten und trägt
 * seinen Inhalt mit sich; `AssetInfo` ist die bloße Auskunft über eine Datei
 * des Anwenders — Name, Pfad, Typ, Größe. Die Bytes stehen nirgends im
 * Speicher: Wer sie braucht, holt sie einzeln von der Platte (core/assetstore).
 *
 * Dieses Modul ist das reine MODELL — Namen, Pfade, Medientypen, ohne einen
 * Griff zur Platte (wie core/design neben core/designstore). So kann auch der
 * Renderer damit rechnen, ohne node:fs ins Bündel zu ziehen.
 */

/** Der Ordner, in dem die Assets einer App liegen. */
export const ASSETS_DIR = 'assets';

/**
 * So lang darf der Name eines Assets werden. Er steht im Prompt, im Git-Log und
 * im Dateisystem — dort ist bei 255 Bytes Schluss, lange bevor ein Mensch ihn
 * noch liest.
 */
export const MAX_ASSET_NAME_LENGTH = 80;

/** Wie ein Asset heißt, dessen Name nichts Brauchbares übrig lässt. */
const FALLBACK_NAME = 'asset';

/** Was in einem Asset-Namen stehen darf — alles andere wird zum Bindestrich. */
const ALLOWED = /[^A-Za-z0-9._-]+/g;

/** Dasselbe zum bloßen Prüfen — ohne „g“, denn `test` einer globalen Suche merkt sich die Stelle. */
const FORBIDDEN = /[^A-Za-z0-9._-]/;

/**
 * Die Auskunft über ein Asset — ohne seine Bytes. Genau das trägt `AppData`:
 * Eine App weiß, welche Beigaben sie hat, hält aber kein einziges Bild im
 * Speicher.
 */
export interface AssetInfo {
  /** Der Dateiname, z. B. `logo.png`. */
  name: string;
  /** Der Pfad in der App, mit „/“ und stets `assets/<name>`. */
  path: string;
  /** Medientyp nach der Endung, z. B. `image/png`. */
  mime: string;
  /** Größe in Bytes. */
  size: number;
}

/** Ein Asset samt seinen Bytes — so kommt es einzeln von der Platte. */
export interface AssetFile extends AssetInfo {
  data: Uint8Array;
}

/** Der Pfad eines Assets in der App (`assets/logo.png`). */
export function assetPath(name: string): string {
  return `${ASSETS_DIR}/${name}`;
}

/**
 * Der Name aus einem Asset-Pfad — leer, wenn das kein Asset ist. Nimmt sowohl
 * `assets/logo.png` als auch den bloßen `logo.png` entgegen: Das Fenster kennt
 * den Pfad, ein Wunsch nennt oft nur den Namen.
 */
export function assetName(pathOrName: string): string {
  const raw = String(pathOrName ?? '').trim();
  const name = raw.startsWith(`${ASSETS_DIR}/`) ? raw.slice(ASSETS_DIR.length + 1) : raw;
  return isValidAssetName(name) ? name : '';
}

/** Gültige Asset-Pfade: genau `assets/<name>`, ohne Unterordner und ohne Ausbruch. */
export function isAssetPath(p: string): boolean {
  if (typeof p !== 'string' || !p.startsWith(`${ASSETS_DIR}/`)) return false;
  return isValidAssetName(p.slice(ASSETS_DIR.length + 1));
}

/** Ein Name, wie er im Asset-Ordner stehen darf (das Ergebnis von `sanitizeAssetName`). */
function isValidAssetName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_ASSET_NAME_LENGTH) return false;
  if (name.startsWith('.')) return false;
  return !FORBIDDEN.test(name);
}

/** Name und Endung getrennt (`logo`, `.png`) — ohne Endung bleibt die zweite leer. */
function splitName(name: string): [string, string] {
  const at = name.lastIndexOf('.');
  return at > 0 ? [name.slice(0, at), name.slice(at)] : [name, ''];
}

/**
 * Macht aus dem Namen, den der Anwender mitbringt, einen, der im Asset-Ordner
 * stehen darf: nur der Dateiname (nie der Pfad davor — auch kein `..`), nur
 * einfache Zeichen, nichts Verstecktes, nicht zu lang. Bleibt nichts übrig,
 * heißt die Datei `asset`.
 */
export function sanitizeAssetName(name: string): string {
  const raw = String(name ?? '').trim();
  const base = raw.split(/[/\\]/).pop() ?? '';
  const visible = base.replace(/^\.+/, '');
  const [stem, ext] = splitName(visible);

  const cleanStem = stem.replace(ALLOWED, '-').replace(/-{2,}/g, '-').replace(/^-+|[-.]+$/g, '');
  const cleanExt = ext.replace(ALLOWED, '-').replace(/-{2,}/g, '-').replace(/-+$/, '');
  if (!cleanStem) return FALLBACK_NAME;

  const room = Math.max(1, MAX_ASSET_NAME_LENGTH - cleanExt.length);
  return `${cleanStem.slice(0, room)}${cleanExt}`;
}

/**
 * Ein Name, den es im Asset-Ordner noch nicht gibt: `logo.png` wird zu
 * `logo-2.png`, dann `logo-3.png`. Zwei gleichnamige Bilder sind der Normalfall
 * (jedes Fotoprogramm liefert `bild.png`) — überschrieben wird deshalb nie
 * stillschweigend. Verglichen wird ohne Rücksicht auf Groß- und
 * Kleinschreibung: Auf macOS und Windows ist `Logo.png` dieselbe Datei wie
 * `logo.png`.
 */
export function uniqueAssetName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;

  const [stem, ext] = splitName(name);
  for (let n = 2; ; n += 1) {
    const candidate = `${stem}-${n}${ext}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Endung → Medientyp. Eigene Tabelle, nicht die der Vorschau (core/preview):
 * Die dortige liefert bewusst nur Bild, Video und Ton aus, damit über den
 * Dateistrom nie ein aktives Dokument geladen wird. Hier geht es um etwas
 * anderes — der Typ wird beim Bündeln zur `data:`-URI (c0117), und dafür
 * braucht es gerade auch Schriften und SVG.
 */
const MIME: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  svg: 'image/svg+xml',

  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',

  json: 'application/json', csv: 'text/csv', tsv: 'text/tab-separated-values',
  txt: 'text/plain', md: 'text/markdown', xml: 'application/xml',
  pdf: 'application/pdf',

  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  flac: 'audio/flac', aac: 'audio/aac',

  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
};

/** Der Medientyp eines Assets, an seiner Endung erkannt. */
export function assetMime(pathOrName: string): string {
  return MIME[extensionOf(String(pathOrName ?? ''))] ?? 'application/octet-stream';
}
