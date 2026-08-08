import { describe, it, expect } from 'vitest';
import { formatBytes } from './bytes';

describe('formatBytes', () => {
  it('zeigt kleine Größen in ganzen Bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('rechnet in die nächstgrößere Einheit um', () => {
    expect(formatBytes(1024)).toBe('1,0 KB');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1,0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3,0 GB');
  });

  it('zeigt ab zehn Einheiten keine Nachkommastelle mehr', () => {
    expect(formatBytes(20 * 1024)).toBe('20 KB');
    expect(formatBytes(512 * 1024 * 1024)).toBe('512 MB');
  });

  it('rückt bei 1024 in die nächste Einheit auf, statt „1024 KB“ zu zeigen', () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe('1,0 MB');
  });

  it('nimmt unbrauchbare Werte als nichts', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(undefined)).toBe('0 B');
  });
});
