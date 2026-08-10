import { describe, it, expect } from 'vitest';
import { MIN_TILE } from './tiling';
import {
  cleanChromeHide,
  cleanChromeHides,
  cleanTileGap,
  cleanTileGaps,
  DEFAULT_TILE_CHROME_HIDE,
  DEFAULT_TILE_GAP,
  MAX_TILE_GAP,
} from './tilesettings';

describe('Die Fuge des Kachel-Verbunds (c0072)', () => {
  it('nennt eine Vorgabe, die zwischen null und dem Höchstwert liegt', () => {
    expect(DEFAULT_TILE_GAP).toBeGreaterThan(0);
    expect(DEFAULT_TILE_GAP).toBeLessThanOrEqual(MAX_TILE_GAP);
    // Auch die weiteste Fuge darf die Mindestgröße einer Kachel nicht aufzehren.
    expect(MIN_TILE).toBeGreaterThan(MAX_TILE_GAP);
  });

  it('nimmt ganze Bildpunkte zwischen null und dem Höchstwert an', () => {
    expect(cleanTileGap(0)).toBe(0);
    expect(cleanTileGap(18)).toBe(18);
    expect(cleanTileGap(MAX_TILE_GAP)).toBe(MAX_TILE_GAP);
    // Krumme Werte werden gerundet — der Regler soll keine Bruchteile merken.
    expect(cleanTileGap(9.4)).toBe(9);
  });

  it('weist zurück, was keine Fuge sein kann (dann gilt die Vorgabe)', () => {
    expect(cleanTileGap(-1)).toBeNull();
    expect(cleanTileGap(MAX_TILE_GAP + 1)).toBeNull();
    expect(cleanTileGap(Number.NaN)).toBeNull();
    expect(cleanTileGap('12')).toBeNull();
    expect(cleanTileGap(undefined)).toBeNull();
  });

  it('tütet die gemerkten Fugen je Verzeichnis ein und lässt beschädigte weg', () => {
    expect(cleanTileGaps({ '/apps': 20, '/kaputt': 'weit', '/zu-weit': 999 })).toEqual({ '/apps': 20 });
    expect(cleanTileGaps(null)).toEqual({});
    expect(cleanTileGaps('nichts')).toEqual({});
  });
});

describe('Der Fensterrahmen im Kachel-Modus (c0072)', () => {
  it('bleibt von Haus aus stehen', () => {
    expect(DEFAULT_TILE_CHROME_HIDE).toBe(false);
  });

  it('nimmt nur ein Ja oder ein Nein an', () => {
    expect(cleanChromeHide(true)).toBe(true);
    expect(cleanChromeHide(false)).toBe(false);
    expect(cleanChromeHide('ja')).toBeNull();
    expect(cleanChromeHide(undefined)).toBeNull();
  });

  it('tütet die gemerkten Entscheidungen ein und lässt beschädigte weg', () => {
    expect(cleanChromeHides({ '/apps': true, '/kaputt': 1 })).toEqual({ '/apps': true });
    expect(cleanChromeHides(null)).toEqual({});
  });
});
