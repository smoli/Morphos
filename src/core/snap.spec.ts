import { describe, it, expect } from 'vitest';
import {
  SNAP_RANGE,
  snapLines,
  snapMoved,
  snapSized,
  type Lines,
} from './snap';
import { MIN_BLOCK_SIZE, type Block } from './design';

/** Ein Block mit Vorgabewerten — die Tests nennen nur, worauf es ihnen ankommt. */
function block(id: string, rect: Partial<Block['rect']> = {}, children: Block[] = []): Block {
  return { id, name: id, rect: { x: 0, y: 0, w: 0.5, h: 0.5, ...rect }, children };
}

/** Nur die genannten Linien — der Fensterrahmen kommt in `snapLines` dazu. */
function lines(x: number[], y: number[] = []): Lines {
  return { x, y };
}

describe('core/snap', () => {
  describe('snapLines', () => {
    it('kennt ohne Kästen Rand und Mitte des Fensters', () => {
      expect(snapLines([])).toEqual({ x: [0, 0.5, 1], y: [0, 0.5, 1] });
    });

    it('nimmt von jedem Kasten beide Kanten und seine Mitte', () => {
      const got = snapLines([block('a', { x: 0.2, y: 0.1, w: 0.3, h: 0.2 })]);

      expect(got.x).toEqual([0, 0.2, 0.35, 0.5, 1]);
      expect(got.y).toEqual([0, 0.1, 0.2, 0.3, 0.5, 1]);
    });

    it('läuft auch durch die Kinder', () => {
      const got = snapLines([
        block('a', { x: 0, y: 0, w: 0.8, h: 0.8 }, [block('k', { x: 0.6, y: 0, w: 0.1, h: 0.1 })]),
      ]);

      expect(got.x).toContain(0.6);
      expect(got.x).toContain(0.65);
      expect(got.x).toContain(0.7);
    });

    it('nimmt den angefassten Kasten samt seinem Zweig heraus', () => {
      // Er wandert mit — an sich selbst richtet sich niemand aus.
      const got = snapLines(
        [block('a', { x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, [block('k', { x: 0.25, y: 0.25, w: 0.1, h: 0.1 })])],
        'a',
      );

      expect(got).toEqual({ x: [0, 0.5, 1], y: [0, 0.5, 1] });
    });

    it('nennt dieselbe Linie nur einmal, und zwar der Reihe nach', () => {
      const got = snapLines([
        block('a', { x: 0.2, y: 0, w: 0.3, h: 0.5 }),
        block('b', { x: 0.2, y: 0, w: 0.3, h: 0.5 }),
      ]);

      expect(got.x).toEqual([0, 0.2, 0.35, 0.5, 1]);
    });
  });

  describe('snapMoved', () => {
    it('rastet die linke Kante an einer Linie ein und behält die Größe', () => {
      const got = snapMoved({ x: 0.196, y: 0.5, w: 0.2, h: 0.1 }, lines([0.2]));

      expect(got.rect).toEqual({ x: 0.2, y: 0.5, w: 0.2, h: 0.1 });
      expect(got.guides).toEqual([{ axis: 'x', at: 0.2 }]);
    });

    it('rastet auch mit der rechten Kante ein', () => {
      const got = snapMoved({ x: 0.305, y: 0.5, w: 0.2, h: 0.1 }, lines([0.5]));

      expect(got.rect.x).toBe(0.3);
      expect(got.guides).toEqual([{ axis: 'x', at: 0.5 }]);
    });

    it('rastet mit der Mitte ein', () => {
      const got = snapMoved({ x: 0.204, y: 0.5, w: 0.2, h: 0.1 }, lines([0.3]));

      expect(got.rect.x).toBe(0.2);
      expect(got.guides).toEqual([{ axis: 'x', at: 0.3 }]);
    });

    it('nimmt die nächste Linie', () => {
      const got = snapMoved({ x: 0.204, y: 0, w: 0.1, h: 0.1 }, lines([0.2, 0.206]));

      expect(got.rect.x).toBe(0.206);
      expect(got.guides).toEqual([{ axis: 'x', at: 0.206 }]);
    });

    it('lässt liegen, was zu weit weg ist', () => {
      const rect = { x: 0.3, y: 0.3, w: 0.2, h: 0.1 };

      const got = snapMoved(rect, lines([0.1], [0.9]));

      expect(got.rect).toEqual(rect);
      expect(got.guides).toEqual([]);
    });

    it('richtet beide Achsen aus, jede für sich', () => {
      const got = snapMoved({ x: 0.196, y: 0.402, w: 0.2, h: 0.1 }, lines([0.2], [0.4]));

      expect(got.rect).toEqual({ x: 0.2, y: 0.4, w: 0.2, h: 0.1 });
      expect(got.guides).toEqual([
        { axis: 'x', at: 0.2 },
        { axis: 'y', at: 0.4 },
      ]);
    });

    it('rastet bis an die Reichweite ein, darüber nicht mehr', () => {
      const nah = snapMoved({ x: SNAP_RANGE, y: 0.5, w: 0.2, h: 0.1 }, lines([0]));
      expect(nah.rect.x).toBe(0);

      const weit = snapMoved({ x: SNAP_RANGE * 1.5, y: 0.5, w: 0.2, h: 0.1 }, lines([0]));
      expect(weit.rect.x).toBe(SNAP_RANGE * 1.5);
      expect(weit.guides).toEqual([]);
    });

    it('führt den Zweig nicht aus dem Fenster hinaus', () => {
      // Der Kasten steht am rechten Rand; die Linie läge zwar nah, der Zweig
      // ragte dann aber hinaus — also bleibt er stehen.
      const bounds = { x: 0.5, y: 0, w: 0.5, h: 0.2 };

      const got = snapMoved({ x: 0.8, y: 0, w: 0.2, h: 0.2 }, lines([0.805]), bounds);

      expect(got.rect.x).toBe(0.8);
      expect(got.guides).toEqual([]);
    });
  });

  describe('snapSized', () => {
    it('bewegt am Ost-Griff nur die rechte Kante', () => {
      const got = snapSized({ x: 0.1, y: 0.1, w: 0.295, h: 0.2 }, 'e', lines([0.1, 0.4]));

      expect(got.rect).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 });
      expect(got.guides).toEqual([{ axis: 'x', at: 0.4 }]);
    });

    it('bewegt am West-Griff nur die linke Kante — die andere bleibt stehen', () => {
      const got = snapSized({ x: 0.204, y: 0.1, w: 0.296, h: 0.2 }, 'w', lines([0.2, 0.5]));

      expect(got.rect).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.2 });
      expect(got.guides).toEqual([{ axis: 'x', at: 0.2 }]);
    });

    it('rührt an einer waagerechten Kante die senkrechten Linien nicht an', () => {
      const got = snapSized({ x: 0.196, y: 0.302, w: 0.2, h: 0.2 }, 's', lines([0.2], [0.5]));

      expect(got.rect).toEqual({ x: 0.196, y: 0.302, w: 0.2, h: 0.198 });
      expect(got.guides).toEqual([{ axis: 'y', at: 0.5 }]);
    });

    it('richtet an einer Ecke beide Kanten aus', () => {
      const got = snapSized({ x: 0.1, y: 0.1, w: 0.295, h: 0.196 }, 'se', lines([0.4], [0.3]));

      expect(got.rect).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 });
      expect(got.guides).toEqual([
        { axis: 'x', at: 0.4 },
        { axis: 'y', at: 0.3 },
      ]);
    });

    it('richtet beim Zeichnen (ohne Griff) alle vier Kanten aus', () => {
      const got = snapSized({ x: 0.203, y: 0.098, w: 0.294, h: 0.205 }, null, lines([0.2, 0.5], [0.1, 0.3]));

      expect(got.rect).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.2 });
      expect(got.guides).toEqual([
        { axis: 'x', at: 0.2 },
        { axis: 'x', at: 0.5 },
        { axis: 'y', at: 0.1 },
        { axis: 'y', at: 0.3 },
      ]);
    });

    it('macht einen Kasten nicht kleiner als das Kleinste', () => {
      // Die Linie liegt jenseits der gegenüberliegenden Kante — das ließe den
      // Kasten umklappen, also rastet er nicht ein.
      const rect = { x: 0.1, y: 0.1, w: MIN_BLOCK_SIZE, h: 0.2 };

      const got = snapSized(rect, 'e', lines([0.105]));

      expect(got.rect).toEqual(rect);
      expect(got.guides).toEqual([]);
    });

    it('lässt liegen, was zu weit weg ist', () => {
      const rect = { x: 0.1, y: 0.1, w: 0.3, h: 0.2 };

      const got = snapSized(rect, 'se', lines([0.8], [0.9]));

      expect(got.rect).toEqual(rect);
      expect(got.guides).toEqual([]);
    });
  });
});
