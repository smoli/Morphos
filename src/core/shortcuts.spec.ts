import { describe, it, expect } from 'vitest';
import {
  SHORTCUTS,
  isSwitcherChord,
  isSwitcherRelease,
  isTypingTarget,
  matchShortcut,
  shortcutKeys,
} from './shortcuts';

/** Eine Tastenmeldung, wie sie der Browser schickt (nur das Nötige). */
function press(key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) {
  return { key, ...mods };
}

describe('core/shortcuts', () => {
  describe('Tastenkürzel des Desktops', () => {
    it('führt jedes Kürzel genau einmal und mit Beschriftung', () => {
      const ids = SHORTCUTS.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of SHORTCUTS) {
        expect(s.label.length).toBeGreaterThan(0);
        expect(s.keys.length).toBeGreaterThan(0);
      }
    });

    it('vergibt keine Tastenkombination doppelt', () => {
      const combos = SHORTCUTS.map((s) => `${s.shift ? 'shift+' : ''}${s.key}`);
      expect(new Set(combos).size).toBe(combos.length);
    });

    it('erkennt Strg + Taste ebenso wie ⌘ + Taste', () => {
      expect(matchShortcut(press('k', { ctrlKey: true }))).toBe('launcher');
      expect(matchShortcut(press('k', { metaKey: true }))).toBe('launcher');
      expect(matchShortcut(press('n', { ctrlKey: true }))).toBe('new-app');
      expect(matchShortcut(press(',', { metaKey: true }))).toBe('settings');
    });

    it('nimmt die Taste unabhängig von der Groß-/Kleinschreibung', () => {
      expect(matchShortcut(press('K', { ctrlKey: true }))).toBe('launcher');
      // Mit gedrückter Umschalttaste meldet der Browser den Großbuchstaben.
      expect(matchShortcut(press('W', { ctrlKey: true, shiftKey: true }))).toBe('close-window');
    });

    it('unterscheidet Kürzel mit und ohne Umschalttaste', () => {
      expect(matchShortcut(press('w', { metaKey: true, shiftKey: true }))).toBe('close-window');
      expect(matchShortcut(press('m', { metaKey: true, shiftKey: true }))).toBe('minimize-window');
      expect(matchShortcut(press('f', { metaKey: true, shiftKey: true }))).toBe('maximize-window');
      expect(matchShortcut(press('c', { metaKey: true, shiftKey: true }))).toBe('composer');
      // ⌘C bleibt das Kopieren des Wirtsfensters.
      expect(matchShortcut(press('c', { metaKey: true }))).toBeNull();
      // Ohne Umschalttaste gehören ⌘W/⌘M dem Wirtsfenster — wir fassen sie nicht an.
      expect(matchShortcut(press('w', { metaKey: true }))).toBeNull();
      expect(matchShortcut(press('m', { metaKey: true }))).toBeNull();
      // Und mit Umschalttaste ist ⌘⇧K kein Startmenü.
      expect(matchShortcut(press('k', { metaKey: true, shiftKey: true }))).toBeNull();
    });

    it('lässt Tasten ohne Strg/⌘ und alles mit Alt in Ruhe', () => {
      expect(matchShortcut(press('k'))).toBeNull();
      expect(matchShortcut(press('k', { altKey: true }))).toBeNull();
      expect(matchShortcut(press('k', { ctrlKey: true, altKey: true }))).toBeNull();
    });

    it('nennt zu jedem Kürzel seine Schreibweise', () => {
      expect(shortcutKeys('launcher')).toBe('Strg/⌘ + K');
      expect(shortcutKeys('close-window')).toBe('Strg/⌘ + ⇧ + W');
      expect(shortcutKeys('composer')).toBe('Strg/⌘ + ⇧ + C');
    });
  });

  describe('Umschalter (Tab)', () => {
    it('erkennt Strg/⌘ + Tab — vorwärts wie rückwärts', () => {
      expect(isSwitcherChord(press('Tab', { ctrlKey: true }))).toBe(true);
      expect(isSwitcherChord(press('Tab', { metaKey: true }))).toBe(true);
      expect(isSwitcherChord(press('Tab', { ctrlKey: true, shiftKey: true }))).toBe(true);
    });

    it('lässt Tab ohne Haltetaste (Fokuswechsel) unangetastet', () => {
      expect(isSwitcherChord(press('Tab'))).toBe(false);
      expect(isSwitcherChord(press('Tab', { altKey: true }))).toBe(false);
      expect(isSwitcherChord(press('k', { ctrlKey: true }))).toBe(false);
    });

    it('sieht im Loslassen der Haltetaste das Aktivieren', () => {
      expect(isSwitcherRelease(press('Control'))).toBe(true);
      expect(isSwitcherRelease(press('Meta'))).toBe(true);
      expect(isSwitcherRelease(press('Tab'))).toBe(false);
      expect(isSwitcherRelease(press('Shift'))).toBe(false);
    });
  });

  describe('Wo gerade getippt wird, gilt kein Kürzel', () => {
    it('erkennt Eingabefelder, Textflächen, Auswahlen und App-Rahmen', () => {
      for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME']) {
        expect(isTypingTarget({ tagName: tag })).toBe(true);
      }
    });

    it('erkennt frei beschreibbare Bereiche', () => {
      expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
      expect(isTypingTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    });

    it('sieht in Knöpfen, Fläche und Nichts kein Tippen', () => {
      expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
      expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
      expect(isTypingTarget(null)).toBe(false);
      // Das Fenster selbst ist kein Element (Ereignis ohne Ziel im Dokument).
      expect(isTypingTarget({})).toBe(false);
    });
  });
});
