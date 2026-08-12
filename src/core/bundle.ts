import type { SourceFile } from '@/types';

/** Einstiegsdatei jeder App. */
export const ENTRY_FILE = 'src/index.html';

/** Löst eine in src/index.html referenzierte URL gegen den Dateisatz auf. */
function lookup(files: Map<string, string>, ref: string): string | undefined {
  if (/^[a-z]+:/i.test(ref) || ref.startsWith('/')) return undefined; // absolute/externe URLs
  const cleaned = ref.replace(/^\.\//, '');
  return files.get(`src/${cleaned}`);
}

/** Entschärft schließende Script-Tags, damit Inline-Einbettung das Dokument nicht sprengt. */
function escapeScript(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

/**
 * Elemente, die als Ziel des Element-Pickers nicht in Frage kommen: Kopf und
 * Metadaten. Sie bleiben unangetastet — auch damit die Ersetzungen unten
 * (link/script/meta) auf unverändertem Markup arbeiten.
 */
const SKIP_TAGS = new Set(['html', 'head', 'base', 'link', 'meta', 'title', 'script', 'style']);

/**
 * Ein Durchgang durch das Dokument: Kommentar, vollständiger Script-/Style-Block
 * (samt Inhalt — dort steht kein statisch geschriebenes Markup, sondern Code)
 * oder ein öffnendes Tag. Attributwerte werden mitgelesen, damit ein "<" darin
 * kein Tag vortäuscht.
 */
const TOKEN = /<!--[\s\S]*?-->|<(script|style)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/**
 * Schreibt jedem statisch geschriebenen Element seinen Quellort als
 * `data-morphos-src="datei:zeile:spalte"` ins Tag. Damit findet das LLM zu einem
 * im Fenster markierten Element (siehe core/pick) die exakte Stelle im Quelltext
 * wieder. Was erst zur Laufzeit entsteht, bekommt naturgemäß keinen — dort trägt
 * die Beschreibung des Elements.
 */
export function annotateSource(html: string, path: string): string {
  if (!html) return html;
  let out = '';
  let last = 0;
  // Zeile/Spalte laufen mit dem Durchgang mit, statt für jedes Tag von vorn zu zählen.
  let line = 1;
  let lineStart = 0;
  let scanned = 0;

  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(html); m; m = TOKEN.exec(html)) {
    const tag = m[2];
    if (!tag) continue; // Kommentar oder Script-/Style-Block: übergehen
    if (SKIP_TAGS.has(tag.toLowerCase()) || /\bdata-morphos-src\s*=/i.test(m[3] ?? '')) continue;

    for (; scanned < m.index; scanned++) {
      if (html.charCodeAt(scanned) === 10) {
        line += 1;
        lineStart = scanned + 1;
      }
    }
    const at = m.index + 1 + tag.length;
    out += `${html.slice(last, at)} data-morphos-src="${path}:${line}:${m.index - lineStart + 1}"`;
    last = at;
  }
  return out + html.slice(last);
}

/**
 * Bündelt den Quelldatei-Satz einer App zu EINEM in sich geschlossenen
 * HTML-Dokument: <link>-Stylesheets und <script src>-Referenzen auf eigene
 * Quelldateien werden inline eingebettet, morphos:lib-Metatags durch den
 * (von der Shell gecacht gelieferten) Bibliotheks-Code ersetzt.
 *
 * `libs` bildet Bibliotheks-URL → Inhalt ab; nicht auflösbare Referenzen
 * bleiben unangetastet (und scheitern zur Laufzeit an der CSP).
 */
export function bundle(files: SourceFile[], libs: Record<string, string> = {}): string {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const entry = byPath.get(ENTRY_FILE);
  if (!entry) return '';

  // Zuerst die Quellorte — sie beziehen sich auf src/index.html, also auf den
  // Stand VOR dem Einbetten fremder Inhalte.
  let html = annotateSource(entry, ENTRY_FILE);

  // <link rel="stylesheet" href="…"> → <style>…</style>
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel=["']stylesheet["']/i.test(tag)) return tag;
    const href = tag.match(/\bhref=["']([^"']+)["']/i);
    const content = href ? lookup(byPath, href[1]) : undefined;
    return content !== undefined ? `<style>${content}</style>` : tag;
  });

  // <script src="…"></script> → <script>…</script>
  html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src: string) => {
    const content = lookup(byPath, src);
    return content !== undefined ? `<script>${escapeScript(content)}</script>` : tag;
  });

  // <meta name="morphos:lib" content="URL"> → <script data-morphos-lib="URL">…</script>
  html = html.replace(/<meta\b[^>]*\bname=["']morphos:lib["'][^>]*>/gi, (tag) => {
    const m = tag.match(/\bcontent=["']([^"']+)["']/i);
    const url = m?.[1]?.trim();
    const content = url ? libs[url] : undefined;
    return content !== undefined ? `<script data-morphos-lib="${url}">${escapeScript(content)}</script>` : tag;
  });

  return html;
}
