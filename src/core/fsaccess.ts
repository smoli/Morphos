import fs from 'node:fs';
import path from 'node:path';
import type { FsEntry, FsRequest, FsResponse, FsResult, FsStatInfo } from '@/types';

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

function ok(result?: FsResult): FsResponse {
  return { ok: true, result };
}
function fail(err: unknown): FsResponse {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}
function deny(): FsResponse {
  return { ok: false, error: 'Zugriff außerhalb des Datenordners ist nicht erlaubt.' };
}

/** Führt eine einzelne, auf den Zugriffsordner eingegrenzte Operation aus. */
export function runFs(root: string, req: FsRequest): FsResponse {
  const target = confineWithin(root, req.path);
  if (target === null) return deny();

  try {
    if (escapesViaSymlink(root, target)) return deny();
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
        const entries: FsEntry[] = dirents.map((d) => {
          const abs = path.join(target, d.name);
          return {
            name: d.name,
            path: path.relative(root, abs).split(path.sep).join('/'),
            isDir: d.isDirectory(),
          };
        });
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
