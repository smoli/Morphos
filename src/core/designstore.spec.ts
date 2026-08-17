import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DESIGN_FILE, DESIGN_VERSION, emptyDesign, type Block, type Design } from './design';
import { designPath, readDesign, writeDesign } from './designstore';

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

describe('designPath', () => {
  it('legt die Datei im Wurzelverzeichnis der App ab', () => {
    expect(DESIGN_FILE).toBe('design.ui.json');
    expect(designPath('/apps/notiz')).toBe(path.join('/apps/notiz', DESIGN_FILE));
  });
});

describe('readDesign / writeDesign', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-design-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('liefert einen leeren Entwurf, solange keine Datei da ist', () => {
    expect(readDesign(dir)).toEqual(emptyDesign());
    expect(fs.existsSync(designPath(dir))).toBe(false);
  });

  it('schreibt und liest denselben Entwurf zurück', () => {
    const d = design(
      block('b1', { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, {
        name: 'Kopf',
        instructions: 'Zwei Zeilen\nText',
        type: 'header',
        children: [block('b2', { x: 0.15, y: 0.25, w: 0.1, h: 0.1 })],
      }),
      block('b3'),
    );
    writeDesign(dir, d);
    expect(readDesign(dir)).toEqual(d);
  });

  it('legt die Datei lesbar (eingerückt) im Wurzelverzeichnis ab', () => {
    writeDesign(dir, design(block('b1')));
    const text = fs.readFileSync(designPath(dir), 'utf8');
    expect(text).toContain('\n  "version"');
    expect(JSON.parse(text).blocks).toHaveLength(1);
  });

  it('bringt beim Schreiben in Ordnung, was ihm gereicht wird', () => {
    writeDesign(dir, { version: 0, blocks: [{ name: 'a', rect: { x: 9, y: 9, w: 9, h: 9 } }] } as unknown as Design);
    const d = readDesign(dir);
    expect(d.version).toBe(DESIGN_VERSION);
    expect(d.blocks[0].rect.x).toBeLessThanOrEqual(1);
  });

  it('gibt zurück, was tatsächlich geschrieben wurde', () => {
    const written = writeDesign(dir, { version: 0, blocks: [{ name: 'Kopf', rect: { x: 0.10001, y: 0, w: 2, h: 0.2 } }] } as unknown as Design);
    expect(written).toEqual(readDesign(dir));
    expect(written.blocks[0].rect).toEqual({ x: 0.1, y: 0, w: 0.9, h: 0.2 });
  });

  it('legt einen fehlenden Ordner an', () => {
    const sub = path.join(dir, 'neu', 'app');
    writeDesign(sub, design(block('b1')));
    expect(readDesign(sub).blocks).toHaveLength(1);
  });

  it('überlebt eine beschädigte Datei', () => {
    fs.writeFileSync(designPath(dir), '{ kein json', 'utf8');
    expect(readDesign(dir)).toEqual(emptyDesign());
  });

  it('bringt eine fremde Datei beim Lesen in Ordnung', () => {
    fs.writeFileSync(designPath(dir), JSON.stringify({ blocks: [{ name: 'a', rect: { w: 4 } }] }), 'utf8');
    const d = readDesign(dir);
    expect(d.version).toBe(DESIGN_VERSION);
    expect(d.blocks[0].rect.w).toBe(1);
  });
});
