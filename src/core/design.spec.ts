import { describe, it, expect } from 'vitest';
import {
  addBlock,
  BLOCK_ROLES,
  DESIGN_FILE,
  DESIGN_VERSION,
  MAX_DESIGN_DEPTH,
  MAX_TYPE_LENGTH,
  MIN_BLOCK_SIZE,
  emptyDesign,
  findBlock,
  findBlockIn,
  listBlocks,
  makeBlockId,
  moveBlock,
  normalizeDesign,
  removeBlock,
  reparentBlock,
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
