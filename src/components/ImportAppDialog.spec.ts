import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ImportAppDialog from './ImportAppDialog.vue';
import type { ImportCollision } from '@/types';

const COLLISION: ImportCollision = {
  token: 'import-1',
  id: 'rechner-ab12c',
  name: 'Rechner',
  existingName: 'Mein Rechner',
  copyId: 'rechner-ab12c-2',
};

function mountDialog(
  props: Partial<{ busy: boolean; error: string | null; collision: ImportCollision | null }> = {},
) {
  return mount(ImportAppDialog, { props: { busy: false, error: null, collision: null, ...props } });
}

describe('ImportAppDialog', () => {
  it('fragt nach der Adresse und meldet sie beim Absenden', async () => {
    const wrapper = mountDialog();
    await wrapper.get('.url-input').setValue('  https://example.org/rechner.git  ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toEqual([['https://example.org/rechner.git']]);
  });

  it('schickt keine leere Adresse los', async () => {
    const wrapper = mountDialog();
    await wrapper.get('.url-input').setValue('   ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('.go').attributes('disabled')).toBeDefined();
  });

  it('zeigt, dass geholt wird, und schickt nicht ein zweites Mal', async () => {
    const wrapper = mountDialog({ busy: true });
    expect(wrapper.get('.busy').text()).toMatch(/geholt|Repository/i);
    await wrapper.get('.url-input').setValue('https://example.org/rechner.git');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('zeigt einen Fehler an', () => {
    const wrapper = mountDialog({ error: 'Das Repository konnte nicht geholt werden.' });
    expect(wrapper.get('.error').text()).toContain('konnte nicht geholt werden');
  });

  it('stellt bei belegter Id die drei Wege vor', () => {
    const wrapper = mountDialog({ collision: COLLISION });
    const text = wrapper.get('.collision').text();
    expect(text).toContain('Mein Rechner');
    expect(text).toContain('rechner-ab12c-2');
    // Solange gefragt wird, ist das Adressfeld weg.
    expect(wrapper.find('.url-input').exists()).toBe(false);
    expect(wrapper.find('.choice-copy').exists()).toBe(true);
    expect(wrapper.find('.choice-replace').exists()).toBe(true);
    expect(wrapper.find('.choice-cancel').exists()).toBe(true);
  });

  it('meldet die Wahl „Kopie“', async () => {
    const wrapper = mountDialog({ collision: COLLISION });
    await wrapper.get('.choice-copy').trigger('click');
    expect(wrapper.emitted('choose')).toEqual([['copy']]);
  });

  it('meldet die Wahl „Ersetzen“', async () => {
    const wrapper = mountDialog({ collision: COLLISION });
    await wrapper.get('.choice-replace').trigger('click');
    expect(wrapper.emitted('choose')).toEqual([['replace']]);
  });

  it('meldet den Abbruch — auch über das Kreuz und den Hintergrund', async () => {
    const wrapper = mountDialog({ collision: COLLISION });
    await wrapper.get('.choice-cancel').trigger('click');
    await wrapper.get('.close').trigger('click');
    await wrapper.get('.backdrop').trigger('click');
    expect(wrapper.emitted('choose')).toEqual([['cancel'], ['cancel'], ['cancel']]);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('schließt ohne offene Rückfrage einfach', async () => {
    const wrapper = mountDialog();
    await wrapper.get('.close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('choose')).toBeUndefined();
  });

  it('lässt sich beim Holen nicht wegklicken', async () => {
    const wrapper = mountDialog({ busy: true });
    await wrapper.get('.backdrop').trigger('click');
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
