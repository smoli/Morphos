import fs from 'node:fs';
import path from 'node:path';
import type { ImportChoice, ImportResult } from '@/types';
import { isSafeAppId } from './app';
import { readManifest } from './appstore';
import { cloneRepo, commitAll } from './gitstore';
import { accessProblem } from './remote';

/**
 * Eine App aus einem Git-Repository holen (nur Hauptprozess).
 *
 * Jede Morphos-App IST ein Repository — Teilen heißt also: den App-Ordner zu
 * einer Gegenstelle schieben, Holen heißt: ihn zurückklonen. Genau das passiert
 * hier, und zwar als echter Klon: mit `.git`, voller Historie und `origin`.
 * Damit bleibt der Weg zurück offen (Aktualisierung ziehen/zurückschieben).
 *
 * Der Ablauf in drei Schritten, weil dazwischen der Anwender gefragt werden
 * muss:
 *
 *   1. `startImport` klont in einen Wartebereich IM Arbeitsverzeichnis
 *      (`.morphos-import/…`) und prüft dort, ob das überhaupt eine Morphos-App
 *      ist. Passt alles und ist die Id frei, wandert der Klon sofort an seinen
 *      Platz — fertig.
 *   2. Ist die Id belegt, bleibt der Klon liegen und es kommt eine Rückfrage
 *      zurück (Kopie / Ersetzen / Abbrechen).
 *   3. `resolveImport` führt die Antwort aus.
 *
 * Der Wartebereich liegt bewusst im Arbeitsverzeichnis und nicht im Temp-Ordner
 * des Systems: Der Klon verlässt den freigegebenen Bereich nie, und das
 * Einordnen ist am Ende ein Umbenennen im selben Dateisystem — kein Kopieren,
 * kein halb angekommener App-Ordner. Eine Ebene tiefer als die Apps liegt er
 * auch: `listApps` sieht in `.morphos-import` kein Manifest und geht vorbei.
 */

/** Der Wartebereich der Klone, relativ zum Arbeitsverzeichnis. */
export const IMPORT_DIR = '.morphos-import';

// ---- Prüfen (rein) ----

/** Adressen, die git versteht: mit Schema, im scp-Kurzformat oder ein Pfad. */
const URL_SCHEME = /^(https?|ssh|git|file):\/\/[^\s]+$/i;
const URL_SCP = /^[A-Za-z0-9._~-]+@[A-Za-z0-9._-]+:[^\s]+$/;
const URL_PATH = /^(\/[^\s]*|[A-Za-z]:[\\/][^\s]*)$/;

/**
 * Der Grund, warum diese Repository-Adresse nicht taugt — leer heißt: sie
 * taugt. Die Adresse kommt vom Anwender, nicht aus App-Inhalten; geprüft wird
 * sie trotzdem, denn git kennt Adressen, die mehr tun als holen:
 *
 * - `ext::sh -c …` (und jeder andere Transport-Helfer `name::…`) führt einen
 *   Befehl aus — das ist keine Adresse, das ist eine Ausführung.
 * - Was mit `-` beginnt, sähe für git wie eine Option aus. Es geht ohnehin
 *   hinter `--` (siehe gitstore), aber was keine Adresse ist, kommt hier gar
 *   nicht erst durch.
 */
export function repoUrlError(url: unknown): string {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) return 'Bitte die Adresse des Repositories angeben.';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f]/.test(value)) return 'Die Adresse enthält unerlaubte Zeichen.';
  if (value.startsWith('-')) return 'Eine Adresse darf nicht mit „-“ beginnen.';
  if (/^[A-Za-z0-9+.-]*::/.test(value)) {
    return 'Adressen mit „::“ (Transport-Helfer wie ext::) sind nicht erlaubt.';
  }
  if (!URL_SCHEME.test(value) && !URL_SCP.test(value) && !URL_PATH.test(value)) {
    return 'Das sieht nicht nach einer Repository-Adresse aus (https://…, git@…:… oder ein Pfad).';
  }
  return '';
}

/**
 * Der Grund, warum das Geklonte keine Morphos-App ist — leer heißt: es ist
 * eine. Verlangt wird das Manifest im Wurzelverzeichnis mit einer Id, die als
 * Ordnername taugt (sonst führte eine fremde app.json aus dem
 * Arbeitsverzeichnis heraus), und einem Namen. Alles Weitere — auch das
 * Alt-Format mit `history` — erledigt beim Öffnen die gewohnte Migration.
 */
export function manifestError(meta: unknown): string {
  if (!meta || typeof meta !== 'object') {
    return 'Dieses Repository enthält keine Morphos-App (app.json fehlt oder ist nicht lesbar).';
  }
  const { id, name } = meta as { id?: unknown; name?: unknown };
  if (!isSafeAppId(id)) return 'Die app.json dieses Repositories hat keine gültige Id.';
  if (typeof name !== 'string' || !name.trim()) return 'Die app.json dieses Repositories hat keinen Namen.';
  return '';
}

/**
 * Aus dem Klagelaut von git eine Meldung machen, mit der der Anwender etwas
 * anfangen kann (i0007): „fatal: could not read Username for
 * 'https://github.com': terminal prompts disabled" sagt nichts darüber, dass
 * schlicht kein Zugang hinterlegt ist — und schon gar nicht, wo er herkommt.
 *
 * Woran ein fehlender Zugang zu erkennen ist und was dagegen hilft, steht in
 * core/remote: Es gilt fürs Holen einer App genauso wie fürs Schieben und
 * Ziehen (c0082). Alles Übrige — kaputte Adresse, kein Netz — bleibt wörtlich
 * stehen, da weiß git es besser.
 */
export function cloneErrorMessage(reason: string, url: string): string {
  return accessProblem(reason, url) ?? `Das Repository konnte nicht geholt werden: ${reason}`;
}

/**
 * Eine im Arbeitsverzeichnis noch freie Id: `rechner-ab12c` →
 * `rechner-ab12c-2` → `rechner-ab12c-3`. So bekommt eine Kopie ihren eigenen
 * Ordner neben dem Original (wie core/trash uniqueName es für Dateien tut).
 */
export function uniqueAppId(taken: Iterable<string>, id: string): string {
  const used = new Set(taken);
  if (!used.has(id)) return id;
  for (let n = 2; ; n++) {
    const candidate = `${id}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

// ---- Ausführen (Dateisystem + git) ----

/** Ein geklonter, aber noch nicht eingeordneter Import — er wartet auf die Antwort. */
interface PendingImport {
  folder: string;
  /** Der wartende Klon im Wartebereich. */
  dir: string;
  id: string;
  name: string;
}

const pending = new Map<string, PendingImport>();
let counter = 0;

/** Alles, was im Arbeitsverzeichnis eine Id belegt — Ordnername wie Manifest. */
function takenIds(folder: string): Set<string> {
  const ids = new Set<string>();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return ids;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === IMPORT_DIR) continue;
    ids.add(entry.name);
    const meta = readManifest(path.join(folder, entry.name));
    if (meta?.id) ids.add(meta.id);
  }
  return ids;
}

/** Der Anzeigename der App, die diese Id schon hat (notfalls die Id selbst). */
function existingNameOf(folder: string, id: string): string {
  return readManifest(path.join(folder, id))?.name || id;
}

/**
 * Wirft weg, was ein abgebrochener Lauf im Wartebereich hinterlassen hat — was
 * gerade auf eine Antwort wartet, bleibt selbstverständlich liegen.
 */
function sweepStaleClones(folder: string): void {
  const base = path.join(folder, IMPORT_DIR);
  const alive = new Set([...pending.values()].map((p) => p.dir));
  let entries: string[];
  try {
    entries = fs.readdirSync(base);
  } catch {
    return;
  }
  for (const name of entries) {
    const dir = path.join(base, name);
    if (!alive.has(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Räumt einen Klon weg und, wenn er der letzte war, auch den Wartebereich. */
function discardClone(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  try {
    fs.rmdirSync(path.dirname(dir));
  } catch {
    /* nicht leer oder gar nicht da — dann bleibt er eben */
  }
}

/** Verschiebt den geprüften Klon an seinen Platz: `<Arbeitsverzeichnis>/<id>`. */
function placeClone(folder: string, dir: string, id: string): void {
  fs.renameSync(dir, path.join(folder, id));
  try {
    fs.rmdirSync(path.dirname(dir));
  } catch {
    /* es warten noch andere */
  }
}

/**
 * Schreibt eine neue Id ins Manifest des Klons — alles andere (Name, Icon,
 * Zeitstempel, auch ein Alt-Format-`history`) bleibt unangetastet.
 */
function rewriteId(dir: string, id: string): void {
  const file = path.join(dir, 'app.json');
  const meta = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  fs.writeFileSync(file, JSON.stringify({ ...meta, id }, null, 2), 'utf8');
}

/**
 * Holt die App aus dem Repository. Zurück kommt entweder die eingeordnete App,
 * eine Rückfrage wegen einer belegten Id — oder ein Fehler; in dem Fall ist
 * auch der Klon wieder weg und das Arbeitsverzeichnis unverändert.
 */
export async function startImport(folder: string, url: string): Promise<ImportResult> {
  if (!folder || typeof folder !== 'string' || !fs.existsSync(folder)) {
    return { ok: false, error: 'Kein Arbeitsverzeichnis geöffnet.' };
  }
  const urlError = repoUrlError(url);
  if (urlError) return { ok: false, error: urlError };

  sweepStaleClones(folder);
  const dir = path.join(folder, IMPORT_DIR, `clone-${(counter += 1)}-${Date.now()}`);

  try {
    await cloneRepo(String(url).trim(), dir);
  } catch (err) {
    discardClone(dir);
    return {
      ok: false,
      error: cloneErrorMessage(err instanceof Error ? err.message : String(err), String(url)),
    };
  }

  const meta = readManifest(dir);
  const metaError = manifestError(meta);
  if (metaError || !meta) {
    discardClone(dir);
    return { ok: false, error: metaError };
  }

  const id = meta.id;
  const name = meta.name;
  const taken = takenIds(folder);
  if (!taken.has(id)) {
    try {
      placeClone(folder, dir, id);
    } catch (err) {
      discardClone(dir);
      return { ok: false, error: `Die App konnte nicht abgelegt werden: ${err instanceof Error ? err.message : String(err)}` };
    }
    return { ok: true, id, name };
  }

  const token = `import-${counter}`;
  pending.set(token, { folder, dir, id, name });
  return {
    ok: false,
    collision: {
      token,
      id,
      name,
      existingName: existingNameOf(folder, id),
      copyId: uniqueAppId(taken, id),
    },
  };
}

/**
 * Führt die Antwort auf eine belegte Id aus: als Kopie unter neuer Id ablegen,
 * die vorhandene App ersetzen (das bestätigt der Anwender zuvor in der Schale)
 * oder abbrechen. In jedem Fall ist der Wartebereich danach leer.
 */
export async function resolveImport(token: string, choice: ImportChoice): Promise<ImportResult> {
  const entry = pending.get(token);
  if (!entry) return { ok: false, error: 'Dieser Import wartet nicht mehr.' };
  pending.delete(token);
  const { folder, dir, name } = entry;

  if (choice === 'cancel') {
    discardClone(dir);
    return { ok: false, cancelled: true };
  }

  try {
    if (choice === 'copy') {
      const id = uniqueAppId(takenIds(folder), entry.id);
      rewriteId(dir, id);
      // Die neue Id gehört in die Historie: Der Klon bringt seine mit, dies ist
      // die erste eigene Version dieser Kopie.
      await commitAll(dir, `Als Kopie importiert (Id: ${id})`);
      placeClone(folder, dir, id);
      return { ok: true, id, name };
    }

    // Ersetzen: Die vorhandene App weicht mitsamt ihrer Historie dem Import.
    fs.rmSync(path.join(folder, entry.id), { recursive: true, force: true });
    placeClone(folder, dir, entry.id);
    return { ok: true, id: entry.id, name };
  } catch (err) {
    discardClone(dir);
    return { ok: false, error: `Die App konnte nicht abgelegt werden: ${err instanceof Error ? err.message : String(err)}` };
  }
}
