import { describe, it, expect } from 'vitest';
import {
  cleanTileTrees,
  MAX_TILE_DEPTH,
  restoreTiles,
  sameTree,
  serializeTiles,
  type TileWindow,
} from './tilelayout';
import { leaf, leafIds, split, type TileTree } from './tiling';
import { EXPLORER_ID } from './system';

/** Ein offenes Fenster, wie der Desktop es führt (nur, was hier zählt). */
function win(instanceId: string, appId: string | null, systemId: string | null = null): TileWindow {
  return { instanceId, appId, systemId };
}

const fenster: TileWindow[] = [
  win('win-1', 'rechner-1'),
  win('win-2', 'editor-2'),
  win('win-3', null, EXPLORER_ID),
];

describe('serializeTiles', () => {
  it('merkt sich einen leeren Baum als nichts', () => {
    expect(serializeTiles(null, fenster)).toBeNull();
  });

  it('schreibt die Blätter auf App und Ansicht um — Gestalt und Verhältnis bleiben', () => {
    const tree = split('row', leaf('win-1'), split('column', leaf('win-2'), leaf('win-3'), 0.25), 0.7);

    expect(serializeTiles(tree, fenster)).toEqual(
      split('row', leaf('app:rechner-1'), split('column', leaf('app:editor-2'), leaf(`sys:${EXPLORER_ID}`), 0.25), 0.7),
    );
  });

  it('lässt einen Entwurf ohne App weg — seine Schwester erbt den Platz', () => {
    const tree = split('row', leaf('win-1'), leaf('win-9'), 0.7);

    expect(serializeTiles(tree, [...fenster, win('win-9', null)])).toEqual(leaf('app:rechner-1'));
  });

  it('lässt ein Blatt weg, zu dem es gar kein Fenster gibt', () => {
    const tree = split('row', leaf('win-1'), leaf('win-weg'), 0.7);

    expect(serializeTiles(tree, fenster)).toEqual(leaf('app:rechner-1'));
  });

  it('merkt von zwei Fenstern derselben App nur das erste', () => {
    const tree = split('row', leaf('win-1'), leaf('win-1b'), 0.7);

    expect(serializeTiles(tree, [...fenster, win('win-1b', 'rechner-1')])).toEqual(leaf('app:rechner-1'));
  });
});

describe('restoreTiles', () => {
  const saved = split('row', leaf('app:rechner-1'), split('column', leaf('app:editor-2'), leaf(`sys:${EXPLORER_ID}`), 0.25), 0.7);

  it('macht aus den Schlüsseln wieder die Fenster dieser Sitzung', () => {
    expect(restoreTiles(saved, fenster)).toEqual(
      split('row', leaf('win-1'), split('column', leaf('win-2'), leaf('win-3'), 0.25), 0.7),
    );
  });

  it('kennt ohne gemerkten Baum nichts', () => {
    expect(restoreTiles(null, fenster)).toBeNull();
  });

  it('lässt eine App, die es nicht mehr gibt, herausfallen — ohne leere Kachel', () => {
    const rest = restoreTiles(saved, [win('win-1', 'rechner-1'), win('win-3', null, EXPLORER_ID)]);

    expect(rest).toEqual(split('row', leaf('win-1'), leaf('win-3'), 0.7));
    expect(leafIds(rest)).toEqual(['win-1', 'win-3']);
  });

  it('gibt nichts zurück, wenn keine der gemerkten Apps mehr da ist', () => {
    expect(restoreTiles(saved, [win('win-4', 'ganz-anders')])).toBeNull();
  });

  it('nimmt ein Fenster nicht auf, das gar nicht im gemerkten Baum steht', () => {
    const rest = restoreTiles(leaf('app:rechner-1'), fenster);
    expect(leafIds(rest)).toEqual(['win-1']);
  });
});

describe('Hin und zurück', () => {
  it('bringt denselben Baum zurück — Gestalt, Verhältnisse, Reihenfolge', () => {
    const tree = split(
      'column',
      split('row', leaf('win-1'), leaf('win-2'), 0.62),
      leaf('win-3'),
      0.38,
    );

    const zurück = restoreTiles(serializeTiles(tree, fenster), fenster);

    expect(zurück).toEqual(tree);
    expect(sameTree(zurück, tree)).toBe(true);
  });

  it('bringt ihn auch dann zurück, wenn eine App inzwischen fehlt', () => {
    const tree = split('column', split('row', leaf('win-1'), leaf('win-2'), 0.62), leaf('win-3'), 0.38);
    const saved = serializeTiles(tree, fenster);

    // Der Editor ist von der Platte verschwunden: Er wird nicht wieder geöffnet.
    const offen = [win('win-1', 'rechner-1'), win('win-3', null, EXPLORER_ID)];
    const zurück = restoreTiles(saved, offen);

    expect(zurück).toEqual(split('column', leaf('win-1'), leaf('win-3'), 0.38));
    expect(leafIds(zurück)).toEqual(['win-1', 'win-3']);
  });

  it('erkennt die Fenster auch unter neuen Instanz-Ids wieder', () => {
    const tree = split('row', leaf('win-1'), leaf('win-2'), 0.7);
    const saved = serializeTiles(tree, fenster);

    // Nächster Start: dieselben Apps, andere Fenster-Ids.
    const zurück = restoreTiles(saved, [win('win-7', 'editor-2'), win('win-8', 'rechner-1')]);

    expect(zurück).toEqual(split('row', leaf('win-8'), leaf('win-7'), 0.7));
  });
});

describe('sameTree', () => {
  it('erkennt zwei gleich gebaute Bäume', () => {
    expect(sameTree(split('row', leaf('a'), leaf('b'), 0.3), split('row', leaf('a'), leaf('b'), 0.3))).toBe(true);
    expect(sameTree(null, null)).toBe(true);
  });

  it('erkennt jeden Unterschied — Verhältnis, Richtung, Blatt, Gestalt', () => {
    const tree = split('row', leaf('a'), leaf('b'), 0.3);
    expect(sameTree(tree, split('row', leaf('a'), leaf('b'), 0.31))).toBe(false);
    expect(sameTree(tree, split('column', leaf('a'), leaf('b'), 0.3))).toBe(false);
    expect(sameTree(tree, split('row', leaf('a'), leaf('c'), 0.3))).toBe(false);
    expect(sameTree(tree, leaf('a'))).toBe(false);
    expect(sameTree(tree, null)).toBe(false);
  });
});

describe('cleanTileTrees', () => {
  it('nimmt gemerkte Bäume je Verzeichnis an', () => {
    const raw = { '/apps': split('row', leaf('app:a'), leaf('app:b'), 0.4) };
    expect(cleanTileTrees(raw)).toEqual(raw);
  });

  it('überliest, was gar keine Bäume sind', () => {
    expect(cleanTileTrees(undefined)).toEqual({});
    expect(cleanTileTrees('kaputt')).toEqual({});
    expect(cleanTileTrees({ '/apps': 'kaputt', '/x': null, '/y': 42 })).toEqual({});
  });

  it('lässt einen beschädigten Ast weg — der heile erbt den Platz', () => {
    const raw = { '/apps': { kind: 'split', orientation: 'row', ratio: 0.4, a: leaf('app:a'), b: { kind: 'nichts' } } };
    expect(cleanTileTrees(raw)).toEqual({ '/apps': leaf('app:a') });
  });

  it('wirft ein doppeltes Blatt weg', () => {
    const raw = { '/apps': split('row', leaf('app:a'), leaf('app:a'), 0.4) };
    expect(cleanTileTrees(raw)).toEqual({ '/apps': leaf('app:a') });
  });

  it('holt ein unbrauchbares Verhältnis auf die Hälfte zurück', () => {
    const raw = {
      '/a': { kind: 'split', orientation: 'row', ratio: 'viel', a: leaf('app:a'), b: leaf('app:b') },
      '/b': split('row', leaf('app:a'), leaf('app:b'), 4),
    };
    expect(cleanTileTrees(raw)).toEqual({
      '/a': split('row', leaf('app:a'), leaf('app:b'), 0.5),
      '/b': split('row', leaf('app:a'), leaf('app:b'), 1),
    });
  });

  it('nimmt keine Richtung an, die es nicht gibt, und kein leeres Blatt', () => {
    const raw = {
      '/a': { kind: 'split', orientation: 'schräg', ratio: 0.5, a: leaf('app:a'), b: leaf('app:b') },
      '/b': { kind: 'leaf', id: '' },
    };
    expect(cleanTileTrees(raw)).toEqual({});
  });

  it('bricht einen unsinnig tief verschachtelten Baum ab, statt sich zu verlaufen', () => {
    let tief: TileTree = leaf('app:tief');
    for (let i = 0; i < 200; i += 1) tief = split('row', leaf(`app:a${i}`), tief);

    const clean = cleanTileTrees({ '/apps': tief })['/apps'];

    expect(clean).toBeDefined();
    expect(leafIds(clean).length).toBeLessThanOrEqual(MAX_TILE_DEPTH);
    expect(leafIds(clean)).not.toContain('app:tief');
  });
});
