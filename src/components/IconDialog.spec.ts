import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import IconDialog from './IconDialog.vue';

const IMAGE = `data:image/png;base64,${Buffer.alloc(60, 3).toString('base64')}`;

function mountDialog(props: Partial<{ name: string; icon: string; custom: boolean }> = {}) {
  return mount(IconDialog, { props: { name: 'Rechner', icon: '🧮', ...props } });
}

describe('IconDialog', () => {
  it('zeigt das aktuelle Icon der App', () => {
    const wrapper = mountDialog({ icon: IMAGE });
    expect(wrapper.get('.current img').attributes('src')).toBe(IMAGE);
  });

  it('meldet ein eingegebenes Emoji — auf genau ein Zeichen gekürzt', async () => {
    const wrapper = mountDialog();
    await wrapper.get('.emoji-input').setValue(' 🎯abc ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply')).toEqual([['🎯']]);
  });

  it('meldet nichts und erklärt, wenn die Eingabe kein Zeichen hergibt', async () => {
    const wrapper = mountDialog();
    await wrapper.get('.emoji-input').setValue('   ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply')).toBeUndefined();
    expect(wrapper.get('.error').text()).toMatch(/Zeichen/);
  });

  it('setzt mit null auf die Vorgabe zurück — nur bei eigenem Icon', async () => {
    const vorgabe = mountDialog({ custom: false });
    expect(vorgabe.get('.foot button').attributes('disabled')).toBeDefined();

    const eigen = mountDialog({ custom: true });
    await eigen.get('.foot button').trigger('click');
    expect(eigen.emitted('apply')).toEqual([[null]]);
  });

  it('lehnt einen unpassenden Dateityp ab', async () => {
    const wrapper = mountDialog();
    const input = wrapper.get('input[type="file"]');
    const file = new File(['x'], 'notiz.pdf', { type: 'application/pdf' });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });

    await input.trigger('change');
    expect(wrapper.get('.error').text()).toMatch(/nicht unterstützt/);
    expect(wrapper.emitted('apply')).toBeUndefined();
  });

  it('lässt sich schließen', async () => {
    const wrapper = mountDialog();
    await wrapper.get('.close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
