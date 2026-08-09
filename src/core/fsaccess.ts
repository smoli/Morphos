import fs from 'node:fs';
import path from 'node:path';
import type {
  FsEntry,
  FsRequest,
  FsResponse,
  FsResult,
  FsStatInfo,
  ShellFsRequest,
  ShellFsResponse,
  ShellFsResult,
  TrashEntry,
} from '@/types';
import { joinRelPath, normalizeRelPath, parentDir } from './dialog';
import { TRASH_DIR, TRASH_FILES, TRASH_META, isTrashPath, nameError, parseTrashMeta, uniqueName } from './trash';

/**
 * Löst einen von einer App angefragten (relativen) Pfad gegen den Zugriffsordner
 * auf und stellt sicher, dass er den Ordner NICHT verlässt. Gibt den absoluten
 * Zielpfad zurück oder null, wenn er ausbrechen würde.
 *
 * Absolute bzw. laufwerksbehaftete Pfade werden als relativ zum Ordner behandelt
 * (führende Trenner/Laufwerksbuchstaben werden entfernt), damit eine App durch
 * "/etc/passwd" o. Ä. nicht ausbrechen kann.
 */
export function confineWithin(root: string, relPath: string): string | null {
  const base = path.resolve(root);
  const cleaned = String(relPath ?? '')
    .replace(/^[a-zA-Z]:[\\/]?/, '') // Laufwerksbuchstabe
    .replace(/^[\\/]+/, ''); // führende Trenner
  const target = path.resolve(base, cleaned);
  if (!staysWithin(base, target)) return null;
  return target;
}

/** Lexikalische Prüfung: liegt `target` innerhalb von `base` (oder ist `base` selbst)? */
function staysWithin(base: string, target: string): boolean {
  const rel = path.relative(base, target);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

/** Existenzprüfung, die Symlinks selbst sieht (auch kaputte), statt ihnen zu folgen. */
function lexists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * confineWithin prüft nur lexikalisch — ein Symlink INNERHALB des Ordners kann
 * trotzdem nach außen zeigen. Hier wird der tiefste existierende Teil des Ziels
 * real aufgelöst (Symlinks folgen) und geprüft, dass er im real aufgelösten
 * Ordner bleibt. Kaputte Symlinks lassen realpathSync werfen → Zugriff scheitert.
 */
function escapesViaSymlink(root: string, target: string): boolean {
  const base = fs.realpathSync(path.resolve(root));
  let probe = target;
  const rest: string[] = [];
  while (!lexists(probe)) {
    rest.unshift(path.basename(probe));
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const real = path.resolve(fs.realpathSync(probe), ...rest);
  return !staysWithin(base, real);
}

/**
 * Der vollständig geprüfte, absolute Zielpfad einer Anfrage: lexikalisch
 * eingegrenzt UND real aufgelöst (kein Symlink führt hinaus). Null heißt: Der
 * Zugriff wird verweigert. Die eine Stelle, an der ein Pfad aus dem Renderer zu
 * einem Pfad auf der Platte wird — auch für den Dateistrom (core/filelink).
 */
export function resolveWithin(root: string, relPath: string): string | null {
  const target = confineWithin(root, relPath);
  if (target === null) return null;
  try {
    return escapesViaSymlink(root, target) ? null : target;
  } catch {
    // Kaputte Symlinks o. Ä.: Was sich nicht auflösen lässt, wird nicht gereicht.
    return null;
  }
}

function ok(result?: FsResult): FsResponse {
  return { ok: true, result };
}
function fail(err: unknown): FsResponse {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}
function deny(): FsResponse {
  return { ok: false, error: 'Zugriff außerhalb des Datenordners ist nicht erlaubt.' };
}

function denyTrash(): FsResponse {
  return { ok: false, error: 'Der Papierkorb gehört der Schale und ist von hier aus nicht erreichbar.' };
}

/**
 * Führt eine einzelne, auf den Zugriffsordner eingegrenzte Operation aus.
 *
 * Der Papierkorb (`.trash`) bleibt dabei außen vor — er ist weder anzufragen
 * noch in einer Liste zu sehen. Was der Anwender gelöscht hat, soll ihm keine
 * App wegräumen können; verwaltet wird der Papierkorb allein über `runShellFs`.
 */
export function runFs(root: string, req: FsRequest): FsResponse {
  if (isTrashPath(req.path)) return denyTrash();
  const target = resolveWithin(root, req.path);
  if (target === null) return deny();

  try {
    switch (req.op) {
      case 'read':
        return ok(fs.readFileSync(target, 'utf8'));

      case 'write': {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, req.data ?? '', 'utf8');
        return ok();
      }

      case 'mkdir':
        fs.mkdirSync(target, { recursive: true });
        return ok();

      case 'list': {
        const dirents = fs.readdirSync(target, { withFileTypes: true });
        const entries: FsEntry[] = dirents
          .map((d) => {
            const abs = path.join(target, d.name);
            return {
              name: d.name,
              path: path.relative(root, abs).split(path.sep).join('/'),
              isDir: d.isDirectory(),
            };
          })
          .filter((e) => !isTrashPath(e.path));
        return ok(entries);
      }

      case 'exists':
        return ok(fs.existsSync(target));

      case 'stat': {
        if (!fs.existsSync(target)) {
          const info: FsStatInfo = { exists: false, isDir: false, size: 0, modified: 0 };
          return ok(info);
        }
        const s = fs.statSync(target);
        const info: FsStatInfo = {
          exists: true,
          isDir: s.isDirectory(),
          size: s.size,
          modified: s.mtimeMs,
        };
        return ok(info);
      }

      case 'delete':
        fs.rmSync(target, { recursive: true, force: true });
        return ok();

      default:
        return { ok: false, error: `Unbekannte Operation: ${(req as FsRequest).op}` };
    }
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ *
 * Verwalten (c0050): anlegen, umbenennen, verschieben, kopieren — und
 * der Papierkorb. Alles Anweisungen des ANWENDERS aus der Schale, keine
 * App-Anfragen: die Operationen stehen bewusst nicht in `FsOp`, also
 * kann sie über `morphosFS` niemand anfordern (core/appfs: ALLOWED_OPS).
 * Eingegrenzt wird trotzdem jeder Pfad — Quelle wie Ziel.
 * ------------------------------------------------------------------ */

function sok(result?: ShellFsResult): ShellFsResponse {
  return { ok: true, result };
}
function serr(message: string): ShellFsResponse {
  return { ok: false, error: message };
}
function sdeny(): ShellFsResponse {
  return { ok: false, error: 'Zugriff außerhalb des Datenordners ist nicht erlaubt.' };
}
/** „Am Ziel liegt schon etwas“ — die Schale fragt nach und wiederholt mit `overwrite`. */
function sexists(name: string): ShellFsResponse {
  return { ok: false, error: `„${name}“ gibt es dort bereits.`, code: 'exists' };
}

/**
 * Ein Pfad, der eine gewöhnliche Stelle im Datenordner bezeichnet: normalisiert,
 * eingegrenzt, nicht im Papierkorb. `null` heißt: kommt nicht in Frage.
 */
function userPath(root: string, relPath: unknown): { rel: string; abs: string } | null {
  const rel = normalizeRelPath(relPath);
  if (rel === null || isTrashPath(rel)) return null;
  const abs = resolveWithin(root, rel);
  return abs === null ? null : { rel, abs };
}

/** Verschiebt innerhalb des Datenordners; über Gerätegrenzen hinweg als Kopie. */
function moveTo(from: string, to: string): void {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    fs.cpSync(from, to, { recursive: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

/** Räumt ein belegtes Ziel — aber nur, wenn der Anwender es zugelassen hat. */
function clearTarget(destAbs: string, name: string, overwrite: boolean): ShellFsResponse | null {
  if (!lexists(destAbs)) return null;
  if (!overwrite) return sexists(name);
  fs.rmSync(destAbs, { recursive: true, force: true });
  return null;
}

/** Liegt `inner` in `outer` (oder ist es selbst)? Verhindert den Ordner in sich selbst. */
function isInside(outer: string, inner: string): boolean {
  const rel = path.relative(outer, inner);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

/** Legt einen Ordner an: `path` ist der Elternordner, `to` der neue Name. */
function newFolder(root: string, req: ShellFsRequest): ShellFsResponse {
  const name = String(req.to ?? '').trim();
  const bad = nameError(name);
  if (bad) return serr(bad);

  const parent = userPath(root, req.path);
  if (!parent) return sdeny();
  const rel = joinRelPath(parent.rel, name);
  const abs = resolveWithin(root, rel);
  if (abs === null) return sdeny();
  if (lexists(abs)) return sexists(name);

  fs.mkdirSync(abs, { recursive: true });
  return sok(rel);
}

/** Benennt um: derselbe Ordner, neuer Name. */
function renameEntry(root: string, req: ShellFsRequest): ShellFsResponse {
  const name = String(req.to ?? '').trim();
  const bad = nameError(name);
  if (bad) return serr(bad);

  const src = userPath(root, req.path);
  if (!src) return sdeny();
  if (!src.rel) return serr('Der Datenordner selbst lässt sich nicht umbenennen.');
  if (!lexists(src.abs)) return serr('Diesen Eintrag gibt es nicht (mehr).');

  const destRel = joinRelPath(parentDir(src.rel), name);
  const destAbs = resolveWithin(root, destRel);
  if (destAbs === null) return sdeny();
  if (destAbs === src.abs) return sok(destRel);

  const blocked = clearTarget(destAbs, name, req.overwrite === true);
  if (blocked) return blocked;

  moveTo(src.abs, destAbs);
  return sok(destRel);
}

/** Verschiebt oder kopiert einen Eintrag in einen anderen Ordner. */
function transfer(root: string, req: ShellFsRequest, copy: boolean): ShellFsResponse {
  const src = userPath(root, req.path);
  if (!src) return sdeny();
  if (!src.rel) return serr('Der Datenordner selbst lässt sich nicht verschieben.');
  if (!lexists(src.abs)) return serr('Diesen Eintrag gibt es nicht (mehr).');

  const destDir = userPath(root, req.to ?? '');
  if (!destDir) return sdeny();
  if (!fs.existsSync(destDir.abs) || !fs.statSync(destDir.abs).isDirectory()) {
    return serr('Das Ziel ist kein Ordner.');
  }
  // Ein Ordner kann nicht in sich selbst wandern — das wäre eine Endlosschleife.
  if (fs.lstatSync(src.abs).isDirectory() && isInside(src.abs, destDir.abs)) {
    return serr('Ein Ordner lässt sich nicht in sich selbst verschieben.');
  }

  const name = src.rel.slice(src.rel.lastIndexOf('/') + 1);
  let destRel = joinRelPath(destDir.rel, name);
  let destAbs = resolveWithin(root, destRel);
  if (destAbs === null) return sdeny();

  if (destAbs === src.abs) {
    // Am selben Ort: Verschieben ist getan, Kopieren bekommt einen freien Namen.
    if (!copy) return sok(destRel);
    const free = uniqueName(fs.readdirSync(destDir.abs), name);
    destRel = joinRelPath(destDir.rel, free);
    destAbs = resolveWithin(root, destRel);
    if (destAbs === null) return sdeny();
  } else {
    const blocked = clearTarget(destAbs, name, req.overwrite === true);
    if (blocked) return blocked;
  }

  if (copy) fs.cpSync(src.abs, destAbs, { recursive: true });
  else moveTo(src.abs, destAbs);
  return sok(destRel);
}

/** Die beiden Ordner des Papierkorbs, angelegt falls nötig. */
function trashDirs(root: string): { files: string; meta: string } | null {
  const files = resolveWithin(root, TRASH_FILES);
  const meta = resolveWithin(root, TRASH_META);
  if (files === null || meta === null) return null;
  fs.mkdirSync(files, { recursive: true });
  fs.mkdirSync(meta, { recursive: true });
  return { files, meta };
}

/** Löschen heißt: in den Papierkorb verschieben, samt Zettel, wo es herkam. */
function toTrash(root: string, req: ShellFsRequest): ShellFsResponse {
  const src = userPath(root, req.path);
  if (!src) return sdeny();
  if (!src.rel) return serr('Der Datenordner selbst lässt sich nicht löschen.');
  if (!lexists(src.abs)) return serr('Diesen Eintrag gibt es nicht (mehr).');

  const dirs = trashDirs(root);
  if (!dirs) return sdeny();

  const name = src.rel.slice(src.rel.lastIndexOf('/') + 1);
  const id = uniqueName(fs.readdirSync(dirs.files), name);
  const isDir = fs.lstatSync(src.abs).isDirectory();

  moveTo(src.abs, path.join(dirs.files, id));
  const meta = { name, from: src.rel, deletedAt: Date.now(), isDir };
  fs.writeFileSync(path.join(dirs.meta, `${id}.json`), JSON.stringify(meta, null, 2), 'utf8');
  return sok(id);
}

/** Was im Papierkorb liegt — das Jüngste zuerst. Zettel ohne Stück zählen nicht. */
function listTrash(root: string): TrashEntry[] {
  const meta = resolveWithin(root, TRASH_META);
  const files = resolveWithin(root, TRASH_FILES);
  if (meta === null || files === null || !fs.existsSync(meta)) return [];

  const items: TrashEntry[] = [];
  for (const file of fs.readdirSync(meta)) {
    if (!file.endsWith('.json')) continue;
    const id = file.slice(0, -'.json'.length);
    if (!lexists(path.join(files, id))) continue;
    try {
      const item = parseTrashMeta(JSON.parse(fs.readFileSync(path.join(meta, file), 'utf8')), id);
      if (item) items.push(item);
    } catch {
      /* Ein unlesbarer Zettel verschweigt nur seine Herkunft — er soll nicht die Liste kippen. */
    }
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt || a.name.localeCompare(b.name, 'de'));
}

/** Holt ein Stück aus dem Papierkorb an seinen Herkunftsort zurück. */
function restore(root: string, req: ShellFsRequest): ShellFsResponse {
  const id = String(req.path ?? '');
  // Die Id ist ein einfacher Name im Papierkorb — kein Pfad, kein Ausbruch.
  if (!id || id !== path.basename(id) || id === '.' || id === '..') {
    return serr('Diesen Eintrag gibt es im Papierkorb nicht.');
  }
  const fileAbs = resolveWithin(root, `${TRASH_FILES}/${id}`);
  const metaAbs = resolveWithin(root, `${TRASH_META}/${id}.json`);
  if (fileAbs === null || metaAbs === null || !lexists(fileAbs) || !fs.existsSync(metaAbs)) {
    return serr('Diesen Eintrag gibt es im Papierkorb nicht.');
  }

  let item: TrashEntry | null = null;
  try {
    item = parseTrashMeta(JSON.parse(fs.readFileSync(metaAbs, 'utf8')), id);
  } catch {
    item = null;
  }
  if (!item) return serr('Zu diesem Eintrag ist nicht mehr bekannt, wo er herkam.');

  const dest = userPath(root, item.from);
  if (!dest) return sdeny();
  const blocked = clearTarget(dest.abs, item.name, req.overwrite === true);
  if (blocked) return blocked;

  // Der Ordner von damals kann inzwischen fehlen — dann entsteht er neu.
  fs.mkdirSync(path.dirname(dest.abs), { recursive: true });
  moveTo(fileAbs, dest.abs);
  fs.rmSync(metaAbs, { force: true });
  return sok(dest.rel);
}

/** Leert den Papierkorb endgültig — der einzige Weg, an dem nichts zurückkommt. */
function emptyTrash(root: string): ShellFsResponse {
  const count = listTrash(root).length;
  const dir = resolveWithin(root, TRASH_DIR);
  if (dir === null) return sdeny();
  fs.rmSync(dir, { recursive: true, force: true });
  trashDirs(root);
  return sok(count);
}

/**
 * Führt eine Verwaltungs-Operation der Schale aus — eingegrenzt auf den
 * Datenordner, Quelle wie Ziel (siehe `userPath`).
 */
export function runShellFs(root: string, req: ShellFsRequest): ShellFsResponse {
  try {
    switch (req.op) {
      case 'newFolder':
        return newFolder(root, req);
      case 'rename':
        return renameEntry(root, req);
      case 'move':
        return transfer(root, req, false);
      case 'copy':
        return transfer(root, req, true);
      case 'trash':
        return toTrash(root, req);
      case 'trashList':
        return sok(listTrash(root));
      case 'restore':
        return restore(root, req);
      case 'emptyTrash':
        return emptyTrash(root);
      default:
        return serr(`Unbekannte Operation: ${(req as ShellFsRequest).op}`);
    }
  } catch (err) {
    return serr(err instanceof Error ? err.message : String(err));
  }
}
