import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PromptBar from './PromptBar.vue';

describe('PromptBar', () => {
  it('sendet den getrimmten Text beim Absenden und leert das Feld', async () => {
    const wrapper = mount(PromptBar, { props: { busy: false } });
    const input = wrapper.get('input');
    await input.setValue('  Ein Editor  ');
    await wrapper.get('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toBeTruthy();
    expect(wrapper.emitted('submit')![0]).toEqual(['Ein Editor']);
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('sendet nichts bei leerer Eingabe', async () => {
    const wrapper = mount(PromptBar, { props: { busy: false } });
    await wrapper.get('input').setValue('   ');
    await wrapper.get('form').trigger('submit.prevent');
    expect(wrapper.emitted('submit')).toBeFalsy();
  });

  it('deaktiviert die Steuerung während busy', () => {
    const wrapper = mount(PromptBar, { props: { busy: true } });
    expect((wrapper.get('button').element as HTMLButtonElement).disabled).toBe(true);
    expect((wrapper.get('input').element as HTMLInputElement).disabled).toBe(true);
  });
});
