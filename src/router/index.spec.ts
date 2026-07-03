import { describe, it, expect } from 'vitest';
import { router } from './index';

describe('router', () => {
  it('kennt den Startbildschirm unter /', () => {
    const match = router.resolve('/');
    expect(match.name).toBe('start');
  });

  it('definiert Desktop-, App- und Versionsrouten', () => {
    const names = router.getRoutes().map((r) => r.name);
    expect(names).toContain('start');
    expect(names).toContain('desktop');
    expect(names).toContain('app-new');
    expect(names).toContain('app');
    expect(names).toContain('versions');
  });

  it('löst eine App-Route mit Id auf', () => {
    const match = router.resolve('/app/rechner-1');
    expect(match.name).toBe('app');
    expect(match.params.id).toBe('rechner-1');
  });
});
