import { describe, it, expect } from 'vitest';
import { cleanUiMode, DEFAULT_UI_MODE, UI_MODES, UI_MODE_OPTIONS } from './uimode';

describe('core/uimode', () => {
  it('kennt die drei Darstellungen und beginnt bei Fenstern', () => {
    expect(UI_MODES).toEqual(['windows', 'single', 'tiles']);
    expect(DEFAULT_UI_MODE).toBe('windows');
  });

  it('beschreibt jede Darstellung mit Name, Symbol und Erklärung — in derselben Reihenfolge', () => {
    expect(UI_MODE_OPTIONS.map((o) => o.id)).toEqual([...UI_MODES]);
    for (const option of UI_MODE_OPTIONS) {
      expect(option.label).toBeTruthy();
      expect(option.icon).toBeTruthy();
      expect(option.hint).toBeTruthy();
    }
  });

  it('lässt jede bekannte Darstellung durch', () => {
    for (const mode of UI_MODES) expect(cleanUiMode(mode)).toBe(mode);
  });

  it('fällt bei Unbekanntem, Fehlendem oder Fremdem auf die Vorgabe zurück', () => {
    expect(cleanUiMode(undefined)).toBe('windows');
    expect(cleanUiMode(null)).toBe('windows');
    expect(cleanUiMode('kacheln')).toBe('windows');
    expect(cleanUiMode(7)).toBe('windows');
  });
});
