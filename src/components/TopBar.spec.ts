import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TopBar from './TopBar.vue';

const global = { stubs: { RouterLink: { template: '<a><slot /></a>' } } };

describe('TopBar', () => {
  it('zeigt den Namen der Anwendung', () => {
    const wrapper = mount(TopBar, { props: { historyCount: 0 }, global });
    expect(wrapper.text()).toContain('Morphos');
  });

  it('zeigt die Anzahl der Versionen', () => {
    const wrapper = mount(TopBar, { props: { historyCount: 3 }, global });
    expect(wrapper.text()).toContain('3');
  });
});
