import { describe, it, expect, vi } from 'vitest';
import { pickTerminal, terminalCandidates } from './terminal';

describe('terminalCandidates', () => {
  it('öffnet auf macOS Terminal.app mit dem Ordner als Argument', () => {
    expect(terminalCandidates('darwin', '/apps')).toEqual([{ command: 'open', args: ['-a', 'Terminal', '/apps'] }]);
  });

  it('kennt auf Windows das Windows Terminal und die Eingabeaufforderung', () => {
    const candidates = terminalCandidates('win32', 'C:\\apps');
    expect(candidates[0]).toEqual({ command: 'wt.exe', args: ['-d', 'C:\\apps'] });
    expect(candidates[candidates.length - 1].command).toBe('cmd.exe');
  });

  it('zählt auf Linux die üblichen Terminals auf — der Ordner steckt dort im cwd', () => {
    const candidates = terminalCandidates('linux', '/apps');
    expect(candidates.map((c) => c.command)).toContain('gnome-terminal');
    expect(candidates.map((c) => c.command)).toContain('xterm');
    // Keines bekommt den Ordner als Argument: jedes Terminal hätte dafür eine
    // andere Option — der Kindprozess startet stattdessen im Ordner.
    expect(candidates.every((c) => c.args.length === 0)).toBe(true);
  });
});

describe('pickTerminal', () => {
  it('nimmt das erste vorhandene Programm und dessen vollen Pfad', () => {
    const find = vi.fn((names: string[]) => (names.includes('konsole') ? '/usr/bin/konsole' : null));
    expect(pickTerminal('linux', '/apps', find)).toEqual({ command: '/usr/bin/konsole', args: [] });
  });

  it('behält die Argumente des Kandidaten bei', () => {
    const find = vi.fn(() => '/usr/bin/open');
    expect(pickTerminal('darwin', '/apps', find)).toEqual({
      command: '/usr/bin/open',
      args: ['-a', 'Terminal', '/apps'],
    });
  });

  it('meldet null, wenn kein Terminal installiert ist', () => {
    expect(pickTerminal('linux', '/apps', () => null)).toBe(null);
  });

  it('fällt auf Windows auf die Eingabeaufforderung zurück — die gibt es dort immer', () => {
    expect(pickTerminal('win32', 'C:\\apps', () => null)).toEqual({
      command: 'cmd.exe',
      args: ['/c', 'start', '', 'cmd.exe'],
    });
  });
});
