/**
 * Framework-unabhängige Helfer rund um die App-Identität (Name, Icon, Id/Slug).
 * Der Slug dient zugleich als Name des App-Unterordners im Arbeitsverzeichnis.
 */

export const DEFAULT_NAME = 'Neue App';
export const DEFAULT_ICON = '🧩';

/** Wandelt einen Namen in einen dateisystemtauglichen Slug (a–z, 0–9, "-"). */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diakritische Zeichen entfernen
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base || 'app';
}

/** Bildet eine eindeutige App-Id aus Slug + kurzem Zufallssuffix. */
export function makeAppId(name: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${slugify(name)}-${suffix}`;
}

/**
 * Taugt das als App-Id? Die Id ist zugleich der Name des App-Unterordners —
 * sie darf daher nichts enthalten, womit sich das Arbeitsverzeichnis verlassen
 * ließe. Wichtig überall dort, wo eine Id von außen kommt: aus dem Renderer
 * (siehe main.ts safeId) oder aus einer fremden app.json (siehe core/appimport).
 */
export function isSafeAppId(id: unknown): id is string {
  return typeof id === 'string' && id !== '.' && id !== '..' && /^[A-Za-z0-9._-]+$/.test(id);
}
