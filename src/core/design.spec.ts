import { describe, it, expect } from 'vitest';
import {
  addBlock,
  BLOCK_HANDLES,
  BLOCK_ROLES,
  DESIGN_FILE,
  DESIGN_VERSION,
  MAX_DESIGN_DEPTH,
  MAX_TYPE_LENGTH,
  MIN_BLOCK_SIZE,
  blockBounds,
  canNestUnder,
  containerFor,
  containerIn,
  deleteBlock,
  emptyDesign,
  findBlock,
  findBlockIn,
  listBlocks,
  makeBlockId,
  moveBlock,
  moveRect,
  nestBlock,
  normalizeDesign,
  parentOf,
  placeBlock,
  removeBlock,
  reparentBlock,
  resizeRect,
  updateBlock,
  walkBlocks,
  type Block,
  type Design,
} from './design';
import { isValidOutputPath } from './files';

/** Ein Block mit Vorgabewerten — die Tests nennen nur, worauf es ihnen ankommt. */
function block(id: string, rect: Partial<Block['rect']> = {}, extra: Partial<Block> = {}): Block {
  return {
    id,
    name: id,
    rect: { x: 0, y: 0, w: 0.5, h: 0.5, ...rect },
    children: [],
    ...extra,
  };
}

/** Ein Entwurf aus den übergebenen Blöcken (bereits in Ordnung). */
function design(...blocks: Block[]): Design {
  return { version: DESIGN_VERSION, blocks };
}

describe('emptyDesign', () => {
  it('liefert einen leeren Entwurf in der aktuellen Fassung', () => {
    expect(emptyDesign()).toEqual({ version: DESIGN_VERSION, blocks: [] });
  });

  it('gibt bei jedem Aufruf einen eigenen Entwurf zurück', () => {
    const a = emptyDesign();
    a.blocks.push(block('b1'));
    expect(emptyDesign().blocks).toEqual([]);
  });

  it('ist für den Agenten nicht beschreibbar (Nur-Lesen-Vertrag)', () => {
    expect(isValidOutputPath(DESIGN_FILE)).toBe(false);
    expect(isValidOutputPath(`src/${DESIGN_FILE}`)).toBe(true);
  });
});

describe('makeBlockId', () => {
  it('erzeugt eine brauchbare, jedes Mal andere Id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeBlockId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^b[A-Za-z0-9]+$/);
  });
});

describe('normalizeDesign', () => {
  it('macht aus allem Unbrauchbaren einen leeren Entwurf', () => {
    for (const raw of [null, undefined, 0, 'kaputt', [], { blocks: 'nein' }]) {
      expect(normalizeDesign(raw)).toEqual(emptyDesign());
    }
  });

  it('behält eine gültige Fassungsnummer und ersetzt eine unbrauchbare', () => {
    expect(normalizeDesign({ version: 7, blocks: [] }).version).toBe(7);
    expect(normalizeDesign({ version: 0, blocks: [] }).version).toBe(DESIGN_VERSION);
    expect(normalizeDesign({ version: 'zwei', blocks: [] }).version).toBe(DESIGN_VERSION);
    expect(normalizeDesign({ version: 1.5, blocks: [] }).version).toBe(DESIGN_VERSION);
  });

  it('ergänzt fehlende Felder eines Blocks', () => {
    const [b] = normalizeDesign({ blocks: [{ name: 'Kopf' }] }).blocks;
    expect(b.name).toBe('Kopf');
    expect(b.id).toMatch(/^b/);
    expect(b.children).toEqual([]);
    expect(b.rect).toEqual({ x: 0, y: 0, w: MIN_BLOCK_SIZE, h: MIN_BLOCK_SIZE });
    expect('instructions' in b).toBe(false);
    expect('type' in b).toBe(false);
  });

  it('wirft weg, was gar kein Block ist', () => {
    const d = normalizeDesign({ blocks: [null, 'x', 42, { name: 'gut' }, []] });
    expect(d.blocks.map((b) => b.name)).toEqual(['gut']);
  });

  it('setzt eine schadhafte Geometrie auf das begehbare Feld zurück', () => {
    const d = normalizeDesign({
      blocks: [
        { name: 'a', rect: { x: -3, y: 2, w: 5, h: 0 } },
        { name: 'b', rect: { x: 'links', y: NaN, w: Infinity, h: -1 } },
        { name: 'c', rect: { x: 0.8, y: 0.9, w: 0.5, h: 0.5 } },
      ],
    });
    expect(d.blocks[0].rect).toEqual({ x: 0, y: 1 - MIN_BLOCK_SIZE, w: 1, h: MIN_BLOCK_SIZE });
    expect(d.blocks[1].rect).toEqual({ x: 0, y: 0, w: MIN_BLOCK_SIZE, h: MIN_BLOCK_SIZE });
    // Ein Block ragt nie über den Rand hinaus: die Breite wird beschnitten.
    expect(d.blocks[2].rect).toEqual({ x: 0.8, y: 0.9, w: 0.2, h: 0.1 });
  });

  it('rundet die Anteile, damit kein Fließkommastaub in der Datei landet', () => {
    const [b] = normalizeDesign({
      blocks: [{ name: 'a', rect: { x: 0.1234567, y: 1 / 3, w: 0.30000000000000004, h: 0.2 } }],
    }).blocks;
    expect(b.rect).toEqual({ x: 0.1235, y: 0.3333, w: 0.3, h: 0.2 });
  });

  it('nimmt Text nur als Text und beschneidet ihn auf ein vernünftiges Maß', () => {
    const [b] = normalizeDesign({
      blocks: [{ name: '  Kopfzeile  ', instructions: ' x '.repeat(4000), type: 42, children: [] }],
    }).blocks;
    expect(b.name).toBe('Kopfzeile');
    expect(b.instructions!.length).toBeLessThanOrEqual(4000);
    expect('type' in b).toBe(false);

    const [c] = normalizeDesign({ blocks: [{ name: 1, instructions: '   ', type: ' liste ' }] }).blocks;
    expect(c.name).toBe('');
    expect('instructions' in c).toBe(false);
    expect(c.type).toBe('liste');
  });

  it('vergibt doppelte Ids neu, damit jeder Block eindeutig bleibt', () => {
    const d = normalizeDesign({
      blocks: [
        { id: 'gleich', name: 'a' },
        { id: 'gleich', name: 'b', children: [{ id: 'gleich', name: 'c' }] },
      ],
    });
    const ids = [...listBlocks(d)].map((b) => b.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('gleich');
  });

  it('ersetzt unbrauchbare Ids', () => {
    const d = normalizeDesign({ blocks: [{ id: 42, name: 'a' }, { id: '', name: 'b' }] });
    for (const b of d.blocks) expect(b.id).toMatch(/^b/);
  });

  it('kappt einen Baum, der zu tief geschachtelt ist', () => {
    let raw: unknown = { name: 'blatt' };
    for (let i = 0; i < MAX_DESIGN_DEPTH + 5; i++) raw = { name: `n${i}`, children: [raw] };
    const d = normalizeDesign({ blocks: [raw] });

    let depth = 0;
    let node = d.blocks[0];
    while (node.children.length) {
      node = node.children[0];
      depth++;
    }
    expect(depth).toBe(MAX_DESIGN_DEPTH - 1);
  });

  it('lässt einen heilen Entwurf unverändert (und rührt das Original nicht an)', () => {
    const d = design(block('b1', {}, { instructions: 'kurz', type: 'liste', children: [block('b2')] }));
    const copy = JSON.parse(JSON.stringify(d)) as Design;
    expect(normalizeDesign(d)).toEqual(d);
    expect(d).toEqual(copy);
  });
});

describe('walkBlocks / listBlocks / findBlock', () => {
  const d = design(
    block('a', {}, { children: [block('a1', {}, { children: [block('a2')] })] }),
    block('b'),
  );

  it('läuft den Baum in Lesereihenfolge ab und kennt Elter und Tiefe', () => {
    const seen: string[] = [];
    walkBlocks(d, (b, parent, depth) => seen.push(`${b.id}:${parent?.id ?? '-'}:${depth}`));
    expect(seen).toEqual(['a:-:0', 'a1:a:1', 'a2:a1:2', 'b:-:0']);
  });

  it('listet alle Blöcke auf', () => {
    expect([...listBlocks(d)].map((b) => b.id)).toEqual(['a', 'a1', 'a2', 'b']);
  });

  it('findet einen Block über seine Id — auch tief im Baum', () => {
    expect(findBlock(d, 'a2')!.id).toBe('a2');
    expect(findBlock(d, 'b')!.id).toBe('b');
    expect(findBlock(d, 'weg')).toBeNull();
    expect(findBlock(d, '')).toBeNull();
  });

  it('findet ihn auch in einer blanken Kästenliste (ohne Entwurf drumherum)', () => {
    // Die Zeichenfläche bekommt nur die Kästen gereicht, nicht den Entwurf.
    expect(findBlockIn(d.blocks, 'a2')!.id).toBe('a2');
    expect(findBlockIn(d.blocks, 'weg')).toBeNull();
    expect(findBlockIn([], 'a')).toBeNull();
    expect(findBlockIn(d.blocks, '')).toBeNull();
  });
});

describe('BLOCK_ROLES', () => {
  it('sind ein Vorrat lesbarer Rollen, keine Vorschrift', () => {
    // Frei wählbar bleibt die Rolle (updateBlock nimmt jeden Text an) — die
    // Liste ist nur da, damit dasselbe zweimal gleich geschrieben wird.
    expect(BLOCK_ROLES.length).toBeGreaterThan(2);
    expect(new Set(BLOCK_ROLES).size).toBe(BLOCK_ROLES.length);
    for (const role of BLOCK_ROLES) {
      expect(role.trim()).toBe(role);
      expect(role.length).toBeLessThanOrEqual(MAX_TYPE_LENGTH);
    }
    expect(updateBlock(design(block('a')), 'a', { type: 'ganz was anderes' }).blocks[0].type)
      .toBe('ganz was anderes');
  });
});

describe('addBlock', () => {
  it('hängt einen Block an die Wurzel', () => {
    const d = addBlock(emptyDesign(), block('b1'));
    expect(d.blocks.map((b) => b.id)).toEqual(['b1']);
  });

  it('hängt einen Block unter seinen Elter', () => {
    const d = addBlock(design(block('a')), block('a1'), 'a');
    expect(findBlock(d, 'a')!.children.map((b) => b.id)).toEqual(['a1']);
    expect(d.blocks).toHaveLength(1);
  });

  it('bringt den neuen Block in Ordnung', () => {
    const d = addBlock(emptyDesign(), { id: 'b1', name: ' Kopf ', rect: { x: -1, y: 0, w: 5, h: 0.5 } } as Block);
    expect(d.blocks[0]).toEqual({ id: 'b1', name: 'Kopf', rect: { x: 0, y: 0, w: 1, h: 0.5 }, children: [] });
  });

  it('lässt den Entwurf unverändert, wenn der Elter fehlt oder die Id belegt ist', () => {
    const d = design(block('a'));
    expect(addBlock(d, block('neu'), 'gibtsnicht')).toEqual(d);
    expect(addBlock(d, block('a'))).toEqual(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const d = design(block('a'));
    const before = JSON.parse(JSON.stringify(d)) as Design;
    const next = addBlock(d, block('a1'), 'a');
    expect(d).toEqual(before);
    expect(next).not.toBe(d);
  });
});

describe('removeBlock', () => {
  const d = design(block('a', {}, { children: [block('a1'), block('a2')] }), block('b'));

  it('entfernt einen Block an der Wurzel', () => {
    expect(removeBlock(d, 'b').blocks.map((b) => b.id)).toEqual(['a']);
  });

  it('entfernt einen Block samt seiner Kinder', () => {
    const next = removeBlock(design(block('a', {}, { children: [block('a1', {}, { children: [block('a2')] })] })), 'a1');
    expect([...listBlocks(next)].map((b) => b.id)).toEqual(['a']);
  });

  it('lässt den Entwurf unverändert, wenn es die Id nicht gibt', () => {
    expect(removeBlock(d, 'weg')).toEqual(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const before = JSON.parse(JSON.stringify(d)) as Design;
    removeBlock(d, 'a1');
    expect(d).toEqual(before);
  });
});

describe('moveBlock', () => {
  const d = design(block('a', { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { children: [block('a1')] }));

  it('setzt die Geometrie neu und beschneidet sie', () => {
    expect(moveBlock(d, 'a', { x: 0.5, y: 0.5, w: 0.9, h: 0.1 }).blocks[0].rect).toEqual({
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.1,
    });
  });

  it('nimmt auch nur einzelne Werte entgegen', () => {
    expect(moveBlock(d, 'a', { x: 0.4 }).blocks[0].rect).toEqual({ x: 0.4, y: 0.1, w: 0.2, h: 0.2 });
  });

  it('erreicht auch ein Kind', () => {
    const next = moveBlock(d, 'a1', { w: 0.3 });
    expect(findBlock(next, 'a1')!.rect.w).toBe(0.3);
  });

  it('lässt den Entwurf unverändert, wenn es die Id nicht gibt', () => {
    expect(moveBlock(d, 'weg', { x: 0.5 })).toEqual(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const before = JSON.parse(JSON.stringify(d)) as Design;
    moveBlock(d, 'a', { x: 0.9 });
    expect(d).toEqual(before);
  });
});

// c0109: Anfassen — schieben und an den Kanten ziehen. Die Rechnung dazu ist
// rein und steht hier, nicht in der Zeichenfläche: Dieselben Funktionen zeigen
// den Zug an (das Gummiband) und führen ihn aus (der Entwurf).
describe('blockBounds', () => {
  it('umschließt einen Kasten ohne Kinder genau', () => {
    expect(blockBounds(block('a', { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }))).toEqual({
      x: 0.1, y: 0.2, w: 0.3, h: 0.4,
    });
  });

  it('nimmt Kinder mit hinein, die über ihren Elter hinausragen', () => {
    const kind = block('a1', { x: 0.25, y: 0.1, w: 0.2, h: 0.1 });
    const b = block('a', { x: 0.1, y: 0.2, w: 0.2, h: 0.2 }, { children: [kind] });
    // waagerecht 0.1…0.45, senkrecht 0.1…0.4
    expect(blockBounds(b)).toEqual({ x: 0.1, y: 0.1, w: 0.35, h: 0.3 });
  });

  it('reicht bis ins tiefste Kind', () => {
    const enkel = block('a2', { x: 0.5, y: 0.5, w: 0.1, h: 0.1 });
    const kind = block('a1', { x: 0.2, y: 0.2, w: 0.1, h: 0.1 }, { children: [enkel] });
    const b = block('a', { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, { children: [kind] });
    expect(blockBounds(b)).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });
});

describe('moveRect', () => {
  const r = { x: 0.2, y: 0.2, w: 0.3, h: 0.3 };

  it('verschiebt, ohne die Größe anzutasten', () => {
    expect(moveRect(r, 0.1, -0.1)).toEqual({ x: 0.3, y: 0.1, w: 0.3, h: 0.3 });
  });

  it('bleibt am Rand stehen, statt zu schrumpfen', () => {
    // Der Unterschied zu moveBlock/clampRect: Ein Zug nach rechts hört am Rand
    // auf — er macht den Kasten nicht schmaler.
    expect(moveRect(r, 5, 5)).toEqual({ x: 0.7, y: 0.7, w: 0.3, h: 0.3 });
    expect(moveRect(r, -5, -5)).toEqual({ x: 0, y: 0, w: 0.3, h: 0.3 });
  });

  it('hält die mitgereichte Fläche im Fenster, nicht nur den Kasten', () => {
    // Der Kasten kommt mit seinen Kindern: Was am weitesten ragt, gibt die Grenze.
    const bounds = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expect(moveRect(r, 5, 5, bounds)).toEqual({ x: 0.5, y: 0.5, w: 0.3, h: 0.3 });
  });

  it('rundet auf vier Stellen und übersteht Unfug', () => {
    expect(moveRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.100005, 0)).toEqual({
      x: 0.2, y: 0.1, w: 0.2, h: 0.2,
    });
    expect(moveRect(r, Number.NaN, Number.NaN)).toEqual(r);
  });
});

describe('resizeRect', () => {
  const r = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };

  it('zieht an der rechten unteren Ecke — die linke obere bleibt', () => {
    expect(resizeRect(r, 'se', 0.2, 0.1)).toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.5 });
  });

  it('zieht an der linken oberen Ecke — die rechte untere bleibt', () => {
    expect(resizeRect(r, 'nw', -0.1, -0.1)).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });

  it('lässt eine Kante die andere Richtung in Ruhe', () => {
    expect(resizeRect(r, 'n', 0.5, 0.1)).toEqual({ x: 0.2, y: 0.3, w: 0.4, h: 0.3 });
    expect(resizeRect(r, 'e', 0.1, 0.5)).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.4 });
    expect(resizeRect(r, 'w', 0.1, 0.5)).toEqual({ x: 0.3, y: 0.2, w: 0.3, h: 0.4 });
    expect(resizeRect(r, 's', 0.5, 0.1)).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.5 });
  });

  it('wird nicht kleiner als MIN_BLOCK_SIZE und klappt nicht um', () => {
    // Über die gegenüberliegende Kante hinaus: Der Kasten bleibt ein Kasten.
    expect(resizeRect(r, 'se', -1, -1)).toEqual({
      x: 0.2, y: 0.2, w: MIN_BLOCK_SIZE, h: MIN_BLOCK_SIZE,
    });
    expect(resizeRect(r, 'nw', 1, 1)).toEqual({
      x: 0.6 - MIN_BLOCK_SIZE, y: 0.6 - MIN_BLOCK_SIZE, w: MIN_BLOCK_SIZE, h: MIN_BLOCK_SIZE,
    });
  });

  it('geht nicht über den Rand des Fensters hinaus', () => {
    expect(resizeRect(r, 'se', 5, 5)).toEqual({ x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
    expect(resizeRect(r, 'nw', -5, -5)).toEqual({ x: 0, y: 0, w: 0.6, h: 0.6 });
  });

  it('kennt acht Griffe — vier Ecken und vier Kanten', () => {
    expect([...BLOCK_HANDLES].sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
  });
});

describe('placeBlock', () => {
  // Das Kind ragt rechts über seinen Elter hinaus (bis 0.35) — daran zeigt sich,
  // dass beim Schieben der ganze Zweig gemeint ist.
  const d = design(
    block('a', { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, {
      children: [block('a1', { x: 0.25, y: 0.15, w: 0.1, h: 0.1 })],
    }),
    block('b', { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }),
  );

  it('setzt einen Kasten an eine neue Stelle, ohne seine Größe zu ändern', () => {
    expect(placeBlock(d, 'b', 0.1, 0.2).blocks[1].rect).toEqual({ x: 0.1, y: 0.2, w: 0.2, h: 0.2 });
  });

  it('nimmt die Kinder mit — der Baum bleibt, wie er aussieht', () => {
    const next = placeBlock(d, 'a', 0.5, 0.1);
    expect(findBlock(next, 'a')!.rect).toEqual({ x: 0.5, y: 0.1, w: 0.2, h: 0.2 });
    // Das Kind lag 0.15 rechts vom Elter — und liegt es hinterher wieder.
    expect(findBlock(next, 'a1')!.rect).toEqual({ x: 0.65, y: 0.15, w: 0.1, h: 0.1 });
  });

  it('bleibt am Rand stehen, statt am Rand zu schrumpfen', () => {
    const next = placeBlock(d, 'b', 5, 5);
    expect(next.blocks[1].rect).toEqual({ x: 0.8, y: 0.8, w: 0.2, h: 0.2 });
  });

  it('lässt nichts ins Negative rutschen', () => {
    expect(placeBlock(d, 'b', -5, -5).blocks[1].rect).toEqual({ x: 0, y: 0, w: 0.2, h: 0.2 });
  });

  it('hält auch die Kinder im Fenster', () => {
    // Das Kind ragt 0.05 über seinen Elter hinaus (bis 0.35) — um so viel früher
    // ist Schluss.
    const next = placeBlock(d, 'a', 5, 0.1);
    expect(findBlock(next, 'a')!.rect.x).toBe(0.75);
    expect(findBlock(next, 'a1')!.rect.x).toBe(0.9);
  });

  it('erreicht auch ein Kind — dann zieht nur dessen Zweig um', () => {
    const next = placeBlock(d, 'a1', 0.5, 0.5);
    expect(findBlock(next, 'a1')!.rect).toEqual({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 });
    expect(findBlock(next, 'a')!.rect).toEqual(d.blocks[0].rect);
  });

  it('lässt den Entwurf unverändert, wenn es die Id nicht gibt', () => {
    expect(placeBlock(d, 'weg', 0.5, 0.5)).toEqual(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const before = JSON.parse(JSON.stringify(d)) as Design;
    placeBlock(d, 'a', 0.9, 0.9);
    expect(d).toEqual(before);
  });
});

describe('updateBlock', () => {
  const d = design(block('a', {}, { name: 'Kopf', instructions: 'alt', type: 'header' }));

  it('ändert Name, Anweisungen und Rolle', () => {
    const next = updateBlock(d, 'a', { name: ' Fuß ', instructions: 'neu', type: 'footer' });
    expect(next.blocks[0]).toMatchObject({ name: 'Fuß', instructions: 'neu', type: 'footer' });
  });

  it('nimmt leeren Text als „nicht gesetzt“', () => {
    const next = updateBlock(d, 'a', { instructions: '  ', type: '' });
    expect('instructions' in next.blocks[0]).toBe(false);
    expect('type' in next.blocks[0]).toBe(false);
  });

  it('lässt Nichtgenanntes stehen und Unbekanntes unverändert', () => {
    expect(updateBlock(d, 'a', {}).blocks[0]).toEqual(d.blocks[0]);
    expect(updateBlock(d, 'weg', { name: 'x' })).toEqual(d);
  });
});

describe('reparentBlock', () => {
  const d = design(
    block('a', {}, { children: [block('a1', {}, { children: [block('a11')] })] }),
    block('b'),
  );

  it('schiebt einen Block unter einen anderen', () => {
    const next = reparentBlock(d, 'b', 'a1');
    expect(next.blocks.map((x) => x.id)).toEqual(['a']);
    expect(findBlock(next, 'a1')!.children.map((x) => x.id)).toEqual(['a11', 'b']);
  });

  it('nimmt einen Block samt seiner Kinder mit', () => {
    const next = reparentBlock(d, 'a1', null);
    expect(next.blocks.map((x) => x.id)).toEqual(['a', 'b', 'a1']);
    expect(findBlock(next, 'a1')!.children.map((x) => x.id)).toEqual(['a11']);
    expect(findBlock(next, 'a')!.children).toEqual([]);
  });

  it('setzt einen Block an die gewünschte Stelle unter den Geschwistern', () => {
    const flat = design(block('a'), block('b'), block('c'));
    expect(reparentBlock(flat, 'c', null, 0).blocks.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(reparentBlock(flat, 'a', null, 99).blocks.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('verweigert einen Kreis: ein Block wird nicht sein eigener Nachfahre', () => {
    expect(reparentBlock(d, 'a', 'a11')).toEqual(d);
    expect(reparentBlock(d, 'a', 'a')).toEqual(d);
  });

  it('lässt den Entwurf unverändert, wenn Block oder Elter fehlen', () => {
    expect(reparentBlock(d, 'weg', 'a')).toEqual(d);
    expect(reparentBlock(d, 'b', 'gibtsnicht')).toEqual(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const before = JSON.parse(JSON.stringify(d)) as Design;
    reparentBlock(d, 'b', 'a');
    expect(d).toEqual(before);
  });
});

// c0110: Wohin ein Kasten GEHÖRT, sagt seine Lage — der unterste Kasten, der ihn
// ganz umschließt, ist sein Elter; umschließt ihn keiner, gehört er an die
// Wurzel. Eine Regel für beide Richtungen: hineinschieben verschachtelt,
// hinausschieben hängt um.
describe('containerIn / containerFor', () => {
  const d = design(
    block('a', { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, {
      children: [block('a1', { x: 0.2, y: 0.2, w: 0.2, h: 0.2 })],
    }),
    block('b', { x: 0.7, y: 0.7, w: 0.2, h: 0.2 }),
  );

  it('nimmt den untersten Kasten, der die Fläche ganz umschließt', () => {
    expect(containerFor(d, { x: 0.22, y: 0.22, w: 0.05, h: 0.05 })!.id).toBe('a1');
    expect(containerFor(d, { x: 0.12, y: 0.12, w: 0.05, h: 0.05 })!.id).toBe('a');
    expect(containerFor(d, { x: 0.75, y: 0.75, w: 0.05, h: 0.05 })!.id).toBe('b');
  });

  it('lässt eine Fläche an der Wurzel, die kein Kasten ganz umschließt', () => {
    // Ragt sie auch nur an einer Kante heraus, liegt sie nicht drinnen.
    expect(containerFor(d, { x: 0.05, y: 0.2, w: 0.1, h: 0.1 })).toBeNull();
    expect(containerFor(d, { x: 0.2, y: 0.2, w: 0.5, h: 0.1 })).toBeNull();
    expect(containerFor(d, { x: 0, y: 0, w: 1, h: 1 })).toBeNull();
    expect(containerIn([], { x: 0.2, y: 0.2, w: 0.1, h: 0.1 })).toBeNull();
  });

  it('zählt die Kante als drinnen und übersteht den Rechenstaub', () => {
    // Deckungsgleich heißt drinnen — sonst ließe sich ein Kasten nicht in einen
    // gleich großen zeichnen.
    expect(containerFor(d, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 })!.id).toBe('a');
    // 0.2 + 0.4 rechnet das Fließkomma als 0.6000000000000001, die Kante von
    // 'a' liegt bei 0.6 — ein Millionstel Nachsicht macht daraus kein Draußen.
    expect(0.2 + 0.4).toBeGreaterThan(0.1 + 0.5);
    expect(containerFor(d, { x: 0.2, y: 0.2, w: 0.4, h: 0.4 })!.id).toBe('a');
  });

  it('übersieht einen Kasten nicht, dessen Elter die Fläche nicht umschließt', () => {
    // Ein Kind darf über seinen Elter hinausragen (c0104): Die Suche darf einen
    // Zweig darum nicht abschneiden, nur weil der Elter nicht passt.
    const ragt = design(
      block('p', { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, {
        children: [block('k', { x: 0.5, y: 0.5, w: 0.4, h: 0.4 })],
      }),
    );
    expect(containerFor(ragt, { x: 0.6, y: 0.6, w: 0.1, h: 0.1 })!.id).toBe('k');
  });

  it('überspringt einen Kasten samt seinem Zweig (kein Kreis)', () => {
    // Beim Umhängen darf weder er selbst noch sein Nachfahre sein Elter werden.
    expect(containerFor(d, findBlock(d, 'a')!.rect, 'a')).toBeNull();
    expect(containerFor(d, { x: 0.25, y: 0.25, w: 0.05, h: 0.05 }, 'a1')!.id).toBe('a');
  });

  it('nimmt bei gleicher Tiefe den zuletzt gezeichneten — er liegt oben', () => {
    const gleich = design(
      block('unten', { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }),
      block('oben', { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }),
    );
    expect(containerFor(gleich, { x: 0.2, y: 0.2, w: 0.1, h: 0.1 })!.id).toBe('oben');
  });

  it('sucht auch in einer blanken Kästenliste (ohne Entwurf drumherum)', () => {
    // Die Zeichenfläche bekommt nur die Kästen gereicht, zeigt aber schon
    // während des Zugs, wo der Kasten landet.
    expect(containerIn(d.blocks, { x: 0.22, y: 0.22, w: 0.05, h: 0.05 })!.id).toBe('a1');
  });
});

describe('parentOf', () => {
  const d = design(block('a', {}, { children: [block('a1')] }), block('b'));

  it('nennt den Elter eines Kastens — an der Wurzel keinen', () => {
    expect(parentOf(d, 'a1')!.id).toBe('a');
    expect(parentOf(d, 'a')).toBeNull();
    expect(parentOf(d, 'weg')).toBeNull();
  });
});

describe('canNestUnder', () => {
  /** Eine Kette von `n` Kästen, jeder ganz im vorigen. */
  function chain(n: number): Design {
    let inner: Block | null = null;
    for (let i = n - 1; i >= 0; i--) {
      inner = {
        id: `t${i}`,
        name: `t${i}`,
        rect: { x: i * 0.01, y: i * 0.01, w: 1 - i * 0.02, h: 1 - i * 0.02 },
        children: inner ? [inner] : [],
      };
    }
    return design(inner!);
  }

  it('lässt an der Wurzel und in flachen Bäumen alles zu', () => {
    const d = design(block('a', {}, { children: [block('a1')] }));
    expect(canNestUnder(d, null)).toBe(true);
    expect(canNestUnder(d, 'a1')).toBe(true);
    expect(canNestUnder(d, 'a', 3)).toBe(true);
  });

  it('sagt Nein, wo der Zweig beim Speichern wegfiele', () => {
    // normalizeDesign kappt bei MAX_DESIGN_DEPTH — was tiefer läge, wäre beim
    // nächsten Schreiben still verloren.
    const tief = chain(MAX_DESIGN_DEPTH);
    expect(canNestUnder(tief, `t${MAX_DESIGN_DEPTH - 2}`)).toBe(true);
    expect(canNestUnder(tief, `t${MAX_DESIGN_DEPTH - 1}`)).toBe(false);
    // Ein Zweig braucht Platz für seine eigenen Ebenen.
    expect(canNestUnder(tief, `t${MAX_DESIGN_DEPTH - 3}`, 1)).toBe(true);
    expect(canNestUnder(tief, `t${MAX_DESIGN_DEPTH - 3}`, 2)).toBe(false);
  });

  it('kennt einen Kasten nicht, den es nicht gibt', () => {
    expect(canNestUnder(design(block('a')), 'weg')).toBe(false);
  });

  it('lässt eine ganze Kette bis MAX_DESIGN_DEPTH unangetastet durch', () => {
    // Belegt, dass die Grenze richtig gezogen ist: Diese Kette übersteht das
    // Zurechtrücken vollständig.
    const tief = chain(MAX_DESIGN_DEPTH);
    expect(listBlocks(normalizeDesign(tief))).toHaveLength(MAX_DESIGN_DEPTH);
  });
});

describe('nestBlock', () => {
  // Der Kasten 'b' liegt in 'a', hängt aber (noch) an der Wurzel.
  const d = design(
    block('a', { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }),
    block('b', { x: 0.2, y: 0.2, w: 0.1, h: 0.1 }),
  );

  it('hängt einen Kasten unter den, in dem er liegt', () => {
    const next = nestBlock(d, 'b');
    expect(next.blocks.map((x) => x.id)).toEqual(['a']);
    expect(findBlock(next, 'a')!.children.map((x) => x.id)).toEqual(['b']);
    // Verschoben wird dabei nichts: Die Anteile sind absolut (c0104).
    expect(findBlock(next, 'b')!.rect).toEqual(d.blocks[1].rect);
  });

  it('hebt einen Kasten an die Wurzel, der aus seinem Elter heraus liegt', () => {
    const drin = design(
      block('a', { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, {
        children: [block('b', { x: 0.7, y: 0.7, w: 0.1, h: 0.1 })],
      }),
    );
    const next = nestBlock(drin, 'b');
    expect(next.blocks.map((x) => x.id)).toEqual(['a', 'b']);
    expect(findBlock(next, 'a')!.children).toEqual([]);
  });

  it('hängt ihn unter den untersten Kasten, in dem er liegt', () => {
    const zwei = design(
      block('a', { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, {
        children: [block('a1', { x: 0.2, y: 0.2, w: 0.4, h: 0.4 })],
      }),
      block('b', { x: 0.25, y: 0.25, w: 0.1, h: 0.1 }),
    );
    expect(findBlock(nestBlock(zwei, 'b'), 'a1')!.children.map((x) => x.id)).toEqual(['b']);
  });

  it('nimmt die Kinder des umgehängten Kastens mit', () => {
    const mitKind = design(
      block('a', { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }),
      block('b', { x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, {
        children: [block('b1', { x: 0.25, y: 0.25, w: 0.05, h: 0.05 })],
      }),
    );
    const next = nestBlock(mitKind, 'b');
    expect(findBlock(next, 'a')!.children.map((x) => x.id)).toEqual(['b']);
    expect(findBlock(next, 'b')!.children.map((x) => x.id)).toEqual(['b1']);
  });

  it('lässt alles, wie es ist, wenn er schon am richtigen Elter hängt', () => {
    const passt = design(
      block('a', { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, {
        children: [block('b', { x: 0.2, y: 0.2, w: 0.1, h: 0.1 })],
      }),
    );
    expect(nestBlock(passt, 'b')).toBe(passt);
    // Und ein Wurzelkasten, den keiner umschließt, bleibt an der Wurzel.
    expect(nestBlock(passt, 'a')).toBe(passt);
  });

  it('macht einen Kasten nicht zu seinem eigenen Nachfahren', () => {
    // Ein Elter, der (nach einem Zug) ganz in seinem Kind liegt: Er bleibt, wo
    // er ist — ein Kreis entsteht nie.
    const eng = design(
      block('a', { x: 0.2, y: 0.2, w: 0.1, h: 0.1 }, {
        children: [block('a1', { x: 0.1, y: 0.1, w: 0.5, h: 0.5 })],
      }),
    );
    expect(nestBlock(eng, 'a')).toBe(eng);
    expect(findBlock(nestBlock(eng, 'a'), 'a1')!.children).toEqual([]);
  });

  it('hängt nicht so tief, dass der Kasten beim Speichern verlorenginge', () => {
    let inner: Block | null = null;
    for (let i = MAX_DESIGN_DEPTH - 1; i >= 0; i--) {
      inner = {
        id: `t${i}`,
        name: `t${i}`,
        rect: { x: i * 0.01, y: i * 0.01, w: 1 - i * 0.02, h: 1 - i * 0.02 },
        children: inner ? [inner] : [],
      };
    }
    const tief = design(inner!, block('b', { x: 0.3, y: 0.3, w: 0.05, h: 0.05 }));

    // 'b' liegt im tiefsten Kasten der Kette — dort wäre es eine Ebene zu tief.
    expect(nestBlock(tief, 'b')).toBe(tief);
  });

  it('lässt den Entwurf unverändert, wenn es die Id nicht gibt', () => {
    expect(nestBlock(d, 'weg')).toBe(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const before = JSON.parse(JSON.stringify(d)) as Design;
    const next = nestBlock(d, 'b');
    expect(d).toEqual(before);
    expect(next).not.toBe(d);
  });
});

describe('deleteBlock', () => {
  const d = design(
    block('a', { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, {
      children: [
        block('a1', { x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, {
          children: [block('a11', { x: 0.25, y: 0.25, w: 0.05, h: 0.05 })],
        }),
        block('a2', { x: 0.45, y: 0.2, w: 0.1, h: 0.1 }),
      ],
    }),
    block('b', { x: 0.7, y: 0.7, w: 0.2, h: 0.2 }),
  );

  it('nimmt einen Kasten weg', () => {
    expect(deleteBlock(d, 'b').blocks.map((x) => x.id)).toEqual(['a']);
  });

  it('hebt die Kinder an die Stelle des gelöschten Kastens', () => {
    // Gelöscht wird der Rahmen, nicht der Inhalt: Ein Griff daneben soll nicht
    // einen halben Entwurf mitnehmen.
    const next = deleteBlock(d, 'a1');
    expect(findBlock(next, 'a')!.children.map((x) => x.id)).toEqual(['a11', 'a2']);
    expect(findBlock(next, 'a11')!.children).toEqual([]);
    expect(findBlock(next, 'a1')).toBeNull();
  });

  it('hebt die Kinder eines Wurzelkastens an die Wurzel', () => {
    expect(deleteBlock(d, 'a').blocks.map((x) => x.id)).toEqual(['a1', 'a2', 'b']);
  });

  it('lässt die Geometrie, wie sie ist', () => {
    // Die Anteile sind absolut (c0104) — wer hochrückt, bleibt, wo er liegt.
    const next = deleteBlock(d, 'a1');
    expect(findBlock(next, 'a11')!.rect).toEqual({ x: 0.25, y: 0.25, w: 0.05, h: 0.05 });
  });

  it('macht aus einem gelöschten Blatt nichts weiter', () => {
    expect(listBlocks(deleteBlock(d, 'a11')).map((x) => x.id)).toEqual(['a', 'a1', 'a2', 'b']);
  });

  it('lässt den Entwurf unverändert, wenn es die Id nicht gibt', () => {
    expect(deleteBlock(d, 'weg')).toBe(d);
    expect(deleteBlock(d, '')).toBe(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const before = JSON.parse(JSON.stringify(d)) as Design;
    const next = deleteBlock(d, 'a1');
    expect(d).toEqual(before);
    expect(next).not.toBe(d);
  });
});
