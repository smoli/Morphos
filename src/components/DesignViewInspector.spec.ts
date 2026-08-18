import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignViewInspector from './DesignViewInspector.vue';
import type { View } from '@/core/design';

const VIEW: View = { id: 'v1', title: 'Liste', description: 'alle Einträge', blocks: [] };

function mountField(view: View = VIEW) {
  return mount(DesignViewInspector, { props: { view } });
}

describe('DesignViewInspector', () => {
  it('zeigt Titel und Beschreibung der Ansicht', () => {
    const wrapper = mountField();

    expect((wrapper.get('input.dvi-title').element as HTMLInputElement).value).toBe('Liste');
    expect((wrapper.get('textarea.dvi-description').element as HTMLTextAreaElement).value).toBe('alle Einträge');
  });

  it('bleibt leer, wo die Ansicht nichts sagt', () => {
    const wrapper = mountField({ id: 'v2', title: 'Detail', blocks: [] });

    expect((wrapper.get('textarea.dvi-description').element as HTMLTextAreaElement).value).toBe('');
  });

  it('meldet einen fertigen Titel und eine fertige Beschreibung nach oben', async () => {
    const wrapper = mountField();

    await wrapper.get('input.dvi-title').setValue('  Übersicht  ');
    await wrapper.get('textarea.dvi-description').setValue('alles auf einen Blick');

    expect(wrapper.emitted('update')).toEqual([
      [{ title: 'Übersicht' }],
      [{ description: 'alles auf einen Blick' }],
    ]);
  });

  it('sagt nichts, wenn sich nichts geändert hat', async () => {
    const wrapper = mountField();

    await wrapper.get('input.dvi-title').setValue('Liste');
    await wrapper.get('textarea.dvi-description').setValue('alle Einträge');

    expect(wrapper.emitted('update')).toBeUndefined();
  });

  it('holt einen geleerten Titel zurück, statt ihn wegzuwerfen', async () => {
    // Eine Ansicht ohne Titel gibt es nicht (core/design: updateView).
    const wrapper = mountField();

    await wrapper.get('input.dvi-title').setValue('   ');

    expect(wrapper.emitted('update')).toBeUndefined();
    expect((wrapper.get('input.dvi-title').element as HTMLInputElement).value).toBe('Liste');
  });

  it('nimmt eine geleerte Beschreibung als „nicht gesetzt“', async () => {
    const wrapper = mountField();

    await wrapper.get('textarea.dvi-description').setValue('   ');

    expect(wrapper.emitted('update')).toEqual([[{ description: '' }]]);
  });

  it('übernimmt, was von der Platte zurückkommt', async () => {
    const wrapper = mountField();

    await wrapper.setProps({ view: { id: 'v1', title: 'Übersicht', blocks: [] } });

    expect((wrapper.get('input.dvi-title').element as HTMLInputElement).value).toBe('Übersicht');
    expect((wrapper.get('textarea.dvi-description').element as HTMLTextAreaElement).value).toBe('');
  });

  it('verwirft mit Escape und geht zu — die Ansicht bleibt, wie sie war', async () => {
    const wrapper = mountField();
    const title = wrapper.get('input.dvi-title');

    await title.setValue('halbfertig');
    await title.trigger('keydown.esc');

    expect((title.element as HTMLInputElement).value).toBe('Liste');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('bittet ums Schließen und ums Löschen', async () => {
    const wrapper = mountField();

    await wrapper.get('.dvi-close').trigger('click');
    await wrapper.get('.dvi-delete').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('delete')).toHaveLength(1);
  });
});
