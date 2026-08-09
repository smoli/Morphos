import { describe, it, expect } from 'vitest';
import { explorerEntries, formatWhen, isHiddenName, sizeLabel } from './explorer';
import type { FsEntry } from '@/types';

function entry(name: string, isDir = false): FsEntry {
  return { name, path: name, isDir };
}

describe('isHiddenName', () => {
  it('erkennt Einträge mit führendem Punkt als verborgen', () => {
    expect(isHiddenName('.trash')).toBe(true);
    expect(isHiddenName('.DS_Store')).toBe(true);
  });

  it('lässt gewöhnliche Namen sichtbar — auch mit Punkt in der Mitte', () => {
    expect(isHiddenName('liste.txt')).toBe(false);
    expect(isHiddenName('notizen')).toBe(false);
  });
});

describe('explorerEntries', () => {
  const mixed = [
    entry('liste.txt'),
    entry('Bilder', true),
    entry('archiv', true),
    entry('anfang.md'),
  ];

  it('zeigt Ordner vor Dateien, beide alphabetisch', () => {
    expect(explorerEntries(mixed).map((e) => e.name)).toEqual([
      'archiv',
      'Bilder',
      'anfang.md',
      'liste.txt',
    ]);
  });

  it('dreht mit „desc“ die Namensfolge um, Ordner bleiben oben', () => {
    expect(explorerEntries(mixed, 'desc').map((e) => e.name)).toEqual([
      'Bilder',
      'archiv',
      'liste.txt',
      'anfang.md',
    ]);
  });

  it('blendet verborgene Einträge aus — auch den künftigen Papierkorb', () => {
    const entries = [entry('.trash', true), entry('.DS_Store'), entry('notiz.txt')];
    expect(explorerEntries(entries).map((e) => e.name)).toEqual(['notiz.txt']);
  });

  it('lässt die übergebene Liste unangetastet', () => {
    const entries = [entry('b'), entry('a')];
    explorerEntries(entries);
    expect(entries.map((e) => e.name)).toEqual(['b', 'a']);
  });

  describe('nach Größe und Datum (c0051)', () => {
    const files: FsEntry[] = [
      { name: 'mittel.txt', path: 'mittel.txt', isDir: false, size: 500, modified: 200, created: 300 },
      { name: 'groß.bin', path: 'groß.bin', isDir: false, size: 9000, modified: 100, created: 100 },
      { name: 'klein.md', path: 'klein.md', isDir: false, size: 12, modified: 300, created: 200 },
      { name: 'ordner', path: 'ordner', isDir: true, size: 0, modified: 999, created: 999 },
    ];

    it('sortiert nach Größe — Ordner bleiben trotzdem oben', () => {
      expect(explorerEntries(files, 'asc', 'size').map((e) => e.name)).toEqual([
        'ordner',
        'klein.md',
        'mittel.txt',
        'groß.bin',
      ]);
      expect(explorerEntries(files, 'desc', 'size').map((e) => e.name)).toEqual([
        'ordner',
        'groß.bin',
        'mittel.txt',
        'klein.md',
      ]);
    });

    it('sortiert nach Änderungs- und nach Erstellungsdatum', () => {
      expect(explorerEntries(files, 'desc', 'modified').map((e) => e.name)).toEqual([
        'ordner',
        'klein.md',
        'mittel.txt',
        'groß.bin',
      ]);
      expect(explorerEntries(files, 'desc', 'created').map((e) => e.name)).toEqual([
        'ordner',
        'mittel.txt',
        'klein.md',
        'groß.bin',
      ]);
    });

    it('gibt Gleichstand und fehlende Angaben dem Namen zu entscheiden', () => {
      const same = [entry('b.txt'), entry('a.txt'), { ...entry('c.txt'), size: 1 }];
      expect(explorerEntries(same, 'asc', 'size').map((e) => e.name)).toEqual([
        'a.txt',
        'b.txt',
        'c.txt',
      ]);
    });
  });
});

describe('sizeLabel', () => {
  it('zeigt die Größe einer Datei lesbar', () => {
    expect(sizeLabel({ name: 'a', path: 'a', isDir: false, size: 2048 })).toBe('2,0 KB');
    expect(sizeLabel({ name: 'a', path: 'a', isDir: false, size: 0 })).toBe('0 B');
  });

  it('lässt Ordner und Unbekanntes ohne Zahl', () => {
    expect(sizeLabel({ name: 'o', path: 'o', isDir: true, size: 4096 })).toBe('—');
    expect(sizeLabel({ name: 'a', path: 'a', isDir: false })).toBe('—');
  });
});

describe('formatWhen', () => {
  it('schreibt einen Zeitpunkt kurz und lesbar', () => {
    // Kurz genug für eine Spalte: „09.08.26, 10:30“ — in der hiesigen Zone gedacht.
    const text = formatWhen(new Date(2026, 7, 9, 10, 30).getTime());
    expect(text).toBe('09.08.26, 10:30');
  });

  it('macht aus einem unbekannten Zeitpunkt keinen 1.1.1970', () => {
    expect(formatWhen(0)).toBe('—');
    expect(formatWhen(undefined)).toBe('—');
    expect(formatWhen(Number.NaN)).toBe('—');
  });
});
