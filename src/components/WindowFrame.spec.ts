import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WindowFrame from './WindowFrame.vue';
import { useDesktopStore } from '@/stores/desktop';
import { useWorkspaceStore } from '@/stores/workspace';
import { EXPLORER_ID } from '@/core/system';

/**
 * Der Rahmen für sich — ohne App und ohne Ansicht darin. Was ein Aufsatz
 * beisteuert (AppWindow, SystemWindow), steht in deren eigenen Prüfungen.
 */
function mountFrame({ single = false } = {}) {
  const desktop = useDesktopStore();
  const id = desktop.openSystem(EXPLORER_ID)!;
  const win = desktop.find(id)!;
  const wrapper = mount(WindowFrame, {
    props: { win, single },
    slots: {
      icon: '<span class="mein-icon">🗂</span>',
      title: 'Meine Ansicht',
      actions: '<button type="button" class="mein-knopf">★</button>',
      default: '<div class="mein-inhalt">Inhalt</div>',
    },
  });
  return { wrapper, desktop, win };
}

describe('WindowFrame', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('zeigt Icon, Titel, eigene Knöpfe und den Inhalt des Aufsatzes', () => {
    const { wrapper } = mountFrame();
    expect(wrapper.get('.mein-icon').text()).toBe('🗂');
    expect(wrapper.get('.w-title').text()).toBe('Meine Ansicht');
    expect(wrapper.find('.w-actions .mein-knopf').exists()).toBe(true);
    expect(wrapper.get('.w-body .mein-inhalt').text()).toBe('Inhalt');
  });

  it('nimmt ohne Aufsatz Icon und Titel des Fensters', () => {
    const desktop = useDesktopStore();
    const win = desktop.find(desktop.openSystem(EXPLORER_ID)!)!;
    const wrapper = mount(WindowFrame, { props: { win } });
    expect(wrapper.get('.w-title').text()).toBe(win.title);
    expect(wrapper.get('.w-icon').text()).toBe(win.icon);
  });

  it('positioniert sich nach der Fenster-Geometrie', () => {
    const { wrapper, win } = mountFrame();
    const style = wrapper.attributes('style') ?? '';
    expect(style).toContain(`${win.x}px`);
    expect(style).toContain(`${win.w}px`);
  });

  it('holt sich beim Anklicken den Fokus (nach vorn)', async () => {
    const { wrapper, desktop, win } = mountFrame();
    const other = desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
    expect(desktop.focusedId).toBe(other);

    await wrapper.trigger('mousedown');
    expect(desktop.focusedId).toBe(win.instanceId);
  });

  describe('Marke des aktiven Fensters (c0071)', () => {
    it('markiert den Rahmen, der vorn liegt', () => {
      const { wrapper } = mountFrame();
      expect(wrapper.get('.window-frame').classes()).toContain('active');
    });

    it('gibt die Marke ab, sobald ein anderes Fenster nach vorn kommt — und holt sie zurück', async () => {
      const { wrapper, desktop } = mountFrame();

      desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await wrapper.vm.$nextTick();
      expect(wrapper.get('.window-frame').classes()).not.toContain('active');

      await wrapper.trigger('mousedown');
      expect(wrapper.get('.window-frame').classes()).toContain('active');
    });

    it('trägt keine Marke, wenn das Fenster minimiert wartet', async () => {
      const { wrapper } = mountFrame();

      await wrapper.get('.w-min').trigger('click');
      expect(wrapper.get('.window-frame').classes()).not.toContain('active');
    });

    it('markiert auch gekachelt nur die Kachel, die den Anwender bedient', async () => {
      useWorkspaceStore().uiMode = 'tiles';
      const desktop = useDesktopStore();
      desktop.setTileArea({ x: 0, y: 0, w: 1000, h: 600 });
      const a = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      const b = desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      const frames = [a, b].map((id) =>
        mount(WindowFrame, { props: { win: desktop.find(id)!, tiled: true } }),
      );

      expect(frames[0].get('.window-frame').classes()).not.toContain('active');
      expect(frames[1].get('.window-frame').classes()).toContain('active');

      await frames[0].trigger('mousedown');
      expect(frames[0].get('.window-frame').classes()).toContain('active');
      expect(frames[1].get('.window-frame').classes()).not.toContain('active');
    });

    it('trägt im Einzel-Modus keine Marke, solange der Desktop davor liegt', async () => {
      useWorkspaceStore().uiMode = 'single';
      const { wrapper, desktop } = mountFrame({ single: true });
      expect(wrapper.get('.window-frame').classes()).toContain('active');

      desktop.showDesktop();
      await wrapper.vm.$nextTick();
      expect(wrapper.get('.window-frame').classes()).not.toContain('active');
    });
  });

  it('minimiert, maximiert und schließt über die Fensterknöpfe', async () => {
    const { wrapper, desktop, win } = mountFrame();

    await wrapper.get('.w-max').trigger('click');
    expect(desktop.find(win.instanceId)!.maximized).toBe(true);
    expect(wrapper.get('.window-frame').classes()).toContain('full');

    await wrapper.get('.w-min').trigger('click');
    expect(desktop.find(win.instanceId)!.minimized).toBe(true);

    await wrapper.get('.w-close').trigger('click');
    expect(desktop.windows).toHaveLength(0);
  });

  it('verschiebt das Fenster per Ziehen der Titelleiste (mit Schutzschicht)', async () => {
    const { wrapper, desktop, win } = mountFrame();
    const startX = win.x;

    await wrapper.get('.titlebar').trigger('mousedown', { clientX: 200, clientY: 100 });
    expect(wrapper.find('.drag-shield').exists()).toBe(true);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 140 }));
    await wrapper.vm.$nextTick();

    expect(desktop.find(win.instanceId)!.x).toBe(startX + 60);
    window.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.drag-shield').exists()).toBe(false);
  });

  it('ändert die Größe über den Griff (mit Mindestgröße)', async () => {
    const { wrapper, desktop, win } = mountFrame();
    const startW = win.w;

    await wrapper.get('.resize-handle').trigger('mousedown', { clientX: 100, clientY: 100 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 150 }));
    await wrapper.vm.$nextTick();

    expect(desktop.find(win.instanceId)!.w).toBe(startW + 80);
    window.dispatchEvent(new MouseEvent('mouseup'));
  });

  describe('Composer-Leiste am unteren Rand', () => {
    it('hält den Rahmen frei, solange kein Aufsatz einen Chat mitbringt', () => {
      const { wrapper } = mountFrame();
      expect(wrapper.find('.w-composer').exists()).toBe(false);
    });

    it('hängt den Chat des Aufsatzes unten an das Fenster', () => {
      const desktop = useDesktopStore();
      const win = desktop.find(desktop.openSystem(EXPLORER_ID)!)!;
      const wrapper = mount(WindowFrame, {
        props: { win },
        slots: {
          default: '<div class="mein-inhalt">Inhalt</div>',
          composer: '<div class="mein-chat">Chat</div>',
        },
      });

      const bar = wrapper.get('.w-composer');
      expect(bar.get('.mein-chat').text()).toBe('Chat');
      // Er liegt im Rahmen, hinter dem Fensterkörper — nicht daneben.
      expect(wrapper.get('.w-body').element.nextElementSibling).toBe(bar.element);
    });
  });

  it('zeigt im Einzel-Modus keine Fensterknöpfe und keinen Ziehgriff', () => {
    const { wrapper } = mountFrame({ single: true });
    expect(wrapper.find('.w-max').exists()).toBe(false);
    expect(wrapper.find('.w-min').exists()).toBe(false);
    expect(wrapper.find('.w-close').exists()).toBe(false);
    expect(wrapper.find('.resize-handle').exists()).toBe(false);
    expect(wrapper.get('.window-frame').classes()).toContain('full');
    // Die Knöpfe des Aufsatzes bleiben dagegen erreichbar.
    expect(wrapper.find('.mein-knopf').exists()).toBe(true);
  });

  it('kehrt im Einzel-Modus über den Desktop-Knopf zum Desktop zurück', async () => {
    const { wrapper, desktop } = mountFrame({ single: true });

    const back = wrapper.get('.w-desktop');
    expect(back.text()).toContain('Desktop');
    await back.trigger('click');

    expect(desktop.showingDesktop).toBe(true);
    // Das Fenster bleibt offen — es liegt nur hinter dem Desktop.
    expect(desktop.windows).toHaveLength(1);
  });

  it('bewegt das Fenster im Einzel-Modus nicht per Ziehen der Titelleiste', async () => {
    const { wrapper, desktop, win } = mountFrame({ single: true });
    const startX = win.x;

    await wrapper.get('.titlebar').trigger('mousedown', { clientX: 200, clientY: 100 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 140 }));
    await wrapper.vm.$nextTick();

    expect(desktop.find(win.instanceId)!.x).toBe(startX);
  });

  describe('Kachel-Modus', () => {
    /** Ein Rahmen, dessen Platz aus dem Kachel-Baum kommt (siehe stores/desktop). */
    function mountTile() {
      useWorkspaceStore().uiMode = 'tiles';
      const desktop = useDesktopStore();
      desktop.setTileArea({ x: 0, y: 0, w: 1000, h: 600 });
      const id = desktop.openSystem(EXPLORER_ID)!;
      const win = desktop.find(id)!;
      const wrapper = mount(WindowFrame, { props: { win, tiled: true } });
      return { wrapper, desktop, win };
    }

    it('nimmt seinen Platz aus dem Baum, nicht aus der eigenen Geometrie', () => {
      const { wrapper, desktop, win } = mountTile();
      const rect = desktop.tileRects[win.instanceId];
      const style = wrapper.attributes('style') ?? '';

      expect(rect).toEqual({ x: 0, y: 0, w: 1000, h: 600 });
      expect(style).toContain(`left: ${rect.x}px`);
      expect(style).toContain(`top: ${rect.y}px`);
      expect(style).toContain(`width: ${rect.w}px`);
      expect(style).toContain(`height: ${rect.h}px`);
      expect(wrapper.get('.window-frame').classes()).toContain('tiled');
    });

    it('folgt jeder Änderung am Baum', async () => {
      const { wrapper, desktop, win } = mountTile();
      // Ein zweites Fenster teilt die Fläche — der Rahmen rückt nach.
      desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await wrapper.vm.$nextTick();

      const rect = desktop.tileRects[win.instanceId];
      expect(rect.w).toBeLessThan(1000);
      expect(wrapper.attributes('style')).toContain(`width: ${rect.w}px`);
    });

    it('lässt sich weder ziehen noch am Griff größer machen', async () => {
      const { wrapper, desktop, win } = mountTile();
      const before = desktop.tileRects[win.instanceId];

      expect(wrapper.find('.resize-handle').exists()).toBe(false);
      await wrapper.get('.titlebar').trigger('mousedown', { clientX: 200, clientY: 100 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300 }));
      await wrapper.vm.$nextTick();

      expect(desktop.tileRects[win.instanceId]).toEqual(before);
      expect(wrapper.attributes('style')).toContain(`left: ${before.x}px`);
    });

    /** Zwei gekachelte Rahmen nebeneinander — jeder mit seinem eigenen Fenster. */
    function mountTiles() {
      useWorkspaceStore().uiMode = 'tiles';
      const desktop = useDesktopStore();
      desktop.setTileArea({ x: 0, y: 0, w: 1000, h: 600 });
      const ids = [
        desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' }),
        desktop.openApp('editor-2', { title: 'Editor', icon: '📝' }),
      ];
      const frames = ids.map((id) =>
        mount(WindowFrame, { props: { win: desktop.find(id)!, tiled: true } }),
      );
      return { desktop, ids, frames };
    }

    /** Die Mitte einer Kachel — dorthin zeigt die Maus beim Tauschen. */
    function mitte(desktop: ReturnType<typeof useDesktopStore>, id: string) {
      const r = desktop.tileRects[id];
      return { clientX: r.x + r.w / 2, clientY: r.y + r.h / 2 };
    }

    it('trägt das Fenster an der Titelleiste auf eine andere Kachel und tauscht dort', async () => {
      const { desktop, ids, frames } = mountTiles();
      const [a, b] = ids;
      const vorher = { ...desktop.tileRects };

      await frames[0].get('.titlebar').trigger('mousedown', mitte(desktop, a));
      // Auf der eigenen Kachel gibt es noch nichts zu tauschen.
      expect(desktop.tileSwap).toEqual({ id: a, targetId: null });
      expect(frames[0].get('.window-frame').classes()).toContain('swapping');

      window.dispatchEvent(new MouseEvent('mousemove', mitte(desktop, b)));
      await frames[1].vm.$nextTick();
      // Die Zielkachel zeigt, wo das Fenster landet.
      expect(desktop.tileSwap).toEqual({ id: a, targetId: b });
      expect(frames[1].find('.drop-target').exists()).toBe(true);
      expect(frames[0].find('.drop-target').exists()).toBe(false);

      window.dispatchEvent(new MouseEvent('mouseup'));
      await frames[0].vm.$nextTick();

      expect(desktop.tileSwap).toBeNull();
      expect(desktop.tileRects[a]).toEqual(vorher[b]);
      expect(desktop.tileRects[b]).toEqual(vorher[a]);
      expect(frames[0].get('.window-frame').classes()).not.toContain('swapping');
      expect(frames[1].find('.drop-target').exists()).toBe(false);
    });

    it('deckt die Kacheln beim Tragen mit der Schutzschicht ab', async () => {
      const { desktop, ids, frames } = mountTiles();
      expect(frames[0].find('.drag-shield').exists()).toBe(false);

      await frames[0].get('.titlebar').trigger('mousedown', mitte(desktop, ids[0]));
      expect(frames[0].find('.drag-shield').exists()).toBe(true);

      window.dispatchEvent(new MouseEvent('mouseup'));
      await frames[0].vm.$nextTick();
      expect(frames[0].find('.drag-shield').exists()).toBe(false);
    });

    it('lässt über der eigenen Kachel alles, wie es war', async () => {
      const { desktop, ids, frames } = mountTiles();
      const vorher = { ...desktop.tileRects };

      await frames[0].get('.titlebar').trigger('mousedown', mitte(desktop, ids[1]));
      window.dispatchEvent(new MouseEvent('mousemove', mitte(desktop, ids[0])));
      window.dispatchEvent(new MouseEvent('mouseup'));
      await frames[0].vm.$nextTick();

      expect(desktop.tileRects).toEqual(vorher);
    });

    it('bricht das Tragen ab, wenn das Fenster mitten im Zug fortgeht', async () => {
      const { desktop, ids, frames } = mountTiles();

      await frames[0].get('.titlebar').trigger('mousedown', mitte(desktop, ids[0]));
      expect(desktop.tileSwap).not.toBeNull();

      frames[0].unmount();
      expect(desktop.tileSwap).toBeNull();
    });

    describe('Titelleiste weglegen (c0072)', () => {
      /** Eine Kachel in einem Verzeichnis, das seine Leisten weglegt. */
      function mountOhneLeiste({ tiled = true } = {}) {
        const ws = useWorkspaceStore();
        ws.uiMode = 'tiles';
        ws.folder = '/apps';
        ws.tileChromeHides = { '/apps': true };
        const desktop = useDesktopStore();
        desktop.setTileArea({ x: 0, y: 0, w: 1000, h: 600 });
        const id = desktop.openSystem(EXPLORER_ID)!;
        const wrapper = mount(WindowFrame, { props: { win: desktop.find(id)!, tiled } });
        return { wrapper, desktop };
      }

      it('trägt seine Leiste, solange die Einstellung sie nicht weglegt', () => {
        const { wrapper } = mountTile();
        expect(wrapper.get('.window-frame').classes()).not.toContain('chrome-hidden');
        expect(wrapper.find('.chrome-sensor').exists()).toBe(false);
      });

      it('legt die Leiste weg und holt sie am oberen Rand wieder hervor', async () => {
        const { wrapper } = mountOhneLeiste();
        const frame = () => wrapper.get('.window-frame').classes();

        expect(frame()).toContain('chrome-hidden');
        expect(frame()).toContain('chrome-away');
        // Sie ist nur weggelegt, nicht abgebaut — die Fensterknöpfe bleiben.
        expect(wrapper.find('.w-close').exists()).toBe(true);

        await wrapper.get('.chrome-sensor').trigger('mouseenter');
        expect(frame()).toContain('chrome-hidden');
        expect(frame()).not.toContain('chrome-away');

        await wrapper.get('.titlebar').trigger('mouseleave');
        expect(frame()).toContain('chrome-away');
      });

      it('behält die Leiste, solange das Fenster getragen wird', async () => {
        const { wrapper, desktop } = mountOhneLeiste();
        desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
        await wrapper.vm.$nextTick();

        await wrapper.get('.chrome-sensor').trigger('mouseenter');
        await wrapper.get('.titlebar').trigger('mousedown', { clientX: 100, clientY: 4 });
        // Der Zeiger verlässt die Leiste beim Tragen — sie bleibt trotzdem da.
        await wrapper.get('.titlebar').trigger('mouseleave');
        expect(wrapper.get('.window-frame').classes()).not.toContain('chrome-away');

        window.dispatchEvent(new MouseEvent('mouseup'));
        await wrapper.vm.$nextTick();
        expect(wrapper.get('.window-frame').classes()).toContain('chrome-away');
      });

      it('rührt die Leiste außerhalb des Kachel-Modus nicht an', () => {
        const { wrapper } = mountOhneLeiste({ tiled: false });
        expect(wrapper.get('.window-frame').classes()).not.toContain('chrome-hidden');
        expect(wrapper.find('.chrome-sensor').exists()).toBe(false);
      });
    });

    it('füllt maximiert die ganze Fläche und kehrt danach in die Kachel zurück', async () => {
      const { wrapper, desktop, win } = mountTile();
      desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await wrapper.vm.$nextTick();
      const tile = desktop.tileRects[win.instanceId];

      await wrapper.get('.w-max').trigger('click');
      expect(wrapper.get('.window-frame').classes()).toContain('full');

      await wrapper.get('.w-max').trigger('click');
      expect(wrapper.get('.window-frame').classes()).not.toContain('full');
      expect(wrapper.attributes('style')).toContain(`width: ${tile.w}px`);
    });
  });
});
