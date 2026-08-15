import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PublishAppDialog from './PublishAppDialog.vue';

function mountDialog(props: Partial<{ appName: string; busy: boolean; error: string | null }> = {}) {
  return mount(PublishAppDialog, { props: { appName: 'Rechner', busy: false, error: null, ...props } });
}

describe('PublishAppDialog', () => {
  it('nennt die App, um die es geht', () => {
    expect(mountDialog().text()).toContain('Rechner');
  });

  it('sagt, dass der Anwender das leere Repository selbst anlegt', () => {
    // Morphos legt keines an (kein API-Schlüssel im Haus) — das muss dastehen,
    // sonst wartet der Anwender auf etwas, das nicht kommt.
    const text = mountDialog().text();
    expect(text).toMatch(/leer/i);
    expect(text).toMatch(/\bLege\b/);
    expect(text).toMatch(/legt Morphos nicht an/i);
  });

  it('fragt nach der Adresse und meldet sie beim Absenden', async () => {
    const wrapper = mountDialog();
    await wrapper.get('.url-input').setValue('  https://github.com/jemand/rechner.git  ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toEqual([['https://github.com/jemand/rechner.git']]);
  });

  it('schickt keine leere Adresse los', async () => {
    const wrapper = mountDialog();
    await wrapper.get('.url-input').setValue('   ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('.go').attributes('disabled')).toBeDefined();
  });

  it('zeigt, dass veröffentlicht wird, und schickt nicht ein zweites Mal', async () => {
    const wrapper = mountDialog({ busy: true });
    expect(wrapper.get('.busy').text()).toMatch(/veröffentlicht|geschoben/i);
    await wrapper.get('.url-input').setValue('https://github.com/jemand/rechner.git');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('zeigt einen Fehler an', () => {
    const wrapper = mountDialog({ error: 'Auf github.com liegt unter dieser Adresse schon etwas.' });
    expect(wrapper.get('.error').text()).toContain('liegt unter dieser Adresse schon etwas');
  });

  it('schließt über das Kreuz und den Hintergrund — beim Veröffentlichen aber nicht', async () => {
    const wrapper = mountDialog();
    await wrapper.get('.close').trigger('click');
    await wrapper.get('.backdrop').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);

    const busy = mountDialog({ busy: true });
    await busy.get('.backdrop').trigger('click');
    expect(busy.emitted('close')).toBeUndefined();
  });
});
