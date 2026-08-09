/**
 * Rein: die Lieblings-Apps eines Arbeitsverzeichnisses.
 *
 * „Im Dock behalten“ heißt: Die App steht dort auch dann, wenn sie gerade nicht
 * läuft. Gemerkt wird je Workspace-Pfad — wie die Kachel-Positionen, denn ein
 * anderes Verzeichnis hat andere Apps.
 */

/** Die gemerkten Lieblinge aus den Einstellungen eintüten (Fremdes fällt weg). */
export function cleanFavorites(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue;
    const clean: string[] = [];
    for (const id of ids) {
      if (typeof id !== 'string' || !id || clean.includes(id)) continue;
      clean.push(id);
    }
    if (clean.length) out[folder] = clean;
  }
  return out;
}

/** Eine App zu den Lieblingen nehmen oder wieder heraus (Reihenfolge bleibt). */
export function toggleFavorite(list: readonly string[], appId: string): string[] {
  return list.includes(appId) ? list.filter((id) => id !== appId) : [...list, appId];
}
