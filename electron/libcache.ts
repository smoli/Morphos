import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { matchesWhitelist } from '../src/core/libs';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_LIB_BYTES = 10_000_000;

/**
 * Tier-1-Bibliotheksauflösung: Eine freigegebene Bibliothek wird EINMALIG von
 * ihrer https-Quelle geladen und dauerhaft gecacht (Schlüssel = URL-Hash).
 * Die laufende App bekommt den Inhalt beim Bündeln inline — sie selbst hat
 * weiterhin keinerlei Netzwerkzugriff.
 */
export async function resolveLibs(
  urls: string[],
  whitelist: string[],
  cacheDir: string,
): Promise<{ ok: true; libs: Record<string, string> } | { ok: false; error: string }> {
  const blocked = urls.filter((u) => !matchesWhitelist(u, whitelist));
  if (blocked.length > 0) {
    return {
      ok: false,
      error:
        `Nicht freigegebene Bibliotheks-Quelle(n):\n${blocked.map((u) => `  ${u}`).join('\n')}\n` +
        'Ergänze die Quelle auf dem Desktop unter „Bibliotheken der Apps“ oder formuliere den Wunsch ohne Bibliothek.',
    };
  }

  const libs: Record<string, string> = {};
  for (const url of urls) {
    try {
      libs[url] = await loadCached(url, whitelist, cacheDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Die Bibliothek konnte nicht geladen werden (${url}): ${msg}` };
    }
  }
  return { ok: true, libs };
}

function cacheFile(cacheDir: string, url: string): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  return path.join(cacheDir, `${hash}.js`);
}

async function loadCached(url: string, whitelist: string[], cacheDir: string): Promise<string> {
  const file = cacheFile(cacheDir, url);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    /* noch nicht im Cache */
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Auch das Ziel etwaiger Redirects muss freigegeben sein.
    if (res.url && res.url !== url && !matchesWhitelist(res.url, whitelist)) {
      throw new Error(`Umleitung auf nicht freigegebene Quelle: ${res.url}`);
    }
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_LIB_BYTES) {
      throw new Error('Bibliothek zu groß (mehr als 10 MB).');
    }
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
