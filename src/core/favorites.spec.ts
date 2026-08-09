import { describe, it, expect } from 'vitest';
import { cleanFavorites, toggleFavorite } from './favorites';

describe('cleanFavorites', () => {
  it('übernimmt die App-Ids je Verzeichnis in ihrer Reihenfolge', () => {
    expect(cleanFavorites({ '/apps': ['rechner-1', 'editor-2'] })).toEqual({
      '/apps': ['rechner-1', 'editor-2'],
    });
  });

  it('wirft Fremdes, Leeres und Doppeltes weg', () => {
    expect(cleanFavorites({ '/apps': ['rechner-1', '', 42, null, 'rechner-1'] })).toEqual({
      '/apps': ['rechner-1'],
    });
  });

  it('lässt Verzeichnisse ohne brauchbaren Eintrag ganz weg', () => {
    expect(cleanFavorites({ '/a': [], '/b': 'nein', '/c': ['x'] })).toEqual({ '/c': ['x'] });
  });

  it('verträgt fehlende oder beschädigte Einstellungen', () => {
    expect(cleanFavorites(undefined)).toEqual({});
    expect(cleanFavorites('kaputt')).toEqual({});
  });
});

describe('toggleFavorite', () => {
  it('nimmt eine App hinten dazu', () => {
    expect(toggleFavorite(['rechner-1'], 'editor-2')).toEqual(['rechner-1', 'editor-2']);
  });

  it('nimmt eine App wieder heraus und lässt die Reihenfolge stehen', () => {
    expect(toggleFavorite(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('rührt die übergebene Liste nicht an', () => {
    const list = ['a'];
    toggleFavorite(list, 'b');
    expect(list).toEqual(['a']);
  });
});
