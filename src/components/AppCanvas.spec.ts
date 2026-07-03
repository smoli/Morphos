import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppCanvas from './AppCanvas.vue';

describe('AppCanvas', () => {
  it('rendert das HTML in einem iframe via srcdoc und injiziert die Brücke', () => {
    const html = '<!DOCTYPE html><html><head></head><body>Hallo</body></html>';
    const wrapper = mount(AppCanvas, { props: { html } });
    const srcdoc = wrapper.get('iframe').attributes('srcdoc') ?? '';
    expect(srcdoc).toContain('Hallo');
    expect(srcdoc).toContain('data-morphos-bridge');
    expect(srcdoc).toContain('window.morphosFS');
  });

  it('läuft in einer Sandbox ohne same-origin-Rechte', () => {
    const wrapper = mount(AppCanvas, { props: { html: '<html></html>' } });
    const sandbox = wrapper.get('iframe').attributes('sandbox') ?? '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });
});
