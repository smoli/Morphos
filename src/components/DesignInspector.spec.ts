import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount } from '@vue/test-utils';
import DesignInspector from './DesignInspector.vue';
import { BLOCK_ROLES, type Block } from '@/core/design';

/** Der ausgewählte Kasten, wie ihn die Fläche hereinreicht. */
function block(extra: Partial<Block> = {}): Block {
  return { id: 'b1', name: 'Kopf', rect: { x: 0, y: 0, w: 1, h: 0.2 }, children: [], ...extra };
}

/**
 * Tippen ohne fertig zu werden: `setValue` meldet auch gleich das fertige Feld
 * (`change`) — hier soll nur etwas im Feld stehen.
 */
async function typing(field: ReturnType<typeof inspector>['type'], value: string): Promise<void> {
  (field.element as HTMLInputElement | HTMLTextAreaElement).value = value;
  await field.trigger('input');
}

function inspector(b: Block = block(), ancestors: Block[] = []) {
  const wrapper = mount(DesignInspector, { props: { block: b, ancestors } });
  return {
    wrapper,
    type: wrapper.get('input.di-type'),
    instructions: wrapper.get('textarea.di-instructions'),
  };
}

describe('DesignInspector (c0108)', () => {
  it('nennt den Kasten, um den es geht', () => {
    const { wrapper } = inspector(block({ name: 'Seitenleiste' }));

    expect(wrapper.get('.di-name').text()).toBe('Seitenleiste');
  });

  it('zeigt Rolle und Anweisungen des Kastens', () => {
    const { type, instructions } = inspector(block({ type: 'Liste', instructions: 'Zeilen mit Datum' }));

    expect((type.element as HTMLInputElement).value).toBe('Liste');
    expect((instructions.element as HTMLTextAreaElement).value).toBe('Zeilen mit Datum');
  });

  it('lässt beide Felder leer, wenn der Kasten nichts dazu sagt', () => {
    const { type, instructions } = inspector();

    expect((type.element as HTMLInputElement).value).toBe('');
    expect((instructions.element as HTMLTextAreaElement).value).toBe('');
  });

  it('bietet Rollen zur Wahl an, ohne auf sie zu bestehen', () => {
    const { wrapper, type } = inspector();

    // Ein Vorschlagsfeld: Die Liste hängt am Feld, getippt werden darf alles.
    const list = type.attributes('list');
    expect(list).toBeTruthy();
    const options = wrapper.findAll(`#${list} option`).map((o) => o.attributes('value'));
    expect(options).toEqual([...BLOCK_ROLES]);
  });

  it('gibt eine geänderte Rolle weiter, sobald das Feld fertig ist', async () => {
    const { wrapper, type } = inspector();

    // Tippen allein sagt noch nichts — erst das fertige Feld (`change`).
    await typing(type, ' Kopfzeile ');
    expect(wrapper.emitted('update')).toBeUndefined();

    await type.trigger('change');

    expect(wrapper.emitted('update')).toEqual([[{ type: 'Kopfzeile' }]]);
  });

  it('gibt geänderte Anweisungen weiter', async () => {
    const { wrapper, instructions } = inspector();

    await instructions.setValue('Links das Logo, rechts die Suche');

    expect(wrapper.emitted('update')).toEqual([[{ instructions: 'Links das Logo, rechts die Suche' }]]);
  });

  it('nimmt einen geleerten Text als „nicht gesetzt“ zurück', async () => {
    const { wrapper, type, instructions } = inspector(block({ type: 'Liste', instructions: 'weg damit' }));

    await type.setValue('   ');
    await instructions.setValue('');

    expect(wrapper.emitted('update')).toEqual([[{ type: '' }], [{ instructions: '' }]]);
  });

  it('schweigt, wenn sich nichts geändert hat', async () => {
    // Sonst schriebe jedes Verlassen eines Feldes die Datei neu.
    const { wrapper, type, instructions } = inspector(block({ type: 'Liste', instructions: 'bleibt' }));

    await type.trigger('change');
    await instructions.trigger('change');
    await type.setValue(' Liste ');

    expect(wrapper.emitted('update')).toBeUndefined();
  });

  it('übernimmt, was der gespeicherte Kasten zurückmeldet', async () => {
    // Maßgeblich ist die Datei: Was von dort zurückkommt, steht danach im Feld.
    const { wrapper, type } = inspector();

    await wrapper.setProps({ block: block({ type: 'Kopfzeile', instructions: 'aus der Datei' }) });

    expect((type.element as HTMLInputElement).value).toBe('Kopfzeile');
    expect((wrapper.get('textarea.di-instructions').element as HTMLTextAreaElement).value)
      .toBe('aus der Datei');
  });

  it('lässt sich schließen', async () => {
    const { wrapper } = inspector();

    await wrapper.get('.di-close').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('verwirft auf Escape, was im Feld steht, und schließt', async () => {
    const { wrapper, type } = inspector(block({ type: 'Liste' }));

    await typing(type, 'vertippt');
    await type.trigger('keydown.esc');

    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect((type.element as HTMLInputElement).value).toBe('Liste');
  });

  it('behält Escape für sich, damit nicht gleich der Entwurfs-Modus zugeht', async () => {
    const draussen = vi.fn();
    window.addEventListener('keydown', draussen);
    try {
      const { instructions } = inspector();
      await instructions.trigger('keydown.esc');
      expect(draussen).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', draussen);
    }
  });

  // c0110: Das Feld redet von einem Kasten — also gehört auch das Wegwerfen
  // dieses Kastens hierher.
  it('bittet um das Löschen des Kastens', async () => {
    const { wrapper } = inspector();

    await wrapper.get('.di-delete').trigger('click');

    expect(wrapper.emitted('delete')).toHaveLength(1);
    // Geschrieben wird hier nichts, und geschlossen wird auch nicht: Das
    // entscheidet, was von der Platte zurückkommt.
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  // c0111: Ein Kasten ist nicht nur er selbst, sondern eine Stelle im Baum —
  // das Feld zeigt den Weg zu ihm und das, was er enthält.
  describe('Gliederung', () => {
    /** Kopf › Inhalt › Liste — die Liste ist ausgewählt und hat zwei Kinder. */
    function nested() {
      const kinder = [block({ id: 'b4', name: 'Zeile' }), block({ id: 'b5', name: 'Fuß' })];
      const liste = block({ id: 'b3', name: 'Liste', children: kinder });
      return inspector(liste, [block({ id: 'b1', name: 'Rahmen' }), block({ id: 'b2', name: 'Inhalt' })]);
    }

    it('zeigt den Weg von der Wurzel bis zum Kasten', () => {
      const { wrapper } = nested();

      const weg = wrapper.findAll('.di-path .di-crumb, .di-path .di-root, .di-path .di-name');
      expect(weg.map((c) => c.text())).toEqual(['Entwurf', 'Rahmen', 'Inhalt', 'Liste']);
    });

    it('stellt einen Wurzelkasten unmittelbar an den Entwurf', () => {
      const { wrapper } = inspector(block({ name: 'Kopf' }));

      expect(wrapper.findAll('.di-path .di-crumb')).toHaveLength(0);
      expect(wrapper.get('.di-root').text()).toBe('Entwurf');
      expect(wrapper.get('.di-name').text()).toBe('Kopf');
    });

    it('wechselt mit einem Klick zu einem Vorfahren', async () => {
      const { wrapper } = nested();

      await wrapper.findAll('.di-path .di-crumb')[1].trigger('click');

      expect(wrapper.emitted('select')).toEqual([['b2']]);
      // Gewechselt wird nicht hier: Welcher Kasten ausgewählt ist, weiß die
      // Fläche — das Feld bittet nur darum.
      expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('bietet den Kasten selbst nicht zum Wechseln an', () => {
      const { wrapper } = nested();

      expect(wrapper.get('.di-name').element.tagName).not.toBe('BUTTON');
    });

    it('zeigt, was der Kasten unmittelbar enthält', () => {
      const { wrapper } = nested();

      expect(wrapper.findAll('.di-kid').map((k) => k.text())).toEqual(['Zeile', 'Fuß']);
    });

    it('wechselt mit einem Klick zu einem Kind', async () => {
      const { wrapper } = nested();

      await wrapper.findAll('.di-kid')[0].trigger('click');

      expect(wrapper.emitted('select')).toEqual([['b4']]);
    });

    it('schweigt über die Kinder, wenn es keine gibt', () => {
      const { wrapper } = inspector();

      expect(wrapper.find('.di-kids').exists()).toBe(false);
    });

    it('übernimmt die Gliederung, die der gespeicherte Entwurf zurückmeldet', async () => {
      // Maßgeblich ist die Datei — auch für den Weg und die Kinder.
      const { wrapper } = nested();

      await wrapper.setProps({
        block: block({ id: 'b3', name: 'Liste', children: [block({ id: 'b4', name: 'Zeile' })] }),
        ancestors: [block({ id: 'b1', name: 'Rahmen' })],
      });

      expect(wrapper.findAll('.di-path .di-crumb').map((c) => c.text())).toEqual(['Rahmen']);
      expect(wrapper.findAll('.di-kid').map((k) => k.text())).toEqual(['Zeile']);
    });
  });

  /**
   * jsdom rechnet kein CSS einer SFC aus. Wo das Feld steht, hängt aber eine
   * Aussage dran (i0008), darum wird sie im Quelltext nachgeschlagen: der
   * Rumpf der Regel für diesen Wähler, ohne Kommentare.
   */
  function styleRule(selector: string): string {
    const source = readFileSync('src/components/DesignInspector.vue', 'utf8');
    // Hinter dem Etikett anfangen — sonst stünde es mit vor der ersten Klammer.
    const styles = source
      .slice(source.indexOf('>', source.indexOf('<style')) + 1)
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of styles.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (rule[1].split(',').some((s) => s.trim() === selector)) return rule[2];
    }
    throw new Error(`Keine CSS-Regel für ${selector} in DesignInspector.vue`);
  }

  describe('bleibt neben dem Chat ganz zu sehen (i0008)', () => {
    // Die Composer-Leiste liegt über dem unteren Teil des Fensters — beim
    // Anlegen einer App steht sie immer offen und verdeckte das halbe Feld.
    // Wie hoch sie steht, schreibt der Rahmen an (WindowFrame).
    it('setzt sich über die Composer-Leiste statt unter sie', () => {
      expect(styleRule('.design-inspector')).toMatch(
        /bottom:\s*calc\(\s*12px\s*\+\s*var\(--composer-height,\s*0px\)\s*\)/,
      );
    });

    it('nimmt sich nur den Platz, der daneben bleibt, und rollt sonst', () => {
      const rule = styleRule('.design-inspector');
      expect(rule).toMatch(/max-height:\s*calc\([^;]*var\(--composer-height,\s*0px\)[^;]*\)/);
      expect(rule).toMatch(/overflow-y:\s*auto/);
    });
  });

  it('sagt, dass die Kinder des Kastens bleiben', async () => {
    // Gelöscht wird der Rahmen, nicht der Inhalt (core/design: deleteBlock) —
    // das soll dranstehen, bevor jemand klickt.
    const { wrapper } = inspector();

    expect(wrapper.get('.di-delete').attributes('title')).toContain('Kinder');
  });
});
