import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ContextMenu from './ContextMenu.vue';
import type { MenuItem } from '@/core/menu';

const items: MenuItem[] = [
  { id: 'open', label: 'Öffnen', icon: '↗' },
  { id: 'pin', label: 'Im Dock behalten', icon: '📌' },
  { id: 'delete', label: 'Löschen', icon: '🗑', danger: true, separator: true },
];

function mountMenu(x = 120, y = 90) {
  return mount(ContextMenu, { props: { items, x, y }, attachTo: document.body });
}

describe('ContextMenu', () => {
  it('zeigt jeden Eintrag mit Zeichen und Text', () => {
    const wrapper = mountMenu();
    const entries = wrapper.findAll('.ctx-item');
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.text())).toEqual(['↗Öffnen', '📌Im Dock behalten', '🗑Löschen']);
    wrapper.unmount();
  });

  it('klappt an der übergebenen Stelle auf', () => {
    const wrapper = mountMenu(120, 90);
    const style = (wrapper.get('.ctx').element as HTMLElement).style;
    expect(style.left).toBe('120px');
    expect(style.top).toBe('90px');
    wrapper.unmount();
  });

  it('meldet den gewählten Eintrag', async () => {
    const wrapper = mountMenu();
    await wrapper.findAll('.ctx-item')[1].trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['pin']]);
    wrapper.unmount();
  });

  it('hebt einen Eintrag hervor, der etwas wegnimmt', () => {
    const wrapper = mountMenu();
    const entries = wrapper.findAll('.ctx-item');
    expect(entries[2].classes()).toContain('danger');
    expect(entries[0].classes()).not.toContain('danger');
    wrapper.unmount();
  });

  it('schließt sich mit Escape', async () => {
    const wrapper = mountMenu();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('schließt sich bei einem Klick daneben, nicht aber im Menü', () => {
    const wrapper = mountMenu();
    wrapper.get('.ctx-item').element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(wrapper.emitted('close')).toBeUndefined();

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('horcht nicht mehr, sobald es fort ist', () => {
    const wrapper = mountMenu();
    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
