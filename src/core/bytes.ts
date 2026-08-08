/**
 * Größenangaben, wie ein Mensch sie liest — die einzige Stelle, an der aus
 * Bytes ein „1,5 MB“ wird (Renderer-tauglich, ohne Dateisystem).
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Eine Byte-Zahl als kurze Angabe: unter 1024 in ganzen Bytes, darüber in der
 * nächstgrößeren Einheit — mit einer Nachkommastelle, solange die Zahl klein
 * ist („1,5 MB“, aber „512 MB“). Unbrauchbare Werte gelten als nichts.
 */
export function formatBytes(bytes: unknown): string {
  let value = typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Erst das Runden macht aus 1023,9 KB ein „1024 KB“ — dann lieber eine Einheit weiter.
  if (unit < UNITS.length - 1 && Math.round(value) >= 1024) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} ${UNITS[0]}`;
  const text = value < 10 ? value.toFixed(1).replace('.', ',') : String(Math.round(value));
  return `${text} ${UNITS[unit]}`;
}
