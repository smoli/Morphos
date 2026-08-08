import type { DialogKind, DialogRequest, DialogResponse, FsEntry } from '@/types';

/**
 * Die Dateidialoge der Shell: Auswahl einer Datei zum Öffnen, eines Ziels zum
 * Speichern oder eines Ordners. Der Picker wird vom vertrauenswürdigen Renderer
 * gezeichnet (nicht im App-iframe) und bleibt im Datenordner; zurück kommt ein
 * relativer Pfad, mit dem die App dann readFile/writeFile aufruft — die
 * Berechtigungen greifen also unverändert.
 */
export const DIALOG_KINDS: readonly DialogKind[] = ['open', 'save', 'directory'];

/**
 * Normalisiert einen Pfad zu einem "/"-getrennten relativen Pfad im Datenordner.
 * "" bezeichnet den Datenordner selbst. Absolute bzw. laufwerksbehaftete Pfade
 * werden als relativ behandelt (wie in core/fsaccess), ein Ausbruch über ".."
 * liefert null.
 */
export function normalizeRelPath(input: unknown): string | null {
  const raw = String(input ?? '')
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:\/?/, '') // Laufwerksbuchstabe
    .replace(/^\/+/, ''); // führende Trenner → relativ zum Datenordner
  const out: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

/** Hängt einen Namen an einen relativen Ordnerpfad an. */
export function joinRelPath(dir: string, name: string): string {
  const d = dir.replace(/\/+$/, '');
  return d ? `${d}/${name}` : name;
}

/** Der übergeordnete Ordner — über den Datenordner ("") hinaus geht es nicht. */
export function parentDir(dir: string): string {
  const at = dir.lastIndexOf('/');
  return at < 0 ? '' : dir.slice(0, at);
}

/** Zerlegt einen Ordnerpfad in anklickbare Wegmarken (ohne den Datenordner selbst). */
export function breadcrumbs(dir: string): { name: string; path: string }[] {
  const crumbs: { name: string; path: string }[] = [];
  let path = '';
  for (const seg of dir.split('/')) {
    if (!seg) continue;
    path = joinRelPath(path, seg);
    crumbs.push({ name: seg, path });
  }
  return crumbs;
}

/** Reduziert eine Eingabe auf einen einfachen Dateinamen (ohne Pfadanteile). */
export function sanitizeFileName(input: unknown): string {
  const raw = String(input ?? '').replace(/\\/g, '/');
  const last = raw.slice(raw.lastIndexOf('/') + 1).trim();
  return last === '.' || last === '..' ? '' : last;
}

/** Normalisiert Dateiendungen: ohne führenden Punkt, klein, ohne Dubletten. */
export function normalizeExtensions(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    const ext = String(raw ?? '')
      .trim()
      .replace(/^\.+/, '')
      .toLowerCase();
    if (ext && !out.includes(ext)) out.push(ext);
  }
  return out;
}

/** Passt ein Dateiname zum Endungsfilter? Ein leerer Filter lässt alles zu. */
export function matchesExtensions(name: string, exts: string[]): boolean {
  if (exts.length === 0) return true;
  const lower = name.toLowerCase();
  return exts.some((e) => lower.endsWith(`.${e}`));
}

/**
 * Ergänzt beim Speichern die erste erlaubte Endung — aber nur, wenn der Anwender
 * gar keine getippt hat. Eine bewusst andere Endung bleibt stehen.
 */
export function applyDefaultExtension(name: string, exts: string[]): string {
  const n = name.trim();
  if (!n || exts.length === 0) return n;
  return /\.[^./]+$/.test(n) ? n : `${n}.${exts[0]}`;
}

/**
 * Die im Dialog anzuzeigenden Einträge: Ordner zuerst, dann alphabetisch. Bei
 * der Ordnerauswahl bleiben Dateien ganz weg, sonst filtert die Endungsliste sie
 * (Ordner bleiben immer sichtbar — sonst käme man nicht weiter).
 */
export function visibleEntries(entries: FsEntry[], kind: DialogKind, exts: string[]): FsEntry[] {
  return entries
    .filter((e) => (e.isDir ? true : kind !== 'directory' && matchesExtensions(e.name, exts)))
    .sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name, 'de') : a.isDir ? -1 : 1,
    );
}

/**
 * Prüft und normalisiert die Dialoganfrage einer App. Alles, was die App
 * mitschickt, ist unvertrauenswürdig: Startordner wird eingegrenzt, der
 * Namensvorschlag auf einen reinen Dateinamen reduziert.
 */
export function parseDialogRequest(raw: unknown): DialogRequest | null {
  const msg = (raw ?? {}) as { dialog?: unknown; options?: unknown };
  const kind = msg.dialog;
  if (typeof kind !== 'string' || !DIALOG_KINDS.includes(kind as DialogKind)) return null;

  const opts = (msg.options ?? {}) as Record<string, unknown>;
  const req: DialogRequest = {
    kind: kind as DialogKind,
    // Ein ausbrechender Startordner ist kein Fehler — er fällt auf den Datenordner zurück.
    startDir: normalizeRelPath(opts.startDir) ?? '',
    extensions: normalizeExtensions(opts.extensions),
  };
  const suggested = sanitizeFileName(opts.suggestedName);
  if (suggested) req.suggestedName = suggested;
  const title = String(opts.title ?? '').trim();
  if (title) req.title = title.slice(0, 120);
  return req;
}

/**
 * Nimmt die Dialoganfrage einer App entgegen und übergibt sie dem Picker der
 * Shell (`pick`). Der Rückgabewert ist ein auf den Datenordner eingegrenzter
 * relativer Pfad oder null bei Abbruch. Ein Fehler des Pickers (z. B. es ist
 * schon einer offen) wird zur fangbaren Fehlerantwort.
 */
export async function dispatchDialogRequest(
  raw: unknown,
  accessRoot: string | null,
  pick: (req: DialogRequest) => Promise<string | null>,
): Promise<DialogResponse> {
  if (!accessRoot) {
    return { ok: false, error: 'Für diesen Workspace ist kein Datenordner festgelegt.' };
  }
  const req = parseDialogRequest(raw);
  if (!req) {
    return { ok: false, error: `Unbekannter Dateidialog: ${String((raw as { dialog?: unknown })?.dialog)}` };
  }

  let picked: string | null;
  try {
    picked = await pick(req);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (picked === null || picked === undefined) return { ok: true, result: null };

  const rel = normalizeRelPath(picked);
  if (rel === null) return { ok: false, error: 'Zugriff außerhalb des Datenordners ist nicht erlaubt.' };
  return { ok: true, result: rel };
}
