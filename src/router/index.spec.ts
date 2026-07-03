import { describe, it, expect } from 'vitest';
import { router } from './index';

describe('router', () => {
  it('kennt den Startbildschirm unter /', () => {
    const match = router.resolve('/');
    expect(match.name).toBe('start');
  });

  it('definiert Start- und Desktop-Route', () => {
    const names = router.getRoutes().map((r) => r.name);
    expect(names).toContain('start');
    expect(names).toContain('desktop');
  });

  it('kennt keine eigenständigen App-/Versions-Routen mehr (Apps sind Fenster)', () => {
    const names = router.getRoutes().map((r) => r.name);
    expect(names).not.toContain('app');
    expect(names).not.toContain('app-new');
    expect(names).not.toContain('versions');
  });

  it('leitet Alt-App-Links auf den Desktop um', () => {
    expect(router.resolve('/app/rechner-1').redirectedFrom).toBeUndefined();
    // Die Redirect-Definition zeigt auf den Desktop.
    const record = router.getRoutes().find((r) => r.path === '/app/:id');
    expect(record?.redirect).toBe('/desktop');
  });
});
