import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import ToastStack from './ToastStack.vue';
import { useNotificationsStore } from '@/stores/notifications';

describe('ToastStack', () => {
  let pinia: Pinia;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  const mountIt = () => mount(ToastStack, { global: { plugins: [pinia] } });

  it('zeigt ohne Meldung nichts an', () => {
    const wrapper = mountIt();
    expect(wrapper.find('.toasts').exists()).toBe(false);
  });

  it('stapelt die Meldungen des Stores in ihrer Reihenfolge', async () => {
    const notes = useNotificationsStore();
    const wrapper = mountIt();

    notes.info('Erste');
    notes.success('Zweite');
    await wrapper.vm.$nextTick();

    const toasts = wrapper.findAll('.toast');
    expect(toasts).toHaveLength(2);
    expect(toasts[0].text()).toContain('Erste');
    expect(toasts[0].classes()).toContain('info');
    expect(toasts[1].text()).toContain('Zweite');
    expect(toasts[1].classes()).toContain('success');
  });

  it('meldet einen Fehler als Warnung an die Vorlesehilfe', async () => {
    const notes = useNotificationsStore();
    const wrapper = mountIt();

    notes.error('Das ging schief');
    await wrapper.vm.$nextTick();

    const toast = wrapper.get('.toast');
    expect(toast.classes()).toContain('error');
    expect(toast.attributes('role')).toBe('alert');
  });

  it('klickt eine Meldung weg', async () => {
    const notes = useNotificationsStore();
    notes.info('Erste');
    notes.info('Zweite');
    const wrapper = mountIt();

    await wrapper.findAll('.toast')[0].get('.toast-close').trigger('click');

    expect(notes.toasts.map((t) => t.text)).toEqual(['Zweite']);
    expect(wrapper.findAll('.toast')).toHaveLength(1);
  });

  it('verschwindet, sobald die letzte Meldung weg ist', async () => {
    const notes = useNotificationsStore();
    notes.info('Erste');
    const wrapper = mountIt();
    expect(wrapper.find('.toasts').exists()).toBe(true);

    notes.clear();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.toasts').exists()).toBe(false);
  });
});
