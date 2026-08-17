import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignBlock from './DesignBlock.vue';
import type { Block } from '@/core/design';

/** Ein Kasten, wie ihn core/design liefert (Anteile des App-Fensters). */
function block(over: Partial<Block> = {}): Block {
  return { id: 'b1', name: 'Kopf', rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, children: [], ...over };
}

describe('DesignBlock', () => {
  it('zeichnet einen Kasten der Wurzel an seinen Anteilen des Fensters', () => {
    const wrapper = mount(DesignBlock, { props: { block: block() } });

    const style = wrapper.get('.design-block').attributes('style') ?? '';
    expect(style).toContain('left: 10%');
    expect(style).toContain('top: 20%');
    expect(style).toContain('width: 50%');
    expect(style).toContain('height: 40%');
  });

  it('schreibt den Namen des Kastens hinein', () => {
    const wrapper = mount(DesignBlock, { props: { block: block({ name: 'Kopfzeile' }) } });
    expect(wrapper.get('.db-name').text()).toBe('Kopfzeile');
  });

  it('nennt die Rolle, wenn der Kasten eine trägt — sonst gar nichts', () => {
    const mit = mount(DesignBlock, { props: { block: block({ type: 'liste' }) } });
    expect(mit.get('.db-type').text()).toBe('liste');

    const ohne = mount(DesignBlock, { props: { block: block() } });
    expect(ohne.find('.db-type').exists()).toBe(false);
  });

  it('zeichnet ein Kind IN seinen Elter — die Anteile umgerechnet auf dessen Kasten', () => {
    const kind = block({ id: 'b2', name: 'Liste', rect: { x: 0.2, y: 0.3, w: 0.1, h: 0.1 } });
    const wrapper = mount(DesignBlock, { props: { block: block({ children: [kind] }) } });

    // Das Kind liegt im DOM im Elter (die Verschachtelung ist zu sehen) …
    const inner = wrapper.get('.design-block .design-block');
    expect(inner.get('.db-name').text()).toBe('Liste');
    // … und seine Anteile beziehen sich laut Entwurf auf das FENSTER (c0104),
    // gezeichnet wird aber im Kasten des Elters: (0.2 − 0.1) / 0.5 = 20 %.
    const style = inner.attributes('style') ?? '';
    expect(style).toContain('left: 20%');
    expect(style).toContain('top: 25%');
    expect(style).toContain('width: 20%');
    expect(style).toContain('height: 25%');
  });

  // c0109: Angefasst wird nur der ausgewählte Kasten — an seinem Rumpf zum
  // Schieben, an seinen acht Griffen zum Ziehen. Gerechnet wird hier nichts:
  // Der Kasten meldet bloß, dass (und woran) er angefasst wurde.
  describe('Anfassen (c0109)', () => {
    it('zeigt seine Griffe erst, wenn er ausgewählt ist', () => {
      const ohne = mount(DesignBlock, { props: { block: block() } });
      expect(ohne.findAll('.db-handle')).toHaveLength(0);

      const mit = mount(DesignBlock, { props: { block: block(), selectedId: 'b1' } });
      expect(mit.findAll('.db-handle')).toHaveLength(8);
      expect(mit.find('.db-handle.db-se').exists()).toBe(true);
    });

    it('meldet einen Griff am Rumpf ohne Kante', async () => {
      const wrapper = mount(DesignBlock, { props: { block: block(), selectedId: 'b1' } });

      await wrapper.get('.design-block').trigger('pointerdown');

      expect(wrapper.emitted('grab')).toEqual([['b1', null]]);
    });

    it('meldet an einem Griff dessen Kante — und den Rumpf gleich mit', async () => {
      const wrapper = mount(DesignBlock, { props: { block: block(), selectedId: 'b1' } });

      await wrapper.get('.db-handle.db-nw').trigger('pointerdown');

      // Der Griff meldet sich zuerst, der Rumpf darunter hinterher: Welcher
      // gemeint ist, entscheidet die Fläche (der erste gewinnt).
      expect(wrapper.emitted('grab')).toEqual([['b1', 'nw'], ['b1', null]]);
    });

    it('meldet keinen Griff, wenn am Namen angesetzt wird', async () => {
      const wrapper = mount(DesignBlock, { props: { block: block(), selectedId: 'b1' } });

      await wrapper.get('.db-name').trigger('pointerdown');

      expect(wrapper.emitted('grab')).toBeUndefined();
    });

    it('reicht den Griff eines Kindes weiter', async () => {
      const kind = block({ id: 'b2', name: 'Liste', rect: { x: 0.2, y: 0.3, w: 0.1, h: 0.1 } });
      const wrapper = mount(DesignBlock, {
        props: { block: block({ children: [kind] }), selectedId: 'b2' },
      });

      await wrapper.get('.design-block .design-block').trigger('pointerdown');

      expect(wrapper.emitted('grab')).toEqual([['b2', null], ['b1', null]]);
    });
  });

  // c0110: Während eines Zugs ist der künftige Elter hervorgehoben — welcher
  // das ist, entscheidet die Fläche (containerIn), der Kasten trägt es nur.
  describe('Künftiger Elter (c0110)', () => {
    it('hebt sich hervor, wenn ein Zug in ihm landen würde', () => {
      const ohne = mount(DesignBlock, { props: { block: block() } });
      expect(ohne.get('.design-block').classes()).not.toContain('drop');

      const mit = mount(DesignBlock, { props: { block: block(), dropId: 'b1' } });
      expect(mit.get('.design-block').classes()).toContain('drop');
    });

    it('reicht die Auszeichnung durch den ganzen Baum', () => {
      const kind = block({ id: 'b2', name: 'Liste', rect: { x: 0.2, y: 0.3, w: 0.1, h: 0.1 } });
      const wrapper = mount(DesignBlock, {
        props: { block: block({ children: [kind] }), dropId: 'b2' },
      });

      expect(wrapper.get('.design-block').classes()).not.toContain('drop');
      expect(wrapper.get('.design-block .design-block').classes()).toContain('drop');
    });
  });

  it('trägt auch tiefere Verschachtelungen (Kind im Kind)', () => {
    const enkel = block({ id: 'b3', name: 'Zeile', rect: { x: 0.25, y: 0.35, w: 0.05, h: 0.05 } });
    const kind = block({ id: 'b2', name: 'Liste', rect: { x: 0.2, y: 0.3, w: 0.1, h: 0.1 }, children: [enkel] });
    const wrapper = mount(DesignBlock, { props: { block: block({ children: [kind] }) } });

    const deep = wrapper.get('.design-block .design-block .design-block');
    expect(deep.get('.db-name').text()).toBe('Zeile');
    // (0.25 − 0.2) / 0.1 = 50 %
    const style = deep.attributes('style') ?? '';
    expect(style).toContain('left: 50%');
    expect(style).toContain('top: 50%');
  });
});
