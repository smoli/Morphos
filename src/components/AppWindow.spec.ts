import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AppWindow from './AppWindow.vue';
import WelcomeScreen from './WelcomeScreen.vue';
import IconDialog from './IconDialog.vue';
import DocsPanel from './DocsPanel.vue';
import { useAppWindow } from '@/stores/app';
import { useDesktopStore } from '@/stores/desktop';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
import type { AppData, GenerateResult, MorphosHost, SourceFile } from '@/types';

const DOC = (body: string, title = 'App', icon = '🧩'): string =>
  `<!DOCTYPE html><html><head><title>${title}</title><meta name="morphos:icon" content="${icon}"></head><body>${body}</body></html>`;
const FILES = (html: string): SourceFile[] => [{ path: 'src/index.html', content: html }];
/** Ein (winziges) Bild-Icon, wie es der Icon-Dialog ablegt. */
const IMAGE_ICON = `data:image/png;base64,${Buffer.alloc(60, 3).toString('base64')}`;

function appData(over: Partial<AppData> = {}): AppData {
  return {
    id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 2,
    files: FILES(DOC('calc')), html: DOC('calc'), chat: [], ...over,
  };
}

function makeHost(over: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, files: FILES(DOC('x', 'Rechner', '🧮')), html: DOC('x', 'Rechner', '🧮') })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    chooseAttachment: vi.fn(async () => ({ ok: false })),
    readClipboardImage: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
    loadApp: vi.fn(async () => appData()),
    saveApp: vi.fn(async () => ({ ok: true })),
    saveChat: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    setAppIcon: vi.fn(async (_f: string, _i: string, icon: string | null) => ({ ok: true, icon: icon ?? '🧩' })),
    listVersions: vi.fn(async () => [{ sha: 'v1', prompt: 'a', time: 1 }]),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...over,
  };
}

async function mountFrameForApp(over: Partial<MorphosHost> = {}) {
  setActivePinia(createPinia());
  setHost(makeHost(over));
  const workspace = useWorkspaceStore();
  workspace.folder = '/apps';
  const desktop = useDesktopStore();
  const id = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
  const win = desktop.windows.find((w) => w.instanceId === id)!;
  const wrapper = mount(AppWindow, { props: { win } });
  await flushPromises();
  return { wrapper, desktop, workspace, win };
}

async function mountSingleFrame(over: Partial<MorphosHost> = {}) {
  setActivePinia(createPinia());
  setHost(makeHost(over));
  const workspace = useWorkspaceStore();
  workspace.folder = '/apps';
  workspace.uiMode = 'single';
  const desktop = useDesktopStore();
  const id = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
  const win = desktop.windows.find((w) => w.instanceId === id)!;
  const wrapper = mount(AppWindow, { props: { win, single: true } });
  await flushPromises();
  return { wrapper, desktop, workspace, win };
}

describe('AppWindow', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('lädt die App und zeigt Name, Icon und die App im Canvas', async () => {
    const { wrapper } = await mountFrameForApp();
    expect(wrapper.get('.w-title').text()).toBe('Rechner');
    expect(wrapper.get('.w-icon').text()).toBe('🧮');
    expect(wrapper.find('iframe').exists()).toBe(true);
  });

  it('positioniert sich nach der Fenster-Geometrie', async () => {
    const { wrapper, win } = await mountFrameForApp();
    const style = wrapper.attributes('style') ?? '';
    expect(style).toContain(`${win.x}px`);
    expect(style).toContain(`${win.w}px`);
  });

  it('schließt das Fenster über den Schließen-Knopf', async () => {
    const { wrapper, desktop } = await mountFrameForApp();
    await wrapper.get('.w-close').trigger('click');
    expect(desktop.windows).toHaveLength(0);
  });

  it('minimiert das Fenster', async () => {
    const { wrapper, desktop, win } = await mountFrameForApp();
    await wrapper.get('.w-min').trigger('click');
    expect(desktop.windows.find((w) => w.instanceId === win.instanceId)!.minimized).toBe(true);
  });

  it('holt sich beim Anklicken den Fokus (nach vorn)', async () => {
    const { wrapper, desktop, win } = await mountFrameForApp();
    // Ein weiteres Fenster in den Vordergrund bringen.
    const other = desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
    expect(desktop.focusedId).toBe(other);
    await wrapper.trigger('mousedown');
    expect(desktop.focusedId).toBe(win.instanceId);
  });

  it('zeigt die Versionen über den Versionsknopf an', async () => {
    const { wrapper } = await mountFrameForApp();
    expect(wrapper.find('.w-versions-panel').exists()).toBe(false);
    await wrapper.get('.w-versions').trigger('click');
    expect(wrapper.find('.w-versions-panel').exists()).toBe(true);
    expect(wrapper.find('.w-versions-panel').text()).toContain('a');
  });

  describe('Dokumente aus der Titelleiste', () => {
    const DOCS = { concept: '# Rechner\n\nRechnet.', userdoc: '# Anleitung\n\nZahl tippen.' };

    it('öffnet Konzept und Anleitung als Nur-Lese-Ansicht', async () => {
      const { wrapper } = await mountFrameForApp({
        loadApp: vi.fn(async () => appData({ docs: DOCS })),
      });
      expect(wrapper.findComponent(DocsPanel).exists()).toBe(false);

      await wrapper.get('.w-docs').trigger('click');

      const panel = wrapper.getComponent(DocsPanel);
      expect(panel.props('docs')).toEqual(DOCS);
      expect(panel.text()).toContain('Rechnet.');
      // Nur lesen — nichts zum Bearbeiten.
      expect(panel.find('textarea').exists()).toBe(false);
    });

    it('legt Dokumente und Versionen nicht übereinander', async () => {
      const { wrapper } = await mountFrameForApp({
        loadApp: vi.fn(async () => appData({ docs: DOCS })),
      });
      await wrapper.get('.w-versions').trigger('click');
      await wrapper.get('.w-docs').trigger('click');

      expect(wrapper.findComponent(DocsPanel).exists()).toBe(true);
      expect(wrapper.find('.w-versions-panel').exists()).toBe(false);
    });

    it('bietet einem Entwurf (noch ohne App) keine Dokumente an', async () => {
      setActivePinia(createPinia());
      setHost(makeHost());
      useWorkspaceStore().folder = '/apps';
      const desktop = useDesktopStore();
      const id = desktop.openDraft();
      const win = desktop.windows.find((w) => w.instanceId === id)!;
      const wrapper = mount(AppWindow, { props: { win } });
      await flushPromises();

      expect(wrapper.find('.w-docs').exists()).toBe(false);
    });
  });

  it('verschiebt das Fenster per Ziehen der Titelleiste (mit Schutzschicht)', async () => {
    const { wrapper, desktop, win } = await mountFrameForApp();
    const startX = win.x;
    await wrapper.get('.titlebar').trigger('mousedown', { clientX: 200, clientY: 100 });
    expect(wrapper.find('.drag-shield').exists()).toBe(true);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 140 }));
    await wrapper.vm.$nextTick();
    const moved = desktop.windows.find((w) => w.instanceId === win.instanceId)!;
    expect(moved.x).toBe(startX + 60);
    window.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.drag-shield').exists()).toBe(false);
  });

  it('macht aus einem Entwurf beim ersten Generieren eine echte App (Fenster-Meta)', async () => {
    setActivePinia(createPinia());
    setHost(makeHost());
    const workspace = useWorkspaceStore();
    workspace.folder = '/apps';
    const desktop = useDesktopStore();
    const id = desktop.openDraft();
    const win = desktop.windows.find((w) => w.instanceId === id)!;
    const wrapper = mount(AppWindow, { props: { win } });
    await flushPromises();

    expect(win.appId).toBeNull();

    // Der WelcomeScreen eines leeren Entwurfs generiert über die zentrale Orchestrierung.
    wrapper.findComponent(WelcomeScreen).vm.$emit('pick', 'Ein Rechner');
    await flushPromises();

    expect(win.appId).not.toBeNull();
    expect(win.title).toBe('Rechner');
  });

  it('maximiert und stellt über den Maximieren-Knopf wieder her', async () => {
    const { wrapper, desktop, win } = await mountFrameForApp();
    await wrapper.get('.w-max').trigger('click');
    expect(desktop.find(win.instanceId)!.maximized).toBe(true);
    expect(wrapper.get('.window-frame').classes()).toContain('full');
    await wrapper.get('.w-max').trigger('click');
    expect(desktop.find(win.instanceId)!.maximized).toBe(false);
  });

  it('zeigt im Einzel-Modus keine Fensterknöpfe und keinen Ziehgriff', async () => {
    const { wrapper } = await mountSingleFrame();

    expect(wrapper.find('.w-max').exists()).toBe(false);
    expect(wrapper.find('.w-min').exists()).toBe(false);
    expect(wrapper.find('.w-close').exists()).toBe(false);
    expect(wrapper.find('.resize-handle').exists()).toBe(false);
    expect(wrapper.get('.window-frame').classes()).toContain('full');
  });

  it('kehrt im Einzel-Modus über den Desktop-Knopf zum Desktop zurück', async () => {
    const { wrapper, desktop } = await mountSingleFrame();

    const back = wrapper.get('.w-desktop');
    expect(back.text()).toContain('Desktop');
    await back.trigger('click');

    expect(desktop.showingDesktop).toBe(true);
    // Das Fenster bleibt offen — es liegt nur hinter dem Desktop.
    expect(desktop.windows).toHaveLength(1);
  });

  it('führt in der Warteanzeige den laufenden Schritt und die Laufzeit vor', async () => {
    const { wrapper, win } = await mountFrameForApp();
    expect(wrapper.find('.w-loading').exists()).toBe(false);

    const store = useAppWindow(win.instanceId);
    store.busy = true;
    store.runStartedAt = Date.now() - 65_000;
    store.activity = [{ kind: 'start' }, { kind: 'tool', name: 'Read', detail: 'src/index.html' }];
    await wrapper.vm.$nextTick();

    const loading = wrapper.get('.w-loading');
    expect(loading.text()).toContain('Die Änderung wird umgesetzt');
    expect(loading.get('.w-step').text()).toContain('Read: src/index.html');
    expect(loading.get('.w-elapsed').text()).toBe('1:05');
  });

  it('bleibt in der Warteanzeige beim allgemeinen Hinweis, solange nichts gemeldet wurde', async () => {
    const { wrapper, win } = await mountFrameForApp();

    const store = useAppWindow(win.instanceId);
    store.busy = true;
    store.runStartedAt = Date.now();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.w-step').text()).toContain('Der Agent arbeitet');
  });

  it('zeigt den Desktop-Knopf im Fenster-Modus nicht', async () => {
    const { wrapper } = await mountFrameForApp();
    expect(wrapper.find('.w-desktop').exists()).toBe(false);
  });

  describe('Lebensdauer des Instanz-Zustands', () => {
    it('behält den Store, wenn nur die Ansicht verschwindet (das Fenster bleibt offen)', async () => {
      const { wrapper, win } = await mountSingleFrame();
      const store = useAppWindow(win.instanceId);
      store.busy = true;
      store.activity = [{ kind: 'tool', name: 'Read', detail: 'src/index.html' }];

      wrapper.unmount();

      // Dasselbe Fenster erneut anzeigen: derselbe Store, unverändert.
      const again = useAppWindow(win.instanceId);
      expect(again).toBe(store);
      expect(again.busy).toBe(true);
      expect(again.activity).toHaveLength(1);
      expect(again.id).toBe('rechner-1');
    });

    it('gibt den Store frei, sobald das Fenster wirklich geschlossen ist', async () => {
      const { wrapper, desktop, win } = await mountSingleFrame();
      const store = useAppWindow(win.instanceId);
      desktop.closeWindow(win.instanceId);

      wrapper.unmount();

      expect(useAppWindow(win.instanceId)).not.toBe(store);
    });

    it('lädt eine bereits geladene App beim erneuten Anzeigen nicht noch einmal', async () => {
      const loadApp = vi.fn(async () => appData());
      const { wrapper, win } = await mountSingleFrame({ loadApp });
      expect(loadApp).toHaveBeenCalledTimes(1);

      wrapper.unmount();
      const again = mount(AppWindow, { props: { win, single: true } });
      await flushPromises();

      expect(loadApp).toHaveBeenCalledTimes(1);
      expect(again.get('.w-title').text()).toBe('Rechner');
    });
  });

  describe('Icon aus der Titelleiste', () => {
    it('öffnet über das Icon den Dialog und setzt das gewählte Icon', async () => {
      const host = makeHost();
      const { wrapper, desktop, win } = await mountFrameForApp(host);

      await wrapper.get('.w-icon-btn').trigger('click');
      const dialog = wrapper.getComponent(IconDialog);
      expect(dialog.props('name')).toBe('Rechner');

      dialog.vm.$emit('apply', '🎯');
      await flushPromises();

      expect(host.setAppIcon).toHaveBeenCalledWith('/apps', 'rechner-1', '🎯');
      expect(wrapper.get('.w-icon').text()).toBe('🎯');
      expect(desktop.find(win.instanceId)!.icon).toBe('🎯');
      expect(wrapper.findComponent(IconDialog).exists()).toBe(false);
    });

    it('zeigt ein Bild-Icon in der Titelleiste als Bild', async () => {
      const { wrapper } = await mountFrameForApp({
        loadApp: vi.fn(async () => appData({ icon: IMAGE_ICON, iconCustom: true })),
      });
      expect(wrapper.get('.w-icon img').attributes('src')).toBe(IMAGE_ICON);
    });

    it('bietet einem Entwurf (noch ohne App) keinen Icon-Dialog an', async () => {
      setActivePinia(createPinia());
      setHost(makeHost());
      useWorkspaceStore().folder = '/apps';
      const desktop = useDesktopStore();
      const id = desktop.openDraft();
      const win = desktop.windows.find((w) => w.instanceId === id)!;
      const wrapper = mount(AppWindow, { props: { win } });
      await flushPromises();

      expect(wrapper.find('.w-icon-btn').exists()).toBe(false);
      expect(wrapper.get('.w-icon').text()).toBe('🧩');
    });
  });

  it('bewegt das Fenster im Einzel-Modus nicht per Ziehen der Titelleiste', async () => {
    const { wrapper, desktop, win } = await mountSingleFrame();
    const startX = win.x;
    await wrapper.get('.titlebar').trigger('mousedown', { clientX: 200, clientY: 100 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 140 }));
    await wrapper.vm.$nextTick();
    expect(desktop.find(win.instanceId)!.x).toBe(startX);
  });
});
