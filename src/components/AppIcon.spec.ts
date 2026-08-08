import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppIcon from './AppIcon.vue';

const IMAGE = `data:image/png;base64,${Buffer.alloc(60, 3).toString('base64')}`;

describe('AppIcon', () => {
  it('zeigt ein Emoji als Text', () => {
    const wrapper = mount(AppIcon, { props: { icon: '🧮', size: 42 } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toBe('🧮');
    expect(wrapper.attributes('style')).toContain('font-size: 42px');
  });

  it('zeigt ein Bild-Icon als Bild', () => {
    const wrapper = mount(AppIcon, { props: { icon: IMAGE, size: 16 } });
    const img = wrapper.get('img');
    expect(img.attributes('src')).toBe(IMAGE);
    expect(img.attributes('style')).toContain('16px');
  });

  it('fällt ohne Icon auf die Vorgabe zurück', () => {
    expect(mount(AppIcon, { props: { icon: '' } }).text()).toBe('🧩');
    expect(mount(AppIcon, { props: { icon: null } }).text()).toBe('🧩');
  });
});
