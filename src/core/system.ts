/**
 * Die „System“-Fenster der Schale: Fenster des Desktops, die keine erzeugte App
 * zeigen, sondern eine Ansicht der Schale selbst — derzeit der Datei-Explorer.
 *
 * Sie sind im Fenstermanager gleichberechtigt (Fokus, Stapel, Minimieren,
 * Dock, Fensterwechsler), tragen aber keine App-Id und keinen Instanz-Store.
 * Hier steht nur, WELCHE es gibt und wie sie heißen; gezeichnet werden sie von
 * components/SystemWindow, geöffnet über stores/desktop: openSystem().
 *
 * Jede Ansicht gibt es höchstens einmal — ein zweites Öffnen holt das
 * bestehende Fenster nach vorn.
 */

/** Kennung einer Schalen-Ansicht. */
export type SystemWindowId = 'explorer';

/** Was der Desktop über ein System-Fenster wissen muss. */
export interface SystemWindowInfo {
  id: SystemWindowId;
  /** Name in Titelleiste, Dock und Startmenü. */
  title: string;
  icon: string;
}

export const EXPLORER_ID = 'explorer';

/** Alle Ansichten der Schale, die sich als Fenster öffnen lassen. */
export const SYSTEM_WINDOWS: readonly SystemWindowInfo[] = [
  { id: 'explorer', title: 'Dateien', icon: '📁' },
];

/** Die Ansicht zu einer Kennung — oder undefined, wenn es sie nicht (mehr) gibt. */
export function systemWindow(id: string): SystemWindowInfo | undefined {
  return SYSTEM_WINDOWS.find((s) => s.id === id);
}
