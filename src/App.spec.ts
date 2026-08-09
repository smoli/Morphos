import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from './App.vue';
import TopBar from '@/components/TopBar.vue';
import ToastStack from '@/components/ToastStack.vue';
import { useNotificationsStore } from '@/stores/notifications';
import { useDesktopStore } from '@/stores/desktop';
import { SETTINGS_ID } from '@/core/system';

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

  it('öffnet die Einstellungen als Fenster des Desktops, nicht als Dialog', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'home', component: { template: '<div>home</div>' } }],
    });
    router.push('/');
    await router.isReady();

    const wrapper = mount(App, { global: { plugins: [router] } });
    const desktop = useDesktopStore();
    expect(desktop.windows).toEqual([]);

    // So kommt der Wunsch aus der Kopfleiste (⚙) an.
    wrapper.getComponent(TopBar).vm.$emit('open-settings');
    await wrapper.vm.$nextTick();

    expect(desktop.windows).toHaveLength(1);
    expect(desktop.windows[0]).toMatchObject({ kind: 'system', systemId: SETTINGS_ID, appId: null });
    // Nichts liegt über der Schale — das Fenster zeichnet der Desktop.
    expect(wrapper.find('.backdrop').exists()).toBe(false);
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
