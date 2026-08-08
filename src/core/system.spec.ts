import { describe, it, expect } from 'vitest';
import { EXPLORER_ID, SYSTEM_WINDOWS, systemWindow } from './system';

describe('core/system', () => {
  it('führt den Datei-Explorer als Fenster der Schale', () => {
    const explorer = systemWindow(EXPLORER_ID);
    expect(explorer).toBeDefined();
    expect(explorer!.title).toBeTruthy();
    expect(explorer!.icon).toBeTruthy();
  });

  it('vergibt jede Kennung nur einmal', () => {
    const ids = SYSTEM_WINDOWS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('kennt eine fremde Kennung nicht', () => {
    expect(systemWindow('gibt-es-nicht')).toBeUndefined();
  });
});
