import { describe, it, expect, vi } from 'vitest';
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

function inspector(b: Block = block()) {
  const wrapper = mount(DesignInspector, { props: { block: b } });
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

  it('sagt, dass die Kinder des Kastens bleiben', async () => {
    // Gelöscht wird der Rahmen, nicht der Inhalt (core/design: deleteBlock) —
    // das soll dranstehen, bevor jemand klickt.
    const { wrapper } = inspector();

    expect(wrapper.get('.di-delete').attributes('title')).toContain('Kinder');
  });
});
