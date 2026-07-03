import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import VersionsView from './VersionsView.vue';
import { useAppStore } from '@/stores/app';
import type { HistoryEntry } from '@/types';

const entries: HistoryEntry[] = [
  { id: 'a', prompt: 'erste Idee', html: '<html>1</html>', time: 1 },
  { id: 'b', prompt: 'zweite Idee', html: '<html>2</html>', time: 2 },
];

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/:id', name: 'app', component: { template: '<div>app</div>' } },
      { path: '/app/:id/versions', name: 'versions', component: VersionsView },
    ],
  });
}

describe('VersionsView', () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('listet die Versionen aus dem Store', async () => {
    const store = useAppStore();
    store.id = 'app1';
    store.history = entries;
    store.activeId = 'b';
    const router = makeRouter();
    router.push('/app/app1/versions');
    await router.isReady();

    const wrapper = mount(VersionsView, { global: { plugins: [pinia, router] } });
    expect(wrapper.findAll('li')).toHaveLength(2);
  });

  it('springt bei Auswahl zurück und navigiert zur App', async () => {
    const store = useAppStore();
    store.id = 'app1';
    store.history = entries;
    store.activeId = 'b';
    const revert = vi.spyOn(store, 'revertTo');
    const router = makeRouter();
    router.push('/app/app1/versions');
    await router.isReady();

    const wrapper = mount(VersionsView, { global: { plugins: [pinia, router] } });
    const first = wrapper.findAll('li').find((li) => li.text().includes('erste Idee'))!;
    await first.trigger('click');
    await flushPromises();

    expect(revert).toHaveBeenCalledWith('a');
    expect(router.currentRoute.value.path).toBe('/app/app1');
  });
});
