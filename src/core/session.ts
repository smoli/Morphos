/**
 * Die Sitzung eines Arbeitsverzeichnisses: welche App-Fenster offen waren und
 * wie sie lagen. Beim nächsten Start kommt der Desktop so zurück, wie er
 * verlassen wurde (siehe stores/desktop: restoreSession).
 *
 * Gemerkt wird nur, was sich rekonstruieren lässt: eine gespeicherte App plus
 * ihre Geometrie. Ein Entwurf ohne App-Id hat nichts zu laden und fällt weg —
 * ebenso ein Fenster, dessen App inzwischen von der Platte verschwunden ist.
 * Titel und Icon werden nicht gemerkt: sie stammen beim Wiederherstellen aus
 * dem Verzeichnis und sind damit stets aktuell.
 */

import type { SessionWindow } from '@/types';

/** Höchstzahl gemerkter Fenster je Verzeichnis — eine Sitzung soll nicht wuchern. */
export const MAX_SESSION_WINDOWS = 24;

/** Was ein offenes Fenster zur Sitzung beiträgt (siehe stores/desktop: DesktopWindow). */
export interface OpenWindow {
  /** null = noch nicht gespeicherter Entwurf. */
  appId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

/**
 * Die offenen Fenster als Sitzung — von hinten nach vorn, das zuletzt
 * fokussierte also zuletzt. Entwürfe bleiben außen vor; von zwei Fenstern
 * derselben App zählt das vordere.
 */
export function serializeSession(windows: readonly OpenWindow[]): SessionWindow[] {
  const front = [...windows].sort((a, b) => b.z - a.z);
  const seen = new Set<string>();
  const out: SessionWindow[] = [];
  for (const w of front) {
    if (!w.appId || seen.has(w.appId)) continue;
    seen.add(w.appId);
    out.push({
      appId: w.appId,
      x: Math.round(w.x),
      y: Math.round(w.y),
      w: Math.round(w.w),
      h: Math.round(w.h),
      minimized: w.minimized === true,
      maximized: w.maximized === true,
    });
    if (out.length === MAX_SESSION_WINDOWS) break;
  }
  return out.reverse();
}

/**
 * Die Fenster einer Sitzung, die sich wieder öffnen lassen: Ihre App muss es im
 * Verzeichnis noch geben. Die Stapelreihenfolge bleibt erhalten.
 */
export function restorableSession(
  saved: readonly SessionWindow[],
  known: Iterable<string>,
): SessionWindow[] {
  const ids = new Set(known);
  const seen = new Set<string>();
  const out: SessionWindow[] = [];
  for (const s of saved) {
    if (!ids.has(s.appId) || seen.has(s.appId)) continue;
    seen.add(s.appId);
    out.push(s);
  }
  return out;
}

/**
 * Sind zwei Sitzungen dieselbe? Ein Klick in ein Fenster, das ohnehin vorn
 * liegt, ändert nichts — und soll dann auch nichts schreiben.
 */
export function sameSession(a: readonly SessionWindow[], b: readonly SessionWindow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    return (
      x.appId === y.appId &&
      x.x === y.x &&
      x.y === y.y &&
      x.w === y.w &&
      x.h === y.h &&
      x.minimized === y.minimized &&
      x.maximized === y.maximized
    );
  });
}

/**
 * Gespeicherte Sitzungen auf brauchbare Einträge eintüten — fremde oder
 * beschädigte fallen weg (dann fehlt eben dieses Fenster). Wird vom
 * Hauptprozess beim Lesen und Schreiben der Einstellungen angewandt.
 */
export function cleanSessions(raw: unknown): Record<string, SessionWindow[]> {
  const out: Record<string, SessionWindow[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [folder, windows] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(windows)) continue;
    const clean = windows
      .map(cleanWindow)
      .filter((w): w is SessionWindow => w !== null)
      .slice(-MAX_SESSION_WINDOWS);
    if (clean.length) out[folder] = clean;
  }
  return out;
}

function cleanWindow(raw: unknown): SessionWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.appId !== 'string' || !w.appId) return null;
  const x = size(w.x, 0);
  const y = size(w.y, 0);
  const width = size(w.w, 1);
  const height = size(w.h, 1);
  if (x === null || y === null || width === null || height === null) return null;
  return { appId: w.appId, x, y, w: width, h: height, minimized: !!w.minimized, maximized: !!w.maximized };
}

/** Eine Bildpunkt-Angabe: ganzzahlig und mindestens `min` — sonst null (unbrauchbar). */
function size(value: unknown, min: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (min > 0 && rounded < min) return null;
  return Math.max(min, rounded);
}
