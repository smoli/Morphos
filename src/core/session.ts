/**
 * Die Sitzung eines Arbeitsverzeichnisses: welche Fenster offen waren und wie
 * sie lagen. Beim nächsten Start kommt der Desktop so zurück, wie er verlassen
 * wurde (siehe stores/desktop: restoreSession).
 *
 * Gemerkt wird nur, was sich rekonstruieren lässt: eine gespeicherte App oder
 * eine Ansicht der Schale (Dateien, Einstellungen — siehe core/system) plus
 * ihre Geometrie. Ein Entwurf ohne App-Id hat nichts zu laden und fällt weg —
 * ebenso ein Fenster, dessen App inzwischen von der Platte verschwunden ist
 * oder dessen Ansicht es nicht mehr gibt. Titel und Icon werden nicht gemerkt:
 * sie stammen beim Wiederherstellen aus dem Verzeichnis bzw. von der Schale und
 * sind damit stets aktuell.
 */

import { systemWindow } from './system';
import type { SessionWindow } from '@/types';

/** Höchstzahl gemerkter Fenster je Verzeichnis — eine Sitzung soll nicht wuchern. */
export const MAX_SESSION_WINDOWS = 24;

/** Was ein offenes Fenster zur Sitzung beiträgt (siehe stores/desktop: DesktopWindow). */
export interface OpenWindow {
  /** null = Entwurf oder Fenster der Schale. */
  appId: string | null;
  /** Ansicht der Schale (siehe core/system) — null bei App und Entwurf. */
  systemId?: string | null;
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
 * derselben App (bzw. derselben Ansicht) zählt das vordere.
 */
export function serializeSession(windows: readonly OpenWindow[]): SessionWindow[] {
  const front = [...windows].sort((a, b) => b.z - a.z);
  const seen = new Set<string>();
  const out: SessionWindow[] = [];
  for (const w of front) {
    const key = sessionKey(w.appId, w.systemId ?? null);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const geometry = {
      x: Math.round(w.x),
      y: Math.round(w.y),
      w: Math.round(w.w),
      h: Math.round(w.h),
      minimized: w.minimized === true,
      maximized: w.maximized === true,
    };
    out.push(
      w.appId
        ? { appId: w.appId, ...geometry }
        : { appId: null, systemId: w.systemId as string, ...geometry },
    );
    if (out.length === MAX_SESSION_WINDOWS) break;
  }
  return out.reverse();
}

/**
 * Die Fenster einer Sitzung, die sich wieder öffnen lassen: Ihre App muss es im
 * Verzeichnis noch geben, ihre Ansicht in der Schale. Die Stapelreihenfolge
 * bleibt erhalten.
 */
export function restorableSession(
  saved: readonly SessionWindow[],
  known: Iterable<string>,
): SessionWindow[] {
  const ids = new Set(known);
  const seen = new Set<string>();
  const out: SessionWindow[] = [];
  for (const s of saved) {
    const key = sessionKey(s.appId, s.systemId ?? null);
    if (!key || seen.has(key)) continue;
    if (s.appId ? !ids.has(s.appId) : !systemWindow(s.systemId!)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Was dieses Fenster in der Sitzung ausmacht — oder null, wenn nichts (Entwurf). */
function sessionKey(appId: string | null, systemId: string | null): string | null {
  if (appId) return `app:${appId}`;
  return systemId ? `sys:${systemId}` : null;
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
      (x.systemId ?? null) === (y.systemId ?? null) &&
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
  // Entweder eine App oder eine Ansicht der Schale — ohne beides ist da nichts.
  const appId = typeof w.appId === 'string' && w.appId ? w.appId : null;
  const systemId = typeof w.systemId === 'string' && w.systemId ? w.systemId : null;
  if (!appId && !systemId) return null;
  const x = size(w.x, 0);
  const y = size(w.y, 0);
  const width = size(w.w, 1);
  const height = size(w.h, 1);
  if (x === null || y === null || width === null || height === null) return null;
  const geometry = { x, y, w: width, h: height, minimized: !!w.minimized, maximized: !!w.maximized };
  return appId ? { appId, ...geometry } : { appId: null, systemId: systemId!, ...geometry };
}

/** Eine Bildpunkt-Angabe: ganzzahlig und mindestens `min` — sonst null (unbrauchbar). */
function size(value: unknown, min: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (min > 0 && rounded < min) return null;
  return Math.max(min, rounded);
}
