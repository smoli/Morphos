import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignOverlay from './DesignOverlay.vue';
import type { Block } from '@/core/design';

/** Ein kleiner Entwurf: Kopf, Inhalt — und im Inhalt eine Liste. */
const BLOCKS: Block[] = [
  { id: 'b1', name: 'Kopf', rect: { x: 0, y: 0, w: 1, h: 0.15 }, children: [] },
  {
    id: 'b2',
    name: 'Inhalt',
    rect: { x: 0, y: 0.15, w: 0.6, h: 0.85 },
    children: [
      { id: 'b3', name: 'Liste', type: 'liste', rect: { x: 0.05, y: 0.25, w: 0.5, h: 0.5 }, children: [] },
    ],
  },
];

describe('DesignOverlay', () => {
  it('zeigt jeden Kasten des Entwurfs mit seinem Namen', () => {
    const wrapper = mount(DesignOverlay, { props: { blocks: BLOCKS } });

    const names = wrapper.findAll('.db-name').map((n) => n.text());
    expect(names).toEqual(['Kopf', 'Inhalt', 'Liste']);
  });

  it('zeichnet einen geschachtelten Kasten in seinem Elter', () => {
    const wrapper = mount(DesignOverlay, { props: { blocks: BLOCKS } });

    const inhalt = wrapper.findAll('.design-stage > .design-block')[1];
    expect(inhalt.get('.db-name').text()).toBe('Inhalt');
    // Die Liste liegt IM Inhalt, nicht neben ihm.
    expect(inhalt.findAll('.design-block')).toHaveLength(1);
    expect(wrapper.get('.design-block .design-block .db-name').text()).toBe('Liste');
    // Und nur die beiden Wurzelkästen liegen unmittelbar auf der Fläche.
    expect(wrapper.findAll('.design-stage > .design-block')).toHaveLength(2);
  });

  it('bleibt bei einem leeren (oder fehlenden) Entwurf leer, ohne zu straucheln', () => {
    const wrapper = mount(DesignOverlay, { props: { blocks: [] } });

    expect(wrapper.find('.design-overlay').exists()).toBe(true);
    expect(wrapper.findAll('.design-block')).toHaveLength(0);
    expect(wrapper.get('.design-empty').text()).toContain('noch keinen Entwurf');
  });

  it('bittet auf Wunsch ums Schließen', async () => {
    const wrapper = mount(DesignOverlay, { props: { blocks: BLOCKS } });

    await wrapper.get('.design-close').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('ist eine Ansicht zum Lesen — hier wird (noch) nichts bearbeitet', () => {
    const wrapper = mount(DesignOverlay, { props: { blocks: BLOCKS } });

    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('textarea').exists()).toBe(false);
  });
});
