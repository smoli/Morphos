import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setActivePinia, createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import DesignOverlay from './DesignOverlay.vue';
import { useAppWindow } from '@/stores/app';
import { setHost } from '@/services/host';
import { readDesign, writeDesign, designPath } from '@/core/designstore';
import { DEFAULT_BLOCK_NAME, type Design, type Rect } from '@/core/design';
import { buildPrompt } from '@/core/prompt';
import type { AppData, MorphosHost, SourceFile } from '@/types';

/**
 * Die dünne Scheibe durch den ganzen UI-Designer (c0107): zeichnen — benennen —
 * speichern — wiederfinden — und der Agent hält sich daran.
 *
 * Die anderen Specs prüfen je ein Stück für sich; hier laufen sie EINMAL
 * zusammen, und zwar über eine echte Datei: Der Host ruft dieselben Funktionen
 * auf wie der Hauptprozess (core/designstore in einem Wegwerf-Ordner). Damit ist
 * belegt, was die Karte verspricht — nicht, dass jedes Stück für sich tut, was
 * es soll, sondern dass der Kreis sich schließt.
 */

const HTML = '<!DOCTYPE html><html><head><title>Notizen</title></head><body>x</body></html>';
const FILES: SourceFile[] = [{ path: 'src/index.html', content: HTML }];

/** Was das Feld zu einem Kasten meldet (c0108). */
type Patch = { instructions?: string; type?: string };

describe('Entwurf zeichnen, speichern, wiederfinden (c0107)', () => {
  let root: string;
  let dir: string;

  /** Ein Host, der wie der Hauptprozess auf die Platte geht. */
  function diskHost(): Partial<MorphosHost> {
    return {
      loadApp: vi.fn(async (): Promise<AppData> => ({
        id: 'notizen', name: 'Notizen', icon: '📝', createdAt: 1, updatedAt: 2,
        files: FILES, html: HTML, chat: [],
      })),
      listVersions: vi.fn(async () => []),
      readDesign: vi.fn(async (folder: string, id: string) => readDesign(path.join(folder, id))),
      writeDesign: vi.fn(async (folder: string, id: string, design: Design) =>
        writeDesign(path.join(folder, id), design)),
    };
  }

  /** Ein geöffnetes App-Fenster mit offenem Entwurfs-Modus. */
  async function openWindow(name: string) {
    const store = useAppWindow(name);
    await store.open(root, 'notizen');
    await store.openDesign();
    return store;
  }

  /** Die Zeichenfläche über den Kästen des Fensters (400 × 200 Pixel groß). */
  function overlay(blocks: () => ReturnType<typeof useAppWindow>['designBlocks']) {
    const wrapper = mount(DesignOverlay, { props: { blocks: blocks() }, attachTo: document.body });
    const stage = wrapper.get('.design-stage');
    (stage.element as HTMLElement).getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0 }) as DOMRect;
    return { wrapper, stage };
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-flow-'));
    dir = path.join(root, 'notizen');
    fs.mkdirSync(dir, { recursive: true });
    setHost(diskHost() as MorphosHost);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('zeichnet einen Kasten, benennt ihn und schreibt ihn nach design.ui.json', async () => {
    const store = await openWindow('flow');
    expect(store.designBlocks).toEqual([]);
    expect(fs.existsSync(designPath(dir))).toBe(false);

    // Zeichnen: ein Zug über das obere Fünftel der Fläche.
    const { wrapper, stage } = overlay(() => store.designBlocks);
    await stage.trigger('pointerdown', { button: 0, clientX: 0, clientY: 0 });
    await stage.trigger('pointermove', { clientX: 400, clientY: 40 });
    await stage.trigger('pointerup', { clientX: 400, clientY: 40 });

    // Benennen: der Platzhalter steht schon da, der Anwender überschreibt ihn.
    const input = wrapper.get('input.db-input');
    expect((input.element as HTMLInputElement).value).toBe(DEFAULT_BLOCK_NAME);
    (input.element as HTMLInputElement).value = 'Kopfzeile';
    await input.trigger('keydown.enter');

    // Speichern: was die Fläche meldet, geht durch den Store auf die Platte.
    const [rect, name] = wrapper.emitted('draw')![0] as [Rect, string];
    await store.addDesignBlock(rect, name);

    const onDisk = JSON.parse(fs.readFileSync(designPath(dir), 'utf8')) as Design;
    expect(onDisk.blocks).toHaveLength(1);
    expect(onDisk.blocks[0].name).toBe('Kopfzeile');
    expect(onDisk.blocks[0].rect).toEqual({ x: 0, y: 0, w: 1, h: 0.2 });
    expect(store.error).toBeNull();
  });

  it('zeigt den gespeicherten Kasten, wenn der Entwurfs-Modus wieder aufgeht', async () => {
    const store = await openWindow('flow');
    await store.addDesignBlock({ x: 0, y: 0, w: 1, h: 0.2 }, 'Kopfzeile');

    store.closeDesign();
    await store.openDesign();

    expect(store.designBlocks).toEqual([
      { id: expect.any(String), name: 'Kopfzeile', rect: { x: 0, y: 0, w: 1, h: 0.2 }, children: [] },
    ]);

    // Und auch ein frisch geöffnetes Fenster sieht ihn — die Datei ist maßgeblich.
    const zweites = await openWindow('flow-2');
    expect(zweites.designBlocks.map((b) => b.name)).toEqual(['Kopfzeile']);

    // Ein Klick auf den Namen benennt ihn um; auch das steht sogleich in der Datei.
    const { wrapper } = overlay(() => zweites.designBlocks);
    await wrapper.get('.db-name').trigger('click');
    const input = wrapper.get('input.db-input');
    (input.element as HTMLInputElement).value = 'Titelzeile';
    await input.trigger('keydown.enter');
    const [id, neu] = wrapper.emitted('rename')![0] as [string, string];
    await zweites.renameDesignBlock(id, neu);

    expect(readDesign(dir).blocks[0].name).toBe('Titelzeile');
  });

  it('gibt einem Kasten Rolle und Anweisungen — bis in den Prompt (c0108)', async () => {
    const store = await openWindow('flow');
    await store.addDesignBlock({ x: 0, y: 0, w: 1, h: 0.2 }, 'Kopfzeile');

    // Auswählen: Ein Klick auf den Kasten öffnet sein Feld.
    const { wrapper } = overlay(() => store.designBlocks);
    await wrapper.get('.design-stage > .design-block').trigger('click');
    expect(wrapper.get('.di-name').text()).toBe('Kopfzeile');

    // Beschreiben: Rolle und Anweisungen, jedes fertige Feld für sich.
    await wrapper.get('input.di-type').setValue('Kopfzeile');
    await wrapper.get('textarea.di-instructions').setValue('Links das Logo, rechts die Suche');
    for (const [id, patch] of wrapper.emitted('describe') as [string, Patch][]) {
      await store.describeDesignBlock(id, patch);
    }

    // Speichern: beides steht in der Datei — und nur dort, wo es hingehört.
    const onDisk = readDesign(dir);
    expect(onDisk.blocks[0]).toMatchObject({
      name: 'Kopfzeile',
      type: 'Kopfzeile',
      instructions: 'Links das Logo, rechts die Suche',
    });
    expect(store.error).toBeNull();

    // Weitergeben: Der Agent sieht beides an seinem Kasten.
    const prompt = buildPrompt('Bau die Kopfzeile aus', [], { design: onDisk });
    expect(prompt).toContain('- Kopfzeile [Kopfzeile]');
    expect(prompt).toContain('Anweisungen: Links das Logo, rechts die Suche');
  });

  it('nimmt geleerte Angaben wieder weg — aus der Datei und aus dem Prompt (c0108)', async () => {
    const store = await openWindow('flow');
    const id = await store.addDesignBlock({ x: 0, y: 0, w: 1, h: 0.2 }, 'Kopfzeile');
    await store.describeDesignBlock(id!, { type: 'Kopfzeile' });
    await store.describeDesignBlock(id!, { instructions: 'weg damit' });

    // Das Feld zeigt, was gespeichert ist — und der Anwender leert beides.
    const { wrapper } = overlay(() => store.designBlocks);
    await wrapper.get('.design-stage > .design-block').trigger('click');
    expect((wrapper.get('input.di-type').element as HTMLInputElement).value).toBe('Kopfzeile');
    await wrapper.get('input.di-type').setValue('   ');
    await wrapper.get('textarea.di-instructions').setValue('');
    for (const [blockId, patch] of wrapper.emitted('describe') as [string, Patch][]) {
      await store.describeDesignBlock(blockId, patch);
    }

    // In der Datei steht kein leeres Feld — auch nicht als "".
    const raw = fs.readFileSync(designPath(dir), 'utf8');
    expect(raw).not.toContain('instructions');
    expect(raw).not.toContain('type');
    const prompt = buildPrompt('Mach weiter', [], { design: readDesign(dir) });
    expect(prompt).toContain('- Kopfzeile\n');
    expect(prompt).not.toContain('Anweisungen:');
    expect(prompt).not.toContain('[]');
  });

  it('gibt den gezeichneten Kasten an den Agenten weiter (UI-LAYOUT, c0106)', async () => {
    const store = await openWindow('flow');
    await store.addDesignBlock({ x: 0, y: 0, w: 1, h: 0.2 }, 'Kopfzeile');

    // Der Prompt liest den Entwurf so, wie es core/generate tut: von der Platte.
    const prompt = buildPrompt('Mach die Liste bunt', [], { design: readDesign(dir) });

    expect(prompt).toContain('UI-LAYOUT');
    expect(prompt).toContain('Kopfzeile');
    expect(prompt).toContain('senkrecht 0%…20%');
  });
});
