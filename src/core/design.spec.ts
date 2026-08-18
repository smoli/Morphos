import { describe, it, expect } from 'vitest';
import {
  addBlock,
  addView,
  BLOCK_HANDLES,
  BLOCK_ROLES,
  DESIGN_FILE,
  DESIGN_VERSION,
  MAX_DESIGN_DEPTH,
  MAX_TYPE_LENGTH,
  MAX_VIEWS,
  MAX_VIEW_TITLE_LENGTH,
  MIN_BLOCK_SIZE,
  blockBounds,
  canNestUnder,
  containerFor,
  containerIn,
  deleteBlock,
  emptyDesign,
  emptyView,
  findBlock,
  findView,
  hasContent,
  inView,
  makeViewId,
  removeView,
  updateView,
  viewTitleFor,
  findBlockIn,
  listBlocks,
  makeBlockId,
  moveBlock,
  moveRect,
  nestBlock,
  normalizeDesign,
  parentOf,
  pathIn,
  placeBlock,
  removeBlock,
  reparentBlock,
  resizeRect,
  updateBlock,
  walkBlocks,
  type Block,
  type Design,
  type View,
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

/**
 * Eine Ansicht aus den übergebenen Blöcken (bereits in Ordnung). Die Baum-Helfer
 * arbeiten seit c0113 an einer Ansicht, nicht am ganzen Entwurf.
 */
function view(...blocks: Block[]): View {
  return { id: 'v1', title: 'Ansicht 1', blocks };
}

/** Ein Entwurf aus den übergebenen Ansichten (bereits in Ordnung). */
function design(...views: View[]): Design {
  return { version: DESIGN_VERSION, views };
}

describe('emptyDesign', () => {
  it('liefert einen leeren Entwurf in der aktuellen Fassung', () => {
    // Leer heißt: noch keine Ansicht. Die erste entsteht mit dem ersten Kasten
    // (stores/app: addDesignBlock) — ein Entwurf verlangt nichts im Voraus.
    expect(emptyDesign()).toEqual({ version: DESIGN_VERSION, views: [] });
  });

  it('gibt bei jedem Aufruf einen eigenen Entwurf zurück', () => {
    const a = emptyDesign();
    a.views.push(view(block('b1')));
    expect(emptyDesign().views).toEqual([]);
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
  /** Die Kästen der ersten Ansicht — dort landet ein gelesener Baum. */
  function blocksOf(d: Design): Block[] {
    return d.views[0]?.blocks ?? [];
  }

  /** Ein roher Entwurf mit EINER Ansicht, wie er von der Platte käme. */
  function raw(blocks: unknown[], rest: Record<string, unknown> = {}): unknown {
    return { ...rest, views: [{ id: 'v1', title: 'Ansicht 1', blocks }] };
  }

  it('macht aus allem Unbrauchbaren einen leeren Entwurf', () => {
    for (const bad of [null, undefined, 0, 'kaputt', [], { views: 'nein' }, { blocks: 'nein' }]) {
      expect(normalizeDesign(bad)).toEqual(emptyDesign());
    }
  });

  it('behält eine gültige Fassungsnummer und ersetzt eine unbrauchbare', () => {
    expect(normalizeDesign({ version: 7, views: [] }).version).toBe(7);
    expect(normalizeDesign({ version: 0, views: [] }).version).toBe(DESIGN_VERSION);
    expect(normalizeDesign({ version: 'zwei', views: [] }).version).toBe(DESIGN_VERSION);
    expect(normalizeDesign({ version: 1.5, views: [] }).version).toBe(DESIGN_VERSION);
  });

  it('ergänzt fehlende Felder eines Blocks', () => {
    const [b] = blocksOf(normalizeDesign(raw([{ name: 'Kopf' }])));
    expect(b.name).toBe('Kopf');
    expect(b.id).toMatch(/^b/);
    expect(b.children).toEqual([]);
    expect(b.rect).toEqual({ x: 0, y: 0, w: MIN_BLOCK_SIZE, h: MIN_BLOCK_SIZE });
    expect('instructions' in b).toBe(false);
    expect('type' in b).toBe(false);
  });

  it('wirft weg, was gar kein Block ist', () => {
    const d = normalizeDesign(raw([null, 'x', 42, { name: 'gut' }, []]));
    expect(blocksOf(d).map((b) => b.name)).toEqual(['gut']);
  });

  it('setzt eine schadhafte Geometrie auf das begehbare Feld zurück', () => {
    const bs = blocksOf(normalizeDesign(raw([
      { name: 'a', rect: { x: -3, y: 2, w: 5, h: 0 } },
      { name: 'b', rect: { x: 'links', y: NaN, w: Infinity, h: -1 } },
      { name: 'c', rect: { x: 0.8, y: 0.9, w: 0.5, h: 0.5 } },
    ])));
    expect(bs[0].rect).toEqual({ x: 0, y: 1 - MIN_BLOCK_SIZE, w: 1, h: MIN_BLOCK_SIZE });
    expect(bs[1].rect).toEqual({ x: 0, y: 0, w: MIN_BLOCK_SIZE, h: MIN_BLOCK_SIZE });
    // Ein Block ragt nie über den Rand hinaus: die Breite wird beschnitten.
    expect(bs[2].rect).toEqual({ x: 0.8, y: 0.9, w: 0.2, h: 0.1 });
  });

  it('rundet die Anteile, damit kein Fließkommastaub in der Datei landet', () => {
    const [b] = blocksOf(normalizeDesign(raw([
      { name: 'a', rect: { x: 0.1234567, y: 1 / 3, w: 0.30000000000000004, h: 0.2 } },
    ])));
    expect(b.rect).toEqual({ x: 0.1235, y: 0.3333, w: 0.3, h: 0.2 });
  });

  it('nimmt Text nur als Text und beschneidet ihn auf ein vernünftiges Maß', () => {
    const [b] = blocksOf(normalizeDesign(raw([
      { name: '  Kopfzeile  ', instructions: ' x '.repeat(4000), type: 42, children: [] },
    ])));
    expect(b.name).toBe('Kopfzeile');
    expect(b.instructions!.length).toBeLessThanOrEqual(4000);
    expect('type' in b).toBe(false);

    const [c] = blocksOf(normalizeDesign(raw([{ name: 1, instructions: '   ', type: ' liste ' }])));
    expect(c.name).toBe('');
    expect('instructions' in c).toBe(false);
    expect(c.type).toBe('liste');
  });

  it('vergibt doppelte Ids neu, damit jeder Block eindeutig bleibt', () => {
    const d = normalizeDesign(raw([
      { id: 'gleich', name: 'a' },
      { id: 'gleich', name: 'b', children: [{ id: 'gleich', name: 'c' }] },
    ]));
    const ids = [...listBlocks(d.views[0])].map((b) => b.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('gleich');
  });

  it('hält die Ids auch über die Ansichten hinweg auseinander', () => {
    // Sonst fände ein Zug in der einen Ansicht den Kasten der anderen.
    const d = normalizeDesign({
      views: [{ id: 'v1', blocks: [{ id: 'gleich', name: 'a' }] }, { id: 'v2', blocks: [{ id: 'gleich', name: 'b' }] }],
    });
    expect(d.views[0].blocks[0].id).toBe('gleich');
    expect(d.views[1].blocks[0].id).not.toBe('gleich');
  });

  it('ersetzt unbrauchbare Ids', () => {
    const d = normalizeDesign(raw([{ id: 42, name: 'a' }, { id: '', name: 'b' }]));
    for (const b of blocksOf(d)) expect(b.id).toMatch(/^b/);
  });

  it('kappt einen Baum, der zu tief geschachtelt ist', () => {
    let deep: unknown = { name: 'blatt' };
    for (let i = 0; i < MAX_DESIGN_DEPTH + 5; i++) deep = { name: `n${i}`, children: [deep] };
    const d = normalizeDesign(raw([deep]));

    let depth = 0;
    let node = blocksOf(d)[0];
    while (node.children.length) {
      node = node.children[0];
      depth++;
    }
    expect(depth).toBe(MAX_DESIGN_DEPTH - 1);
  });

  it('lässt einen heilen Entwurf unverändert (und rührt das Original nicht an)', () => {
    const d = design(view(block('b1', {}, { instructions: 'kurz', type: 'liste', children: [block('b2')] })));
    const copy = JSON.parse(JSON.stringify(d)) as Design;
    expect(normalizeDesign(d)).toEqual(d);
    expect(d).toEqual(copy);
  });

  // c0113: Die Ansichten selbst — Titel, Beschreibung, Id, Obergrenze.
  it('ergänzt die fehlenden Felder einer Ansicht', () => {
    const d = normalizeDesign({ views: [{}, { title: '  Liste  ', description: ' zeigt alles ' }] });
    expect(d.views[0].id).toMatch(/^v/);
    expect(d.views[0].title).toBe(viewTitleFor(0));
    expect(d.views[0].blocks).toEqual([]);
    expect('description' in d.views[0]).toBe(false);
    expect(d.views[1]).toMatchObject({ title: 'Liste', description: 'zeigt alles' });
  });

  it('wirft weg, was gar keine Ansicht ist, und kappt bei MAX_VIEWS', () => {
    const d = normalizeDesign({ views: [null, 'x', 42, { title: 'gut' }, []] });
    expect(d.views.map((v) => v.title)).toEqual(['gut']);

    const viele = normalizeDesign({ views: Array.from({ length: MAX_VIEWS + 5 }, () => ({})) });
    expect(viele.views).toHaveLength(MAX_VIEWS);
  });

  it('vergibt doppelte Ansicht-Ids neu und beschneidet zu lange Titel', () => {
    const d = normalizeDesign({
      views: [{ id: 'gleich' }, { id: 'gleich' }, { title: 'x'.repeat(MAX_VIEW_TITLE_LENGTH + 50) }],
    });
    expect(d.views[0].id).toBe('gleich');
    expect(d.views[1].id).not.toBe('gleich');
    expect(d.views[2].title.length).toBe(MAX_VIEW_TITLE_LENGTH);
  });

  it('macht aus einem Entwurf ohne Ansichten (alte Datei) eine Ansicht', () => {
    // Vor c0113 hingen die Kästen unmittelbar am Entwurf. Eine solche Datei
    // liest sich weiter — als die eine Ansicht, die sie war.
    const d = normalizeDesign({ version: 1, blocks: [{ id: 'b1', name: 'Kopf' }, { name: 'Inhalt' }] });
    expect(d.views).toHaveLength(1);
    expect(d.views[0].title).toBe(viewTitleFor(0));
    expect(d.views[0].blocks.map((b) => b.name)).toEqual(['Kopf', 'Inhalt']);
    expect(d.views[0].blocks[0].id).toBe('b1');
  });

  it('nimmt die Ansichten, wo es beides gibt', () => {
    const d = normalizeDesign({ views: [{ title: 'neu', blocks: [{ name: 'a' }] }], blocks: [{ name: 'alt' }] });
    expect(d.views).toHaveLength(1);
    expect(d.views[0].blocks.map((b) => b.name)).toEqual(['a']);
  });
});

// c0113: Ein Entwurf hat Ansichten — jede mit Titel, Beschreibung und eigenem
// Baum. Die Ebene darüber: Was mit Ansichten zu tun hat, rührt keine Kästen an.
describe('Ansichten', () => {
  const zwei = design(
    { id: 'v1', title: 'Liste', blocks: [block('a')] },
    { id: 'v2', title: 'Detail', description: 'ein Eintrag', blocks: [] },
  );

  it('macht eine leere Ansicht mit Id und Titel', () => {
    const v = emptyView();
    expect(v.id).toMatch(/^v[A-Za-z0-9]+$/);
    expect(v.title).toBe('Ansicht 1');
    expect(v.blocks).toEqual([]);
    expect(emptyView('Anmeldung').title).toBe('Anmeldung');
    expect(emptyView().id).not.toBe(v.id);
  });

  it('erzeugt eine brauchbare, jedes Mal andere Ansicht-Id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeViewId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^v[A-Za-z0-9]+$/);
  });

  it('zählt die Titel von eins an', () => {
    expect(viewTitleFor(0)).toBe('Ansicht 1');
    expect(viewTitleFor(2)).toBe('Ansicht 3');
  });

  it('findet eine Ansicht über ihre Id', () => {
    expect(findView(zwei, 'v2')!.title).toBe('Detail');
    expect(findView(zwei, 'weg')).toBeNull();
    expect(findView(zwei, null)).toBeNull();
    expect(findView(emptyDesign(), 'v1')).toBeNull();
  });

  it('sagt, ob der Entwurf überhaupt etwas sagt', () => {
    expect(hasContent(emptyDesign())).toBe(false);
    // Eine frisch angelegte, leere Ansicht ist ein Platzhalter, kein Entwurf.
    expect(hasContent(design(emptyView()))).toBe(false);
    expect(hasContent(zwei)).toBe(true);
    expect(hasContent(design({ id: 'v1', title: 'Liste', description: 'zeigt alles', blocks: [] }))).toBe(true);
  });

  describe('addView', () => {
    it('hängt eine Ansicht an und zählt ihren Titel weiter', () => {
      const d = addView(addView(emptyDesign()), undefined);
      expect(d.views.map((v) => v.title)).toEqual(['Ansicht 1', 'Ansicht 2']);
      expect(d.views[0].id).not.toBe(d.views[1].id);
    });

    it('nimmt eine mitgebrachte Ansicht und bringt sie in Ordnung', () => {
      const d = addView(emptyDesign(), { id: 'v9', title: '  Anmeldung  ', blocks: [] });
      expect(d.views[0]).toEqual({ id: 'v9', title: 'Anmeldung', blocks: [] });
    });

    it('lässt den Entwurf unverändert bei belegter Id und an der Obergrenze', () => {
      expect(addView(zwei, { id: 'v1', title: 'noch mal', blocks: [] })).toEqual(zwei);
      let voll = emptyDesign();
      for (let i = 0; i < MAX_VIEWS; i++) voll = addView(voll);
      expect(voll.views).toHaveLength(MAX_VIEWS);
      expect(addView(voll)).toBe(voll);
    });

    it('verändert den übergebenen Entwurf nicht', () => {
      const before = JSON.parse(JSON.stringify(zwei)) as Design;
      addView(zwei);
      expect(zwei).toEqual(before);
    });
  });

  describe('removeView', () => {
    it('nimmt eine Ansicht samt ihren Kästen weg', () => {
      const d = removeView(zwei, 'v1');
      expect(d.views.map((v) => v.id)).toEqual(['v2']);
    });

    it('lässt den Entwurf unverändert, wenn es die Ansicht nicht gibt', () => {
      expect(removeView(zwei, 'weg')).toBe(zwei);
    });

    it('darf auch die letzte nehmen — dann hat der Entwurf eben keine mehr', () => {
      expect(removeView(removeView(zwei, 'v1'), 'v2').views).toEqual([]);
    });
  });

  describe('updateView', () => {
    it('ändert Titel und Beschreibung', () => {
      const d = updateView(zwei, 'v1', { title: '  Übersicht  ', description: ' alles auf einen Blick ' });
      expect(d.views[0]).toMatchObject({ title: 'Übersicht', description: 'alles auf einen Blick' });
      // Die andere Ansicht bleibt, wie sie ist.
      expect(d.views[1]).toEqual(zwei.views[1]);
    });

    it('nimmt eine leere Beschreibung als „nicht gesetzt“', () => {
      expect('description' in updateView(zwei, 'v2', { description: '  ' }).views[1]).toBe(false);
    });

    it('behält den Titel, wenn der neue leer wäre', () => {
      // Eine Ansicht ohne Titel wäre im Prompt eine Überschrift ohne Wort.
      expect(updateView(zwei, 'v1', { title: '   ' }).views[0].title).toBe('Liste');
    });

    it('lässt Nichtgenanntes stehen und Unbekanntes unverändert', () => {
      expect(updateView(zwei, 'v1', {}).views[0]).toEqual(zwei.views[0]);
      expect(updateView(zwei, 'weg', { title: 'x' })).toBe(zwei);
    });

    it('verändert den übergebenen Entwurf nicht', () => {
      const before = JSON.parse(JSON.stringify(zwei)) as Design;
      updateView(zwei, 'v1', { title: 'anders' });
      expect(zwei).toEqual(before);
    });
  });

  describe('inView', () => {
    it('setzt eine Änderung an einer Ansicht in den Entwurf zurück', () => {
      const d = inView(zwei, 'v2', (v) => addBlock(v, block('neu')));
      expect(d.views[1].blocks.map((b) => b.id)).toEqual(['neu']);
      // Die andere Ansicht ist unberührt — dieselben Kästen, nicht nur gleiche.
      expect(d.views[0]).toBe(zwei.views[0]);
    });

    it('lässt den Entwurf unverändert bei unbekannter Ansicht', () => {
      expect(inView(zwei, 'weg', (v) => addBlock(v, block('neu')))).toBe(zwei);
      expect(inView(zwei, null, (v) => addBlock(v, block('neu')))).toBe(zwei);
    });

    it('gibt denselben Entwurf zurück, wenn sich nichts ändert', () => {
      // Damit ein Zug, der nichts bewirkt, die Datei nicht neu schreibt.
      expect(inView(zwei, 'v1', (v) => v)).toBe(zwei);
      expect(inView(zwei, 'v1', (v) => removeBlock(v, 'weg'))).toBe(zwei);
    });

    it('verändert den übergebenen Entwurf nicht', () => {
      const before = JSON.parse(JSON.stringify(zwei)) as Design;
      inView(zwei, 'v1', (v) => removeBlock(v, 'a'));
      expect(zwei).toEqual(before);
    });
  });
});

describe('walkBlocks / listBlocks / findBlock', () => {
  const d = view(
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
    expect(updateBlock(view(block('a')), 'a', { type: 'ganz was anderes' }).blocks[0].type)
      .toBe('ganz was anderes');
  });
});

describe('addBlock', () => {
  it('hängt einen Block an die Wurzel', () => {
    const d = addBlock(emptyView(), block('b1'));
    expect(d.blocks.map((b) => b.id)).toEqual(['b1']);
  });

  it('hängt einen Block unter seinen Elter', () => {
    const d = addBlock(view(block('a')), block('a1'), 'a');
    expect(findBlock(d, 'a')!.children.map((b) => b.id)).toEqual(['a1']);
    expect(d.blocks).toHaveLength(1);
  });

  it('bringt den neuen Block in Ordnung', () => {
    const d = addBlock(emptyView(), { id: 'b1', name: ' Kopf ', rect: { x: -1, y: 0, w: 5, h: 0.5 } } as Block);
    expect(d.blocks[0]).toEqual({ id: 'b1', name: 'Kopf', rect: { x: 0, y: 0, w: 1, h: 0.5 }, children: [] });
  });

  it('lässt den Entwurf unverändert, wenn der Elter fehlt oder die Id belegt ist', () => {
    const d = view(block('a'));
    expect(addBlock(d, block('neu'), 'gibtsnicht')).toEqual(d);
    expect(addBlock(d, block('a'))).toEqual(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const d = view(block('a'));
    const before = JSON.parse(JSON.stringify(d)) as View;
    const next = addBlock(d, block('a1'), 'a');
    expect(d).toEqual(before);
    expect(next).not.toBe(d);
  });
});

describe('removeBlock', () => {
  const d = view(block('a', {}, { children: [block('a1'), block('a2')] }), block('b'));

  it('entfernt einen Block an der Wurzel', () => {
    expect(removeBlock(d, 'b').blocks.map((b) => b.id)).toEqual(['a']);
  });

  it('entfernt einen Block samt seiner Kinder', () => {
    const next = removeBlock(view(block('a', {}, { children: [block('a1', {}, { children: [block('a2')] })] })), 'a1');
    expect([...listBlocks(next)].map((b) => b.id)).toEqual(['a']);
  });

  it('lässt den Entwurf unverändert, wenn es die Id nicht gibt', () => {
    expect(removeBlock(d, 'weg')).toEqual(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const before = JSON.parse(JSON.stringify(d)) as View;
    removeBlock(d, 'a1');
    expect(d).toEqual(before);
  });
});

describe('moveBlock', () => {
  const d = view(block('a', { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { children: [block('a1')] }));

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
    const before = JSON.parse(JSON.stringify(d)) as View;
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
  const d = view(
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
    const before = JSON.parse(JSON.stringify(d)) as View;
    placeBlock(d, 'a', 0.9, 0.9);
    expect(d).toEqual(before);
  });
});

describe('updateBlock', () => {
  const d = view(block('a', {}, { name: 'Kopf', instructions: 'alt', type: 'header' }));

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
  const d = view(
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
    const flat = view(block('a'), block('b'), block('c'));
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
    const before = JSON.parse(JSON.stringify(d)) as View;
    reparentBlock(d, 'b', 'a');
    expect(d).toEqual(before);
  });
});

// c0110: Wohin ein Kasten GEHÖRT, sagt seine Lage — der unterste Kasten, der ihn
// ganz umschließt, ist sein Elter; umschließt ihn keiner, gehört er an die
// Wurzel. Eine Regel für beide Richtungen: hineinschieben verschachtelt,
// hinausschieben hängt um.
describe('containerIn / containerFor', () => {
  const d = view(
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
    const ragt = view(
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
    const gleich = view(
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
  const d = view(block('a', {}, { children: [block('a1')] }), block('b'));

  it('nennt den Elter eines Kastens — an der Wurzel keinen', () => {
    expect(parentOf(d, 'a1')!.id).toBe('a');
    expect(parentOf(d, 'a')).toBeNull();
    expect(parentOf(d, 'weg')).toBeNull();
  });
});

describe('pathIn', () => {
  const d = view(
    block('a', {}, { children: [block('a1', {}, { children: [block('a2')] })] }),
    block('b'),
  );

  it('nennt den Weg zu einem Kasten — von der Wurzel bis zu ihm selbst', () => {
    expect(pathIn(d.blocks, 'a2').map((b) => b.id)).toEqual(['a', 'a1', 'a2']);
    expect(pathIn(d.blocks, 'a1').map((b) => b.id)).toEqual(['a', 'a1']);
  });

  it('gibt für einen Wurzelkasten nur ihn selbst', () => {
    expect(pathIn(d.blocks, 'b').map((b) => b.id)).toEqual(['b']);
  });

  it('gibt keinen halben Weg zu einem Kasten, den es nicht gibt', () => {
    expect(pathIn(d.blocks, 'weg')).toEqual([]);
    expect(pathIn(d.blocks, '')).toEqual([]);
    expect(pathIn([], 'a')).toEqual([]);
  });

  it('reicht die Kästen des Entwurfs durch, nicht Abzüge von ihnen', () => {
    // Das Feld zeigt damit den Namen, der gerade in der Datei steht.
    expect(pathIn(d.blocks, 'a2')[1]).toBe(d.blocks[0].children[0]);
  });
});

describe('canNestUnder', () => {
  /** Eine Kette von `n` Kästen, jeder ganz im vorigen. */
  function chain(n: number): View {
    let inner: Block | null = null;
    for (let i = n - 1; i >= 0; i--) {
      inner = {
        id: `t${i}`,
        name: `t${i}`,
        rect: { x: i * 0.01, y: i * 0.01, w: 1 - i * 0.02, h: 1 - i * 0.02 },
        children: inner ? [inner] : [],
      };
    }
    return view(inner!);
  }

  it('lässt an der Wurzel und in flachen Bäumen alles zu', () => {
    const d = view(block('a', {}, { children: [block('a1')] }));
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
    expect(canNestUnder(view(block('a')), 'weg')).toBe(false);
  });

  it('lässt eine ganze Kette bis MAX_DESIGN_DEPTH unangetastet durch', () => {
    // Belegt, dass die Grenze richtig gezogen ist: Diese Kette übersteht das
    // Zurechtrücken vollständig.
    const tief = chain(MAX_DESIGN_DEPTH);
    expect(listBlocks(normalizeDesign(design(tief)).views[0])).toHaveLength(MAX_DESIGN_DEPTH);
  });
});

describe('nestBlock', () => {
  // Der Kasten 'b' liegt in 'a', hängt aber (noch) an der Wurzel.
  const d = view(
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
    const drin = view(
      block('a', { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, {
        children: [block('b', { x: 0.7, y: 0.7, w: 0.1, h: 0.1 })],
      }),
    );
    const next = nestBlock(drin, 'b');
    expect(next.blocks.map((x) => x.id)).toEqual(['a', 'b']);
    expect(findBlock(next, 'a')!.children).toEqual([]);
  });

  it('hängt ihn unter den untersten Kasten, in dem er liegt', () => {
    const zwei = view(
      block('a', { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, {
        children: [block('a1', { x: 0.2, y: 0.2, w: 0.4, h: 0.4 })],
      }),
      block('b', { x: 0.25, y: 0.25, w: 0.1, h: 0.1 }),
    );
    expect(findBlock(nestBlock(zwei, 'b'), 'a1')!.children.map((x) => x.id)).toEqual(['b']);
  });

  it('nimmt die Kinder des umgehängten Kastens mit', () => {
    const mitKind = view(
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
    const passt = view(
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
    const eng = view(
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
    const tief = view(inner!, block('b', { x: 0.3, y: 0.3, w: 0.05, h: 0.05 }));

    // 'b' liegt im tiefsten Kasten der Kette — dort wäre es eine Ebene zu tief.
    expect(nestBlock(tief, 'b')).toBe(tief);
  });

  it('lässt den Entwurf unverändert, wenn es die Id nicht gibt', () => {
    expect(nestBlock(d, 'weg')).toBe(d);
  });

  it('verändert den übergebenen Entwurf nicht', () => {
    const before = JSON.parse(JSON.stringify(d)) as View;
    const next = nestBlock(d, 'b');
    expect(d).toEqual(before);
    expect(next).not.toBe(d);
  });
});

describe('deleteBlock', () => {
  const d = view(
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
    const before = JSON.parse(JSON.stringify(d)) as View;
    const next = deleteBlock(d, 'a1');
    expect(d).toEqual(before);
    expect(next).not.toBe(d);
  });
});
