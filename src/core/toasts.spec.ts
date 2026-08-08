import { describe, it, expect } from 'vitest';
import { MAX_TOASTS, autoDismisses, overflow, timeoutFor } from './toasts';

describe('toasts', () => {
  describe('timeoutFor', () => {
    it('lässt Hinweis und Erfolg von selbst verblassen', () => {
      expect(timeoutFor('info')).toBeGreaterThan(0);
      expect(timeoutFor('success')).toBeGreaterThan(0);
      expect(autoDismisses('info')).toBe(true);
      expect(autoDismisses('success')).toBe(true);
    });

    it('lässt einen Fehler stehen, bis er weggeklickt wird', () => {
      expect(timeoutFor('error')).toBe(0);
      expect(autoDismisses('error')).toBe(false);
    });
  });

  describe('overflow', () => {
    it('meldet nichts, solange der Stapel unter dem Deckel bleibt', () => {
      expect(overflow(['a', 'b'], 4)).toEqual([]);
      expect(overflow([], 4)).toEqual([]);
    });

    it('nennt die ältesten Meldungen, die über den Deckel hinausgehen', () => {
      expect(overflow(['a', 'b', 'c', 'd', 'e'], 3)).toEqual(['a', 'b']);
    });

    it('nutzt ohne Angabe den Deckel des Stapels', () => {
      const many = Array.from({ length: MAX_TOASTS + 2 }, (_, i) => i);
      expect(overflow(many)).toEqual([0, 1]);
    });
  });
});
