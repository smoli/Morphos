import fs from 'node:fs';
import path from 'node:path';
import type { AppDocs } from '@/types';
import { readDocs, readManifest } from './appstore';
import { CONCEPT_FILE, USERDOC_FILE } from './docs';
import { DEFAULT_ICON, DEFAULT_NAME } from './app';
import { isImageIcon, validateIconImage } from './icon';
import { escapeHtml } from './markdown';

/**
 * Die Titelseite einer App (c0077).
 *
 * Jede App IST ihr eigenes Git-Repository (e11): Wer sie teilt, schiebt ihren
 * Ordner auf eine Gegenstelle — und dort schaut jemand zuerst auf das Readme.
 * Also schreibt die Schale eines: Icon und Name, ein Satz dazu, der Verweis auf
 * die beiden Dokumente der App und der Morphos-Stand, den sie braucht.
 *
 * Geschrieben wird es aus dem, was Morphos ohnehin weiß (Manifest + concept.md)
 * — NICHT vom LLM. `README.md` bleibt damit außerhalb des Dateiprotokolls: Eine
 * Generierung kann es weder überschreiben noch löschen (siehe core/files).
 *
 * Läuft nur im Hauptprozess (Dateisystem).
 */

/** Die Titelseite im App-Ordner. */
export const README_FILE = 'README.md';

/** Wohin das Readme für Morphos selbst verweist. */
export const MORPHOS_URL = 'https://github.com/smoli/Morphos';

/** So lang darf die Kurzbeschreibung höchstens werden. */
export const MAX_DESCRIPTION = 300;

/** Kantenlänge, mit der ein Bild-Icon im Readme steht. */
const ICON_WIDTH = 128;

/**
 * Ein Bild-Icon reist im Manifest als data:-URI — im Readme taugt das nichts:
 * Repository-Seiten (GitHub, GitLab) werfen data:-Bilder heraus. Also liegt das
 * Icon als ECHTE Datei neben dem Readme, benannt nach seinem Bildtyp.
 */
const ICON_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** Alle Namen, die ein abgelegtes Bild-Icon haben kann (zum Aufräumen). */
export const ICON_FILES = Object.values(ICON_EXTENSIONS).map((ext) => `icon.${ext}`);

/** data:<mime>;base64,<nutzlast> — mehr wird als Bild-Icon nicht angenommen. */
const IMAGE_DATA_URI = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/i;

/** Ein Morphos-Stand: Fassung und Commit, aus dem gebaut wurde. */
export interface MorphosBuild {
  version: string;
  commit: string;
}

/** Das Bild-Icon als Datei neben dem Readme. */
export interface IconAsset {
  file: string;
  data: Buffer;
}

/** Was beim Schreiben herauskam (c0080). */
export interface ReadmeWrite {
  /** Wurde geschrieben — falsch, wenn schon eines dastand. */
  created: boolean;
  /** Der Text: der eben geschriebene oder der, der dastand. */
  text: string;
}

/** Woraus das Readme gebaut wird — alles schon aufbereitet. */
export interface ReadmeInput extends MorphosBuild {
  name: string;
  /** Emoji oder Bild-Icon (data:-URI) aus dem Manifest. */
  icon: string;
  /** Name der Bilddatei daneben, falls das Icon ein Bild ist. */
  iconFile?: string | null;
  description: string;
  hasConcept: boolean;
  hasUserdoc: boolean;
}

/**
 * Macht aus einem Bild-Icon die Datei, die daneben liegt — null für ein Emoji
 * und für alles, was als Bild-Icon nicht durchgeht (geprüft wie beim Ablegen).
 */
export function iconAsset(icon: string): IconAsset | null {
  const value = (icon ?? '').trim();
  if (!isImageIcon(value) || !validateIconImage(value).ok) return null;
  const match = value.match(IMAGE_DATA_URI);
  if (!match) return null;
  const ext = ICON_EXTENSIONS[match[1].toLowerCase()];
  if (!ext) return null;
  return { file: `icon.${ext}`, data: Buffer.from(match[2], 'base64') };
}

/** Mehrere Zeilen werden ein Satzblock: ein Leerzeichen zwischen allem. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Nimmt dem Text seine Markdown-Zeichen: Die Beschreibung steht im Readme in
 * einem HTML-Absatz, und dort rendert kein Betrachter mehr Markdown — `**fett**`
 * bliebe als Sternchen stehen.
 */
function plain(text: string): string {
  return collapse(
    text
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // Links/Bilder → nur ihr Text
      .replace(/`+/g, '')
      .replace(/\*\*|__|\*/g, ''),
  );
}

/**
 * Der erste ECHTE Absatz eines Dokuments: Überschriften, Codeblöcke und
 * Kommentare am Anfang zählen nicht, der Absatz endet an der ersten Leerzeile.
 */
function firstParagraph(text: string): string {
  const para: string[] = [];
  let inFence = false;
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line.startsWith('<!--')) continue;
    if (!line || line.startsWith('#')) {
      if (para.length) break;
      continue;
    }
    para.push(line);
  }
  return collapse(para.join(' '));
}

/** Kürzt an einer Wortgrenze — lieber ein Satzanfang als ein abgehacktes Wort. */
function cap(text: string, max = MAX_DESCRIPTION): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const kept = space > max / 2 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s,;:.]+$/, '')}…`;
}

/**
 * Der eine Satz, der sagt, was die App ist: der erste Absatz des Konzepts —
 * ersatzweise der der Anleitung. Beides leer? Dann hat die App noch nichts zu
 * sagen, und das Readme setzt einen neutralen Satz.
 */
export function shortDescription(docs: AppDocs): string {
  const text = firstParagraph(docs?.concept ?? '') || firstParagraph(docs?.userdoc ?? '');
  return cap(plain(text));
}

/** Eine Fassung, die glaubwürdig aussieht (sonst lieber gar keine nennen). */
function cleanVersion(version: string): string {
  return /^[0-9A-Za-z.+_-]{1,32}$/.test((version ?? '').trim()) ? version.trim() : '';
}

/** Ein Commit ist eine Hexadezimalzahl — alles andere wird verschwiegen. */
function cleanCommit(commit: string): string {
  return /^[0-9a-f]{4,40}$/i.test((commit ?? '').trim()) ? commit.trim().toLowerCase() : '';
}

/** Der Stand, den diese App mindestens braucht. */
function morphosLine({ version, commit }: MorphosBuild): string {
  const v = cleanVersion(version);
  const c = cleanCommit(commit);
  const stand = [v ? `**Morphos ${v}**` : '**Morphos**', c ? `(Commit \`${c}\`)` : ''].filter(Boolean).join(' ');
  return `Diese Fassung entstand mit ${stand} — mindestens dieser Stand wird gebraucht, um die App zu öffnen und weiterzuentwickeln.`;
}

/** Der Kopf: Icon mittig, darunter der Name. */
function heading(input: ReadmeInput, name: string): string {
  if (input.iconFile) {
    return [
      `<p align="center"><img src="${escapeHtml(input.iconFile)}" alt="${name}" width="${ICON_WIDTH}"></p>`,
      `<h1 align="center">${name}</h1>`,
    ].join('\n\n');
  }
  const icon = (input.icon ?? '').trim();
  const emoji = escapeHtml(!icon || isImageIcon(icon) ? DEFAULT_ICON : icon);
  return `<h1 align="center">${emoji}<br>${name}</h1>`;
}

/** Die Verweise auf die beiden Dokumente der App. */
function details(input: ReadmeInput): string {
  const items = [
    input.hasConcept ? `- [Konzept](${CONCEPT_FILE}) — die lebende Spezifikation dieser App: Absicht, Aufbau, Entscheidungen.` : '',
    input.hasUserdoc ? `- [Anleitung](${USERDOC_FILE}) — wie die App benutzt wird.` : '',
  ].filter(Boolean);
  return items.length
    ? items.join('\n')
    : 'Diese App führt noch kein Konzept und keine Anleitung — beide entstehen bei ihrer nächsten Änderung.';
}

/** Die Titelseite als Markdown — rein, aus schon Aufbereitetem. */
export function buildReadme(input: ReadmeInput): string {
  const name = escapeHtml((input.name ?? '').trim() || DEFAULT_NAME);
  const description = escapeHtml(plain(input.description ?? '')) ||
    'Eine App, die in Morphos im Dialog entstanden ist.';
  return `${[
    heading(input, name),
    `<p align="center">${description}</p>`,
    '## Details',
    details(input),
    '## Morphos',
    `Diese App ist in [Morphos](${MORPHOS_URL}) entstanden: Ihr Ordner ist zugleich ihr Git-Repository — Morphos holt sie mit „App aus Git laden…“ wieder herein und entwickelt sie im Dialog weiter.`,
    morphosLine(input),
  ].join('\n\n')}\n`;
}

/**
 * Schreibt die Titelseite in den App-Ordner: `README.md` und — bei einem
 * Bild-Icon — die Bilddatei daneben; ein Bild-Icon von früher, das nicht mehr
 * gilt, verschwindet. Committet NICHT (das tut der Aufrufer, siehe main.ts).
 *
 * Geschrieben wird NUR, wenn noch kein Readme dasteht (c0080): Was jemand von
 * Hand hineingeschrieben hat, gehört ihm — eine zweite „Readme erstellen“ darf
 * es nicht stillschweigend gegen die Vorlage tauschen. Steht schon eines da,
 * bleibt der Ordner unangetastet (auch die Bilddatei) und `created` ist falsch.
 */
export function writeReadme(dir: string, morphos: MorphosBuild): ReadmeWrite {
  const file = path.join(dir, README_FILE);
  if (fs.existsSync(file)) return { created: false, text: fs.readFileSync(file, 'utf8') };

  const meta = readManifest(dir);
  if (!meta) throw new Error('Diese App hat kein Manifest (app.json).');

  const asset = iconAsset(meta.icon ?? '');
  for (const stale of ICON_FILES) {
    if (stale !== asset?.file) fs.rmSync(path.join(dir, stale), { force: true });
  }
  if (asset) fs.writeFileSync(path.join(dir, asset.file), asset.data);

  const docs = readDocs(dir);
  const text = buildReadme({
    name: meta.name ?? meta.id ?? DEFAULT_NAME,
    icon: meta.icon ?? DEFAULT_ICON,
    iconFile: asset?.file ?? null,
    description: shortDescription(docs),
    hasConcept: docs.concept.trim() !== '',
    hasUserdoc: docs.userdoc.trim() !== '',
    ...morphos,
  });
  fs.writeFileSync(file, text, 'utf8');
  return { created: true, text };
}
