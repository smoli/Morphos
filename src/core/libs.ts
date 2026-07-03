/**
 * Bibliotheks-Freigabe (Tier 1): Apps deklarieren Bibliotheken per
 * <meta name="morphos:lib" content="https://…">. Die Shell lädt eine so
 * deklarierte Bibliothek EINMALIG (nur von freigegebenen Quellen), cacht sie
 * und bettet sie beim Bündeln inline ein — die laufende App bleibt offline.
 */

/** Liest alle per morphos:lib deklarierten Bibliotheks-URLs (dedupliziert). */
export function extractLibs(html: string): string[] {
  const urls: string[] = [];
  const tags = html.match(/<meta\b[^>]*\bname=["']morphos:lib["'][^>]*>/gi) ?? [];
  for (const tag of tags) {
    const m = tag.match(/\bcontent=["']([^"']+)["']/i);
    const url = m?.[1]?.trim();
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Prüft eine Bibliotheks-URL gegen die Freigabeliste. Zwei Musterformen:
 * - Hostname ("cdn.jsdelivr.net"): exakter Host oder Subdomain davon.
 * - https-URL-Präfix ("https://cdn.jsdelivr.net/npm/"): exakter Host und
 *   Pfad-Präfix (geparst, nicht als Stringvergleich — kein Host-Suffix-Trick).
 * Es sind ausschließlich https-URLs zulässig.
 */
export function matchesWhitelist(url: string, patterns: string[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;

  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;

    if (pattern.includes('://')) {
      let p: URL;
      try {
        p = new URL(pattern);
      } catch {
        continue;
      }
      if (p.protocol !== 'https:') continue;
      if (u.hostname !== p.hostname) continue;
      if (u.pathname.startsWith(p.pathname)) return true;
    } else {
      if (u.hostname === pattern || u.hostname.endsWith('.' + pattern)) return true;
    }
  }
  return false;
}
