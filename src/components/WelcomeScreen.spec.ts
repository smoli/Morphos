import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import WelcomeScreen from './WelcomeScreen.vue';

describe('WelcomeScreen', () => {
  it('zeigt mehrere Beispiel-Chips', () => {
    const wrapper = mount(WelcomeScreen);
    expect(wrapper.findAll('.chip').length).toBeGreaterThanOrEqual(3);
  });

  it('emittiert pick mit dem Beispieltext beim Klick', async () => {
    const wrapper = mount(WelcomeScreen);
    const chip = wrapper.get('.chip');
    await chip.trigger('click');
    const emitted = wrapper.emitted('pick');
    expect(emitted).toBeTruthy();
    expect(typeof emitted![0][0]).toBe('string');
    expect((emitted![0][0] as string).length).toBeGreaterThan(0);
  });
});
