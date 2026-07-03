import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import StartView from './StartView.vue';
import { setHost } from '@/services/host';
import type { MorphosHost } from '@/types';

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async () => ({ ok: true as const, files: [], html: '' })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: ['C:/Apps/Alpha', 'C:/Apps/Beta'], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
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
      { path: '/', name: 'start', component: StartView },
      { path: '/desktop', name: 'desktop', component: { template: '<div>desktop</div>' } },
    ],
  });
}

describe('StartView', () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  async function mountView(host: MorphosHost) {
    setHost(host);
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(StartView, { global: { plugins: [pinia, router] } });
    await flushPromises();
    return { wrapper, router };
  }

  it('listet die zuletzt genutzten Ordner', async () => {
    const { wrapper } = await mountView(makeHost());
    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.text()).toContain('Beta');
    expect(wrapper.findAll('.folder')).toHaveLength(2);
  });

  it('öffnet einen zuletzt genutzten Ordner und wechselt zum Desktop', async () => {
    const { wrapper, router } = await mountView(makeHost());
    await wrapper.findAll('.folder')[0].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/desktop');
  });

  it('öffnet über „Ordner öffnen“ den nativen Dialog', async () => {
    const host = makeHost({ chooseFolder: vi.fn(async () => ({ ok: true, path: '/gewaehlt' })) });
    const { wrapper, router } = await mountView(host);
    await wrapper.get('.open').trigger('click');
    await flushPromises();
    expect(host.chooseFolder).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe('/desktop');
  });

  it('zeigt einen Hinweis, wenn noch keine Ordner bekannt sind', async () => {
    const { wrapper } = await mountView(makeHost({ loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })) }));
    expect(wrapper.find('.empty').exists()).toBe(true);
  });
});
