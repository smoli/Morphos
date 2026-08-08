/**
 * Der Fensterwechsler (Strg/⌘ + Tab): in welcher Reihenfolge die offenen
 * Fenster zur Auswahl stehen. Wie am Schreibtisch liegt zuvorderst, was zuletzt
 * benutzt wurde — der Stapelwert `z` des Desktops sagt es bereits.
 *
 * Gezeichnet wird die Auswahl von components/SwitcherOverlay, gehalten und
 * weitergerückt vom Desktop (views/DesktopView).
 */

// Dieselbe Ringbewegung wie im Startmenü — dort ist sie zuhause.
export { nextIndex as cycleSelection } from './launcher';

/** Was der Wechsler von einem Fenster wissen muss. */
export interface StackedWindow {
  z: number;
}

/** Die offenen Fenster als Auswahl: das zuletzt benutzte zuerst. */
export function switcherOrder<T extends StackedWindow>(windows: readonly T[]): T[] {
  return [...windows].sort((a, b) => b.z - a.z);
}

/** Mit null oder einem Fenster gibt es nichts zu wechseln. */
export function canSwitch(count: number): boolean {
  return count > 1;
}
