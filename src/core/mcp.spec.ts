import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MCP_ALLOWED_TOOLS,
  MCP_DENIED_TOOLS,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_FILE,
  MCP_SERVER_NAME,
  agentMcpArgs,
  createMcpServer,
  createMcpStdio,
  emptyRunLog,
  mcpConfigJson,
  mcpLaunch,
  mcpToolId,
  parseRunLog,
  wroteSomething,
  writablePath,
} from './mcp';
import { CONCEPT_FILE, USERDOC_FILE } from './docs';

/* ------------------------------------------------------------------ *
 * Die Grenze: Was darf der Agent überhaupt schreiben?
 * ------------------------------------------------------------------ */

describe('writablePath', () => {
  const root = path.resolve('/apps/notizen');

  it('erlaubt Quelldateien unter src/', () => {
    const p = writablePath(root, 'src/app.js');
    expect(p).toBe(path.join(root, 'src', 'app.js'));
    expect(writablePath(root, 'src/ui/liste.js')).not.toBeNull();
  });

  it('erlaubt genau die beiden Dokumente der App', () => {
    expect(writablePath(root, CONCEPT_FILE)).toBe(path.join(root, CONCEPT_FILE));
    expect(writablePath(root, USERDOC_FILE)).toBe(path.join(root, USERDOC_FILE));
  });

  it('weist alles außerhalb von src/ ab', () => {
    expect(writablePath(root, 'app.json')).toBeNull();
    expect(writablePath(root, '.git/config')).toBeNull();
    expect(writablePath(root, 'notizen.md')).toBeNull();
    expect(writablePath(root, 'src')).toBeNull();
  });

  it('kann mit .. nicht aus dem App-Ordner ausbrechen', () => {
    expect(writablePath(root, '../andere-app/src/app.js')).toBeNull();
    expect(writablePath(root, 'src/../../geheim.txt')).toBeNull();
    expect(writablePath(root, 'src/../app.json')).toBeNull();
    expect(writablePath(root, '..')).toBeNull();
  });

  it('kann mit absoluten Pfaden nicht ausbrechen', () => {
    expect(writablePath(root, '/etc/passwd')).toBeNull();
    expect(writablePath(root, 'C:\\Windows\\system32\\drivers\\etc\\hosts')).toBeNull();
    expect(writablePath(root, path.resolve('/apps/andere/src/app.js'))).toBeNull();
  });

  it('nimmt einen absoluten Pfad an, der schon im App-Ordner liegt', () => {
    const abs = path.join(root, 'src', 'app.js');
    expect(writablePath(root, abs)).toBe(abs);
  });

  it('weist Leeres und Nicht-Zeichenketten ab', () => {
    expect(writablePath(root, '')).toBeNull();
    expect(writablePath(root, '   ')).toBeNull();
    expect(writablePath(root, undefined)).toBeNull();
    expect(writablePath(root, 42)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Die Werkzeuge — am echten Ordner geprüft.
 * ------------------------------------------------------------------ */

let root: string;
let journal: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-mcp-'));
  journal = path.join(root, 'lauf.jsonl');
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Ruft ein Werkzeug auf und liefert das Ergebnis der CLI-Antwort. */
function call(
  server: ReturnType<typeof createMcpServer>,
  name: string,
  args: Record<string, unknown>,
): { text: string; isError: boolean } {
  const res = server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const result = (res as { result?: { content?: { text?: string }[]; isError?: boolean } })?.result;
  return { text: result?.content?.[0]?.text ?? '', isError: result?.isError === true };
}

describe('write', () => {
  it('legt eine Datei samt Ordnern an und merkt sie sich', () => {
    const server = createMcpServer({ root });
    const res = call(server, 'write', { path: 'src/ui/liste.js', content: 'export const x = 1;\n' });

    expect(res.isError).toBe(false);
    expect(fs.readFileSync(path.join(root, 'src/ui/liste.js'), 'utf8')).toBe('export const x = 1;\n');
    expect(server.log().writes).toEqual(['src/ui/liste.js']);
  });

  it('ersetzt eine bestehende Datei vollständig', () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src/app.js'), 'alt');
    const server = createMcpServer({ root });
    call(server, 'write', { path: 'src/app.js', content: 'neu' });

    expect(fs.readFileSync(path.join(root, 'src/app.js'), 'utf8')).toBe('neu');
  });

  it('führt jede Datei nur einmal, auch bei mehreren Schreibvorgängen', () => {
    const server = createMcpServer({ root });
    call(server, 'write', { path: 'src/app.js', content: 'a' });
    call(server, 'write', { path: 'src/app.js', content: 'b' });

    expect(server.log().writes).toEqual(['src/app.js']);
  });

  it('weist einen Pfad außerhalb der Grenze ab, ohne etwas zu schreiben', () => {
    const server = createMcpServer({ root });
    const res = call(server, 'write', { path: '../ausbruch.txt', content: 'x' });

    expect(res.isError).toBe(true);
    expect(res.text).toContain('src/');
    expect(fs.existsSync(path.join(path.dirname(root), 'ausbruch.txt'))).toBe(false);
    expect(server.log().writes).toEqual([]);
  });

  it('weist app.json und .git ab', () => {
    const server = createMcpServer({ root });
    expect(call(server, 'write', { path: 'app.json', content: '{}' }).isError).toBe(true);
    expect(call(server, 'write', { path: '.git/config', content: 'x' }).isError).toBe(true);
    expect(fs.existsSync(path.join(root, 'app.json'))).toBe(false);
  });

  it('schreibt die beiden Dokumente der App', () => {
    const server = createMcpServer({ root });
    expect(call(server, 'write', { path: CONCEPT_FILE, content: '# Konzept' }).isError).toBe(false);
    expect(fs.readFileSync(path.join(root, CONCEPT_FILE), 'utf8')).toBe('# Konzept');
  });

  it('besteht auf einem Inhalt', () => {
    const server = createMcpServer({ root });
    expect(call(server, 'write', { path: 'src/app.js' }).isError).toBe(true);
  });
});

describe('edit', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src/app.js'), 'const a = 1;\nconst b = 2;\nconst a2 = 1;\n');
  });

  it('ersetzt genau eine eindeutige Stelle', () => {
    const server = createMcpServer({ root });
    const res = call(server, 'edit', { path: 'src/app.js', old_text: 'const b = 2;', new_text: 'const b = 3;' });

    expect(res.isError).toBe(false);
    expect(fs.readFileSync(path.join(root, 'src/app.js'), 'utf8')).toContain('const b = 3;');
    expect(server.log().writes).toEqual(['src/app.js']);
  });

  it('lehnt eine mehrdeutige Stelle ab', () => {
    const server = createMcpServer({ root });
    const res = call(server, 'edit', { path: 'src/app.js', old_text: 'const a', new_text: 'const c' });

    expect(res.isError).toBe(true);
    expect(res.text).toContain('2');
    expect(fs.readFileSync(path.join(root, 'src/app.js'), 'utf8')).toContain('const a = 1;');
    expect(server.log().writes).toEqual([]);
  });

  it('ersetzt auf Wunsch alle Stellen', () => {
    const server = createMcpServer({ root });
    const res = call(server, 'edit', { path: 'src/app.js', old_text: 'const a', new_text: 'let a', replace_all: true });

    expect(res.isError).toBe(false);
    expect(fs.readFileSync(path.join(root, 'src/app.js'), 'utf8')).toBe('let a = 1;\nconst b = 2;\nlet a2 = 1;\n');
  });

  it('meldet eine nicht gefundene Stelle', () => {
    const server = createMcpServer({ root });
    const res = call(server, 'edit', { path: 'src/app.js', old_text: 'gibt es nicht', new_text: 'x' });

    expect(res.isError).toBe(true);
    expect(server.log().writes).toEqual([]);
  });

  it('meldet eine fehlende Datei', () => {
    const server = createMcpServer({ root });
    expect(call(server, 'edit', { path: 'src/fehlt.js', old_text: 'a', new_text: 'b' }).isError).toBe(true);
  });

  it('greift nicht außerhalb der Grenze', () => {
    fs.writeFileSync(path.join(root, 'app.json'), '{"name":"x"}');
    const server = createMcpServer({ root });
    const res = call(server, 'edit', { path: 'app.json', old_text: 'x', new_text: 'y' });

    expect(res.isError).toBe(true);
    expect(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).toBe('{"name":"x"}');
  });
});

describe('delete', () => {
  it('löscht eine Quelldatei und merkt es sich', () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src/alt.js'), 'x');
    const server = createMcpServer({ root });
    const res = call(server, 'delete', { path: 'src/alt.js' });

    expect(res.isError).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/alt.js'))).toBe(false);
    expect(server.log().deletions).toEqual(['src/alt.js']);
  });

  it('löscht die Dokumente der App nicht', () => {
    fs.writeFileSync(path.join(root, CONCEPT_FILE), '# Konzept');
    const server = createMcpServer({ root });
    const res = call(server, 'delete', { path: CONCEPT_FILE });

    expect(res.isError).toBe(true);
    expect(fs.existsSync(path.join(root, CONCEPT_FILE))).toBe(true);
  });

  it('löscht keine Ordner und nichts außerhalb der Grenze', () => {
    fs.mkdirSync(path.join(root, 'src/ui'), { recursive: true });
    const server = createMcpServer({ root });

    expect(call(server, 'delete', { path: 'src/ui' }).isError).toBe(true);
    expect(call(server, 'delete', { path: '../.' }).isError).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/ui'))).toBe(true);
  });

  it('meldet eine Datei, die es nicht gibt', () => {
    const server = createMcpServer({ root });
    expect(call(server, 'delete', { path: 'src/fehlt.js' }).isError).toBe(true);
  });
});

describe('ask', () => {
  it('nimmt genau eine Rückfrage entgegen', () => {
    const server = createMcpServer({ root });
    const res = call(server, 'ask', { question: 'Soll die Liste sortiert sein?' });

    expect(res.isError).toBe(false);
    expect(server.log().question).toBe('Soll die Liste sortiert sein?');
  });

  it('weist eine zweite Rückfrage ab', () => {
    const server = createMcpServer({ root });
    call(server, 'ask', { question: 'Erste?' });
    const res = call(server, 'ask', { question: 'Zweite?' });

    expect(res.isError).toBe(true);
    expect(server.log().question).toBe('Erste?');
  });

  it('besteht auf einer Frage mit Inhalt', () => {
    const server = createMcpServer({ root });
    expect(call(server, 'ask', { question: '   ' }).isError).toBe(true);
    expect(server.log().question).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Das Protokoll (JSON-RPC über stdio)
 * ------------------------------------------------------------------ */

describe('MCP-Protokoll', () => {
  it('beantwortet initialize mit Fähigkeiten und Namen', () => {
    const server = createMcpServer({ root });
    const res = server.handle({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'claude', version: '1' } },
    }) as { result: { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string } } };

    expect(res.result.protocolVersion).toBe('2024-11-05');
    expect(res.result.capabilities.tools).toBeTruthy();
    expect(res.result.serverInfo.name).toBe(MCP_SERVER_NAME);
  });

  it('antwortet auf eine unbekannte Protokollfassung mit der eigenen', () => {
    const server = createMcpServer({ root });
    const res = server.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '1999-01-01' } }) as {
      result: { protocolVersion: string };
    };
    expect(res.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
  });

  it('nennt die vier Werkzeuge mit Schema', () => {
    const server = createMcpServer({ root });
    const res = server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) as {
      result: { tools: { name: string; description: string; inputSchema: { properties: Record<string, unknown> } }[] };
    };

    expect(res.result.tools.map((t) => t.name)).toEqual(['write', 'edit', 'delete', 'ask']);
    for (const tool of res.result.tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(Object.keys(tool.inputSchema.properties).length).toBeGreaterThan(0);
    }
  });

  it('lässt Benachrichtigungen ohne Antwort', () => {
    const server = createMcpServer({ root });
    expect(server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('beantwortet ping', () => {
    const server = createMcpServer({ root });
    expect(server.handle({ jsonrpc: '2.0', id: 3, method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
  });

  it('meldet eine unbekannte Methode als Fehler', () => {
    const server = createMcpServer({ root });
    const res = server.handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' }) as { error: { code: number } };
    expect(res.error.code).toBe(-32601);
  });

  it('meldet ein unbekanntes Werkzeug als Werkzeugfehler', () => {
    const server = createMcpServer({ root });
    expect(call(server, 'bash', { command: 'rm -rf /' }).isError).toBe(true);
  });
});

describe('createMcpStdio', () => {
  it('liest zeilenweise, auch über Blockgrenzen hinweg', () => {
    const io = createMcpStdio(createMcpServer({ root }));
    expect(io.push('{"jsonrpc":"2.0","id":1,"met')).toEqual([]);
    const out = io.push('hod":"ping"}\n');

    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0])).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
  });

  it('übergeht Leerzeilen und schweigt zu Benachrichtigungen', () => {
    const io = createMcpStdio(createMcpServer({ root }));
    expect(io.push('\n\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n')).toEqual([]);
  });

  it('meldet unlesbares JSON als Parse-Fehler', () => {
    const io = createMcpStdio(createMcpServer({ root }));
    const out = io.push('kein json\n');

    expect(JSON.parse(out[0])).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32700, message: expect.any(String) } });
  });
});

/* ------------------------------------------------------------------ *
 * Das Protokoll des Laufs — was Morphos danach in Händen hält
 * ------------------------------------------------------------------ */

describe('Lauf-Protokoll', () => {
  it('schreibt jeden Vorgang in die Protokolldatei', () => {
    const server = createMcpServer({ root, journal });
    call(server, 'write', { path: 'src/app.js', content: 'a' });
    call(server, 'delete', { path: 'src/app.js' });
    call(server, 'ask', { question: 'Und nun?' });

    const log = parseRunLog(fs.readFileSync(journal, 'utf8'));
    expect(log.writes).toEqual(['src/app.js']);
    expect(log.deletions).toEqual(['src/app.js']);
    expect(log.question).toBe('Und nun?');
  });

  it('legt ohne Vorgang keine Protokolldatei an', () => {
    createMcpServer({ root, journal });
    expect(fs.existsSync(journal)).toBe(false);
  });

  it('übergeht kaputte Zeilen im Protokoll', () => {
    const log = parseRunLog('{"kind":"write","path":"src/a.js"}\nkaputt\n\n{"kind":"nix"}\n');
    expect(log.writes).toEqual(['src/a.js']);
    expect(log.question).toBeNull();
  });

  it('sagt, ob überhaupt etwas geschrieben wurde', () => {
    expect(wroteSomething(emptyRunLog())).toBe(false);
    expect(wroteSomething({ writes: ['src/a.js'], deletions: [], question: null })).toBe(true);
    expect(wroteSomething({ writes: [], deletions: ['src/a.js'], question: null })).toBe(true);
    expect(wroteSomething({ writes: [], deletions: [], question: 'Und nun?' })).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Der Anschluss an die Claude CLI
 * ------------------------------------------------------------------ */

describe('Aufruf-Konfiguration', () => {
  const launch = { command: '/pfad/electron', args: ['/pfad/mcp-server.js'], env: { MORPHOS_MCP_ROOT: '/apps/x' } };

  it('beschreibt genau einen stdio-Server', () => {
    const config = JSON.parse(mcpConfigJson(launch));
    expect(Object.keys(config.mcpServers)).toEqual([MCP_SERVER_NAME]);
    expect(config.mcpServers.morphos).toMatchObject({ type: 'stdio', command: '/pfad/electron', args: launch.args });
    expect(config.mcpServers.morphos.env.MORPHOS_MCP_ROOT).toBe('/apps/x');
  });

  it('reicht die Konfiguration streng an die CLI', () => {
    const args = agentMcpArgs(launch);
    expect(args[args.indexOf('--mcp-config') + 1]).toBe(mcpConfigJson(launch));
    expect(args).toContain('--strict-mcp-config');
  });

  it('gibt nur die eigenen Werkzeuge und die Lesewerkzeuge frei', () => {
    const allowed = agentMcpArgs(launch)
      .map((a, i, all) => (all[i - 1] === '--allowedTools' ? a : ''))
      .filter(Boolean);

    expect(allowed).toEqual([...MCP_ALLOWED_TOOLS]);
    expect(allowed).toContain('mcp__morphos__write');
    expect(allowed).toContain('mcp__morphos__ask');
    expect(allowed).toContain('Read');
    expect(allowed).not.toContain('Write');
    expect(allowed).not.toContain('Edit');
    expect(allowed).not.toContain('Bash');
  });

  it('verbietet die schreibenden Werkzeuge der CLI ausdrücklich (c0087)', () => {
    const denied = agentMcpArgs(launch)
      .map((a, i, all) => (all[i - 1] === '--disallowedTools' ? a : ''))
      .filter(Boolean);

    expect(denied).toEqual([...MCP_DENIED_TOOLS]);
    expect(denied).toContain('Write');
    expect(denied).toContain('Edit');
    expect(denied).toContain('Bash');
    // Die eigenen Werkzeuge stehen selbstverständlich nicht auf der Verbotsliste.
    expect(denied).not.toContain('mcp__morphos__write');
  });

  it('benennt die Werkzeuge so, wie die CLI sie sieht', () => {
    expect(mcpToolId('write')).toBe('mcp__morphos__write');
  });

  it('startet den Server mit dem eigenen Programm als Node', () => {
    const started = mcpLaunch({
      execPath: '/pfad/Morphos.exe',
      server: `/pfad/dist-electron/${MCP_SERVER_FILE}`,
      root: '/apps/notizen',
      journal: '/tmp/lauf.jsonl',
    });

    expect(started.command).toBe('/pfad/Morphos.exe');
    expect(started.args).toEqual([`/pfad/dist-electron/${MCP_SERVER_FILE}`]);
    expect(started.env).toEqual({
      ELECTRON_RUN_AS_NODE: '1',
      MORPHOS_MCP_ROOT: '/apps/notizen',
      MORPHOS_MCP_JOURNAL: '/tmp/lauf.jsonl',
    });
  });

  it('kommt auch ohne Protokolldatei aus', () => {
    const started = mcpLaunch({ execPath: 'x', server: 'y', root: '/apps/notizen' });
    expect(started.env).not.toHaveProperty('MORPHOS_MCP_JOURNAL');
  });
});
