import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WorkspaceView from './WorkspaceView.vue';
import { useAppStore } from '@/stores/app';
import WelcomeScreen from '@/components/WelcomeScreen.vue';
import AppCanvas from '@/components/AppCanvas.vue';

describe('WorkspaceView', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('zeigt den Startbildschirm, solange keine App existiert', () => {
    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } });
    expect(wrapper.findComponent(WelcomeScreen).exists()).toBe(true);
    expect(wrapper.findComponent(AppCanvas).exists()).toBe(false);
  });

  it('zeigt die erzeugte App, sobald HTML vorhanden ist', () => {
    const store = useAppStore();
    store.currentHtml = '<!DOCTYPE html><html><body>x</body></html>';
    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } });
    expect(wrapper.findComponent(AppCanvas).exists()).toBe(true);
    expect(wrapper.findComponent(WelcomeScreen).exists()).toBe(false);
  });

  it('löst generate aus, wenn die Promptleiste absendet', async () => {
    const store = useAppStore();
    const spy = vi.spyOn(store, 'generate').mockResolvedValue();
    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } });

    await wrapper.get('input').setValue('Ein Spiel');
    await wrapper.get('form').trigger('submit.prevent');

    expect(spy).toHaveBeenCalledWith('Ein Spiel');
  });

  it('löst generate aus, wenn ein Beispiel gewählt wird', async () => {
    const store = useAppStore();
    const spy = vi.spyOn(store, 'generate').mockResolvedValue();
    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } });

    await wrapper.get('.chip').trigger('click');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('zeigt eine Fehlermeldung aus dem Store', () => {
    const store = useAppStore();
    store.error = 'Etwas ging schief';
    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } });
    expect(wrapper.text()).toContain('Etwas ging schief');
  });

  it('zeigt einen Ladezustand, während generiert wird', () => {
    const store = useAppStore();
    store.busy = true;
    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia] } });
    expect(wrapper.find('.loading').exists()).toBe(true);
  });
});
