/**
 * Die Regeln der Datei-Vorschau im Explorer: was sich womit zeigen lässt und wie
 * der Inhalt für die Anzeige aufbereitet wird. Rein — gelesen wird woanders.
 *
 * Zwei Wege, und die Trennung dazwischen ist der Kern dieser Datei:
 *
 * - **Passiv** (Bild, Video, Ton, Markdown, JSON, Text) wird von der Schale
 *   selbst dargestellt. Alles, was dabei zu HTML wird, geht escape-first durch
 *   core/markdown bzw. durch `highlightJson` — aus einer fremden Datei kann so
 *   kein Markup in die Schale entkommen.
 * - **Aktiv** (HTML, SVG) wird NICHT dargestellt, sondern in dieselbe Sandbox
 *   gesteckt wie eine erzeugte App: eigener iframe ohne allow-same-origin, dazu
 *   die CSP aus core/appfs. Gefiltert wird dabei nichts — die Isolation trägt,
 *   nicht das Aussieben.
 *
 * Grosse Dateien kommen gar nicht erst im Renderer an: Bild/Video/Ton laufen
 * über den eingegrenzten Strom (core/filelink), Text wird oberhalb von
 * TEXT_LIMIT nicht gelesen, sondern mit einem Hinweis abgelehnt.
 */

import { CSP_META, insertIntoHead } from './appfs';
import { escapeHtml } from './markdown';

/** Die Art, in der eine Datei gezeigt wird (`unknown` = gar nicht). */
export type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'markdown'
  | 'json'
  | 'text'
  | 'html'
  | 'svg'
  | 'unknown';

/**
 * Endung → Art. Bei Video und Ton ist verlässlich nur, was Chromium überall
 * abspielt: **mp4 (H.264/AAC)**, **webm** und **mp3/wav/ogg**. Die übrigen
 * Formate stehen hier, weil der Versuch nichts kostet — gelingt er nicht, sagt
 * die Vorschau das (und zeigt stattdessen die Angaben zur Datei).
 */
const KINDS: Readonly<Record<string, PreviewKind>> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  avif: 'image', bmp: 'image', ico: 'image',

  mp4: 'video', webm: 'video', m4v: 'video', mov: 'video', ogv: 'video',

  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio',
  flac: 'audio', aac: 'audio',

  md: 'markdown', markdown: 'markdown',
  json: 'json',

  txt: 'text', log: 'text', csv: 'text', tsv: 'text', ini: 'text', conf: 'text',
  js: 'text', mjs: 'text', cjs: 'text', ts: 'text', css: 'text', yml: 'text',
  yaml: 'text', xml: 'text', sh: 'text',

  html: 'html', htm: 'html',
  svg: 'svg',
};

/** Benennung der Arten für den Anwender. */
const LABELS: Readonly<Record<PreviewKind, string>> = {
  image: 'Bild',
  video: 'Video',
  audio: 'Ton',
  markdown: 'Markdown',
  json: 'JSON',
  text: 'Text',
  html: 'HTML-Dokument',
  svg: 'SVG-Grafik',
  unknown: 'Datei',
};

/**
 * So viel Text zeigt die Vorschau höchstens (512 KB). Darüber wird die Datei
 * gar nicht erst gelesen — eine Vorschau ist kein Editor, und ein 200-MB-Log
 * hat im Renderer nichts verloren.
 */
export const TEXT_LIMIT = 512 * 1024;

/** Die Endung eines Dateinamens, klein und ohne Punkt ("" = keine). */
export function extensionOf(name: string): string {
  const at = String(name ?? '').lastIndexOf('.');
  if (at <= 0) return '';
  return name.slice(at + 1).toLowerCase();
}

/** Wie diese Datei gezeigt wird — allein am Namen erkannt. */
export function previewKind(name: string): PreviewKind {
  return KINDS[extensionOf(name)] ?? 'unknown';
}

/**
 * Der Medientyp, unter dem der Dateistrom (core/filelink) eine Datei
 * ausliefert. Bewusst NUR für Bild, Video und Ton — alles andere geht als
 * `application/octet-stream` hinaus, selbst HTML und SVG. So kann über den
 * Strom nie ein aktives Dokument geladen werden; solche Dateien nimmt die
 * Vorschau ohnehin nur gelesen und in die Sandbox gesteckt entgegen.
 */
export function streamMimeType(name: string): string {
  const kind = previewKind(name);
  if (!isStreamed(kind)) return 'application/octet-stream';
  return MIME[extensionOf(name)] ?? 'application/octet-stream';
}

const MIME: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',

  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  ogv: 'video/ogg',

  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac',
};

/** Der Name der Art, wie er in der Vorschau steht. */
export function kindLabel(kind: PreviewKind): string {
  return LABELS[kind];
}

/**
 * Kommt der Inhalt über den eingegrenzten Strom (statt durch einen Lesezugriff)?
 * Genau die Medien — sie sind binär und gern gross.
 */
export function isStreamed(kind: PreviewKind): boolean {
  return kind === 'image' || kind === 'video' || kind === 'audio';
}

/** Kappt zu langen Text auf das Maß und sagt, ob gekappt wurde. */
export function capText(text: string, limit: number = TEXT_LIMIT): { text: string; capped: boolean } {
  const raw = text ?? '';
  if (raw.length <= limit) return { text: raw, capped: false };
  return { text: raw.slice(0, limit), capped: true };
}

/** Rückt JSON ein; null, wenn es keines ist (dann bleibt es schlichter Text). */
export function prettyJson(raw: string): string | null {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return null;
  }
}

/**
 * Färbt eingerücktes JSON ein — escape-first: JEDES Stück, ob Marke oder
 * Zwischenraum, geht durch escapeHtml, bevor es ins Ergebnis kommt. Die
 * einzigen Tags sind die hier erzeugten <span>.
 */
export function highlightJson(pretty: string): string {
  const token = /"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const source = pretty ?? '';
  let out = '';
  let last = 0;

  for (let m = token.exec(source); m; m = token.exec(source)) {
    const raw = m[0];
    const end = m.index + raw.length;
    out += escapeHtml(source.slice(last, m.index));
    out += `<span class="${classOf(raw, source.slice(end))}">${escapeHtml(raw)}</span>`;
    last = end;
  }
  return out + escapeHtml(source.slice(last));
}

/** Ein Name in Anführungszeichen ist ein Schlüssel, wenn ein Doppelpunkt folgt. */
function classOf(raw: string, rest: string): string {
  if (raw.startsWith('"')) return /^\s*:/.test(rest) ? 'jv-key' : 'jv-str';
  if (raw === 'true' || raw === 'false') return 'jv-bool';
  if (raw === 'null') return 'jv-null';
  return 'jv-num';
}

/**
 * Baut das Dokument, das der Vorschau-iframe lädt: der Inhalt unverändert,
 * davor die CSP der erzeugten Apps (kein Netz, keine fremden Ressourcen). Die
 * eigentliche Isolation kommt aus der Sandbox des iframes — ohne
 * allow-same-origin gibt es keinen Weg zur Schale zurück.
 */
export function previewDocument(source: string, kind: 'html' | 'svg'): string {
  if (kind === 'svg') {
    return (
      '<!DOCTYPE html><html><head>' +
      CSP_META +
      '<style>html,body{margin:0;height:100%}body{display:flex;align-items:center;' +
      'justify-content:center;background:#fff}svg{max-width:100%;max-height:100%}</style>' +
      `</head><body>${source}</body></html>`
    );
  }
  return insertIntoHead(source, CSP_META);
}
