/**
 * Der eingegrenzte Strom auf eine Datei im Datenordner — die Adresse, unter der
 * der Renderer ein Bild, ein Video oder einen Ton anzeigen kann, OHNE dass die
 * Datei durch den IPC-Kanal gereicht und im Renderer eingebettet werden müsste.
 *
 * Der Hauptprozess meldet dafür ein eigenes Schema an (`morphos-file://`) und
 * beantwortet jede Anfrage erst, nachdem er sie genauso geprüft hat wie jeden
 * anderen Dateizugriff: Der Datenordner muss ein freigegebener sein, und der
 * Pfad darf ihn nicht verlassen (core/fsaccess). Ausgeliefert wird gestreamt —
 * grosse Dateien und das Spulen in Video/Ton funktionieren so von selbst.
 *
 * Hier steht nur das Reine: die Adresse bauen, sie wieder auseinandernehmen und
 * die Prüfkette in der richtigen Reihenfolge durchlaufen.
 */

/** Das eigene Schema (im Hauptprozess als privilegiert/streamfähig angemeldet). */
export const FILE_SCHEME = 'morphos-file';

/** Der (bedeutungslose, aber nötige) Hostanteil einer Adresse dieses Schemas. */
const FILE_HOST = 'datei';

/** Die Adresse einer Datei im Datenordner: Ordner und Pfad stehen in der Abfrage. */
export function fileUrl(root: string, path: string): string {
  const query = new URLSearchParams({ root, path }).toString();
  return `${FILE_SCHEME}://${FILE_HOST}/?${query}`;
}

/** Zerlegt eine Adresse dieses Schemas wieder; alles andere gilt als ungültig. */
export function parseFileUrl(url: string): { root: string; path: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${FILE_SCHEME}:`) return null;
  const root = parsed.searchParams.get('root');
  if (!root) return null;
  return { root, path: parsed.searchParams.get('path') ?? '' };
}

/**
 * Die Prüfkette einer Stromanfrage: gültige Adresse, freigegebener Datenordner,
 * eingegrenzter Pfad. Erst wenn alles drei zutrifft, kommt der absolute Pfad
 * zurück — sonst null, und der Hauptprozess antwortet mit einer Absage.
 */
export function resolveFileRequest(
  url: string,
  isApprovedRoot: (root: string) => boolean,
  resolve: (root: string, path: string) => string | null,
): string | null {
  const req = parseFileUrl(url);
  if (!req) return null;
  if (!isApprovedRoot(req.root)) return null;
  return resolve(req.root, req.path);
}

/**
 * Zerlegt eine Teilanfrage („bytes=1000-“) in das Stück, das ausgeliefert wird:
 * die Byte-Nummern des ersten und letzten Bytes, beide einschließlich. Null
 * heißt „so nicht“ — der Hauptprozess antwortet dann mit 416.
 *
 * Nötig, weil erst eine saubere 206-Antwort mit Content-Range das Spulen in
 * Video und Ton trägt; ohne sie hält der Abspieler das Bruchstück für die ganze
 * Datei. Mehrteilige Anfragen kommen bei Medien nicht vor — vom ersten Stück
 * abgesehen werden sie hier nicht bedient.
 */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)/.exec(String(header ?? '').trim());
  if (!match || size <= 0) return null;
  const [, from, to] = match;
  if (from === '' && to === '') return null;

  // "bytes=-500": die letzten 500 Bytes.
  if (from === '') {
    const length = Number(to);
    if (length <= 0) return null;
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(from);
  if (start >= size) return null; // hinter dem Ende gibt es nichts
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (end < start) return null;
  return { start, end };
}
