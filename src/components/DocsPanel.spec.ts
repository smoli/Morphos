import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DocsPanel from './DocsPanel.vue';

const DOCS = {
  concept: '# Rechner\n\nRechnet mit **vier** Grundrechenarten.',
  userdoc: '# Anleitung\n\n- Zahl tippen\n- Rechenart wählen',
};

describe('DocsPanel', () => {
  it('zeigt zuerst das Konzept als gerendertes Markdown', () => {
    const wrapper = mount(DocsPanel, { props: { docs: DOCS } });
    const body = wrapper.get('.docs-body');
    expect(body.html()).toContain('<h1>Rechner</h1>');
    expect(body.html()).toContain('<strong>vier</strong>');
    expect(body.text()).not.toContain('Zahl tippen');
  });

  it('wechselt über die Reiter zur Anleitung', async () => {
    const wrapper = mount(DocsPanel, { props: { docs: DOCS } });
    const tabs = wrapper.findAll('.docs-tab');
    expect(tabs.map((t) => t.text())).toEqual(['Konzept', 'Anleitung']);

    await tabs[1].trigger('click');

    const body = wrapper.get('.docs-body');
    expect(body.html()).toContain('<li>Zahl tippen</li>');
    expect(body.text()).not.toContain('Grundrechenarten');
    expect(tabs[1].classes()).toContain('active');
  });

  it('escapt Markup aus den Dokumenten (kein eingeschleustes HTML)', () => {
    const wrapper = mount(DocsPanel, {
      props: { docs: { concept: '<img src=x onerror=alert(1)>', userdoc: '' } },
    });
    const html = wrapper.get('.docs-body').html();
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('sagt es, wenn ein Dokument noch fehlt', async () => {
    const wrapper = mount(DocsPanel, { props: { docs: { concept: '', userdoc: '' } } });
    expect(wrapper.get('.docs-empty').text()).toContain('noch kein Konzept');

    await wrapper.findAll('.docs-tab')[1].trigger('click');
    expect(wrapper.get('.docs-empty').text()).toContain('noch keine Anleitung');
  });

  it('lässt sich schließen und bietet keinerlei Bearbeitung an', async () => {
    const wrapper = mount(DocsPanel, { props: { docs: DOCS } });
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);

    await wrapper.get('.docs-close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
