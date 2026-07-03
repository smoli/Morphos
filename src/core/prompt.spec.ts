import { describe, it, expect } from 'vitest';
import { buildPrompt, SYSTEM_PROMPT } from './prompt';

describe('SYSTEM_PROMPT', () => {
  it('beschreibt die Engine-Rolle und verlangt reines HTML', () => {
    expect(SYSTEM_PROMPT).toContain('Morphos');
    expect(SYSTEM_PROMPT).toMatch(/<!DOCTYPE html>/);
    expect(SYSTEM_PROMPT).toMatch(/localStorage/i);
  });

  it('verlangt Titel und Icon für die Desktop-Kachel', () => {
    expect(SYSTEM_PROMPT).toMatch(/<title>/i);
    expect(SYSTEM_PROMPT).toContain('morphos:icon');
  });

  it('dokumentiert das Dateisystem-API window.morphosFS', () => {
    expect(SYSTEM_PROMPT).toContain('window.morphosFS');
    expect(SYSTEM_PROMPT).toMatch(/writeFile/);
    expect(SYSTEM_PROMPT).toMatch(/readFile/);
  });
});

describe('buildPrompt', () => {
  it('markiert einen Neustart, wenn noch keine App existiert', () => {
    const p = buildPrompt('Ein Taschenrechner', '');
    expect(p).toContain('ES EXISTIERT NOCH KEINE APP');
    expect(p).toContain('Ein Taschenrechner');
    expect(p).not.toContain('AKTUELLE APP');
  });

  it('bettet die bestehende App zur Weiterentwicklung ein', () => {
    const current = '<!DOCTYPE html><html><body>alt</body></html>';
    const p = buildPrompt('Füge einen Button hinzu', current);
    expect(p).toContain('AKTUELLE APP');
    expect(p).toContain(current);
    expect(p).toContain('Füge einen Button hinzu');
    expect(p).not.toContain('ES EXISTIERT NOCH KEINE APP');
  });

  it('trimmt den Nutzerwunsch', () => {
    const p = buildPrompt('   Hallo   ', '');
    expect(p).toContain('Hallo');
    expect(p).not.toContain('   Hallo   ');
  });
});
