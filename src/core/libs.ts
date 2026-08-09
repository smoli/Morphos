/**
 * Bibliotheks-Freigabe (Tier 1): Apps deklarieren Bibliotheken per
 * <meta name="morphos:lib" content="https://…">. Die Shell lädt eine so
 * deklarierte Bibliothek EINMALIG (nur von freigegebenen Quellen), cacht sie
 * und bettet sie beim Bündeln inline ein — die laufende App bleibt offline.
 */

/**
 * Eingebaute Bibliotheken (Tier 0): Sie werden nicht geladen, sondern liegen
 * der Shell bei (vendored in node_modules) und werden beim Bündeln inline
 * eingebettet. Eine App fordert sie unter ihrem NAMEN statt einer URL an —
 * <meta name="morphos:lib" content="preact"> —, deshalb greift für sie weder
 * Freigabeliste noch Cache. `glue` läuft hinter den Dateien und legt die
 * globale API zurecht.
 */
export const BUILTIN_LIBS: Record<string, { files: string[]; glue: string }> = {
  // Preact + Hooks + htm: CSP-sauber, denn htm ist ein Tagged-Template-PARSER
  // (kein eval) und braucht keinen Bündel-Schritt. Globale danach: preact,
  // preactHooks, html.
  preact: {
    files: ['preact/dist/preact.umd.js', 'preact/hooks/dist/hooks.umd.js', 'htm/dist/htm.umd.js'],
    glue: '\n;window.html = htm.bind(preact.h);\n',
  },
};

/** Ist das eine der eingebauten Bibliotheken (und nicht bloß ein Objekt-Erbstück)? */
export function isBuiltinLib(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_LIBS, name);
}

/**
 * Teilt die angeforderten Bibliotheken auf: eingebaute (beim Namen genannt)
 * kommen aus node_modules, alle übrigen sind URLs und laufen über Freigabeliste
 * und Cache.
 */
export function splitLibs(requested: string[]): { builtin: string[]; external: string[] } {
  return {
    builtin: requested.filter(isBuiltinLib),
    external: requested.filter((name) => !isBuiltinLib(name)),
  };
}

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
