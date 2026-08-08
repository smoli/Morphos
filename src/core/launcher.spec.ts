import { describe, it, expect } from 'vitest';
import {
  NEW_APP_ID,
  NEW_APP_NAME,
  filterItems,
  launcherItems,
  matchScore,
  nextIndex,
  normalizeName,
  type LauncherItem,
} from './launcher';

const apps = [
  { id: 'rechner-1', name: 'Rechner', icon: '🧮' },
  { id: 'editor-2', name: 'Text Editor', icon: '📝' },
  { id: 'notiz-3', name: 'Notizzettel', icon: '🗒' },
  { id: 'uebung-4', name: 'Übungsplan', icon: '🏋' },
];

/** Die Namen der gefundenen Einträge — so lesen sich die Erwartungen kurz. */
function names(items: readonly LauncherItem[]): string[] {
  return items.map((i) => i.name);
}

describe('launcher', () => {
  describe('launcherItems', () => {
    it('macht aus den Apps Einträge und hängt „Neue App“ hinten an', () => {
      const items = launcherItems(apps);
      expect(names(items)).toEqual(['Rechner', 'Text Editor', 'Notizzettel', 'Übungsplan', NEW_APP_NAME]);
      expect(items[0]).toEqual({ id: 'rechner-1', name: 'Rechner', icon: '🧮', kind: 'app' });
      expect(items[4].kind).toBe('new');
      expect(items[4].id).toBe(NEW_APP_ID);
    });

    it('bietet „Neue App“ auch in einem leeren Verzeichnis an', () => {
      expect(names(launcherItems([]))).toEqual([NEW_APP_NAME]);
    });
  });

  describe('normalizeName', () => {
    it('macht Groß-/Kleinschreibung und Akzente gleich', () => {
      expect(normalizeName('  Übungsplan ')).toBe('ubungsplan');
      expect(normalizeName('Café')).toBe('cafe');
    });
  });

  describe('matchScore', () => {
    it('nimmt ohne Suchtext jeden Namen', () => {
      expect(matchScore('Rechner', '')).toBe(0);
      expect(matchScore('Rechner', '   ')).toBe(0);
    });

    it('bewertet Anfang besser als Wortanfang und den besser als mittendrin', () => {
      const start = matchScore('Text Editor', 'tex');
      const word = matchScore('Text Editor', 'edi');
      const inside = matchScore('Notizzettel', 'zzet');
      expect(start).toBeLessThan(word);
      expect(word).toBeLessThan(inside);
    });

    it('meldet -1, wenn der Name nicht passt', () => {
      expect(matchScore('Rechner', 'xyz')).toBe(-1);
    });

    it('sucht ohne Rücksicht auf Akzente und Schreibweise', () => {
      expect(matchScore('Übungsplan', 'ubung')).toBeGreaterThanOrEqual(0);
      expect(matchScore('Übungsplan', 'ÜBUNG')).toBeGreaterThanOrEqual(0);
    });
  });

  describe('filterItems', () => {
    const items = launcherItems(apps);

    it('zeigt ohne Suchtext alles, in der gegebenen Reihenfolge', () => {
      expect(names(filterItems(items, ''))).toEqual(names(items));
    });

    it('behält nur die Treffer', () => {
      expect(names(filterItems(items, 'not'))).toEqual(['Notizzettel']);
    });

    it('sortiert die besseren Treffer nach vorn', () => {
      const found = filterItems(items, 'e');
      // „Editor“ steht am Wortanfang, „Rechner“ und „Notizzettel“ mittendrin —
      // und unter Gleichen bleibt die Reihenfolge des Verzeichnisses.
      expect(names(found).slice(0, 2)).toEqual(['Text Editor', 'Rechner']);
    });

    it('findet „Neue App“ über ihren Namen', () => {
      expect(names(filterItems(items, 'neue'))).toEqual([NEW_APP_NAME]);
    });

    it('lässt „Neue App“ unter gleich guten Treffern hinten', () => {
      const found = filterItems(launcherItems([{ id: 'n-1', name: 'Neuigkeiten', icon: '📰' }]), 'neu');
      expect(names(found)).toEqual(['Neuigkeiten', NEW_APP_NAME]);
    });

    it('findet nichts, wenn nichts passt', () => {
      expect(filterItems(items, 'zzz')).toEqual([]);
    });
  });

  describe('nextIndex', () => {
    it('geht Schritt für Schritt durch die Liste', () => {
      expect(nextIndex(0, 1, 3)).toBe(1);
      expect(nextIndex(1, -1, 3)).toBe(0);
    });

    it('läuft an den Enden im Kreis', () => {
      expect(nextIndex(2, 1, 3)).toBe(0);
      expect(nextIndex(0, -1, 3)).toBe(2);
    });

    it('bleibt bei leerer Liste bei 0', () => {
      expect(nextIndex(0, 1, 0)).toBe(0);
    });
  });
});
