import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import DesktopView from './DesktopView.vue';
import WindowFrame from '@/components/WindowFrame.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useDesktopStore } from '@/stores/desktop';
import { setHost } from '@/services/host';
import type { AppSummary, MorphosHost } from '@/types';

const apps: AppSummary[] = [
  { id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 5, versions: 3 },
  { id: 'editor-2', name: 'Editor', icon: '📝', createdAt: 2, updatedAt: 9, versions: 1 },
];

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async () => ({ ok: true as const, files: [], html: '' })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    chooseAttachment: vi.fn(async () => ({ ok: false })),
    readClipboardImage: vi.fn(async () => ({ ok: false })),
    saveChat: vi.fn(async () => ({ ok: true })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => apps),
    loadApp: vi.fn(async () => null),
    saveApp: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    listVersions: vi.fn(async () => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...overrides,
  };
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/desktop', name: 'desktop', component: DesktopView },
      { path: '/app/new', name: 'app-new', component: { template: '<div>new</div>' } },
      { path: '/app/:id', name: 'app', component: { template: '<div>app</div>' } },
    ],
  });
}

describe('DesktopView', () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    setHost(makeHost());
    useWorkspaceStore().folder = '/apps';
  });

  async function mountView() {
    const router = makeRouter();
    router.push('/desktop');
    await router.isReady();
    const wrapper = mount(DesktopView, { global: { plugins: [pinia, router] } });
    await flushPromises();
    return { wrapper, router };
  }

  it('zeigt eine Kachel je App plus „Neue App“', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Rechner');
    expect(wrapper.text()).toContain('Editor');
    expect(wrapper.text()).toContain('Neue App');
    // 2 Apps + 1 Neu-Kachel
    expect(wrapper.findAll('.tile')).toHaveLength(3);
  });

  it('öffnet eine App als Fenster per Klick auf ihre Kachel', async () => {
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    const tile = wrapper.findAll('.tile').find((t) => t.text().includes('Rechner'))!;
    await tile.trigger('click');
    await flushPromises();
    expect(desktop.windows).toHaveLength(1);
    expect(desktop.windows[0].appId).toBe('rechner-1');
    expect(wrapper.findAllComponents(WindowFrame)).toHaveLength(1);
  });

  it('öffnet ein Entwurfsfenster über „Neue App“', async () => {
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    await wrapper.get('.tile.new').trigger('click');
    await flushPromises();
    expect(desktop.windows).toHaveLength(1);
    expect(desktop.windows[0].appId).toBeNull();
  });

  it('minimiert ein Fenster in den Dock und stellt es wieder her', async () => {
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    const tile = wrapper.findAll('.tile').find((t) => t.text().includes('Rechner'))!;
    await tile.trigger('click');
    await flushPromises();

    await wrapper.get('.w-min').trigger('click');
    await flushPromises();
    expect(wrapper.find('.dock').exists()).toBe(true);

    await wrapper.get('.dock-item').trigger('click');
    expect(desktop.windows[0].minimized).toBe(false);
  });

  it('enthält keine Einstellungs-Panels mehr (sie liegen im Einstellungs-Dialog)', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('.perms').exists()).toBe(false);
    expect(wrapper.find('.lib-add').exists()).toBe(false);
    expect(wrapper.find('.access-bar').exists()).toBe(false);
  });

  it('richtet die globale Promptleiste an das aktive Fenster (Entwurf, wenn keins offen)', async () => {
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    const spy = vi.spyOn(desktop, 'submitToActive').mockResolvedValue();

    // ChatDock unten absenden.
    await wrapper.get('textarea').setValue('Ein Spiel');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });

    expect(spy).toHaveBeenCalledWith('Ein Spiel', []);
  });

  it('zeigt im Einzel-Modus nur das aktive Fenster (Vollbild)', async () => {
    const ws = useWorkspaceStore();
    ws.uiMode = 'single';
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();

    desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
    await flushPromises();

    const frames = wrapper.findAllComponents(WindowFrame);
    expect(frames).toHaveLength(1);
    expect(frames[0].props('single')).toBe(true);
    expect(frames[0].props('win').appId).toBe('editor-2'); // das zuletzt fokussierte
  });
});
