import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppCanvas from './AppCanvas.vue';

describe('AppCanvas', () => {
  it('rendert das HTML in einem iframe via srcdoc', () => {
    const html = '<!DOCTYPE html><html><body>Hallo</body></html>';
    const wrapper = mount(AppCanvas, { props: { html } });
    const iframe = wrapper.get('iframe');
    expect(iframe.attributes('srcdoc')).toBe(html);
  });

  it('läuft in einer Sandbox ohne same-origin-Rechte', () => {
    const wrapper = mount(AppCanvas, { props: { html: '<html></html>' } });
    const sandbox = wrapper.get('iframe').attributes('sandbox') ?? '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });
});
