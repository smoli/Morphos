import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from './App.vue';
import TopBar from '@/components/TopBar.vue';
import ToastStack from '@/components/ToastStack.vue';
import { useNotificationsStore } from '@/stores/notifications';

describe('App', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('rendert die Kopfleiste und die aktive Route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div class="home-marker">home</div>' } },
        { path: '/versions', name: 'versions', component: { template: '<div>versions</div>' } },
      ],
    });
    router.push('/');
    await router.isReady();

    const wrapper = mount(App, { global: { plugins: [router] } });
    expect(wrapper.findComponent(TopBar).exists()).toBe(true);
    expect(wrapper.find('.home-marker').exists()).toBe(true);
  });

  it('hängt den Meldungsstapel einmal für die ganze Schale ein', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'home', component: { template: '<div>home</div>' } }],
    });
    router.push('/');
    await router.isReady();

    const wrapper = mount(App, { global: { plugins: [router] } });
    expect(wrapper.findComponent(ToastStack).exists()).toBe(true);

    useNotificationsStore().success('Gespeichert');
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.toast').text()).toContain('Gespeichert');
  });
});
