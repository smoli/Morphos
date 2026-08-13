import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import TopBar from './TopBar.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
import type { MorphosHost } from '@/types';

function makeHost(over: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async () => ({ ok: true as const, files: [], html: '' })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    chooseAttachment: vi.fn(async () => ({ ok: false })),
    readClipboardImage: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
    loadApp: vi.fn(async () => null),
    saveChat: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    setAppIcon: vi.fn(async (_f: string, _i: string, icon: string | null) => ({ ok: true, icon: icon ?? '🧩' })),
    listVersions: vi.fn(async () => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...over,
  };
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'start', component: { template: '<div />' } },
      { path: '/desktop', name: 'desktop', component: { template: '<div />' } },
    ],
  });
}

describe('TopBar', () => {
  let pinia: Pinia;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    setHost(makeHost());
  });

  async function mountDesktop(host?: MorphosHost) {
    if (host) setHost(host);
    const ws = useWorkspaceStore();
    ws.folder = '/apps';
    const router = makeRouter();
    router.push('/desktop');
    await router.isReady();
    return mount(TopBar, { global: { plugins: [pinia, router] } });
  }

  it('zeigt den Namen der Anwendung', async () => {
    const router = makeRouter();
    router.push('/desktop');
    await router.isReady();
    const wrapper = mount(TopBar, { global: { plugins: [pinia, router] } });
    expect(wrapper.text()).toContain('Morphos');
  });

  it('zeigt auf dem Desktop den Ordnernamen', async () => {
    const ws = useWorkspaceStore();
    ws.folder = 'C:/Users/me/MeineApps';
    const router = makeRouter();
    router.push('/desktop');
    await router.isReady();

    const wrapper = mount(TopBar, { global: { plugins: [pinia, router] } });
    expect(wrapper.text()).toContain('MeineApps');
  });

  // Die Darstellung wählt man in den Einstellungen (c0069) — nicht mehr hier.
  it('trägt keinen Umschalter für die Darstellung mehr', async () => {
    const wrapper = await mountDesktop();
    expect(wrapper.find('.mode-switch').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Kacheln');
  });

  it('meldet den Wunsch nach den Einstellungen', async () => {
    const wrapper = await mountDesktop();
    await wrapper.get('.settings').trigger('click');
    expect(wrapper.emitted('open-settings')).toBeTruthy();
  });

  it('zeigt unter macOS keine eigenen Fensterknöpfe (native Ampel) und lässt Platz', async () => {
    const wrapper = await mountDesktop(makeHost({ platform: 'darwin' }));
    expect(wrapper.find('.win-controls').exists()).toBe(false);
    expect(wrapper.get('.topbar').classes()).toContain('mac');
  });

  it('zeigt unter Windows/Linux eigene Fensterknöpfe', async () => {
    const wrapper = await mountDesktop(makeHost({ platform: 'win32' }));
    expect(wrapper.find('.win-controls').exists()).toBe(true);
    expect(wrapper.get('.topbar').classes()).not.toContain('mac');
  });

  it('steuert das rahmenlose Fenster (minimieren/maximieren/schließen)', async () => {
    const host = makeHost({
      minimizeWindow: vi.fn(async () => {}),
      toggleMaximizeWindow: vi.fn(async () => {}),
      closeWindow: vi.fn(async () => {}),
      isWindowMaximized: vi.fn(async () => false),
      onWindowMaximize: vi.fn(() => () => {}),
    });
    const wrapper = await mountDesktop(host);

    const [minB, maxB, closeB] = wrapper.findAll('.win-btn');
    await minB.trigger('click');
    await maxB.trigger('click');
    await closeB.trigger('click');

    expect(host.minimizeWindow).toHaveBeenCalled();
    expect(host.toggleMaximizeWindow).toHaveBeenCalled();
    expect(host.closeWindow).toHaveBeenCalled();
  });
});
