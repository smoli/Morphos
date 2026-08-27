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
 * Die Beigaben der App fürs Bündeln: in-App-Pfad → fertige `data:`-URI
 * (`{ 'assets/logo.png': 'data:image/png;base64,…' }`). `bundle` bleibt damit
 * rein — es rechnet mit einer Karte, so wie es das bei `libs` schon tut; wer
 * sie füllt, liest die Bytes von der Platte (core/assetstore: assetDataUris).
 */
export type AssetMap = Record<string, string>;

/**
 * Löst EINE Referenz gegen die Asset-Karte auf — die eine Stelle, an der aus
 * `assets/logo.png` die `data:`-URI wird. Alle Formen unten (src, srcset,
 * poster, href, url(…)) gehen hier hindurch; was die Karte nicht kennt, bleibt
 * stehen, damit die Schreibweise des Agenten unangetastet bleibt.
 */
function assetUri(assets: AssetMap, ref: string): string | undefined {
  const cleaned = String(ref ?? '').trim().replace(/^\.\//, '');
  return Object.prototype.hasOwnProperty.call(assets, cleaned) ? assets[cleaned] : undefined;
}

/** Ein `url(...)` in CSS — in Anführungszeichen oder ohne. */
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;

/**
 * Die `url(...)` eines CSS-Stücks. Eingesetzt wird OHNE Anführungszeichen: Eine
 * base64-`data:`-URI enthält weder Klammer noch Leerzeichen noch Anführungszeichen
 * und ist so auch im style-Attribut sicher, gleich womit dieses zitiert ist.
 */
function inlineCssUrls(css: string, assets: AssetMap): string {
  return css.replace(CSS_URL, (whole, quoted: string, single: string, bare: string) => {
    const uri = assetUri(assets, quoted ?? single ?? bare ?? '');
    return uri ? `url(${uri})` : whole;
  });
}

/**
 * Ein srcset: Kandidaten durch Komma getrennt, jeder mit Deskriptor („1x“,
 * „640w“). Ersetzt wird nur die URL, der Deskriptor bleibt — ein Asset-Name
 * trägt nie ein Komma (core/assets), das Trennen ist also eindeutig.
 */
function inlineSrcset(value: string, assets: AssetMap): string {
  return value
    .split(',')
    .map((candidate) =>
      candidate.replace(/^(\s*)(\S+)/, (whole, space: string, ref: string) => {
        const uri = assetUri(assets, ref);
        return uri ? `${space}${uri}` : whole;
      }),
    )
    .join(',');
}

/**
 * Die Attribute, die auf ein Asset zeigen können: `src` (img, video, audio,
 * source), `srcset`, `poster`, `href` (nur am SVG-<image> — ein <a href> ist
 * ein Verweis, kein eingebetteter Inhalt) und `style` mit seinen `url(...)`.
 * Vor dem Namen muss Weißraum oder ein Doppelpunkt stehen (`xlink:href`),
 * sonst spräche `data-morphos-src` mit an.
 */
const ASSET_ATTR = /(^|[\s:])(src|srcset|poster|href|style)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi;

/** Die Attribute EINES öffnenden Tags. */
function inlineAttrs(attrs: string, tag: string, assets: AssetMap): string {
  return attrs.replace(
    ASSET_ATTR,
    (whole, lead: string, name: string, eq: string, quoted: string, single: string, bare: string) => {
      const value = quoted ?? single ?? bare ?? '';
      const quote = quoted !== undefined ? '"' : single !== undefined ? "'" : '';
      const key = name.toLowerCase();
      if (key === 'href' && tag !== 'image') return whole;

      const next =
        key === 'style'
          ? inlineCssUrls(value, assets)
          : key === 'srcset'
            ? inlineSrcset(value, assets)
            : (assetUri(assets, value) ?? value);
      return next === value ? whole : `${lead}${name}${eq}${quote}${next}${quote}`;
    },
  );
}

/**
 * Ein Durchgang durch das Dokument, in dem jede Referenz auf `assets/…` zu
 * ihrer `data:`-URI wird: Attribute an öffnenden Tags, `url(...)` in
 * <style>-Blöcken (also auch in einer eben eingebetteten src/*.css samt ihrer
 * @font-face) und in style-Attributen. Skripte bleiben unangetastet — was dort
 * steht, ist Code, kein Markup; ein Kommentar ebenso.
 *
 * Ein Fehlgriff ist kein Fehler: Was die Karte nicht kennt (ein gelöschtes
 * Asset, eine fremde URL), bleibt Zeichen für Zeichen stehen und scheitert
 * höchstens zur Laufzeit an der CSP. Eine Obergrenze gibt es nicht — die
 * base64-Fracht im Artefakt ist hingenommen (e16).
 */
const ASSET_TOKEN =
  /<!--[\s\S]*?-->|<(script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)(<\/\1\s*>)|<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

function inlineAssets(html: string, assets: AssetMap): string {
  return html.replace(
    ASSET_TOKEN,
    (whole, block: string, blockAttrs: string, body: string, close: string, tag: string, attrs: string) => {
      if (block) {
        return block.toLowerCase() === 'style'
          ? `<${block}${blockAttrs}>${inlineCssUrls(body, assets)}${close}`
          : whole;
      }
      if (!tag) return whole; // Kommentar
      return `<${tag}${inlineAttrs(attrs, tag.toLowerCase(), assets)}>`;
    },
  );
}

/**
 * Bündelt den Quelldatei-Satz einer App zu EINEM in sich geschlossenen
 * HTML-Dokument: <link>-Stylesheets und <script src>-Referenzen auf eigene
 * Quelldateien werden inline eingebettet, morphos:lib-Metatags durch den
 * (von der Shell gecacht gelieferten) Bibliotheks-Code ersetzt.
 *
 * `libs` bildet Bibliotheks-URL → Inhalt ab, `assets` in-App-Pfad → `data:`-URI
 * (core/assetstore baut sie von der Platte); nicht auflösbare Referenzen bleiben
 * in beiden Fällen unangetastet (und scheitern zur Laufzeit an der CSP).
 */
export function bundle(files: SourceFile[], libs: Record<string, string> = {}, assets: AssetMap = {}): string {
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

  // Zuletzt die Assets: Erst jetzt steht das ganze Dokument da — auch das CSS
  // aus src/*.css, das eben zum <style>-Block wurde und seine Schriften noch
  // per url(assets/…) sucht.
  return Object.keys(assets).length ? inlineAssets(html, assets) : html;
}
