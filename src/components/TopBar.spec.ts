import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import TopBar from './TopBar.vue';
import { useAppStore } from '@/stores/app';
import { useWorkspaceStore } from '@/stores/workspace';

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'start', component: { template: '<div />' } },
      { path: '/desktop', name: 'desktop', component: { template: '<div />' } },
      { path: '/app/new', name: 'app-new', component: { template: '<div />' } },
      { path: '/app/:id', name: 'app', component: { template: '<div />' } },
      { path: '/app/:id/versions', name: 'versions', component: { template: '<div />' } },
    ],
  });
}

describe('TopBar', () => {
  let pinia: Pinia;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('zeigt den Namen der Anwendung', async () => {
    const router = makeRouter();
    router.push('/desktop');
    await router.isReady();
    const wrapper = mount(TopBar, { global: { plugins: [pinia, router] } });
    expect(wrapper.text()).toContain('Morphos');
  });

  it('zeigt in einer App deren Namen und die Versionsanzahl', async () => {
    const store = useAppStore();
    store.id = 'rechner-1';
    store.name = 'Rechner';
    store.icon = '🧮';
    store.history = [
      { id: 'v1', prompt: 'a', html: '<html>1</html>', time: 1 },
      { id: 'v2', prompt: 'b', html: '<html>2</html>', time: 2 },
    ];
    const router = makeRouter();
    router.push('/app/rechner-1');
    await router.isReady();

    const wrapper = mount(TopBar, { global: { plugins: [pinia, router] } });
    expect(wrapper.text()).toContain('Rechner');
    expect(wrapper.text()).toContain('2');
    expect(wrapper.text()).toContain('Desktop');
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
});
