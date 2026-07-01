import { describe, it, expect } from 'vitest';
import { router } from './index';

describe('router', () => {
  it('kennt die Arbeitsansicht unter /', () => {
    const match = router.resolve('/');
    expect(match.matched.length).toBeGreaterThan(0);
  });

  it('kennt die Versionsansicht unter /versions', () => {
    const paths = router.getRoutes().map((r) => r.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/versions');
  });
});
