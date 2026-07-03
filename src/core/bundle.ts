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

  let html = entry;

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
