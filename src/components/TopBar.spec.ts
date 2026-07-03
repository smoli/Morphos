import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import TopBar from './TopBar.vue';
import { useWorkspaceStore } from '@/stores/workspace';

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
  });

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
});
