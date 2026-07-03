import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import DesktopView from './DesktopView.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
import type { AppSummary, MorphosHost } from '@/types';

const apps: AppSummary[] = [
  { id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 5, versions: 3 },
  { id: 'editor-2', name: 'Editor', icon: '📝', createdAt: 2, updatedAt: 9, versions: 1 },
];

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async () => ({ ok: true as const, html: '' })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => apps),
    loadApp: vi.fn(async () => null),
    saveApp: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
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

  it('öffnet eine App per Klick auf ihre Kachel', async () => {
    const { wrapper, router } = await mountView();
    const tile = wrapper.findAll('.tile').find((t) => t.text().includes('Rechner'))!;
    await tile.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/app/rechner-1');
  });

  it('führt zur Entwurfsansicht über „Neue App“', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('.tile.new').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('app-new');
  });

  it('setzt eine Funktions-Berechtigung über die Berechtigungsliste', async () => {
    const { wrapper } = await mountView();
    const ws = useWorkspaceStore();
    expect(ws.permissionFor('write')).toBe('ask'); // Vorgabe

    const row = wrapper.findAll('.perms li').find((li) => li.text().includes('Datei schreiben'))!;
    const allowBtn = row.findAll('button').find((b) => b.text() === 'Erlauben')!;
    await allowBtn.trigger('click');

    expect(ws.permissionFor('write')).toBe('allow');
  });

  it('legt den Datenordner über die Zugriffsleiste fest', async () => {
    const host = makeHost({ chooseFolder: vi.fn(async () => ({ ok: true, path: '/daten' })) });
    setHost(host);
    const { wrapper } = await mountView();

    await wrapper.get('.access-btn').trigger('click');
    await flushPromises();

    expect(host.chooseFolder).toHaveBeenCalledOnce();
    expect(useWorkspaceStore().accessRoot).toBe('/daten');
    expect(wrapper.text()).toContain('/daten');
  });
});
