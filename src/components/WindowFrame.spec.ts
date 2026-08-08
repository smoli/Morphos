import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WindowFrame from './WindowFrame.vue';
import { useDesktopStore } from '@/stores/desktop';
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
});
