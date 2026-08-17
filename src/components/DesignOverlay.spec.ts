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

  // c0109: Ein ausgewählter Kasten lässt sich schieben und an seinen Griffen
  // größer ziehen. Gerechnet wird in core/design (moveRect/resizeRect); hier
  // steht, was ein Zug bedeutet und was er NICHT bedeutet.
  describe('Schieben und Größe ändern', () => {
    /** Ein Overlay mit Kästen, dessen Fläche 400 × 200 Pixel groß ist. */
    function movable(blocks: Block[] = BLOCKS) {
      const wrapper = mount(DesignOverlay, { props: { blocks }, attachTo: document.body });
      const stage = wrapper.get('.design-stage');
      (stage.element as HTMLElement).getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0 }) as DOMRect;
      return { wrapper, stage };
    }

    /** Wählt den ersten Kasten (Kopf: 0,0 — 1 × 0.15) aus und gibt ihn zurück. */
    async function selectHead(wrapper: ReturnType<typeof movable>['wrapper']) {
      const kopf = wrapper.findAll('.design-stage > .design-block')[0];
      await kopf.trigger('click');
      return kopf;
    }

    /** Ein Zug, der an `griff` (oder am Rumpf) ansetzt und auf der Fläche endet. */
    async function pull(
      { wrapper, stage }: ReturnType<typeof movable>,
      griff: string,
      a: [number, number],
      b: [number, number],
    ): Promise<void> {
      await wrapper.get(griff).trigger('pointerdown', { button: 0, clientX: a[0], clientY: a[1] });
      await stage.trigger('pointermove', { clientX: b[0], clientY: b[1] });
      await stage.trigger('pointerup', { clientX: b[0], clientY: b[1] });
    }

    it('schiebt den ausgewählten Kasten an eine neue Stelle', async () => {
      const parts = movable();
      await selectHead(parts.wrapper);

      // 20 Pixel nach unten sind auf 200 Pixel Höhe ein Zehntel.
      await pull(parts, '.design-stage > .design-block', [40, 10], [40, 30]);

      expect(parts.wrapper.emitted('move')).toEqual([['b1', { x: 0, y: 0.1 }]]);
      expect(parts.wrapper.emitted('draw')).toBeUndefined();
      expect(parts.wrapper.emitted('resize')).toBeUndefined();
    });

    it('zeigt während des Schiebens, wo der Kasten landet', async () => {
      const { wrapper, stage } = movable();
      await selectHead(wrapper);

      const kopf = wrapper.get('.design-stage > .design-block');
      await kopf.trigger('pointerdown', { button: 0, clientX: 40, clientY: 10 });
      await stage.trigger('pointermove', { clientX: 40, clientY: 30 });

      const band = wrapper.get('.design-band');
      expect(band.attributes('style')).toContain('top: 10%');
      expect(band.attributes('style')).toContain('height: 15%');
      expect(wrapper.emitted('move')).toBeUndefined();
    });

    it('bleibt am Rand stehen, statt zu schrumpfen', async () => {
      const parts = movable();
      await selectHead(parts.wrapper);

      await pull(parts, '.design-stage > .design-block', [40, 10], [40, 400]);

      // 1 − 0.15 = 0.85; die Höhe bleibt, wovon nicht die Rede war.
      expect(parts.wrapper.emitted('move')).toEqual([['b1', { x: 0, y: 0.85 }]]);
    });

    it('lässt einen Kasten nicht aus dem Fenster hinaus', async () => {
      const parts = movable([{ ...BLOCKS[0], rect: { x: 0.2, y: 0.2, w: 0.2, h: 0.2 } }]);
      await selectHead(parts.wrapper);

      await pull(parts, '.design-stage > .design-block', [100, 50], [-200, -200]);

      expect(parts.wrapper.emitted('move')).toEqual([['b1', { x: 0, y: 0 }]]);
    });

    it('zieht einen Kasten an seiner Ecke größer', async () => {
      const parts = movable();
      await selectHead(parts.wrapper);

      // Die rechte untere Ecke 200 Pixel nach links: aus voller Breite wird halbe.
      await pull(parts, '.db-handle.db-se', [400, 30], [200, 30]);

      expect(parts.wrapper.emitted('resize')).toEqual([['b1', { x: 0, y: 0, w: 0.5, h: 0.15 }]]);
      expect(parts.wrapper.emitted('move')).toBeUndefined();
    });

    it('zieht an einer Kante nur diese eine', async () => {
      const parts = movable();
      await selectHead(parts.wrapper);

      // Die untere Kante 20 Pixel nach unten — waagerecht ändert sich nichts,
      // auch wenn der Zeiger dabei zur Seite wandert.
      await pull(parts, '.db-handle.db-s', [200, 30], [100, 50]);

      expect(parts.wrapper.emitted('resize')).toEqual([['b1', { x: 0, y: 0, w: 1, h: 0.25 }]]);
    });

    it('macht einen Kasten nicht kleiner als das Kleinste', async () => {
      const parts = movable();
      await selectHead(parts.wrapper);

      await pull(parts, '.db-handle.db-se', [400, 30], [-400, -400]);

      expect(parts.wrapper.emitted('resize')).toEqual([['b1', { x: 0, y: 0, w: 0.01, h: 0.01 }]]);
    });

    it('sagt nichts, wenn sich nichts geändert hat', async () => {
      // Ein Klick auf den ausgewählten Kasten ist kein Zug: Er darf die Datei
      // nicht neu schreiben.
      const parts = movable();
      await selectHead(parts.wrapper);

      await pull(parts, '.design-stage > .design-block', [40, 10], [40, 10]);

      expect(parts.wrapper.emitted('move')).toBeUndefined();
      expect(parts.wrapper.emitted('draw')).toBeUndefined();
      expect(parts.wrapper.find('input.db-input').exists()).toBe(false);
    });

    it('zeichnet über einem Kasten, der nicht ausgewählt ist', async () => {
      // Anfassen setzt Auswählen voraus — sonst ließe sich in einem Kasten kein
      // zweiter mehr aufziehen.
      const parts = movable();

      await pull(parts, '.design-stage > .design-block', [40, 10], [240, 60]);

      expect(parts.wrapper.emitted('move')).toBeUndefined();
      expect(parts.wrapper.get('input.db-input')).toBeTruthy();
    });

    it('behält den geschobenen Kasten ausgewählt', async () => {
      // Der Zeiger endet neben dem Kasten (der DOM-Kasten wandert erst mit der
      // Antwort von der Platte) — das ist kein Klick daneben.
      const parts = movable();
      await selectHead(parts.wrapper);

      await pull(parts, '.design-stage > .design-block', [40, 10], [40, 150]);
      await parts.stage.trigger('click');

      expect(parts.wrapper.emitted('move')).toHaveLength(1);
      expect(parts.wrapper.find('.design-inspector').exists()).toBe(true);

      // Der nächste Klick daneben hebt die Auswahl wie eh und je auf.
      await parts.stage.trigger('pointerdown', { button: 0, clientX: 40, clientY: 150 });
      await parts.stage.trigger('pointerup', { clientX: 40, clientY: 150 });
      await parts.stage.trigger('click');
      expect(parts.wrapper.find('.design-inspector').exists()).toBe(false);
    });

    it('schiebt auch einen geschachtelten Kasten', async () => {
      const parts = movable();
      await parts.wrapper.get('.design-block .design-block').trigger('click');

      await pull(parts, '.design-block .design-block', [40, 60], [80, 60]);

      // 40 Pixel auf 400 Pixel Breite sind ein Zehntel: 0.05 + 0.1 = 0.15.
      expect(parts.wrapper.emitted('move')).toEqual([['b3', { x: 0.15, y: 0.25 }]]);
    });

    it('lässt sich mit der rechten Maustaste nicht anfassen', async () => {
      const { wrapper, stage } = movable();
      await selectHead(wrapper);

      const kopf = wrapper.get('.design-stage > .design-block');
      await kopf.trigger('pointerdown', { button: 2, clientX: 40, clientY: 10 });
      await stage.trigger('pointermove', { clientX: 40, clientY: 30 });
      await stage.trigger('pointerup', { clientX: 40, clientY: 30 });

      expect(wrapper.emitted('move')).toBeUndefined();
      expect(wrapper.find('.design-band').exists()).toBe(false);
    });
  });

  // c0110: Wohin ein Kasten gehört, sagt seine Lage — gerechnet wird das in
  // core/design (containerIn). Die Fläche zeigt es an, WÄHREND gezogen wird:
  // Wer nicht sieht, in welchem Kasten er landet, schachtelt aus Versehen.
  describe('Verschachteln und Löschen', () => {
    /** Ein Overlay mit Kästen, dessen Fläche 400 × 200 Pixel groß ist. */
    function nesting(blocks: Block[] = BLOCKS) {
      const wrapper = mount(DesignOverlay, { props: { blocks }, attachTo: document.body });
      const stage = wrapper.get('.design-stage');
      (stage.element as HTMLElement).getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0 }) as DOMRect;
      return { wrapper, stage };
    }

    /** Der Kasten, der als künftiger Elter hervorgehoben ist (sein Name). */
    function dropName(wrapper: ReturnType<typeof nesting>['wrapper']): string | null {
      const marked = wrapper.findAll('.design-block.drop');
      expect(marked.length).toBeLessThan(2);
      return marked.length ? marked[0].get('.db-name').text() : null;
    }

    it('zeigt während des Zeichnens, in welchem Kasten der neue Kasten landet', async () => {
      // Unter der Liste, aber noch im Inhalt (der reicht senkrecht bis unten).
      const { wrapper, stage } = nesting();

      await stage.trigger('pointerdown', { button: 0, clientX: 40, clientY: 160 });
      await stage.trigger('pointermove', { clientX: 100, clientY: 180 });

      expect(dropName(wrapper)).toBe('Inhalt');
    });

    it('hebt nichts hervor, wo kein Kasten ist', async () => {
      const { wrapper, stage } = nesting();

      await stage.trigger('pointerdown', { button: 0, clientX: 300, clientY: 40 });
      await stage.trigger('pointermove', { clientX: 380, clientY: 80 });

      expect(dropName(wrapper)).toBeNull();
    });

    it('hebt nichts mehr hervor, sobald der Zug vorbei ist', async () => {
      const { wrapper, stage } = nesting();

      await stage.trigger('pointerdown', { button: 0, clientX: 40, clientY: 160 });
      await stage.trigger('pointermove', { clientX: 100, clientY: 180 });
      await stage.trigger('pointerup', { clientX: 100, clientY: 180 });

      expect(dropName(wrapper)).toBeNull();
    });

    it('zeigt beim Schieben, in welchem Kasten der Kasten landet', async () => {
      const { wrapper, stage } = nesting();
      const liste = wrapper.get('.design-block .design-block');
      await liste.trigger('click');

      await liste.trigger('pointerdown', { button: 0, clientX: 100, clientY: 100 });
      await stage.trigger('pointermove', { clientX: 110, clientY: 110 });

      // Der geschobene Kasten selbst kommt nicht in Frage — sein Elter schon.
      expect(dropName(wrapper)).toBe('Inhalt');
    });

    it('bietet den eigenen Zweig nicht als Elter an (kein Kreis)', async () => {
      // Ein Kasten, der ganz in seinem eigenen Kind liegt: Beim Schieben darf
      // weder er selbst noch das Kind als künftiger Elter erscheinen.
      const eng: Block[] = [{
        id: 'p',
        name: 'Elter',
        rect: { x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
        children: [{ id: 'k', name: 'Kind', rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, children: [] }],
      }];
      const { wrapper, stage } = nesting(eng);
      const elter = wrapper.get('.design-stage > .design-block');
      await elter.trigger('click');

      await elter.trigger('pointerdown', { button: 0, clientX: 90, clientY: 45 });
      await stage.trigger('pointermove', { clientX: 95, clientY: 50 });

      expect(dropName(wrapper)).toBeNull();
    });

    it('zeichnet in ein Kind hinein, auch wenn dessen Elter ausgewählt ist', async () => {
      // „Gemeint ist das Unterste“ (c0109): Ein Druck auf ein NICHT ausgewähltes
      // Kind zeichnet — sonst wäre die Fläche jedes Kindes für den Stift
      // verloren, sobald sein Elter ausgewählt ist, und in ein Kind hinein
      // ließe sich nichts mehr schachteln.
      const { wrapper, stage } = nesting();
      await wrapper.findAll('.design-stage > .design-block')[1].trigger('click');
      expect(wrapper.get('.di-name').text()).toBe('Inhalt');

      const liste = wrapper.get('.design-block .design-block');
      await liste.trigger('pointerdown', { button: 0, clientX: 40, clientY: 60 });
      await stage.trigger('pointermove', { clientX: 120, clientY: 100 });
      // Der neue Kasten landet in der Liste, nicht in ihrem Elter.
      expect(dropName(wrapper)).toBe('Liste');
      await stage.trigger('pointerup', { clientX: 120, clientY: 100 });

      expect(wrapper.emitted('move')).toBeUndefined();
      expect(wrapper.get('input.db-input')).toBeTruthy();
    });

    it('gibt das Löschen des ausgewählten Kastens weiter', async () => {
      const { wrapper } = nesting();
      await wrapper.findAll('.design-stage > .design-block')[0].trigger('click');

      await wrapper.get('.di-delete').trigger('click');

      expect(wrapper.emitted('delete')).toEqual([['b1']]);
    });

    it('löscht auch einen geschachtelten Kasten', async () => {
      const { wrapper } = nesting();
      await wrapper.get('.design-block .design-block').trigger('click');

      await wrapper.get('.di-delete').trigger('click');

      expect(wrapper.emitted('delete')).toEqual([['b3']]);
    });

    it('schließt das Feld, sobald der Kasten aus dem Entwurf verschwunden ist', async () => {
      // Maßgeblich ist die Datei (c0107): Gelöscht ist der Kasten erst, wenn er
      // nicht mehr zurückkommt — dann hat das Feld nichts mehr zu zeigen.
      const { wrapper } = nesting();
      await wrapper.findAll('.design-stage > .design-block')[0].trigger('click');
      expect(wrapper.find('.design-inspector').exists()).toBe(true);

      await wrapper.setProps({ blocks: [BLOCKS[1]] });

      expect(wrapper.find('.design-inspector').exists()).toBe(false);
      expect(wrapper.emitted('close')).toBeUndefined();
    });
  });
});
