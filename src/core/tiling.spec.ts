import { describe, it, expect } from 'vitest';
import {
  MIN_TILE,
  computeRects,
  gapBands,
  hitGap,
  hitLeaf,
  insertLeaf,
  leaf,
  leafIds,
  mapLeaves,
  nodeArea,
  ratioAtPoint,
  removeLeaf,
  setRatio,
  split,
  swapLeaves,
  type Rect,
  type TileTree,
} from './tiling';

const area: Rect = { x: 0, y: 0, w: 1000, h: 600 };
const GAP = 10;

/** Liegt eine Kachel ganz in der Fläche? */
function inside(rect: Rect, box: Rect): boolean {
  return rect.x >= box.x && rect.y >= box.y && rect.x + rect.w <= box.x + box.w && rect.y + rect.h <= box.y + box.h;
}

/** Überlappen sich zwei Kacheln? */
function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Keine zwei Kacheln des Baums dürfen sich überlappen. */
function expectNoOverlap(tree: TileTree | null, box: Rect = area, gap = GAP): void {
  const rects = Object.values(computeRects(tree, box, gap));
  for (const rect of rects) expect(inside(rect, box)).toBe(true);
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      expect(overlaps(rects[i], rects[j])).toBe(false);
    }
  }
}

/**
 * Lückenlos: Kacheln und Fugen ergeben zusammen genau die Fläche. Da sich keine
 * zwei Kacheln überlappen und jede Fuge zwischen den Hälften ihrer Teilung
 * liegt, heißt gleiche Fläche hier: der Verbund legt das Rechteck exakt aus —
 * es bleibt kein Rest frei, und nichts steht über den Rand hinaus.
 */
function expectFillsArea(tree: TileTree | null, box: Rect = area, gap = GAP): void {
  expectNoOverlap(tree, box, gap);
  const tiles = Object.values(computeRects(tree, box, gap));
  const fugen = gapBands(tree, box, gap).map((g) => g.band);
  for (const band of fugen) expect(inside(band, box)).toBe(true);
  const belegt = [...tiles, ...fugen].reduce((sum, r) => sum + r.w * r.h, 0);
  expect(belegt).toBe(box.w * box.h);
}

describe('computeRects', () => {
  it('gibt für einen leeren Baum nichts zurück', () => {
    expect(computeRects(null, area, GAP)).toEqual({});
  });

  it('gibt der einzigen Kachel die ganze Fläche', () => {
    expect(computeRects(leaf('a'), area, GAP)).toEqual({ a: { x: 0, y: 0, w: 1000, h: 600 } });
  });

  it('teilt nebeneinander und lässt genau den Abstand dazwischen', () => {
    const rects = computeRects(split('row', leaf('a'), leaf('b')), area, GAP);
    expect(rects.a).toEqual({ x: 0, y: 0, w: 495, h: 600 });
    expect(rects.b).toEqual({ x: 505, y: 0, w: 495, h: 600 });
    expect(rects.a.w + GAP + rects.b.w).toBe(area.w);
  });

  it('teilt übereinander und lässt genau den Abstand dazwischen', () => {
    const rects = computeRects(split('column', leaf('a'), leaf('b')), area, GAP);
    expect(rects.a).toEqual({ x: 0, y: 0, w: 1000, h: 295 });
    expect(rects.b).toEqual({ x: 0, y: 305, w: 1000, h: 295 });
  });

  it('hält sich an das Verhältnis der Teilung', () => {
    const rects = computeRects(split('row', leaf('a'), leaf('b'), 0.25), area, GAP);
    expect(rects.a.w).toBe(Math.round((area.w - GAP) * 0.25));
    expect(rects.b.w).toBe(area.w - GAP - rects.a.w);
  });

  it('reicht den Ursprung der Fläche durch', () => {
    const rects = computeRects(split('row', leaf('a'), leaf('b')), { x: 40, y: 20, w: 210, h: 100 }, GAP);
    expect(rects.a).toEqual({ x: 40, y: 20, w: 100, h: 100 });
    expect(rects.b).toEqual({ x: 150, y: 20, w: 100, h: 100 });
  });

  it('legt auch verschachtelte Kacheln überschneidungsfrei in die Fläche', () => {
    const tree = split('row', leaf('a'), split('column', leaf('b'), split('row', leaf('c'), leaf('d'), 0.3), 0.7));
    expect(Object.keys(computeRects(tree, area, GAP)).sort()).toEqual(['a', 'b', 'c', 'd']);
    expectNoOverlap(tree);
  });
});

describe('leafIds', () => {
  it('zählt die Kacheln von links oben nach rechts unten auf', () => {
    expect(leafIds(split('row', leaf('a'), split('column', leaf('b'), leaf('c'))))).toEqual(['a', 'b', 'c']);
    expect(leafIds(null)).toEqual([]);
  });
});

describe('insertLeaf', () => {
  it('macht aus dem leeren Baum die erste Kachel', () => {
    expect(insertLeaf(null, null, 'a', area, GAP)).toEqual(leaf('a'));
  });

  it('teilt eine breite Kachel nach links/rechts, die neue kommt nach rechts', () => {
    const tree = insertLeaf(leaf('a'), 'a', 'b', area, GAP);
    const rects = computeRects(tree, area, GAP);
    expect(rects.a.x).toBeLessThan(rects.b.x);
    expect(rects.a.y).toBe(rects.b.y);
    expect(rects.a.h).toBe(area.h);
  });

  it('teilt eine hohe Kachel nach oben/unten, die neue kommt nach unten', () => {
    const hoch: Rect = { x: 0, y: 0, w: 400, h: 900 };
    const tree = insertLeaf(leaf('a'), 'a', 'b', hoch, GAP);
    const rects = computeRects(tree, hoch, GAP);
    expect(rects.a.y).toBeLessThan(rects.b.y);
    expect(rects.a.x).toBe(rects.b.x);
    expect(rects.a.w).toBe(hoch.w);
  });

  it('teilt nur die Kachel mit dem Brennpunkt — der Rest bleibt liegen', () => {
    // Die untere Hälfte ist breit (1000 × 295) — dort wird links/rechts geteilt.
    const tree = split('column', leaf('a'), leaf('b'));
    const vorher = computeRects(tree, area, GAP);
    const rects = computeRects(insertLeaf(tree, 'b', 'c', area, GAP), area, GAP);
    expect(rects.a).toEqual(vorher.a);
    expect(rects.b.y).toBe(vorher.b.y);
    expect(rects.b.h).toBe(vorher.b.h);
    expect(rects.b.w).toBeLessThan(vorher.b.w);
    expect(rects.c.x).toBeGreaterThan(rects.b.x);
  });

  it('wählt die Richtung je Kachel nach deren Seitenverhältnis, nicht nach der Fläche', () => {
    // Die rechte Hälfte ist hoch (495 × 600) — dort wird oben/unten geteilt.
    const tree = insertLeaf(split('row', leaf('a'), leaf('b')), 'b', 'c', area, GAP);
    const rects = computeRects(tree, area, GAP);
    expect(rects.b.x).toBe(rects.c.x);
    expect(rects.b.y).toBeLessThan(rects.c.y);
  });

  it('teilt ohne bekannten Brennpunkt die zuletzt entstandene Kachel', () => {
    const tree = insertLeaf(split('row', leaf('a'), leaf('b')), 'weg', 'c', area, GAP);
    expect(leafIds(tree)).toEqual(['a', 'b', 'c']);
    const rects = computeRects(tree, area, GAP);
    expect(rects.a.w).toBe(computeRects(split('row', leaf('a'), leaf('b')), area, GAP).a.w);
  });

  it('nimmt eine schon einsortierte Kachel nicht ein zweites Mal auf', () => {
    const tree = split('row', leaf('a'), leaf('b'));
    expect(insertLeaf(tree, 'a', 'b', area, GAP)).toBe(tree);
  });

  it('bleibt über viele Fenster hinweg überschneidungsfrei', () => {
    let tree: TileTree | null = null;
    let focus: string | null = null;
    for (let i = 0; i < 12; i += 1) {
      focus = `w${i}`;
      tree = insertLeaf(tree, i === 0 ? null : `w${i - 1}`, focus, area, GAP);
    }
    expect(leafIds(tree)).toHaveLength(12);
    expectNoOverlap(tree);
  });
});

describe('removeLeaf', () => {
  it('lässt die Schwester den Platz der Teilung erben', () => {
    const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));
    const vorher = computeRects(tree, area, GAP);
    const rects = computeRects(removeLeaf(tree, 'c'), area, GAP);
    expect(rects.a).toEqual(vorher.a);
    // b bekommt die ganze rechte Hälfte.
    expect(rects.b).toEqual({ x: vorher.b.x, y: vorher.a.y, w: vorher.b.w, h: area.h });
  });

  it('räumt die letzte Kachel ganz ab', () => {
    expect(removeLeaf(leaf('a'), 'a')).toBeNull();
    expect(removeLeaf(null, 'a')).toBeNull();
  });

  it('lässt einen Baum ohne die Kachel unangetastet', () => {
    const tree = split('row', leaf('a'), leaf('b'));
    expect(removeLeaf(tree, 'weg')).toBe(tree);
  });

  it('bleibt beim Abräumen wohlgeformt', () => {
    let tree: TileTree | null = split(
      'row',
      split('column', leaf('a'), leaf('b'), 0.3),
      split('column', leaf('c'), split('row', leaf('d'), leaf('e')), 0.6),
    );
    for (const id of ['b', 'd', 'a']) {
      tree = removeLeaf(tree, id);
      expectNoOverlap(tree);
    }
    expect(leafIds(tree)).toEqual(['c', 'e']);
  });
});

describe('swapLeaves', () => {
  it('tauscht zwei Kacheln an ihren Plätzen', () => {
    const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));
    const vorher = computeRects(tree, area, GAP);
    const rects = computeRects(swapLeaves(tree, 'a', 'c'), area, GAP);
    expect(rects.a).toEqual(vorher.c);
    expect(rects.c).toEqual(vorher.a);
    expect(rects.b).toEqual(vorher.b);
  });

  it('lässt den Baum in Ruhe, wenn eine Kachel fehlt oder beide dieselbe sind', () => {
    const tree = split('row', leaf('a'), leaf('b'));
    expect(swapLeaves(tree, 'a', 'weg')).toBe(tree);
    expect(swapLeaves(tree, 'a', 'a')).toBe(tree);
    expect(swapLeaves(null, 'a', 'b')).toBeNull();
  });
});

describe('nodeArea', () => {
  it('gibt die Fläche eines Astes zurück', () => {
    const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));
    expect(nodeArea(tree, [], area, GAP)).toEqual(area);
    expect(nodeArea(tree, ['b'], area, GAP)).toEqual({ x: 505, y: 0, w: 495, h: 600 });
    expect(nodeArea(tree, ['a', 'b'], area, GAP)).toBeNull();
  });
});

describe('setRatio', () => {
  it('setzt das Verhältnis und rechnet die Nachkommen neu', () => {
    const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));
    const rects = computeRects(setRatio(tree, [], 0.25, area, GAP), area, GAP);
    expect(rects.a.w).toBe(Math.round((area.w - GAP) * 0.25));
    expect(rects.b.w).toBe(area.w - GAP - rects.a.w);
    expect(rects.b.x).toBe(rects.a.w + GAP);
    expect(rects.c.x).toBe(rects.b.x);
  });

  it('setzt auch das Verhältnis eines tiefer liegenden Astes', () => {
    const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));
    const rects = computeRects(setRatio(tree, ['b'], 0.8, area, GAP), area, GAP);
    expect(rects.b.h).toBe(Math.round((area.h - GAP) * 0.8));
  });

  it('hält die Mindestgröße einer Kachel ein', () => {
    const tree = split('row', leaf('a'), leaf('b'));
    const eng = computeRects(setRatio(tree, [], 0.01, area, GAP, 200), area, GAP);
    expect(eng.a.w).toBe(200);
    const weit = computeRects(setRatio(tree, [], 0.99, area, GAP, 200), area, GAP);
    expect(weit.b.w).toBe(200);
  });

  it('bleibt in der Mitte, wenn die Fläche für zwei Mindestgrößen zu klein ist', () => {
    const tree = split('row', leaf('a'), leaf('b'));
    const winzig: Rect = { x: 0, y: 0, w: 150, h: 100 };
    const rects = computeRects(setRatio(tree, [], 0.9, winzig, GAP, MIN_TILE), winzig, GAP);
    expect(rects.a.w).toBe(70);
    expect(rects.b.w).toBe(70);
  });

  it('lässt den Baum in Ruhe, wenn der Pfad auf keine Teilung zeigt', () => {
    const tree = split('row', leaf('a'), leaf('b'));
    expect(setRatio(tree, ['a'], 0.2, area, GAP)).toBe(tree);
    expect(setRatio(tree, ['a', 'b'], 0.2, area, GAP)).toBe(tree);
    expect(setRatio(null, [], 0.2, area, GAP)).toBeNull();
  });
});

describe('hitGap', () => {
  const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));

  it('erkennt die Fuge der äußeren Teilung', () => {
    const hit = hitGap(tree, { x: 500, y: 300 }, area, GAP);
    expect(hit).toEqual({ path: [], orientation: 'row', band: { x: 495, y: 0, w: GAP, h: 600 } });
  });

  it('erkennt die Fuge einer inneren Teilung', () => {
    const hit = hitGap(tree, { x: 700, y: 300 }, area, GAP);
    expect(hit?.path).toEqual(['b']);
    expect(hit?.orientation).toBe('column');
    expect(hit?.band).toEqual({ x: 505, y: 295, w: 495, h: GAP });
  });

  it('findet mitten auf einer Kachel keine Fuge', () => {
    expect(hitGap(tree, { x: 100, y: 100 }, area, GAP)).toBeNull();
    expect(hitGap(tree, { x: 700, y: 100 }, area, GAP)).toBeNull();
  });

  it('findet außerhalb der Fläche und ohne Teilung keine Fuge', () => {
    expect(hitGap(tree, { x: -20, y: 300 }, area, GAP)).toBeNull();
    expect(hitGap(leaf('a'), { x: 100, y: 100 }, area, GAP)).toBeNull();
    expect(hitGap(null, { x: 100, y: 100 }, area, GAP)).toBeNull();
  });

  it('greift mit einer Toleranz auch neben der Fuge', () => {
    expect(hitGap(tree, { x: 490, y: 300 }, area, GAP)).toBeNull();
    expect(hitGap(tree, { x: 490, y: 300 }, area, GAP, 6)?.path).toEqual([]);
  });
});

describe('gapBands', () => {
  const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));

  it('nennt jede Teilung mit ihrem Streifen — genau die, die hitGap findet', () => {
    const bands = gapBands(tree, area, GAP);
    expect(bands.map((b) => b.path)).toEqual([[], ['b']]);
    for (const band of bands) {
      const mitte = {
        x: band.band.x + band.band.w / 2,
        y: band.band.y + band.band.h / 2,
      };
      expect(hitGap(tree, mitte, area, GAP)).toEqual(band);
    }
  });

  it('hat ohne Teilung nichts anzubieten', () => {
    expect(gapBands(leaf('a'), area, GAP)).toEqual([]);
    expect(gapBands(null, area, GAP)).toEqual([]);
  });
});

describe('hitLeaf', () => {
  const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));

  it('nennt das Fenster unter dem Punkt', () => {
    const rects = computeRects(tree, area, GAP);
    for (const [id, r] of Object.entries(rects)) {
      expect(hitLeaf(tree, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, area, GAP)).toBe(id);
    }
  });

  it('findet auf der Fuge und außerhalb der Fläche keines', () => {
    // Mitten in der senkrechten Fuge der äußeren Teilung.
    expect(hitLeaf(tree, { x: 500, y: 300 }, area, GAP)).toBeNull();
    expect(hitLeaf(tree, { x: -20, y: 300 }, area, GAP)).toBeNull();
    expect(hitLeaf(null, { x: 100, y: 100 }, area, GAP)).toBeNull();
  });

  it('trifft auch das einzige Fenster eines ungeteilten Baums', () => {
    expect(hitLeaf(leaf('a'), { x: 100, y: 100 }, area, GAP)).toBe('a');
  });
});

describe('ratioAtPoint', () => {
  const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));

  it('macht aus der Zeigerposition das Verhältnis der Teilung', () => {
    expect(ratioAtPoint(tree, [], { x: 250, y: 300 }, area, GAP)).toBeCloseTo(245 / 990, 5);
    expect(ratioAtPoint(tree, ['b'], { x: 700, y: 155 }, area, GAP)).toBeCloseTo(150 / 590, 5);
  });

  it('bleibt an der Mindestgröße hängen', () => {
    expect(ratioAtPoint(tree, [], { x: 5, y: 300 }, area, GAP, 200)).toBeCloseTo(200 / 990, 5);
    expect(ratioAtPoint(tree, [], { x: 995, y: 300 }, area, GAP, 200)).toBeCloseTo(1 - 200 / 990, 5);
  });

  it('gibt ohne Teilung die Mitte zurück', () => {
    expect(ratioAtPoint(tree, ['a'], { x: 100, y: 300 }, area, GAP)).toBe(0.5);
    expect(ratioAtPoint(null, [], { x: 100, y: 300 }, area, GAP)).toBe(0.5);
  });
});

describe('mapLeaves', () => {
  const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c'), 0.3), 0.7);

  it('schreibt die Blätter um und lässt Gestalt und Verhältnisse stehen', () => {
    expect(mapLeaves(tree, (id) => id.toUpperCase())).toEqual(
      split('row', leaf('A'), split('column', leaf('B'), leaf('C'), 0.3), 0.7),
    );
  });

  it('gibt denselben Baum zurück, wenn kein Blatt sich ändert', () => {
    expect(mapLeaves(tree, (id) => id)).toBe(tree);
  });

  it('lässt ein Blatt ohne neuen Namen heraus — die Schwester erbt die Teilung', () => {
    expect(mapLeaves(tree, (id) => (id === 'b' ? null : id))).toEqual(
      split('row', leaf('a'), leaf('c'), 0.7),
    );
  });

  it('behält von zwei gleich benannten Blättern das erste', () => {
    expect(mapLeaves(tree, (id) => (id === 'c' ? 'a' : id))).toEqual(
      split('row', leaf('a'), leaf('b'), 0.7),
    );
  });

  it('gibt nichts zurück, wenn kein Blatt bleibt', () => {
    expect(mapLeaves(tree, () => null)).toBeNull();
    expect(mapLeaves(null, (id) => id)).toBeNull();
  });
});

/**
 * Der Kachel-Modus als Ganzes (c0064): Was die Oberfläche auch anstellt — der
 * Verbund bleibt überschneidungsfrei UND lückenlos. Die Einzelschritte prüfen
 * die Abschnitte oben; hier zählt, dass die Fläche danach immer noch aufgeht.
 */
describe('Der Verbund füllt die Fläche', () => {
  it('gibt einer einzelnen Kachel die ganze Fläche', () => {
    expectFillsArea(leaf('a'));
  });

  it('legt eine verschachtelte Anordnung lückenlos aus', () => {
    expectFillsArea(
      split(
        'row',
        split('column', leaf('a'), leaf('b'), 0.3),
        split('column', leaf('c'), split('row', leaf('d'), leaf('e'), 0.7), 0.6),
      ),
    );
  });

  it('bleibt lückenlos, während Fenster dazukommen und wieder gehen', () => {
    let tree: TileTree | null = null;
    let focus: string | null = null;
    for (let i = 0; i < 12; i += 1) {
      focus = `w${i}`;
      tree = insertLeaf(tree, i === 0 ? null : `w${i - 1}`, focus, area, GAP);
      expectFillsArea(tree);
    }
    for (const id of ['w3', 'w0', 'w11', 'w7']) {
      tree = removeLeaf(tree, id);
      expectFillsArea(tree);
    }
    expect(leafIds(tree)).toHaveLength(8);
  });

  it('bleibt lückenlos, wenn an einer Fuge gezogen wird — bis an die Mindestgröße', () => {
    const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c')));
    for (const ratio of [0.01, 0.25, 0.5, 0.75, 0.99]) {
      expectFillsArea(setRatio(tree, [], ratio, area, GAP));
      expectFillsArea(setRatio(tree, ['b'], ratio, area, GAP));
    }
  });

  it('bleibt lückenlos, wenn zwei Kacheln die Plätze tauschen', () => {
    const tree = split('row', leaf('a'), split('column', leaf('b'), leaf('c'), 0.2));
    expectFillsArea(swapLeaves(tree, 'a', 'c'));
  });

  it('geht auch auf einer Fläche auf, die kaum die Fuge fasst', () => {
    const eng: Rect = { x: 12, y: 8, w: 8, h: 100 };
    expectFillsArea(split('row', leaf('a'), leaf('b')), eng);
    expectFillsArea(split('column', leaf('a'), leaf('b')), { x: 0, y: 0, w: 100, h: 8 });
  });
});

describe('Voreinstellungen', () => {
  it('nennt eine Mindestgröße für eine Kachel', () => {
    // Die Fuge ist keine Voreinstellung der Rechnung mehr, sondern eine
    // Einstellung (core/tilesettings, c0072) — sie kommt als `gap` herein.
    expect(MIN_TILE).toBeGreaterThan(0);
  });
});
