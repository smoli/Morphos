import { describe, it, expect } from 'vitest';
import { DOCK_RESERVE, dockInsets, insetVars, NO_INSETS, workArea } from './workarea';
import { DOCK_EDGES } from './dock';

describe('core/workarea', () => {
  describe('dockInsets', () => {
    it('hält den Rand frei, an dem die feste Leiste steht', () => {
      expect(dockInsets('bottom', true)).toEqual({ top: 0, right: 0, bottom: DOCK_RESERVE, left: 0 });
      expect(dockInsets('top', true)).toEqual({ top: DOCK_RESERVE, right: 0, bottom: 0, left: 0 });
      expect(dockInsets('left', true)).toEqual({ top: 0, right: 0, bottom: 0, left: DOCK_RESERVE });
      expect(dockInsets('right', true)).toEqual({ top: 0, right: DOCK_RESERVE, bottom: 0, left: 0 });
    });

    it('nimmt keinen Rand weg, wenn die Leiste sich aus dem Weg legt', () => {
      // Ausgeblendet (oder gar nicht da) gehört ihr nichts — sie legt sich beim
      // Herankommen über das Fenster.
      for (const { id } of DOCK_EDGES) expect(dockInsets(id, false)).toEqual(NO_INSETS);
    });

    it('kennt jeden Rand, den die Einstellungen anbieten', () => {
      // Ein neuer Rand in DOCK_EDGES ohne Platz hier wäre wieder ein Dock, das
      // über den Fenstern liegt.
      for (const { id } of DOCK_EDGES) {
        const insets = dockInsets(id, true);
        expect(insets[id]).toBe(DOCK_RESERVE);
        expect(Object.values(insets).filter((v) => v > 0)).toHaveLength(1);
      }
    });
  });

  describe('workArea', () => {
    it('lässt vom Bildschirm übrig, was die Leiste nicht braucht', () => {
      expect(workArea({ w: 1200, h: 800 }, dockInsets('bottom', true))).toEqual({
        x: 0,
        y: 0,
        w: 1200,
        h: 800 - DOCK_RESERVE,
      });
      expect(workArea({ w: 1200, h: 800 }, dockInsets('left', true))).toEqual({
        x: DOCK_RESERVE,
        y: 0,
        w: 1200 - DOCK_RESERVE,
        h: 800,
      });
    });

    it('gibt ohne Leiste den ganzen Bildschirm her', () => {
      expect(workArea({ w: 1200, h: 800 }, NO_INSETS)).toEqual({ x: 0, y: 0, w: 1200, h: 800 });
    });

    it('bleibt auch auf winzigem Bildschirm ein Rechteck', () => {
      // Ungemessen (0×0) oder schmaler als die Leiste: kein negatives Rechteck —
      // sonst zeichnete der Kachel-Baum ins Nichts.
      const tiny = workArea({ w: 0, h: 40 }, dockInsets('bottom', true));
      expect(tiny.w).toBe(0);
      expect(tiny.h).toBe(0);
    });
  });

  describe('insetVars', () => {
    it('schreibt die Ränder an, damit der Stil sie lesen kann', () => {
      expect(insetVars(dockInsets('bottom', true))).toEqual({
        '--work-top': '0px',
        '--work-right': '0px',
        '--work-bottom': `${DOCK_RESERVE}px`,
        '--work-left': '0px',
      });
    });
  });
});
