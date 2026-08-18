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
import { generateApp } from '@/core/generate';
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
    expect(onDisk.views[0].blocks).toHaveLength(1);
    expect(onDisk.views[0].blocks[0].name).toBe('Kopfzeile');
    expect(onDisk.views[0].blocks[0].rect).toEqual({ x: 0, y: 0, w: 1, h: 0.2 });
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

    expect(readDesign(dir).views[0].blocks[0].name).toBe('Titelzeile');
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
    expect(onDisk.views[0].blocks[0]).toMatchObject({
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

  it('schiebt und zieht einen Kasten — und findet ihn so wieder (c0109)', async () => {
    const store = await openWindow('flow');
    await store.addDesignBlock({ x: 0.1, y: 0.1, w: 0.4, h: 0.2 }, 'Kopfzeile');

    // Auswählen: Erst der ausgewählte Kasten lässt sich anfassen.
    const { wrapper, stage } = overlay(() => store.designBlocks);
    const kasten = wrapper.get('.design-stage > .design-block');
    await kasten.trigger('click');

    // Schieben: 40 Pixel nach rechts und 20 nach unten sind auf 400 × 200 je 0.1.
    await kasten.trigger('pointerdown', { button: 0, clientX: 60, clientY: 30 });
    await stage.trigger('pointermove', { clientX: 100, clientY: 50 });
    await stage.trigger('pointerup', { clientX: 100, clientY: 50 });
    const [id, to] = wrapper.emitted('move')![0] as [string, { x: number; y: number }];
    await store.moveDesignBlock(id, to);

    expect(readDesign(dir).views[0].blocks[0].rect).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.2 });

    // Größe ändern: Die Fläche bekommt den Kasten so, wie er nun in der Datei
    // steht, und zieht ihn an der rechten unteren Ecke auf.
    await wrapper.setProps({ blocks: store.designBlocks });
    await wrapper.get('.db-handle.db-se').trigger('pointerdown', { button: 0, clientX: 240, clientY: 80 });
    await stage.trigger('pointermove', { clientX: 280, clientY: 100 });
    await stage.trigger('pointerup', { clientX: 280, clientY: 100 });
    const [gleicheId, rect] = wrapper.emitted('resize')![0] as [string, Rect];
    expect(gleicheId).toBe(id);
    await store.resizeDesignBlock(gleicheId, rect);

    expect(readDesign(dir).views[0].blocks[0].rect).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.3 });

    // Und wiederfinden: Der Entwurfs-Modus geht zu und wieder auf.
    store.closeDesign();
    await store.openDesign();
    expect(store.designBlocks[0].rect).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.3 });
    expect(store.error).toBeNull();
  });

  it('verschachtelt, hängt um und löscht — in der Datei und im Prompt (c0110)', async () => {
    const store = await openWindow('flow');
    const inhalt = await store.addDesignBlock({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 'Inhalt');

    // Zeichnen: ein Zug GANZ IM Inhalt (0.2…0.4 in beiden Richtungen) — die
    // Fläche zeigt schon während des Zugs, wo der neue Kasten landet.
    const { wrapper, stage } = overlay(() => store.designBlocks);
    await stage.trigger('pointerdown', { button: 0, clientX: 80, clientY: 40 });
    await stage.trigger('pointermove', { clientX: 160, clientY: 80 });
    expect(wrapper.get('.design-block.drop').get('.db-name').text()).toBe('Inhalt');
    await stage.trigger('pointerup', { clientX: 160, clientY: 80 });

    const input = wrapper.get('input.db-input');
    (input.element as HTMLInputElement).value = 'Liste';
    await input.trigger('keydown.enter');
    const [rect, name] = wrapper.emitted('draw')![0] as [Rect, string];
    const liste = await store.addDesignBlock(rect, name);

    // In der Datei steht der Baum: die Liste IM Inhalt.
    const drin = readDesign(dir);
    expect(drin.views[0].blocks.map((b) => b.name)).toEqual(['Inhalt']);
    expect(drin.views[0].blocks[0].children.map((b) => b.name)).toEqual(['Liste']);
    expect(drin.views[0].blocks[0].children[0].rect).toEqual({ x: 0.2, y: 0.2, w: 0.2, h: 0.2 });

    // Und der Agent sieht die Gliederung als Einrückung.
    const prompt = buildPrompt('Bau die Liste', [], { design: drin });
    expect(prompt).toContain('- Inhalt\n');
    expect(prompt).toContain('  - Liste\n');

    // Umhängen: dieselbe Liste nach rechts unten aus dem Inhalt heraus.
    await store.moveDesignBlock(liste!, { x: 0.7, y: 0.7 });
    const raus = readDesign(dir);
    expect(raus.views[0].blocks.map((b) => b.name)).toEqual(['Inhalt', 'Liste']);
    expect(raus.views[0].blocks[0].children).toEqual([]);
    expect(buildPrompt('Weiter', [], { design: raus })).toContain('- Liste\n');

    // Wieder hinein — und dann den Elter löschen: Der Rahmen fällt weg, das
    // Kind bleibt liegen, wo es liegt.
    await store.moveDesignBlock(liste!, { x: 0.2, y: 0.2 });
    expect(readDesign(dir).views[0].blocks[0].children).toHaveLength(1);

    await store.deleteDesignBlock(inhalt!);
    const nach = readDesign(dir);
    expect(nach.views[0].blocks.map((b) => b.name)).toEqual(['Liste']);
    expect(nach.views[0].blocks[0].rect).toEqual({ x: 0.2, y: 0.2, w: 0.2, h: 0.2 });
    expect(store.error).toBeNull();

    // Und wiederfinden: Der Entwurfs-Modus geht zu und wieder auf.
    store.closeDesign();
    await store.openDesign();
    expect(store.designBlocks.map((b) => b.name)).toEqual(['Liste']);
  });

  /**
   * c0112: Dieselbe Scheibe, aber VOR der App — gezeichnet wird im Fenster eines
   * Entwurfs, und der erste Wunsch nimmt den Entwurf mit. Der Host ruft dafür
   * denselben `generateApp` auf wie der Hauptprozess (nur der Agent ist
   * nachgestellt): Was der Prompt dieses ersten Laufs trägt und was hinterher im
   * Ordner der neuen App liegt, entscheidet damit der echte Weg.
   */
  it('nimmt den Entwurf einer neuen App mit dem ersten Wunsch mit (c0112)', async () => {
    const prompts: string[] = [];
    const journal = path.join(root, '..', `morphos-flow-journal-${path.basename(root)}.jsonl`);
    const host = {
      ...diskHost(),
      generate: vi.fn(async (
        wish: string, folder: string, id: string | null,
        _chat: unknown, _atts: unknown, _runId?: string, _fw?: unknown, _els?: unknown, design?: Design,
      ) => generateApp(
        { folder, id, wish, context: { design }, execPath: '/morphos', server: '/mcp.js', journal },
        {
          runAgent: async ({ prompt, cwd }) => {
            prompts.push(prompt);
            fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
            fs.writeFileSync(path.join(cwd, 'src', 'index.html'), HTML, 'utf8');
            fs.appendFileSync(journal, `${JSON.stringify({ kind: 'write', path: 'src/index.html' })}\n`, 'utf8');
            return { ok: true as const, text: 'Fertig.' };
          },
          resolveLibs: async () => ({ ok: true as const, libs: {} }),
          builtinLib: () => '',
          ensureRepo: async () => {},
          commitAll: async () => {},
          now: () => 1_000,
        },
      )),
    };
    setHost(host as unknown as MorphosHost);
    fs.rmSync(dir, { recursive: true, force: true }); // es gibt noch keine App

    // Ein Fenster ohne App: Der Entwurfs-Modus geht auf und der Anwender zeichnet.
    const store = useAppWindow('neu');
    store.newDraft(root);
    await store.openDesign();
    const { wrapper, stage } = overlay(() => store.designBlocks);
    await stage.trigger('pointerdown', { button: 0, clientX: 0, clientY: 0 });
    await stage.trigger('pointermove', { clientX: 400, clientY: 40 });
    await stage.trigger('pointerup', { clientX: 400, clientY: 40 });
    const input = wrapper.get('input.db-input');
    (input.element as HTMLInputElement).value = 'Kopfzeile';
    await input.trigger('keydown.enter');
    const [rect, name] = wrapper.emitted('draw')![0] as [Rect, string];
    await store.addDesignBlock(rect, name);

    // Nichts auf der Platte — die App gibt es ja noch nicht.
    expect(fs.readdirSync(root)).toEqual([]);
    expect(store.designBlocks.map((b) => b.name)).toEqual(['Kopfzeile']);

    // Der erste Wunsch: Der Entwurf reist mit.
    await store.generate('Eine App für Notizen');

    expect(prompts[0]).toContain('UI-LAYOUT');
    expect(prompts[0]).toContain('Kopfzeile');
    expect(prompts[0]).toContain('senkrecht 0%…20%');

    // Und er liegt fortan im Ordner der neuen App — das Fenster liest ihn von dort.
    const appDir = path.join(root, store.id!);
    expect(readDesign(appDir).views[0].blocks[0]).toMatchObject({ name: 'Kopfzeile', rect: { x: 0, y: 0, w: 1, h: 0.2 } });
    expect(store.designBlocks.map((b) => b.name)).toEqual(['Kopfzeile']);

    // Von hier an ist es der Entwurf einer ganz gewöhnlichen App.
    await store.renameDesignBlock(store.designBlocks[0].id, 'Titelzeile');
    expect(readDesign(appDir).views[0].blocks[0].name).toBe('Titelzeile');
    fs.rmSync(journal, { force: true });
  });

  /**
   * c0113: Dieselbe Scheibe über MEHRERE Ansichten — jede mit ihrem Titel, ihrer
   * Beschreibung und ihren eigenen Kästen; alles in einer Datei, alles im
   * Prompt.
   */
  it('führt mehrere Ansichten — in der Datei und im Prompt (c0113)', async () => {
    const store = await openWindow('flow');

    // Erste Ansicht: Sie entsteht mit dem ersten Kasten, ohne Zutun.
    const { wrapper, stage } = overlay(() => store.designBlocks);
    await stage.trigger('pointerdown', { button: 0, clientX: 0, clientY: 0 });
    await stage.trigger('pointermove', { clientX: 400, clientY: 40 });
    await stage.trigger('pointerup', { clientX: 400, clientY: 40 });
    const eingabe = wrapper.get('input.db-input');
    (eingabe.element as HTMLInputElement).value = 'Kopfzeile';
    await eingabe.trigger('keydown.enter');
    const [rect, name] = wrapper.emitted('draw')![0] as [Rect, string];
    await store.addDesignBlock(rect, name);
    await store.describeDesignView(store.designViewId!, { title: 'Liste', description: 'alle Notizen' });

    // Zweite Ansicht: über die Leiste angelegt, benannt und beschrieben.
    await wrapper.setProps({ blocks: store.designBlocks, views: store.designViews, viewId: store.designViewId });
    await wrapper.get('.dv-add').trigger('click');
    expect(wrapper.emitted('add-view')).toHaveLength(1);
    const zweite = await store.addDesignView();
    await wrapper.setProps({ blocks: store.designBlocks, views: store.designViews, viewId: store.designViewId });
    await wrapper.get('input.dvi-title').setValue('Detail');
    await wrapper.get('textarea.dvi-description').setValue('eine Notiz für sich');
    for (const [id, patch] of wrapper.emitted('describe-view') as [string, { title?: string; description?: string }][]) {
      await store.describeDesignView(id, patch);
    }
    // Und ein Kasten hinein — er gehört DIESER Ansicht.
    await store.addDesignBlock({ x: 0, y: 0.2, w: 1, h: 0.8 }, 'Formular');

    // In der Datei stehen beide Ansichten, jede mit ihrem Eigenen.
    const onDisk = readDesign(dir);
    expect(onDisk.views.map((v) => v.title)).toEqual(['Liste', 'Detail']);
    expect(onDisk.views[0].blocks.map((b) => b.name)).toEqual(['Kopfzeile']);
    expect(onDisk.views[1].blocks.map((b) => b.name)).toEqual(['Formular']);
    expect(onDisk.views[1].description).toBe('eine Notiz für sich');
    expect(store.error).toBeNull();

    // Der Agent sieht beide Bildschirme, jeden mit seinen Kästen.
    const prompt = buildPrompt('Bau die App', [], { design: onDisk });
    expect(prompt).toContain('ANSICHT: Liste');
    expect(prompt).toContain('Beschreibung: alle Notizen');
    expect(prompt).toContain('ANSICHT: Detail');
    expect(prompt).toContain('eine Notiz für sich');
    expect(prompt.indexOf('- Kopfzeile')).toBeLessThan(prompt.indexOf('ANSICHT: Detail'));
    expect(prompt.indexOf('ANSICHT: Detail')).toBeLessThan(prompt.indexOf('- Formular'));

    // Wiederfinden: Ein frisch geöffnetes Fenster liest beide von der Platte und
    // steht bei der ersten.
    const zweites = await openWindow('flow-2');
    expect(zweites.designViews.map((v) => v.title)).toEqual(['Liste', 'Detail']);
    expect(zweites.designBlocks.map((b) => b.name)).toEqual(['Kopfzeile']);
    zweites.selectDesignView(zweite!);
    expect(zweites.designBlocks.map((b) => b.name)).toEqual(['Formular']);

    // Und wegwerfen nimmt die Kästen dieser Ansicht mit — nur die.
    await zweites.deleteDesignView(zweite!);
    const nach = readDesign(dir);
    expect(nach.views.map((v) => v.title)).toEqual(['Liste']);
    expect(nach.views[0].blocks.map((b) => b.name)).toEqual(['Kopfzeile']);
    expect(buildPrompt('Weiter', [], { design: nach })).not.toContain('Formular');
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
