import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TileGaps from './TileGaps.vue';
import { TILE_GAP, useDesktopStore } from '@/stores/desktop';
import { useWorkspaceStore } from '@/stores/workspace';

const AREA = { x: 0, y: 0, w: 1200, h: 800 };

/**
 * Die Griffe an den Fugen — geprüft an einem gekachelten Desktop mit von Hand
 * gesetzter Fläche (jsdom rechnet kein Layout aus).
 */
function mountGaps(anzahl = 2) {
  useWorkspaceStore().uiMode = 'tiles';
  const desktop = useDesktopStore();
  desktop.setTileArea(AREA);
  const ids = ['a', 'b', 'c']
    .slice(0, anzahl)
    .map((id) => desktop.openApp(id, { title: id.toUpperCase(), icon: '🅰' }));
  const wrapper = mount(TileGaps);
  return { wrapper, desktop, ids };
}

/** Zieht an einer Fuge: drücken, bewegen, loslassen. */
async function dragGap(wrapper: ReturnType<typeof mountGaps>['wrapper'], i: number, x: number, y: number) {
  await wrapper.findAll('.gap-handle')[i].trigger('mousedown', { button: 0 });
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
  await wrapper.vm.$nextTick();
}

describe('TileGaps', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('legt an jede Fuge des Baums einen Griff', () => {
    const { wrapper } = mountGaps(3);
    const handles = wrapper.findAll('.gap-handle');
    // Drei Kacheln haben zwei Teilungen — eine quer, eine längs.
    expect(handles).toHaveLength(2);
    expect(handles[0].classes()).toContain('row');
    expect(handles[1].classes()).toContain('column');
  });

  it('macht den Griff breiter als die Fuge, damit man sie fasst', () => {
    const { wrapper, desktop, ids } = mountGaps();
    const style = wrapper.get('.gap-handle').attributes('style') ?? '';
    const breite = parseFloat(/width: ([\d.]+)px/.exec(style)![1]);

    expect(breite).toBeGreaterThan(TILE_GAP);
    // Und er sitzt mittig auf der Fuge zwischen den beiden Kacheln.
    const links = desktop.tileRects[ids[0]];
    const mitte = links.x + links.w + TILE_GAP / 2;
    expect(parseFloat(/left: ([\d.]+)px/.exec(style)![1]) + breite / 2).toBeCloseTo(mitte, 5);
  });

  it('verschiebt beim Ziehen die Teilung', async () => {
    const { wrapper, desktop, ids } = mountGaps();
    const [a, b] = ids;
    const vorher = desktop.tileRects[a].w;

    await dragGap(wrapper, 0, 300, 400);

    expect(desktop.tileRects[a].w).toBeLessThan(vorher);
    expect(desktop.tileRects[a].w).toBeCloseTo(300 - TILE_GAP / 2, 0);
    // Was die eine verliert, gewinnt die andere — die Fläche bleibt gefüllt.
    expect(desktop.tileRects[a].w + desktop.tileRects[b].w).toBe(AREA.w - TILE_GAP);
  });

  it('rechnet die Maus in die Bühne um, wenn die woanders anfängt', async () => {
    const { wrapper, desktop, ids } = mountGaps();
    desktop.setStageOrigin({ x: 100, y: 40 });

    await dragGap(wrapper, 0, 400, 400);

    expect(desktop.tileRects[ids[0]].w).toBeCloseTo(300 - TILE_GAP / 2, 0);
  });

  it('deckt die Kacheln beim Ziehen mit der Schutzschicht ab', async () => {
    const { wrapper } = mountGaps();
    expect(wrapper.find('.drag-shield').exists()).toBe(false);

    await wrapper.get('.gap-handle').trigger('mousedown', { button: 0 });
    expect(wrapper.get('.drag-shield').classes()).toContain('row');

    window.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.drag-shield').exists()).toBe(false);
  });

  it('hört nach dem Loslassen auf, der Maus zu folgen', async () => {
    const { wrapper, desktop, ids } = mountGaps();

    await dragGap(wrapper, 0, 300, 400);
    window.dispatchEvent(new MouseEvent('mouseup'));
    const nach = desktop.tileRects[ids[0]].w;

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 900, clientY: 400 }));
    await wrapper.vm.$nextTick();
    expect(desktop.tileRects[ids[0]].w).toBe(nach);
  });

  it('hält keine Kachel für eine einzelne oder gar keine offen', () => {
    const { wrapper } = mountGaps(1);
    expect(wrapper.findAll('.gap-handle')).toHaveLength(0);
  });

  it('tritt beiseite, solange eine Kachel getragen wird oder eine maximiert ist', async () => {
    const { wrapper, desktop, ids } = mountGaps();

    desktop.startTileSwap(ids[0]);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.gap-handle')).toHaveLength(0);

    desktop.cancelTileSwap();
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.gap-handle')).toHaveLength(1);

    desktop.toggleMaximize(ids[1]);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.gap-handle')).toHaveLength(0);
  });
});
