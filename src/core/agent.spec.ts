import { describe, it, expect } from 'vitest';
import {
  AGENT_IDLE_TIMEOUT_MS,
  agentBusyIcon,
  agentBusyLabel,
  agentEventIcon,
  agentEventLabel,
  agentIdleTimeoutMessage,
  createAgentStream,
  formatElapsed,
} from './agent';
import { mcpToolId } from './mcp';
import type { AgentEvent } from '@/types';

/** Baut eine stream-json-Zeile, wie die Claude CLI sie ausgibt. */
const line = (obj: unknown): string => `${JSON.stringify(obj)}\n`;

const initLine = line({ type: 'system', subtype: 'init', session_id: 'abc', tools: ['Read'] });

const textDelta = (text: string): string =>
  line({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } } });

const resultLine = (result: string, extra: Record<string, unknown> = {}): string =>
  line({ type: 'result', subtype: 'success', is_error: false, result, ...extra });

describe('AGENT_IDLE_TIMEOUT_MS', () => {
  it('gibt einem Agentenlauf zehn Minuten ohne Lebenszeichen', () => {
    expect(AGENT_IDLE_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});

describe('agentIdleTimeoutMessage', () => {
  it('nennt die Minuten des Standard-Zeitbudgets', () => {
    expect(agentIdleTimeoutMessage()).toContain('10 Minuten');
  });

  it('folgt einem abweichenden Zeitbudget', () => {
    expect(agentIdleTimeoutMessage(90_000)).toContain('2 Minuten');
    expect(agentIdleTimeoutMessage(60_000)).toContain('1 Minute');
  });
});

describe('agentEventLabel', () => {
  it('beschreibt jedes Ereignis in einem kurzen Satz', () => {
    expect(agentEventLabel({ kind: 'start' })).toBe('Agent gestartet');
    expect(agentEventLabel({ kind: 'think' })).toBe('Denkt nach …');
    expect(agentEventLabel({ kind: 'write', path: 'src/app.js' })).toBe('Schreibt src/app.js');
    expect(agentEventLabel({ kind: 'delete', path: 'src/alt.js' })).toBe('Löscht src/alt.js');
    expect(agentEventLabel({ kind: 'say' })).toBe('Formuliert eine Mitteilung');
    expect(agentEventLabel({ kind: 'done' })).toBe('Fertig');
  });

  it('nennt beim Werkzeug den Namen und — wenn vorhanden — das Ziel', () => {
    expect(agentEventLabel({ kind: 'tool', name: 'Read', detail: '/tmp/bild.png' })).toBe('Read: /tmp/bild.png');
    expect(agentEventLabel({ kind: 'tool', name: 'Read' })).toBe('Read');
  });
});

describe('agentEventIcon', () => {
  it('gibt jedem Ereignis ein eigenes Zeichen', () => {
    expect(agentEventIcon({ kind: 'start' })).toBe('▶');
    expect(agentEventIcon({ kind: 'think' })).toBe('💭');
    expect(agentEventIcon({ kind: 'tool', name: 'Read' })).toBe('🔧');
    expect(agentEventIcon({ kind: 'write', path: 'a' })).toBe('📝');
    expect(agentEventIcon({ kind: 'delete', path: 'a' })).toBe('🗑');
    expect(agentEventIcon({ kind: 'say' })).toBe('💬');
    expect(agentEventIcon({ kind: 'done' })).toBe('✓');
  });
});

describe('agentBusyLabel', () => {
  it('nennt den zuletzt gemeldeten Schritt', () => {
    expect(agentBusyLabel([{ kind: 'start' }, { kind: 'think' }])).toBe('Denkt nach …');
    expect(agentBusyLabel([{ kind: 'think' }, { kind: 'tool', name: 'Read', detail: 'src/app.js' }]))
      .toBe('Read: src/app.js');
  });

  it('bleibt beim allgemeinen Hinweis, solange nichts gemeldet wurde', () => {
    expect(agentBusyLabel([])).toBe('Der Agent arbeitet …');
    expect(agentBusyLabel()).toBe('Der Agent arbeitet …');
  });

  it('meldet nach dem letzten Schritt keinen Vollzug — der Lauf läuft weiter', () => {
    expect(agentBusyLabel([{ kind: 'write', path: 'src/app.js' }, { kind: 'done' }])).toBe('Der Agent arbeitet …');
  });

  it('setzt das Zeichen passend zum Schritt', () => {
    expect(agentBusyIcon([{ kind: 'write', path: 'a' }])).toBe('📝');
    expect(agentBusyIcon([])).toBe('⏳');
    expect(agentBusyIcon([{ kind: 'done' }])).toBe('⏳');
  });
});

describe('formatElapsed', () => {
  it('zeigt Minuten und Sekunden', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(7_400)).toBe('0:07');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('nimmt ab einer Stunde die Stunden dazu', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });

  it('kennt keine negative Laufzeit', () => {
    expect(formatElapsed(-5_000)).toBe('0:00');
  });
});

describe('createAgentStream', () => {
  it('meldet den Start des Laufs', () => {
    const stream = createAgentStream();
    expect(stream.push(initLine)).toEqual([{ kind: 'start' }]);
    expect(stream.result()).toBeNull();
  });

  it('meldet, dass der Agent nachdenkt', () => {
    const stream = createAgentStream();
    const events = stream.push(
      line({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } } }),
    );
    expect(events).toEqual([{ kind: 'think' }]);
  });

  it('liest an den Werkzeugen von Morphos ab, was an der App geschieht', () => {
    const stream = createAgentStream();
    const events = stream.push(
      line({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 't1', name: mcpToolId('write'), input: { path: 'src/index.html', content: '<html>' } },
            { type: 'tool_use', id: 't2', name: mcpToolId('edit'), input: { path: 'src/app.js', old_text: 'a', new_text: 'b' } },
            { type: 'tool_use', id: 't3', name: mcpToolId('delete'), input: { path: 'src/alt.js' } },
            { type: 'tool_use', id: 't4', name: mcpToolId('ask'), input: { question: 'Welche Farbe?' } },
          ],
        },
      }),
    );
    expect(events).toEqual([
      { kind: 'write', path: 'src/index.html' },
      { kind: 'write', path: 'src/app.js' },
      { kind: 'delete', path: 'src/alt.js' },
      { kind: 'say' },
    ]);
  });

  it('liest den strömenden Antworttext nicht mehr auf Marken ab', () => {
    const stream = createAgentStream();
    expect(stream.push(textDelta('===MORPHOS:FILE src/style.css===\n'))).toEqual([]);
    expect(stream.push(textDelta('Ich schreibe jetzt src/app.js\n'))).toEqual([]);
  });

  it('meldet Werkzeugaufrufe mit Namen und Ziel', () => {
    const stream = createAgentStream();
    const events = stream.push(
      line({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'kurz überlegen' },
            { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/tmp/bild.png' } },
          ],
        },
      }),
    );
    expect(events).toEqual([{ kind: 'tool', name: 'Read', detail: '/tmp/bild.png' }]);
  });

  it('kürzt ein langes Werkzeug-Ziel', () => {
    const stream = createAgentStream();
    const [event] = stream.push(
      line({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'x'.repeat(300) } }] },
      }),
    ) as [Extract<AgentEvent, { kind: 'tool' }>];
    expect(event.kind).toBe('tool');
    expect(event.detail!.length).toBeLessThanOrEqual(80);
    expect(event.detail).toMatch(/…$/);
  });

  it('setzt Zeilen zusammen, die über mehrere Datenblöcke ankommen', () => {
    const stream = createAgentStream();
    const half = initLine.slice(0, 20);
    expect(stream.push(half)).toEqual([]);
    expect(stream.push(initLine.slice(20))).toEqual([{ kind: 'start' }]);
  });

  it('übergeht leere Zeilen und Fremdausgaben, die kein JSON sind', () => {
    const stream = createAgentStream();
    expect(stream.push('\n\nirgendeine Warnung\n')).toEqual([]);
    expect(stream.result()).toBeNull();
  });

  it('liefert am Ende den Antworttext des Laufs', () => {
    const stream = createAgentStream();
    stream.push(initLine);
    const events = stream.push(resultLine('===MORPHOS:FILE src/index.html===\n<html></html>\n===MORPHOS:END==='));
    expect(events).toEqual([{ kind: 'done' }]);
    expect(stream.result()).toEqual({ ok: true, text: expect.stringContaining('<html></html>') });
  });

  it('macht aus einem Fehl-Ergebnis der CLI einen Fehler', () => {
    const stream = createAgentStream();
    stream.push(line({ type: 'result', subtype: 'error_max_turns', is_error: true, result: 'Zu viele Schritte.' }));
    expect(stream.result()).toEqual({ ok: false, error: 'Zu viele Schritte.' });
  });

  it('benennt auch ein Fehl-Ergebnis ohne Text', () => {
    const stream = createAgentStream();
    stream.push(line({ type: 'result', subtype: 'error_during_execution', is_error: true }));
    expect(stream.result()).toEqual({ ok: false, error: expect.stringContaining('error_during_execution') });
  });
});
