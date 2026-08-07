import { describe, it, expect } from 'vitest';
import {
  AGENT_IDLE_TIMEOUT_MS,
  agentEventLabel,
  agentIdleTimeoutMessage,
  createAgentStream,
} from './agent';
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

  it('leitet aus dem strömenden Antworttext ab, welche Datei gerade entsteht', () => {
    const stream = createAgentStream();
    const events = [
      ...stream.push(textDelta('===MORPHOS:FILE src/index.html===\n<!DOCTYPE html>\n')),
      ...stream.push(textDelta('<body>hallo</body>\n===MORPHOS:END===\n')),
      ...stream.push(textDelta('===MORPHOS:DELETE src/alt.js===\n')),
      ...stream.push(textDelta('===MORPHOS:SAY===\nUmgesetzt.\n===MORPHOS:END===\n')),
    ];
    expect(events).toEqual([
      { kind: 'write', path: 'src/index.html' },
      { kind: 'delete', path: 'src/alt.js' },
      { kind: 'say' },
    ]);
  });

  it('erkennt eine Marke auch, wenn sie über mehrere Ereignisse verteilt ankommt', () => {
    const stream = createAgentStream();
    expect(stream.push(textDelta('===MORPHOS:'))).toEqual([]);
    expect(stream.push(textDelta('FILE src/style'))).toEqual([]);
    expect(stream.push(textDelta('.css===\n'))).toEqual([{ kind: 'write', path: 'src/style.css' }]);
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
