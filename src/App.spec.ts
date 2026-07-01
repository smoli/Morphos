import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from './App.vue';
import TopBar from '@/components/TopBar.vue';

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
});
