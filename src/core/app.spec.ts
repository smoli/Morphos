import { describe, it, expect } from 'vitest';
import { slugify, makeAppId, isSafeAppId, DEFAULT_ICON, DEFAULT_NAME } from './app';

describe('slugify', () => {
  it('macht aus einem Namen einen dateisystemtauglichen Slug', () => {
    expect(slugify('Wissenschaftlicher Taschenrechner')).toBe('wissenschaftlicher-taschenrechner');
  });

  it('entfernt Sonderzeichen und mehrfache Trenner', () => {
    expect(slugify('  To-do!!  Liste (v2) ')).toBe('to-do-liste-v2');
  });

  it('fällt auf "app" zurück, wenn nichts Verwertbares übrig bleibt', () => {
    expect(slugify('   ')).toBe('app');
    expect(slugify('🧮')).toBe('app');
  });

  it('begrenzt die Länge', () => {
    expect(slugify('a'.repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe('makeAppId', () => {
  it('kombiniert Slug und Zufallssuffix', () => {
    const id = makeAppId('Taschenrechner');
    expect(id).toMatch(/^taschenrechner-[a-z0-9]+$/);
  });

  it('liefert bei gleichem Namen unterschiedliche Ids', () => {
    expect(makeAppId('Editor')).not.toBe(makeAppId('Editor'));
  });
});

describe('isSafeAppId', () => {
  it('nimmt an, was als Ordnername taugt', () => {
    expect(isSafeAppId(makeAppId('Taschenrechner'))).toBe(true);
    expect(isSafeAppId('to-do_liste.2')).toBe(true);
  });

  it('weist alles ab, womit sich das Arbeitsverzeichnis verlassen ließe', () => {
    for (const id of ['', '.', '..', '../weg', 'unter/ordner', 'rück\\wärts', 'mit leerzeichen', '/absolut']) {
      expect(isSafeAppId(id), id).toBe(false);
    }
  });

  it('weist alles ab, was gar keine Zeichenkette ist', () => {
    expect(isSafeAppId(undefined)).toBe(false);
    expect(isSafeAppId(null)).toBe(false);
    expect(isSafeAppId(42)).toBe(false);
  });
});

describe('Vorgaben', () => {
  it('bietet Standard-Name und -Icon', () => {
    expect(DEFAULT_NAME.length).toBeGreaterThan(0);
    expect(DEFAULT_ICON.length).toBeGreaterThan(0);
  });
});
