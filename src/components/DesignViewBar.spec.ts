import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignViewBar from './DesignViewBar.vue';
import { MAX_VIEWS, type View } from '@/core/design';

/** Zwei Ansichten, wie sie im Entwurf stehen. */
const VIEWS: View[] = [
  { id: 'v1', title: 'Liste', blocks: [] },
  { id: 'v2', title: 'Detail', description: 'ein Eintrag', blocks: [] },
];

describe('DesignViewBar', () => {
  it('zeigt jede Ansicht mit ihrem Titel und hebt die gezeigte hervor', () => {
    const wrapper = mount(DesignViewBar, { props: { views: VIEWS, viewId: 'v2' } });

    const tabs = wrapper.findAll('.dv-tab');
    expect(tabs.map((t) => t.text())).toEqual(['Liste', 'Detail ·']);
    expect(tabs[0].classes()).not.toContain('on');
    expect(tabs[1].classes()).toContain('on');
  });

  it('gibt sich zu erkennen, wenn eine Ansicht beschrieben ist', () => {
    const wrapper = mount(DesignViewBar, { props: { views: VIEWS, viewId: 'v1' } });

    expect(wrapper.findAll('.dv-tab')[0].find('.dv-said').exists()).toBe(false);
    expect(wrapper.findAll('.dv-tab')[1].find('.dv-said').exists()).toBe(true);
  });

  it('bittet um den Wechsel zu einer anderen Ansicht', async () => {
    const wrapper = mount(DesignViewBar, { props: { views: VIEWS, viewId: 'v1' } });

    await wrapper.findAll('.dv-tab')[1].trigger('click');

    expect(wrapper.emitted('select')).toEqual([['v2']]);
    expect(wrapper.emitted('edit')).toBeUndefined();
  });

  it('bittet beim Klick auf die gezeigte Ansicht um ihr Feld', async () => {
    // Ein Reiter, der schon vorn steht, kann nur noch eines meinen: beschreiben.
    const wrapper = mount(DesignViewBar, { props: { views: VIEWS, viewId: 'v1' } });

    await wrapper.findAll('.dv-tab')[0].trigger('click');

    expect(wrapper.emitted('edit')).toHaveLength(1);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('bittet um eine weitere Ansicht', async () => {
    const wrapper = mount(DesignViewBar, { props: { views: VIEWS, viewId: 'v1' } });

    await wrapper.get('.dv-add').trigger('click');

    expect(wrapper.emitted('add')).toHaveLength(1);
  });

  it('bietet an der Obergrenze keine weitere mehr an', () => {
    const voll = Array.from({ length: MAX_VIEWS }, (_, i) => ({ id: `v${i}`, title: `Ansicht ${i}`, blocks: [] }));
    const wrapper = mount(DesignViewBar, { props: { views: voll, viewId: 'v0' } });

    expect(wrapper.findAll('.dv-tab')).toHaveLength(MAX_VIEWS);
    expect(wrapper.find('.dv-add').exists()).toBe(false);
  });

  it('bleibt still, solange es keine Ansicht gibt', () => {
    // Der erste Kasten legt die erste Ansicht an — vorher gibt es nichts zu wählen.
    const wrapper = mount(DesignViewBar, { props: { views: [], viewId: null } });

    expect(wrapper.find('.design-views').exists()).toBe(false);
  });
});
