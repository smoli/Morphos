import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignOverlay from './DesignOverlay.vue';
import { DEFAULT_BLOCK_NAME, type Block } from '@/core/design';

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

  it('zeigt kein Eingabefeld, solange niemand etwas bearbeitet', () => {
    const wrapper = mount(DesignOverlay, { props: { blocks: BLOCKS } });

    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('.design-band').exists()).toBe(false);
  });

  // c0107: Aus der Fläche wird die Zeichenfläche — ein Zug zieht einen Kasten
  // auf, der sogleich seinen Namen bekommt. Die Fläche misst in Anteilen, also
  // bekommt sie im Test eine Größe (jsdom rechnet sonst mit lauter Nullen).
  describe('Zeichnen und Benennen', () => {
    /** Ein Overlay, dessen Fläche 400 × 200 Pixel groß ist. */
    function drawable(blocks: Block[] = []) {
      const wrapper = mount(DesignOverlay, { props: { blocks }, attachTo: document.body });
      const stage = wrapper.get('.design-stage');
      (stage.element as HTMLElement).getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0 }) as DOMRect;
      return { wrapper, stage };
    }

    /** Ein Zug über die Fläche, von Punkt zu Punkt (Pixel). */
    async function drag(
      stage: ReturnType<typeof drawable>['stage'],
      a: [number, number],
      b: [number, number],
    ): Promise<void> {
      await stage.trigger('pointerdown', { button: 0, clientX: a[0], clientY: a[1] });
      await stage.trigger('pointermove', { clientX: b[0], clientY: b[1] });
      await stage.trigger('pointerup', { clientX: b[0], clientY: b[1] });
    }

    it('zieht während des Zugs ein Gummiband auf', async () => {
      const { wrapper, stage } = drawable();

      await stage.trigger('pointerdown', { button: 0, clientX: 40, clientY: 20 });
      await stage.trigger('pointermove', { clientX: 240, clientY: 120 });

      const band = wrapper.get('.design-band');
      expect(band.attributes('style')).toContain('left: 10%');
      expect(band.attributes('style')).toContain('width: 50%');
      // Solange gezogen wird, ist noch nichts entstanden.
      expect(wrapper.emitted('draw')).toBeUndefined();
    });

    it('macht aus einem Zug einen Kasten, sobald sein Name steht', async () => {
      const { wrapper, stage } = drawable();

      await drag(stage, [40, 20], [240, 120]);

      // Der aufgezogene Kasten wartet auf seinen Namen — mit dem Platzhalter darin.
      const input = wrapper.get('input.db-input');
      expect((input.element as HTMLInputElement).value).toBe(DEFAULT_BLOCK_NAME);
      expect(wrapper.emitted('draw')).toBeUndefined();

      (input.element as HTMLInputElement).value = 'Kopfzeile';
      await input.trigger('keydown.enter');

      expect(wrapper.emitted('draw')).toEqual([[{ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 'Kopfzeile']]);
      // Danach ist die Fläche wieder ruhig: Der Kasten kommt über die Blöcke zurück.
      expect(wrapper.find('input').exists()).toBe(false);
      expect(wrapper.find('.design-band').exists()).toBe(false);
    });

    it('nimmt den Platzhalternamen, wenn niemand etwas eingibt', async () => {
      const { wrapper, stage } = drawable();

      await drag(stage, [0, 0], [400, 40]);
      await wrapper.get('input.db-input').trigger('blur');

      expect(wrapper.emitted('draw')).toEqual([[{ x: 0, y: 0, w: 1, h: 0.2 }, DEFAULT_BLOCK_NAME]]);
    });

    it('zieht auch von rechts unten nach links oben', async () => {
      const { wrapper, stage } = drawable();

      await drag(stage, [240, 120], [40, 20]);
      await wrapper.get('input.db-input').trigger('keydown.enter');

      expect(wrapper.emitted('draw')).toEqual([[{ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, DEFAULT_BLOCK_NAME]]);
    });

    it('verwirft den aufgezogenen Kasten auf Escape', async () => {
      const { wrapper, stage } = drawable();

      await drag(stage, [40, 20], [240, 120]);
      await wrapper.get('input.db-input').trigger('keydown.esc');

      expect(wrapper.emitted('draw')).toBeUndefined();
      expect(wrapper.find('input').exists()).toBe(false);
    });

    it('macht aus einem Klick keinen Kasten', async () => {
      const { wrapper, stage } = drawable();

      await drag(stage, [40, 20], [41, 21]);

      expect(wrapper.find('input').exists()).toBe(false);
      expect(wrapper.emitted('draw')).toBeUndefined();
    });

    it('benennt einen bestehenden Kasten an Ort und Stelle um', async () => {
      const { wrapper } = drawable(BLOCKS);

      await wrapper.findAll('.db-name')[0].trigger('click');
      const input = wrapper.get('input.db-input');
      expect((input.element as HTMLInputElement).value).toBe('Kopf');

      (input.element as HTMLInputElement).value = 'Kopfzeile';
      await input.trigger('keydown.enter');

      expect(wrapper.emitted('rename')).toEqual([['b1', 'Kopfzeile']]);
      expect(wrapper.emitted('draw')).toBeUndefined();
    });

    it('benennt auch einen geschachtelten Kasten um', async () => {
      const { wrapper } = drawable(BLOCKS);

      await wrapper.findAll('.db-name')[2].trigger('click');
      const input = wrapper.get('input.db-input');
      (input.element as HTMLInputElement).value = 'Einträge';
      await input.trigger('keydown.enter');

      expect(wrapper.emitted('rename')).toEqual([['b3', 'Einträge']]);
    });

    it('behält Escape für sich, solange ein Feld offen ist', async () => {
      // Ein Druck räumt EINE Sache ab (DesktopView): erst das Feld, dann — beim
      // nächsten Druck — den Entwurfs-Modus. Escape darf hier also nicht weiter.
      const draussen = vi.fn();
      window.addEventListener('keydown', draussen);
      try {
        const { wrapper } = drawable(BLOCKS);
        await wrapper.findAll('.db-name')[0].trigger('click');

        await wrapper.get('input.db-input').trigger('keydown.esc');
        expect(draussen).not.toHaveBeenCalled();

        // Ohne offenes Feld geht Escape wie eh und je nach oben.
        await wrapper.get('.design-stage').trigger('keydown.esc');
        expect(draussen).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener('keydown', draussen);
      }
    });

    it('lässt einen Namen auf Escape, wie er war', async () => {
      const { wrapper } = drawable(BLOCKS);

      await wrapper.findAll('.db-name')[0].trigger('click');
      const input = wrapper.get('input.db-input');
      (input.element as HTMLInputElement).value = 'Weg damit';
      await input.trigger('keydown.esc');

      expect(wrapper.emitted('rename')).toBeUndefined();
      expect(wrapper.find('input').exists()).toBe(false);
    });

    it('hat immer nur ein Feld offen', async () => {
      const { wrapper } = drawable(BLOCKS);

      await wrapper.findAll('.db-name')[0].trigger('click');
      expect(wrapper.findAll('input.db-input')).toHaveLength(1);

      // Ein anderer Kasten übernimmt das Feld — zwei offene gäbe es nie.
      const weiter = wrapper.findAll('.db-name');
      expect(weiter.map((n) => n.text())).toEqual(['Inhalt', 'Liste']);
      await weiter[0].trigger('click');
      const offen = wrapper.findAll('input.db-input');
      expect(offen).toHaveLength(1);
      expect((offen[0].element as HTMLInputElement).value).toBe('Inhalt');
    });
  });

  // c0108: Ein Kasten sagt mehr als seinen Namen — wer ihn auswählt, bekommt
  // sein Feld für Rolle und Anweisungen. Geschrieben wird auch das nicht hier.
  describe('Auswählen und Beschreiben', () => {
    /** Ein Overlay mit Kästen, dessen Fläche 400 × 200 Pixel groß ist. */
    function selectable(blocks: Block[] = BLOCKS) {
      const wrapper = mount(DesignOverlay, { props: { blocks }, attachTo: document.body });
      const stage = wrapper.get('.design-stage');
      (stage.element as HTMLElement).getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0 }) as DOMRect;
      return { wrapper, stage };
    }

    it('zeigt kein Feld, solange nichts ausgewählt ist', () => {
      const { wrapper } = selectable();

      expect(wrapper.find('.design-inspector').exists()).toBe(false);
    });

    it('öffnet mit einem Klick auf einen Kasten dessen Feld', async () => {
      const { wrapper } = selectable();

      await wrapper.findAll('.design-stage > .design-block')[0].trigger('click');

      expect(wrapper.get('.di-name').text()).toBe('Kopf');
      expect((wrapper.get('input.di-type').element as HTMLInputElement).value).toBe('');
      // Und der ausgewählte Kasten ist auch zu sehen.
      expect(wrapper.findAll('.design-block.selected')).toHaveLength(1);
    });

    it('hält Benennen und Auswählen auseinander', async () => {
      // Der Name gehört dem Kasten (c0107), Rolle und Anweisungen dem Feld: Ein
      // Klick auf den Namen benennt um und öffnet nicht auch noch das Feld.
      const { wrapper } = selectable();

      await wrapper.get('.db-name').trigger('click');

      expect(wrapper.find('.design-inspector').exists()).toBe(false);
      expect(wrapper.findAll('input.db-input')).toHaveLength(1);
    });

    it('wählt den geschachtelten Kasten aus, nicht seinen Elter', async () => {
      const { wrapper } = selectable();

      await wrapper.get('.design-block .design-block').trigger('click');

      expect(wrapper.get('.di-name').text()).toBe('Liste');
      expect((wrapper.get('input.di-type').element as HTMLInputElement).value).toBe('liste');
    });

    it('gibt Rolle und Anweisungen mit der Id des Kastens weiter', async () => {
      const { wrapper } = selectable();

      await wrapper.get('.design-block .design-block').trigger('click');
      await wrapper.get('input.di-type').setValue('Kopfzeile');
      await wrapper.get('textarea.di-instructions').setValue('Zeilen mit Datum');

      expect(wrapper.emitted('describe')).toEqual([
        ['b3', { type: 'Kopfzeile' }],
        ['b3', { instructions: 'Zeilen mit Datum' }],
      ]);
    });

    it('zeigt im Feld, was der gespeicherte Entwurf zurückmeldet', async () => {
      const { wrapper } = selectable();
      await wrapper.findAll('.design-stage > .design-block')[0].trigger('click');

      // Der Store hat geschrieben und den Baum von der Platte übernommen.
      await wrapper.setProps({
        blocks: [{ ...BLOCKS[0], type: 'Kopfzeile', instructions: 'Titel links' }, BLOCKS[1]],
      });

      expect((wrapper.get('input.di-type').element as HTMLInputElement).value).toBe('Kopfzeile');
      expect((wrapper.get('textarea.di-instructions').element as HTMLTextAreaElement).value)
        .toBe('Titel links');
    });

    it('hebt die Auswahl auf, wenn daneben geklickt wird', async () => {
      const { wrapper, stage } = selectable();
      await wrapper.findAll('.design-stage > .design-block')[0].trigger('click');

      await stage.trigger('click');

      expect(wrapper.find('.design-inspector').exists()).toBe(false);
      expect(wrapper.find('.design-block.selected').exists()).toBe(false);
    });

    it('schließt das Feld auf Wunsch, ohne den Entwurfs-Modus zu schließen', async () => {
      const { wrapper } = selectable();
      await wrapper.findAll('.design-stage > .design-block')[0].trigger('click');

      await wrapper.get('.di-close').trigger('click');

      expect(wrapper.find('.design-inspector').exists()).toBe(false);
      expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('macht aus einem Zeichenzug keine Auswahl', async () => {
      // Wer über einem Kasten einen neuen aufzieht, wählt den alten nicht aus —
      // sonst stünde das Feld im Weg, während der neue seinen Namen bekommt.
      const { wrapper, stage } = selectable();

      await stage.trigger('pointerdown', { button: 0, clientX: 10, clientY: 5 });
      await stage.trigger('pointermove', { clientX: 210, clientY: 25 });
      await stage.trigger('pointerup', { clientX: 210, clientY: 25 });
      await wrapper.findAll('.design-stage > .design-block')[0].trigger('click');

      expect(wrapper.find('.design-inspector').exists()).toBe(false);
      expect(wrapper.get('input.db-input')).toBeTruthy();
    });

    it('zeichnet keinen Kasten, wenn im Feld gezogen wird', async () => {
      const { wrapper, stage } = selectable();
      await wrapper.findAll('.design-stage > .design-block')[0].trigger('click');

      const feld = wrapper.get('.design-inspector');
      await feld.trigger('pointerdown', { button: 0, clientX: 300, clientY: 150 });
      await stage.trigger('pointermove', { clientX: 380, clientY: 190 });
      await stage.trigger('pointerup', { clientX: 380, clientY: 190 });

      expect(wrapper.find('.design-band').exists()).toBe(false);
      expect(wrapper.emitted('draw')).toBeUndefined();
      expect(wrapper.find('.design-inspector').exists()).toBe(true);
    });
  });
});
