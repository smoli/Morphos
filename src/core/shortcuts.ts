/**
 * Die Tastenkürzel des Desktops — an dieser einen Stelle festgelegt. Der
 * Desktop (views/DesktopView) horcht auf die Tastatur und fragt hier nach, was
 * gemeint war; der Einstellungsdialog zeigt dieselbe Liste als Spickzettel
 * (components/settings/ShortcutsSection).
 *
 * Zwei Regeln haben die Auswahl bestimmt:
 *
 * - Die Kürzel wirken im Fenster (keydown), nicht im Betriebssystem. ⌘/Strg + W
 *   und ⌘/Strg + M gehören dem Wirtsfenster von Electron — sie schlössen bzw.
 *   minimierten Morphos selbst. Die Fensterbefehle des Desktops tragen darum
 *   zusätzlich die Umschalttaste.
 * - Wo getippt wird, gilt kein Kürzel (siehe `isTypingTarget`): Weder die
 *   Promptleiste noch ein Eingabefeld noch eine laufende App im iframe soll
 *   Tastendrücke an die Schale verlieren.
 */

/** Was ein Kürzel auslöst. */
export type ShortcutId =
  | 'launcher'
  | 'new-app'
  | 'settings'
  | 'close-window'
  | 'minimize-window'
  | 'maximize-window';

export interface Shortcut {
  id: ShortcutId;
  /** Was es tut — für den Spickzettel. */
  label: string;
  /** Die Taste zu Strg/⌘, kleingeschrieben. */
  key: string;
  /** Zusätzlich die Umschalttaste? */
  shift: boolean;
  /** Wie es sich schreibt: „Strg/⌘ + ⇧ + W“. */
  keys: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'launcher', label: 'Apps suchen (Startmenü)', key: 'k', shift: false, keys: 'Strg/⌘ + K' },
  { id: 'new-app', label: 'Neue App', key: 'n', shift: false, keys: 'Strg/⌘ + N' },
  { id: 'settings', label: 'Einstellungen', key: ',', shift: false, keys: 'Strg/⌘ + ,' },
  { id: 'close-window', label: 'Fenster schließen', key: 'w', shift: true, keys: 'Strg/⌘ + ⇧ + W' },
  { id: 'minimize-window', label: 'Fenster minimieren', key: 'm', shift: true, keys: 'Strg/⌘ + ⇧ + M' },
  { id: 'maximize-window', label: 'Fenster maximieren / wiederherstellen', key: 'f', shift: true, keys: 'Strg/⌘ + ⇧ + F' },
];

/** Wie der Umschalter aufgerufen wird — fürs Anzeigen. */
export const SWITCHER_KEYS = 'Strg/⌘ + Tab';

/** Eine Tastenmeldung, soweit sie hier zählt (KeyboardEvent passt darauf). */
export interface KeyChord {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/** Welches Kürzel gedrückt wurde — oder null, wenn keines gemeint war. */
export function matchShortcut(e: KeyChord): ShortcutId | null {
  if (e.altKey || !(e.ctrlKey || e.metaKey)) return null;
  const key = e.key.toLowerCase();
  const hit = SHORTCUTS.find((s) => s.key === key && s.shift === !!e.shiftKey);
  return hit ? hit.id : null;
}

/** Die Schreibweise eines Kürzels (leer, wenn es das Kürzel nicht gibt). */
export function shortcutKeys(id: ShortcutId): string {
  return SHORTCUTS.find((s) => s.id === id)?.keys ?? '';
}

/**
 * Strg/⌘ + Tab: Der Umschalter öffnet bzw. rückt eine Auswahl weiter (mit
 * Umschalttaste zurück). Unter macOS greift sich das System ⌘ + Tab für den
 * Programmwechsel — dort bleibt Strg + Tab.
 */
export function isSwitcherChord(e: KeyChord): boolean {
  return e.key === 'Tab' && !e.altKey && !!(e.ctrlKey || e.metaKey);
}

/** Das Loslassen der Haltetaste — jetzt wird das gewählte Fenster aktiv. */
export function isSwitcherRelease(e: { key: string }): boolean {
  return e.key === 'Control' || e.key === 'Meta';
}

/** Elemente, deren Tastendrücke ihnen allein gehören (der iframe der App auch). */
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME']);

/**
 * Wird auf diesem Ziel gerade getippt? Dann hält sich die Schale heraus.
 * Nimmt alles entgegen, was ein Ereignis als Ziel melden kann (auch `window`).
 */
export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  return typeof el.tagName === 'string' && TYPING_TAGS.has(el.tagName.toUpperCase());
}
