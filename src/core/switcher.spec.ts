import { describe, it, expect } from 'vitest';
import { canSwitch, cycleSelection, switcherOrder } from './switcher';

/** Ein Fenster, wie der Desktop es führt (nur, was der Umschalter braucht). */
function win(instanceId: string, z: number) {
  return { instanceId, z };
}

describe('core/switcher', () => {
  describe('Reihenfolge: zuletzt benutzt zuerst', () => {
    it('stellt das vorderste Fenster nach vorn', () => {
      const order = switcherOrder([win('a', 3), win('b', 7), win('c', 5)]);
      expect(order.map((w) => w.instanceId)).toEqual(['b', 'c', 'a']);
    });

    it('lässt die übergebene Liste unangetastet', () => {
      const windows = [win('a', 1), win('b', 2)];
      switcherOrder(windows);
      expect(windows.map((w) => w.instanceId)).toEqual(['a', 'b']);
    });

    it('nimmt auch minimierte Fenster mit (sie kommen beim Wechsel zurück)', () => {
      const order = switcherOrder([
        { instanceId: 'a', z: 1, minimized: true },
        { instanceId: 'b', z: 2, minimized: false },
      ]);
      expect(order.map((w) => w.instanceId)).toEqual(['b', 'a']);
    });
  });

  describe('Lohnt der Umschalter?', () => {
    it('braucht mindestens zwei Fenster', () => {
      expect(canSwitch(0)).toBe(false);
      expect(canSwitch(1)).toBe(false);
      expect(canSwitch(2)).toBe(true);
    });
  });

  describe('Wandern durch die Auswahl', () => {
    it('beginnt beim zuletzt benutzten Fenster hinter dem aktuellen', () => {
      // Der Umschalter öffnet auf 0 (das aktuelle Fenster) und geht sofort weiter.
      expect(cycleSelection(0, 1, 3)).toBe(1);
    });

    it('geht rückwärts (mit Umschalttaste) ans Ende', () => {
      expect(cycleSelection(0, -1, 3)).toBe(2);
    });

    it('läuft im Kreis', () => {
      expect(cycleSelection(2, 1, 3)).toBe(0);
      expect(cycleSelection(1, 1, 3)).toBe(2);
      expect(cycleSelection(1, -1, 3)).toBe(0);
    });
  });
});
