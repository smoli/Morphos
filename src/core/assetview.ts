import { assetName } from './assets';
import { extensionOf } from './preview';
import type { SourceFile } from '@/types';

/**
 * Wie ein Asset dem Anwender gezeigt wird (e16/c0119) — die Regeln der
 * Beigaben-Verwaltung, rein und ohne einen Griff zur Platte. Die Bytes holt der
 * Panel einzeln über den Host; hier steht nur, WAS damit anzufangen ist.
 *
 * Entschieden wird am Medientyp, den `core/assets` aus der Endung ableitet —
 * nicht am Namen: Die Auskunft über ein Asset trägt ihn ohnehin mit sich, und
 * über den Typ hat schon core/assets entschieden. Das ist auch der Unterschied
 * zu `previewKind` (core/preview): Dort geht es um fremde Dateien im Explorer,
 * wo SVG und HTML in die Sandbox müssen, weil sie aktiv sein können. Ein Asset
 * dagegen wird als BILD gezeigt (`<img src="data:…">`) — dort führt auch ein SVG
 * kein Skript aus —, und Schriften kennt die Vorschau des Explorers gar nicht.
 */

/** Die Art, in der ein Asset gezeigt wird. */
export type AssetView = 'image' | 'font' | 'audio' | 'video' | 'text' | 'file';

/** Medientyp → Darstellung. Was hier nicht zutrifft, ist schlicht eine Datei. */
export function assetView(mime: string): AssetView {
  const type = String(mime ?? '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('font/')) return 'font';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('text/') || type === 'application/json' || type === 'application/xml') return 'text';
  return 'file';
}

/** Zeichen je Art — dasselbe in der Liste, in der Vorschau und am Wunsch (ChatDock). */
const ICONS: Readonly<Record<AssetView, string>> = {
  image: '🖼', font: '🔤', audio: '🎵', video: '🎬', text: '📄', file: '📦',
};

/** Benennung der Arten für den Anwender. */
const LABELS: Readonly<Record<AssetView, string>> = {
  image: 'Bild', font: 'Schrift', audio: 'Ton', video: 'Video', text: 'Daten', file: 'Datei',
};

/** Woran man eine Beigabe auf einen Blick erkennt. */
export function assetIcon(mime: string): string {
  return ICONS[assetView(mime)];
}

/**
 * Die Typangabe in der Liste: die Art aus dem Medientyp, das Format aus der
 * Endung („Bild · PNG“). Die Endung ist die ehrlichere Auskunft über das
 * Format — `image/jpeg` steht für `.jpg` wie für `.jpeg`, und der Anwender
 * sucht die Datei, die er kennt. Ohne Endung bleibt es bei der Art.
 */
export function assetTypeLabel(asset: { name: string; mime: string }): string {
  const label = LABELS[assetView(asset?.mime ?? '')];
  const ext = extensionOf(asset?.name ?? '');
  return ext ? `${label} · ${ext.toUpperCase()}` : label;
}

/**
 * Die `data:`-URI, aus der Bild, Ton und Video ihre Vorschau beziehen. Fehlt
 * eines von beidem, kommt nichts heraus: Eine halbe URI zeigte nur ein kaputtes
 * Bild, wo besser gar keines steht.
 */
export function assetDataUri(mime: string, base64: string): string {
  if (!mime || !base64) return '';
  return `data:${mime};base64,${base64}`;
}

/**
 * Der Inhalt aus dem, was der `FileReader` einer gewählten Datei liefert —
 * `data:<typ>;base64,<inhalt>`. Angenommen wird nur die base64-Form; alles
 * andere gibt nichts her, denn über die Brücke geht ein Asset ausschließlich so.
 */
export function base64FromDataUri(uri: string): string {
  const at = String(uri ?? '').indexOf(';base64,');
  if (at < 0 || !String(uri).startsWith('data:')) return '';
  return String(uri).slice(at + ';base64,'.length);
}

/**
 * So viel Text zeigt die Vorschau einer Datendatei (64 KB). Sie ist eine
 * Vorschau, kein Editor — und der Rest einer 200-MB-CSV hilft niemandem.
 */
export const ASSET_TEXT_LIMIT = 64 * 1024;

/**
 * Der Text einer Datendatei aus ihren base64-Bytes. Entschlüsselt wird nur so
 * viel, wie das Maß hergibt: Bei einer großen Datei stünde sonst erst die ganze
 * Datei als Zeichenkette im Speicher, um dann weggeworfen zu werden. Vier
 * base64-Zeichen sind drei Bytes — an dieser Grenze lässt sich der Anfang für
 * sich allein lesen.
 *
 * Was sich nicht lesen lässt, gibt leeren Text — die Vorschau zeigt dann die
 * Angaben zur Datei, statt dass etwas wirft.
 */
export function assetText(base64: string, limit: number = ASSET_TEXT_LIMIT): { text: string; capped: boolean } {
  const raw = String(base64 ?? '');
  const head = raw.slice(0, Math.ceil(limit / 3) * 4);
  try {
    const binary = atob(head);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    if (text.length <= limit) return { text, capped: head.length < raw.length };
    return { text: text.slice(0, limit), capped: true };
  } catch {
    return { text: '', capped: false };
  }
}

/**
 * Welche Quelldateien dieses Asset verwenden — die Auskunft, die vor dem
 * Entfernen zählt. Gesucht wird der bloße Dateiname, denn er steht in jeder
 * Schreibweise der Referenz (`assets/logo.png`, `./assets/logo.png`,
 * `url(assets/logo.png)`).
 *
 * Ein Name mitten in einem längeren steckt nicht: `meinlogo.png` ist nicht
 * `logo.png`. Und was gar kein Asset-Name ist, findet nichts — ein leerer Name
 * fände sonst jede Datei.
 *
 * Verhindert wird damit nichts: Entfernen bleibt dem Anwender überlassen, die
 * Referenz bliebe stehen (das Bündeln lässt sie unangetastet, c0117). Es ist
 * eine Warnung, keine Sperre.
 */
export function assetUsers(files: readonly SourceFile[], pathOrName: string): string[] {
  const name = assetName(pathOrName);
  if (!name) return [];
  const pattern = new RegExp(`(^|[^A-Za-z0-9._-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9._-])`);
  return (files ?? []).filter((f) => pattern.test(f?.content ?? '')).map((f) => f.path);
}
