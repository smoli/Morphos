import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentArgs, generateApp, type GenerateDeps, type GenerateRequest } from './generate';
import { MCP_ALLOWED_TOOLS, MCP_DENIED_TOOLS, mcpToolId } from './mcp';
import { CONCEPT_FILE, USERDOC_FILE } from './docs';
import { DESIGN_VERSION } from './design';
import { writeDesign } from './designstore';
import { readManifest } from './appstore';
import type { AgentResult } from '@/types';

let folder: string;
let journal: string;

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-generate-'));
  journal = path.join(folder, '..', `morphos-journal-${path.basename(folder)}.jsonl`);
});
afterEach(() => {
  fs.rmSync(folder, { recursive: true, force: true });
  fs.rmSync(journal, { force: true });
});

const DOC = (body = 'hallo', title = 'Taschenrechner', icon = '🧮'): string =>
  `<!DOCTYPE html><html><head><title>${title}</title><meta name="morphos:icon" content="${icon}"></head><body>${body}</body></html>`;

/** Ein Lauf, der schreibt: legt Dateien an und protokolliert sie wie der MCP-Server. */
function writingRun(files: Record<string, string>, text = 'Fertig.'): GenerateDeps['runAgent'] {
  return async ({ cwd }): Promise<AgentResult> => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(cwd, ...rel.split('/'));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf8');
      fs.appendFileSync(journal, `${JSON.stringify({ kind: 'write', path: rel })}\n`, 'utf8');
    }
    return { ok: true, text };
  };
}

/** Ein Lauf, der nur fragt — genau wie das MCP-Werkzeug `ask` es festhält. */
function askingRun(question: string) {
  return async (): Promise<AgentResult> => {
    fs.appendFileSync(journal, `${JSON.stringify({ kind: 'ask', question })}\n`, 'utf8');
    return { ok: true, text: question };
  };
}

function makeDeps(
  runAgent: GenerateDeps['runAgent'],
  overrides: Partial<GenerateDeps> = {},
): GenerateDeps {
  return {
    runAgent,
    resolveLibs: vi.fn(async () => ({ ok: true as const, libs: {} })),
    builtinLib: vi.fn(() => 'window.preact = {};'),
    ensureRepo: vi.fn(async () => {}),
    commitAll: vi.fn(async () => {}),
    now: () => 1_000,
    ...overrides,
  };
}

function request(over: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    folder,
    id: null,
    wish: 'Ein Taschenrechner',
    execPath: '/pfad/morphos',
    server: '/pfad/mcp-server.js',
    journal,
    ...over,
  };
}

/** Eine bestehende App auf der Platte (wie sie nach einem früheren Lauf dasteht). */
function existingApp(id: string, files: Record<string, string> = { 'src/index.html': DOC('alt') }): string {
  const dir = path.join(folder, id);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  fs.writeFileSync(
    path.join(dir, 'app.json'),
    JSON.stringify({ id, name: 'Alt', icon: '📦', createdAt: 5, updatedAt: 5 }),
    'utf8',
  );
  return dir;
}

describe('agentArgs', () => {
  const args = agentArgs({ execPath: 'morphos', server: 's.js', root: '/apps/eins', journal: '/tmp/j' });

  it('reicht genau einen MCP-Server durch — streng, ohne die Einrichtung des Anwenders', () => {
    expect(args).toContain('--strict-mcp-config');
    const config = JSON.parse(args[args.indexOf('--mcp-config') + 1]) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(config.mcpServers)).toEqual(['morphos']);
  });

  it('gibt nur die eigenen Werkzeuge und das Lesen frei', () => {
    const allowed = args.filter((_a, i) => args[i - 1] === '--allowedTools');
    expect(allowed).toEqual([...MCP_ALLOWED_TOOLS]);
    expect(allowed).toContain(mcpToolId('write'));
    expect(allowed).toContain(mcpToolId('ask'));
    expect(allowed).toContain('Read');
  });

  it('verbietet die schreibenden Werkzeuge der CLI ausdrücklich', () => {
    const denied = args.filter((_a, i) => args[i - 1] === '--disallowedTools');
    expect(denied).toEqual([...MCP_DENIED_TOOLS]);
    expect(denied).toContain('Write');
    expect(denied).toContain('Edit');
  });

  it('öffnet für ein Bild-Anhang genau dessen Ordner und Pfad', () => {
    const withImage = agentArgs({
      execPath: 'morphos',
      server: 's.js',
      root: '/apps/eins',
      journal: '/tmp/j',
      images: [path.join('/tmp', 'refs', 'bild.png')],
    });
    expect(withImage).toContain('--add-dir');
    expect(withImage[withImage.indexOf('--add-dir') + 1]).toBe(path.join('/tmp', 'refs'));
    expect(withImage).toContain(`Read(${path.join('/tmp', 'refs', 'bild.png')})`);
  });
});

describe('generateApp — der Lauf im App-Ordner', () => {
  it('startet den Agenten MIT dem App-Ordner als Arbeitsverzeichnis', async () => {
    const dir = existingApp('rechner-1');
    const runAgent = vi.fn(writingRun({ 'src/index.html': DOC('neu') }));
    await generateApp(request({ id: 'rechner-1' }), makeDeps(runAgent));

    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent.mock.calls[0][0].cwd).toBe(dir);
  });

  it('legt den Ordner samt Git an, BEVOR der Agent läuft', async () => {
    let existedDuringRun = false;
    const deps = makeDeps(async ({ cwd }) => {
      existedDuringRun = fs.existsSync(cwd);
      return { ok: true, text: 'nichts zu tun' };
    });
    await generateApp(request(), deps);

    expect(existedDuringRun).toBe(true);
    expect(deps.ensureRepo).toHaveBeenCalledTimes(1);
  });

  it('schickt keine Dateiinhalte mehr in den Prompt — die Platte ist die Quelle', async () => {
    existingApp('rechner-1', { 'src/index.html': DOC('geheimer alter inhalt') });
    const runAgent = vi.fn(writingRun({ 'src/index.html': DOC('neu') }));
    await generateApp(request({ id: 'rechner-1' }), makeDeps(runAgent));

    const prompt = runAgent.mock.calls[0][0].prompt;
    expect(prompt).not.toContain('geheimer alter inhalt');
    expect(prompt).toContain('Ein Taschenrechner');
  });

  it('legt den Entwurf der App als UI-LAYOUT in den Prompt', async () => {
    const dir = existingApp('rechner-1');
    writeDesign(dir, {
      version: DESIGN_VERSION,
      blocks: [
        {
          id: 'b1',
          name: 'Anzeige',
          type: 'display',
          instructions: 'zeigt das Ergebnis',
          rect: { x: 0, y: 0, w: 1, h: 0.25 },
          children: [],
        },
      ],
    });
    const runAgent = vi.fn(writingRun({ 'src/index.html': DOC('neu') }));
    await generateApp(request({ id: 'rechner-1' }), makeDeps(runAgent));

    const prompt = runAgent.mock.calls[0][0].prompt;
    expect(prompt).toContain('UI-LAYOUT');
    expect(prompt).toContain('Anzeige');
    expect(prompt).toContain('zeigt das Ergebnis');
  });

  it('schweigt über den Entwurf, solange die App keinen hat', async () => {
    existingApp('rechner-1');
    const runAgent = vi.fn(writingRun({ 'src/index.html': DOC('neu') }));
    await generateApp(request({ id: 'rechner-1' }), makeDeps(runAgent));

    expect(runAgent.mock.calls[0][0].prompt).not.toContain('UI-LAYOUT');
  });

  it('nimmt den Entwurf von der Platte, nicht aus dem mitgegebenen Kontext', async () => {
    const dir = existingApp('rechner-1');
    writeDesign(dir, {
      version: DESIGN_VERSION,
      blocks: [{ id: 'b1', name: 'Echter Block', rect: { x: 0, y: 0, w: 1, h: 1 }, children: [] }],
    });
    const runAgent = vi.fn(writingRun({ 'src/index.html': DOC('neu') }));
    await generateApp(
      request({
        id: 'rechner-1',
        context: {
          design: {
            version: DESIGN_VERSION,
            blocks: [{ id: 'b2', name: 'Erfundener Block', rect: { x: 0, y: 0, w: 1, h: 1 }, children: [] }],
          },
        },
      }),
      makeDeps(runAgent),
    );

    const prompt = runAgent.mock.calls[0][0].prompt;
    expect(prompt).toContain('Echter Block');
    expect(prompt).not.toContain('Erfundener Block');
  });
});

describe('generateApp — eine reine Rückfrage', () => {
  it('committet nichts, legt keine App an und reicht die Frage durch', async () => {
    const deps = makeDeps(askingRun('Welche Art von Spiel?'));
    const res = await generateApp(request(), deps);

    expect(res).toEqual({ ok: true, say: 'Welche Art von Spiel?', question: 'Welche Art von Spiel?' });
    expect(deps.commitAll).not.toHaveBeenCalled();
    expect(fs.readdirSync(folder)).toEqual([]); // der Entwurfsordner ist wieder weg
  });

  it('lässt eine bestehende App unangetastet', async () => {
    existingApp('rechner-1');
    const deps = makeDeps(askingRun('Welche Farbe?'));
    const res = await generateApp(request({ id: 'rechner-1' }), deps);

    expect(res).toEqual({ ok: true, say: 'Welche Farbe?', question: 'Welche Farbe?' });
    expect(deps.commitAll).not.toHaveBeenCalled();
    expect(readManifest(path.join(folder, 'rechner-1'))!.updatedAt).toBe(5);
  });

  it('meldet eine Mitteilung ohne Änderung als solche — ohne Commit und ohne Frage', async () => {
    existingApp('rechner-1');
    const deps = makeDeps(async () => ({ ok: true, text: 'Das kann die App bereits.' }));
    const res = await generateApp(request({ id: 'rechner-1' }), deps);

    expect(res).toEqual({ ok: true, say: 'Das kann die App bereits.' });
    expect(deps.commitAll).not.toHaveBeenCalled();
  });
});

describe('generateApp — ein Lauf, der geschrieben hat', () => {
  it('liest von der Platte zurück, bündelt und committet mit dem Wunsch', async () => {
    const deps = makeDeps(
      writingRun({
        'src/index.html': '<!DOCTYPE html><html><head><title>Rechner</title><link rel="stylesheet" href="style.css"></head><body>x</body></html>',
        'src/style.css': 'body{color:red}',
        [CONCEPT_FILE]: '# Konzept',
        [USERDOC_FILE]: '# Anleitung',
      }, 'Der Rechner rechnet jetzt.'),
    );
    const res = await generateApp(request({ wish: 'Ein Taschenrechner' }), deps);

    if (!res.ok || !res.app) throw new Error('erwartet: ein neuer Stand');
    expect(res.app.files.map((f) => f.path)).toEqual(['src/index.html', 'src/style.css']);
    expect(res.app.html).toContain('body{color:red}'); // gebündelt
    // Die beiden Dokumente gehören NEBEN die App, nicht in sie hinein.
    expect(res.app.docs).toEqual({ concept: '# Konzept', userdoc: '# Anleitung' });
    expect(res.app.html).not.toContain('# Konzept');
    expect(res.app.html).not.toContain('# Anleitung');
    expect(res.say).toBe('Der Rechner rechnet jetzt.');

    expect(deps.commitAll).toHaveBeenCalledTimes(1);
    expect((deps.commitAll as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('Ein Taschenrechner');

    const dir = path.join(folder, res.app.id);
    expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toBe(res.app.html);
    expect(readManifest(dir)!.name).toBe('Rechner');
  });

  it('leitet Name, Icon und Id einer NEUEN App aus dem Artefakt ab', async () => {
    const res = await generateApp(request(), makeDeps(writingRun({ 'src/index.html': DOC('x', 'Taschenrechner', '🧮') })));

    if (!res.ok || !res.app) throw new Error('erwartet: ein neuer Stand');
    expect(res.app.name).toBe('Taschenrechner');
    expect(res.app.icon).toBe('🧮');
    expect(res.app.id).toMatch(/^taschenrechner-[a-z0-9]+$/);
    expect(res.app.createdAt).toBe(1_000);
    expect(fs.existsSync(path.join(folder, res.app.id, 'src', 'index.html'))).toBe(true);
  });

  it('behält Name, Icon und Anlagedatum einer bestehenden App', async () => {
    existingApp('rechner-1');
    const res = await generateApp(
      request({ id: 'rechner-1', wish: 'Mach es bunt' }),
      makeDeps(writingRun({ 'src/index.html': DOC('bunt', 'Ganz anders', '🌈') })),
    );

    if (!res.ok || !res.app) throw new Error('erwartet: ein neuer Stand');
    expect(res.app.id).toBe('rechner-1');
    expect(res.app.name).toBe('Alt');
    expect(res.app.icon).toBe('📦');
    expect(res.app.createdAt).toBe(5);
    expect(res.app.updatedAt).toBe(1_000);
  });

  it('committet auch, wenn der Agent zusätzlich eine Rückfrage gestellt hat', async () => {
    const deps = makeDeps(async ({ cwd }) => {
      const abs = path.join(cwd, 'src', 'index.html');
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, DOC('teil'), 'utf8');
      fs.appendFileSync(journal, `${JSON.stringify({ kind: 'write', path: 'src/index.html' })}\n`, 'utf8');
      fs.appendFileSync(journal, `${JSON.stringify({ kind: 'ask', question: 'Und die Farbe?' })}\n`, 'utf8');
      return { ok: true, text: 'Ein Teil steht.' };
    });
    const res = await generateApp(request(), deps);

    if (!res.ok || !res.app) throw new Error('erwartet: ein neuer Stand');
    expect(res.question).toBe('Und die Farbe?');
    expect(deps.commitAll).toHaveBeenCalledTimes(1);
  });

  it('nimmt gelöschte Dateien mit — der Stand kommt von der Platte', async () => {
    existingApp('rechner-1', { 'src/index.html': DOC('alt'), 'src/alt.js': 'weg();' });
    const deps = makeDeps(async ({ cwd }) => {
      fs.rmSync(path.join(cwd, 'src', 'alt.js'));
      fs.appendFileSync(journal, `${JSON.stringify({ kind: 'delete', path: 'src/alt.js' })}\n`, 'utf8');
      return { ok: true, text: 'Weg damit.' };
    });
    const res = await generateApp(request({ id: 'rechner-1' }), deps);

    if (!res.ok || !res.app) throw new Error('erwartet: ein neuer Stand');
    expect(res.app.files.map((f) => f.path)).toEqual(['src/index.html']);
    expect(deps.commitAll).toHaveBeenCalledTimes(1);
  });

  it('bettet eine eingebaute Bibliothek ein, die die App anfordert', async () => {
    const deps = makeDeps(
      writingRun({
        'src/index.html': '<!DOCTYPE html><html><head><title>P</title><meta name="morphos:lib" content="preact"></head><body>x</body></html>',
      }),
    );
    const res = await generateApp(request(), deps);

    if (!res.ok || !res.app) throw new Error('erwartet: ein neuer Stand');
    expect(res.app.html).toContain('window.preact = {};');
    expect(deps.builtinLib).toHaveBeenCalledWith('preact');
  });
});

describe('generateApp — wenn etwas schiefgeht', () => {
  it('reicht den Fehler des Agenten durch und committet nicht', async () => {
    existingApp('rechner-1');
    const deps = makeDeps(async () => ({ ok: false, error: 'Claude CLI endete mit Code 1.' }));
    const res = await generateApp(request({ id: 'rechner-1' }), deps);

    expect(res).toEqual({ ok: false, error: 'Claude CLI endete mit Code 1.' });
    expect(deps.commitAll).not.toHaveBeenCalled();
  });

  it('räumt den Entwurfsordner weg, wenn der Lauf scheitert', async () => {
    const res = await generateApp(request(), makeDeps(async () => ({ ok: false, error: 'kaputt' })));

    expect(res.ok).toBe(false);
    expect(fs.readdirSync(folder)).toEqual([]);
  });

  it('meldet eine App ohne gültiges src/index.html und committet nicht', async () => {
    const deps = makeDeps(writingRun({ 'src/index.html': '', 'src/app.js': 'los();' }));
    const res = await generateApp(request(), deps);

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('erwartet: ein Fehler');
    expect(res.error).toContain('src/index.html');
    expect(deps.commitAll).not.toHaveBeenCalled();
  });

  it('reicht einen Bibliotheks-Fehler durch, statt eine halbe App zu committen', async () => {
    const deps = makeDeps(
      writingRun({
        'src/index.html': '<!DOCTYPE html><html><head><meta name="morphos:lib" content="https://fremd.example/x.js"></head><body>x</body></html>',
      }),
      { resolveLibs: vi.fn(async () => ({ ok: false as const, error: 'Diese Quelle ist nicht freigegeben.' })) },
    );
    const res = await generateApp(request(), deps);

    expect(res).toEqual({ ok: false, error: 'Diese Quelle ist nicht freigegeben.' });
    expect(deps.commitAll).not.toHaveBeenCalled();
  });

  it('lässt die Arbeit des Agenten an einer BESTEHENDEN App auf der Platte stehen', async () => {
    existingApp('rechner-1');
    const deps = makeDeps(async ({ cwd }) => {
      fs.writeFileSync(path.join(cwd, 'src', 'index.html'), '', 'utf8');
      fs.writeFileSync(path.join(cwd, 'src', 'halbfertig.js'), 'los();', 'utf8');
      fs.appendFileSync(journal, `${JSON.stringify({ kind: 'write', path: 'src/index.html' })}\n`, 'utf8');
      return { ok: true, text: 'Fertig.' };
    });
    const res = await generateApp(request({ id: 'rechner-1' }), deps);

    expect(res.ok).toBe(false);
    expect(fs.existsSync(path.join(folder, 'rechner-1', 'src', 'halbfertig.js'))).toBe(true);
  });
});

describe('generateApp — das Lauf-Protokoll', () => {
  it('räumt die Protokolldatei nach dem Lauf weg', async () => {
    await generateApp(request(), makeDeps(writingRun({ 'src/index.html': DOC() })));
    expect(fs.existsSync(journal)).toBe(false);
  });

  it('beginnt mit leerem Protokoll, auch wenn eine alte Datei herumliegt', async () => {
    fs.writeFileSync(journal, `${JSON.stringify({ kind: 'write', path: 'src/alt.js' })}\n`, 'utf8');
    const deps = makeDeps(async () => ({ ok: true, text: 'nichts getan' }));
    const res = await generateApp(request({ id: 'rechner-1' }), deps);

    expect(res).toEqual({ ok: true, say: 'nichts getan' });
    expect(deps.commitAll).not.toHaveBeenCalled();
  });
});
