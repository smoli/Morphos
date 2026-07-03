import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { nextTick } from 'vue';
import WorkspaceView from './WorkspaceView.vue';
import { useAppStore } from '@/stores/app';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
import type { AppData, MorphosHost } from '@/types';
import WelcomeScreen from '@/components/WelcomeScreen.vue';
import AppCanvas from '@/components/AppCanvas.vue';

const existingHtml = '<!DOCTYPE html><html><body>doc</body></html>';
const existing: AppData = {
  id: 'editor-1',
  name: 'Editor',
  icon: '📝',
  createdAt: 1,
  updatedAt: 2,
  files: [{ path: 'src/index.html', content: existingHtml }],
  html: existingHtml,
};

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async () => ({ ok: true as const, files: [], html: '<html></html>' })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
    loadApp: vi.fn(async () => existing),
    saveApp: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    listVersions: vi.fn(async () => [{ sha: 'v1', prompt: 'a', time: 1 }]),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...overrides,
  };
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'start', component: { template: '<div />' } },
      { path: '/desktop', name: 'desktop', component: { template: '<div />' } },
      { path: '/app/new', name: 'app-new', component: WorkspaceView },
      { path: '/app/:id', name: 'app', component: WorkspaceView },
    ],
  });
}

describe('WorkspaceView', () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    setHost(makeHost());
    useWorkspaceStore().folder = '/apps';
  });

  afterEach(() => vi.restoreAllMocks());

  async function mountAt(path: string) {
    const router = makeRouter();
    router.push(path);
    await router.isReady();
    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia, router] } });
    await flushPromises();
    return { wrapper, router };
  }

  it('zeigt bei einem Entwurf den Startbildschirm', async () => {
    const { wrapper } = await mountAt('/app/new');
    expect(wrapper.findComponent(WelcomeScreen).exists()).toBe(true);
    expect(wrapper.findComponent(AppCanvas).exists()).toBe(false);
  });

  it('lädt eine bestehende App und zeigt sie an', async () => {
    const { wrapper } = await mountAt('/app/editor-1');
    expect(wrapper.findComponent(AppCanvas).exists()).toBe(true);
    expect(useAppStore().currentHtml).toContain('doc');
  });

  it('löst generate aus, wenn die Promptleiste absendet', async () => {
    const { wrapper } = await mountAt('/app/new');
    const store = useAppStore();
    const spy = vi.spyOn(store, 'generate').mockResolvedValue();

    await wrapper.get('input').setValue('Ein Spiel');
    await wrapper.get('form').trigger('submit.prevent');

    expect(spy).toHaveBeenCalledWith('Ein Spiel');
  });

  it('löst generate aus, wenn ein Beispiel gewählt wird', async () => {
    const { wrapper } = await mountAt('/app/new');
    const store = useAppStore();
    const spy = vi.spyOn(store, 'generate').mockResolvedValue();

    await wrapper.get('.chip').trigger('click');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('zeigt eine Fehlermeldung aus dem Store', async () => {
    const { wrapper } = await mountAt('/app/new');
    useAppStore().error = 'Etwas ging schief';
    await nextTick();
    expect(wrapper.text()).toContain('Etwas ging schief');
  });

  it('zeigt einen Ladezustand, während generiert wird', async () => {
    const { wrapper } = await mountAt('/app/new');
    useAppStore().busy = true;
    await nextTick();
    expect(wrapper.find('.loading').exists()).toBe(true);
  });
});
