/**
 * Framework-unabhängige Logik der Kurzmeldungen („Toasts“).
 *
 * Hier steht nur, wie lange eine Meldung je nach Art stehen bleibt und wie
 * viele gleichzeitig übereinander liegen dürfen. Der Stapel selbst, seine Uhren
 * und seine Darstellung liegen außerhalb (stores/notifications, ToastStack).
 */

/** Die Art einer Meldung — sie bestimmt Farbe und Standzeit. */
export type ToastKind = 'info' | 'success' | 'error';

/** Eine Meldung im Stapel. */
export interface Toast {
  id: string;
  kind: ToastKind;
  text: string;
}

/** Höchstens so viele Meldungen liegen gleichzeitig auf dem Stapel. */
export const MAX_TOASTS = 4;

/**
 * Standzeit je Art in Millisekunden. `0` heißt: Die Meldung bleibt, bis sie
 * weggeklickt wird — ein Fehler soll nicht verschwinden, bevor er gelesen ist.
 */
export const TOAST_TIMEOUTS: Record<ToastKind, number> = {
  info: 4000,
  success: 4000,
  error: 0,
};

/** Wie lange eine Meldung dieser Art steht (0 = bis zum Wegklicken). */
export function timeoutFor(kind: ToastKind): number {
  return TOAST_TIMEOUTS[kind] ?? TOAST_TIMEOUTS.info;
}

/** Verblasst eine Meldung dieser Art von selbst? */
export function autoDismisses(kind: ToastKind): boolean {
  return timeoutFor(kind) > 0;
}

/**
 * Die ältesten Meldungen, die über den Deckel hinausgehen — sie machen einer
 * neuen Meldung Platz. Der Stapel ist nach Alter geordnet (älteste zuerst).
 */
export function overflow<T>(list: readonly T[], max = MAX_TOASTS): T[] {
  return list.slice(0, Math.max(0, list.length - Math.max(0, max)));
}
