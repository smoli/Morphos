import { describe, it, expect } from 'vitest';
import {
  arrangeIcons,
  CELL_H,
  CELL_W,
  clampPos,
  columns,
  layoutHeight,
  PAD,
  slotIndex,
  slotPos,
  TILE_H,
  TILE_W,
} from './arrange';

/** Bequem: die Position des n-ten Rasterplatzes bei `cols` Spalten. */
function slot(index: number, cols: number) {
  return { x: PAD + (index % cols) * CELL_W, y: PAD + Math.floor(index / cols) * CELL_H };
}

describe('columns', () => {
  it('füllt die Breite mit ganzen Kacheln', () => {
    // 1000 - 2*20 = 960 Bildpunkte → 6 Kacheln à 144 (letzter Abstand zählt nicht).
    expect(columns({ w: 1000, h: 800 })).toBe(6);
  });

  it('lässt auch auf einer schmalen Fläche eine Spalte übrig', () => {
    expect(columns({ w: 60, h: 800 })).toBe(1);
  });

  it('nimmt eine Vorgabe an, solange die Fläche noch nicht gemessen ist', () => {
    expect(columns({ w: 0, h: 0 })).toBeGreaterThan(0);
  });
});

describe('slotPos / slotIndex', () => {
  it('füllt das Raster zeilenweise', () => {
    expect(slotPos(0, 3)).toEqual({ x: PAD, y: PAD });
    expect(slotPos(2, 3)).toEqual({ x: PAD + 2 * CELL_W, y: PAD });
    expect(slotPos(3, 3)).toEqual({ x: PAD, y: PAD + CELL_H });
  });

  it('findet zu einer Position den nächstgelegenen Rasterplatz', () => {
    expect(slotIndex(slotPos(4, 3), 3)).toBe(4);
    // Leicht daneben abgelegt — der Platz gilt trotzdem als belegt.
    expect(slotIndex({ x: PAD + CELL_W + 12, y: PAD + 6 }, 3)).toBe(1);
  });

  it('meldet -1 für eine Position außerhalb des Rasters', () => {
    expect(slotIndex({ x: PAD + 5 * CELL_W, y: PAD }, 3)).toBe(-1);
  });
});

describe('clampPos', () => {
  it('hält eine Kachel innerhalb der Fläche', () => {
    expect(clampPos({ x: 950, y: 700 }, { w: 1000, h: 600 })).toEqual({
      x: 1000 - TILE_W,
      y: 600 - TILE_H,
    });
    expect(clampPos({ x: -40, y: -10 }, { w: 1000, h: 600 })).toEqual({ x: 0, y: 0 });
  });

  it('rundet auf ganze Bildpunkte', () => {
    expect(clampPos({ x: 12.4, y: 30.6 }, { w: 1000, h: 600 })).toEqual({ x: 12, y: 31 });
  });

  it('begrenzt nur nach oben hin nicht, solange die Fläche unbekannt ist', () => {
    expect(clampPos({ x: 300, y: 400 }, { w: 0, h: 0 })).toEqual({ x: 300, y: 400 });
  });
});

describe('arrangeIcons', () => {
  const bounds = { w: 1000, h: 800 }; // → 6 Spalten
  const cols = columns(bounds);

  it('legt Kacheln ohne gemerkte Position ins Raster', () => {
    const layout = arrangeIcons(['a', 'b', 'c'], {}, bounds);
    expect(layout).toEqual({ a: slot(0, cols), b: slot(1, cols), c: slot(2, cols) });
  });

  it('lässt die vorderen Plätze für feste Kacheln frei', () => {
    const layout = arrangeIcons(['a', 'b'], {}, bounds, 1);
    expect(layout).toEqual({ a: slot(1, cols), b: slot(2, cols) });
  });

  it('übernimmt gemerkte Positionen unverändert', () => {
    const layout = arrangeIcons(['a', 'b'], { a: { x: 400, y: 300 } }, bounds);
    expect(layout.a).toEqual({ x: 400, y: 300 });
    expect(layout.b).toEqual(slot(0, cols));
  });

  it('holt eine gemerkte Position zurück, wenn die Fläche geschrumpft ist', () => {
    const layout = arrangeIcons(['a'], { a: { x: 900, y: 700 } }, { w: 500, h: 400 });
    expect(layout.a).toEqual({ x: 500 - TILE_W, y: 400 - TILE_H });
  });

  it('setzt neue Kacheln überlappungsfrei neben die gemerkten', () => {
    // „a“ sitzt (frei abgelegt) auf dem zweiten Rasterplatz — „b“ weicht aus.
    const layout = arrangeIcons(['a', 'b', 'c'], { a: slot(1, cols) }, bounds);
    expect(layout.b).toEqual(slot(0, cols));
    expect(layout.c).toEqual(slot(2, cols));
  });

  it('ignoriert gemerkte Positionen von Apps, die es nicht mehr gibt', () => {
    const layout = arrangeIcons(['a'], { weg: slot(0, cols) }, bounds);
    expect(layout).toEqual({ a: slot(0, cols) });
  });
});

describe('layoutHeight', () => {
  it('reicht bis unter die tiefste Kachel', () => {
    const layout = { a: { x: 0, y: 300 }, b: { x: 0, y: 20 } };
    expect(layoutHeight(layout)).toBe(300 + TILE_H + PAD);
  });

  it('ist ohne Kacheln null', () => {
    expect(layoutHeight({})).toBe(0);
  });
});
