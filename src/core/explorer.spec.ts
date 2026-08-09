import { describe, it, expect } from 'vitest';
import { explorerEntries, isHiddenName } from './explorer';
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
});
