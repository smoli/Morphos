import type { AgentEvent, AgentResult } from '@/types';

/**
 * Ruhe-Zeitbudget eines Agentenlaufs: Weil die Claude CLI im Strom-Modus
 * laufend meldet, was sie tut, zählt nicht mehr die Gesamtdauer, sondern die
 * Zeit OHNE Lebenszeichen. Ein Lauf darf damit beliebig lange arbeiten und
 * bricht erst ab, wenn zehn Minuten lang nichts mehr kommt.
 */
export const AGENT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Meldung zum Abbruch — die Minutenangabe folgt dem Zeitbudget. */
export function agentIdleTimeoutMessage(timeoutMs: number = AGENT_IDLE_TIMEOUT_MS): string {
  const minutes = Math.max(1, Math.round(timeoutMs / 60_000));
  const unit = minutes === 1 ? 'Minute' : 'Minuten';
  return `Zeitüberschreitung: Die Claude CLI hat sich seit ${minutes} ${unit} nicht mehr gemeldet.`;
}

/** Kurzer Anzeigetext zu einem Fortschrittsereignis (für den Chat). */
export function agentEventLabel(event: AgentEvent): string {
  switch (event.kind) {
    case 'start':
      return 'Agent gestartet';
    case 'think':
      return 'Denkt nach …';
    case 'tool':
      return event.detail ? `${event.name}: ${event.detail}` : event.name;
    case 'write':
      return `Schreibt ${event.path}`;
    case 'delete':
      return `Löscht ${event.path}`;
    case 'say':
      return 'Formuliert eine Mitteilung';
    case 'done':
      return 'Fertig';
  }
}

/** Ein laufender Strom der Claude CLI: Datenblöcke rein, Ereignisse raus. */
export interface AgentStream {
  /**
   * Nimmt ein Stück stdout entgegen (Zeilengrenzen dürfen mitten hindurch
   * gehen) und liefert die daraus vollständig ablesbaren Ereignisse.
   */
  push(chunk: string): AgentEvent[];
  /** Das Endergebnis, sobald die CLI ihre result-Zeile geschickt hat; sonst null. */
  result(): AgentResult | null;
}

const MAX_DETAIL_CHARS = 80;

// Aus diesen Eingabefeldern eines Werkzeugaufrufs wird das angezeigte Ziel
// gewonnen — das erste vorhandene gewinnt.
const DETAIL_KEYS = ['file_path', 'path', 'command', 'pattern', 'url', 'query', 'description'];

/** Das Ziel eines Werkzeugaufrufs als eine kurze Zeile. */
function toolDetail(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  for (const key of DETAIL_KEYS) {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const flat = value.trim().replace(/\s+/g, ' ');
    return flat.length > MAX_DETAIL_CHARS ? `${flat.slice(0, MAX_DETAIL_CHARS - 1)}…` : flat;
  }
  return undefined;
}

type Json = Record<string, unknown>;

const isJson = (v: unknown): v is Json => !!v && typeof v === 'object';

/**
 * Liest den JSONL-Strom der Claude CLI (`--output-format stream-json
 * --include-partial-messages`) mit: Werkzeugschritte kommen aus den
 * assistant-Nachrichten, der Fortschritt an den Dateien aus den Marken im
 * strömenden Antworttext (siehe core/files: ===MORPHOS:FILE …===).
 */
export function createAgentStream(): AgentStream {
  // Angefangene, noch nicht abgeschlossene JSON- bzw. Antworttext-Zeile.
  let lineBuffer = '';
  let textBuffer = '';
  let finished: AgentResult | null = null;

  /** Marken im strömenden Antworttext erkennen — nur vollständige Zeilen zählen. */
  function fromText(delta: string): AgentEvent[] {
    textBuffer += delta;
    const parts = textBuffer.split('\n');
    textBuffer = parts.pop() ?? '';
    const events: AgentEvent[] = [];
    for (const part of parts) {
      const text = part.trim();
      const file = /^===MORPHOS:FILE (.+?)===$/.exec(text);
      if (file) {
        events.push({ kind: 'write', path: file[1].trim() });
        continue;
      }
      const del = /^===MORPHOS:DELETE (.+?)===$/.exec(text);
      if (del) {
        events.push({ kind: 'delete', path: del[1].trim() });
        continue;
      }
      if (text === '===MORPHOS:SAY===') events.push({ kind: 'say' });
    }
    return events;
  }

  function fromStreamEvent(event: Json): AgentEvent[] {
    if (event.type === 'content_block_start') {
      const block = event.content_block;
      return isJson(block) && block.type === 'thinking' ? [{ kind: 'think' }] : [];
    }
    if (event.type === 'content_block_delta') {
      const delta = event.delta;
      if (isJson(delta) && delta.type === 'text_delta' && typeof delta.text === 'string') {
        return fromText(delta.text);
      }
    }
    return [];
  }

  /** Werkzeugaufrufe stehen erst in der vollständigen Nachricht (mit Eingabe). */
  function fromAssistant(message: unknown): AgentEvent[] {
    const content = isJson(message) ? message.content : null;
    if (!Array.isArray(content)) return [];
    const events: AgentEvent[] = [];
    for (const block of content) {
      if (!isJson(block) || block.type !== 'tool_use') continue;
      const name = typeof block.name === 'string' ? block.name : 'Werkzeug';
      const detail = toolDetail(block.input);
      events.push({ kind: 'tool', name, ...(detail ? { detail } : {}) });
    }
    return events;
  }

  function fromResult(message: Json): AgentEvent[] {
    const text = typeof message.result === 'string' ? message.result : '';
    const subtype = typeof message.subtype === 'string' ? message.subtype : '';
    const failed = message.is_error === true || (subtype !== '' && subtype !== 'success');
    finished = failed
      ? { ok: false, error: text.trim() || `Claude-Ergebnis: ${subtype || 'Fehler'}` }
      : { ok: true, text };
    return [{ kind: 'done' }];
  }

  function fromLine(value: unknown): AgentEvent[] {
    if (!isJson(value)) return [];
    switch (value.type) {
      case 'system':
        return value.subtype === 'init' ? [{ kind: 'start' }] : [];
      case 'stream_event':
        return isJson(value.event) ? fromStreamEvent(value.event) : [];
      case 'assistant':
        return fromAssistant(value.message);
      case 'result':
        return fromResult(value);
      default:
        return [];
    }
  }

  return {
    push(chunk: string): AgentEvent[] {
      lineBuffer += chunk;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      const events: AgentEvent[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue; // Fremdausgaben (Warnungen o. Ä.) übergehen
        }
        events.push(...fromLine(parsed));
      }
      return events;
    },

    result: () => finished,
  };
}
