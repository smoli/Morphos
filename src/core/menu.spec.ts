import { describe, it, expect } from 'vitest';
import { MENU_MARGIN, menuPos } from './menu';

const SIZE = { w: 200, h: 160 };
const SCREEN = { w: 1000, h: 800 };

describe('menuPos', () => {
  it('klappt das Menü an der Maus auf', () => {
    expect(menuPos({ x: 300, y: 220 }, SIZE, SCREEN)).toEqual({ x: 300, y: 220 });
  });

  it('kippt am rechten Rand nach links', () => {
    expect(menuPos({ x: 950, y: 100 }, SIZE, SCREEN).x).toBe(750);
  });

  it('kippt am unteren Rand nach oben', () => {
    expect(menuPos({ x: 100, y: 780 }, SIZE, SCREEN).y).toBe(620);
  });

  it('bleibt auch auf einer winzigen Fläche innerhalb des Randes', () => {
    expect(menuPos({ x: 40, y: 30 }, SIZE, { w: 120, h: 100 })).toEqual({
      x: MENU_MARGIN,
      y: MENU_MARGIN,
    });
  });

  it('rutscht nie über den linken oder oberen Rand hinaus', () => {
    expect(menuPos({ x: 2, y: 0 }, SIZE, SCREEN)).toEqual({ x: MENU_MARGIN, y: MENU_MARGIN });
  });

  it('nimmt die Stelle unverändert, solange nichts gemessen ist', () => {
    expect(menuPos({ x: 640, y: 480 }, { w: 0, h: 0 }, { w: 0, h: 0 })).toEqual({ x: 640, y: 480 });
  });
});
