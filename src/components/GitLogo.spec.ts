import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import GitLogo from './GitLogo.vue';

describe('GitLogo', () => {
  it('zeichnet das Git-Logo als SVG', () => {
    const svg = mount(GitLogo).get('svg');
    expect(svg.attributes('viewBox')).toBe('0 0 97 97');
    // Der Rautenkörper mit dem Zweig — ein einziger Pfad in Git-Orange.
    const path = svg.get('path');
    expect(path.attributes('fill')).toBe('#f05133');
    expect(path.attributes('d')).toMatch(/^M92\.71,44\.408/);
  });

  it('nimmt eine Größe an', () => {
    const svg = mount(GitLogo, { props: { size: 34 } }).get('svg');
    expect(svg.attributes('width')).toBe('34');
    expect(svg.attributes('height')).toBe('34');
  });

  it('ist für Vorleseprogramme benannt', () => {
    const svg = mount(GitLogo).get('svg');
    expect(svg.attributes('role')).toBe('img');
    expect(svg.attributes('aria-label')).toBe('Git');
  });
});
