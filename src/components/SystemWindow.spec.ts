import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SystemWindow from './SystemWindow.vue';
import WindowFrame from './WindowFrame.vue';
import ExplorerPanel from './ExplorerPanel.vue';
import { useDesktopStore } from '@/stores/desktop';
import { useWorkspaceStore } from '@/stores/workspace';
import { EXPLORER_ID, systemWindow } from '@/core/system';
import type { DesktopWindow } from '@/stores/desktop';

function mountSystem(win: DesktopWindow, single = false) {
  return mount(SystemWindow, { props: { win, single } });
}

describe('SystemWindow', () => {
  let desktop: ReturnType<typeof useDesktopStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    useWorkspaceStore().folder = '/apps';
    desktop = useDesktopStore();
  });

  /** Das Explorer-Fenster, wie der Desktop es öffnet. */
  function explorerWindow(): DesktopWindow {
    return desktop.find(desktop.openSystem(EXPLORER_ID)!)!;
  }

  it('zeigt den Datei-Explorer im gewöhnlichen Fensterrahmen', () => {
    const wrapper = mountSystem(explorerWindow());

    expect(wrapper.findComponent(WindowFrame).exists()).toBe(true);
    expect(wrapper.findComponent(ExplorerPanel).exists()).toBe(true);
    expect(wrapper.get('.w-title').text()).toBe(systemWindow(EXPLORER_ID)!.title);
    expect(wrapper.get('.w-icon').text()).toBe(systemWindow(EXPLORER_ID)!.icon);
  });

  it('zeigt keine App: kein Canvas, kein Willkommensbildschirm, keine Versionen', () => {
    const wrapper = mountSystem(explorerWindow());

    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('.w-versions').exists()).toBe(false);
    expect(wrapper.find('.w-docs').exists()).toBe(false);
    expect(wrapper.find('.w-icon-btn').exists()).toBe(false);
  });

  it('trägt dieselben Fensterknöpfe wie ein App-Fenster', async () => {
    const win = explorerWindow();
    const wrapper = mountSystem(win);

    await wrapper.get('.w-min').trigger('click');
    expect(desktop.find(win.instanceId)!.minimized).toBe(true);

    await wrapper.get('.w-max').trigger('click');
    expect(desktop.find(win.instanceId)!.maximized).toBe(true);

    await wrapper.get('.w-close').trigger('click');
    expect(desktop.windows).toHaveLength(0);
  });

  it('füllt im Einzel-Modus die Fläche und bietet den Weg zurück zum Desktop', async () => {
    useWorkspaceStore().uiMode = 'single';
    const wrapper = mountSystem(explorerWindow(), true);

    expect(wrapper.get('.window-frame').classes()).toContain('full');
    expect(wrapper.find('.w-close').exists()).toBe(false);

    await wrapper.get('.w-desktop').trigger('click');
    expect(desktop.showingDesktop).toBe(true);
  });

  it('bleibt bei einer unbekannten Ansicht ein leeres Fenster', () => {
    const win = { ...explorerWindow(), systemId: 'gibt-es-nicht' };
    const wrapper = mountSystem(win);

    expect(wrapper.findComponent(ExplorerPanel).exists()).toBe(false);
    expect(wrapper.get('.sys-unknown').text()).toContain('Ansicht');
  });
});
