import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAppFromDisk, readChat, readManifest, readSourceFiles, writeAppState, writeChat } from './appstore';
import { commitAll, ensureRepo, listVersions, restoreVersion } from './gitstore';
import type { AppMeta, ChatMessage, SourceFile } from '@/types';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-appstore-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const META: AppMeta = { id: 'app-1', name: 'App', icon: '🧩', createdAt: 1, updatedAt: 2 };

describe('writeAppState / readSourceFiles', () => {
  it('schreibt Manifest, Quellen und Artefakt und liest die Quellen zurück', () => {
    const files: SourceFile[] = [
      { path: 'src/index.html', content: '<html>x</html>' },
      { path: 'src/ui/menu.js', content: 'menu();' },
    ];
    writeAppState(dir, META, files, '<html>gebündelt</html>');

    expect(readManifest(dir)!.name).toBe('App');
    expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toBe('<html>gebündelt</html>');
    expect(readSourceFiles(dir)).toEqual(files);
  });

  it('entfernt verwaiste Quelldateien beim erneuten Schreiben', () => {
    writeAppState(dir, META, [{ path: 'src/index.html', content: 'a' }, { path: 'src/alt.js', content: 'x' }], 'a');
    writeAppState(dir, META, [{ path: 'src/index.html', content: 'b' }], 'b');
    expect(readSourceFiles(dir).map((f) => f.path)).toEqual(['src/index.html']);
  });

  it('weist ungültige Quelldatei-Pfade ab', () => {
    expect(() =>
      writeAppState(dir, META, [{ path: 'src/../boese.js', content: 'x' }], 'html'),
    ).toThrow(/Pfad/);
  });
});

describe('Chat-Persistenz', () => {
  const chat: ChatMessage[] = [
    { role: 'user', text: 'Ein Spiel', time: 1 },
    { role: 'assistant', text: 'Welche Art von Spiel?', time: 2 },
  ];

  it('schreibt und liest den Dialogverlauf', () => {
    writeChat(dir, chat);
    expect(readChat(dir)).toEqual(chat);
  });

  it('liefert leer ohne chat.json oder bei kaputtem Inhalt', () => {
    expect(readChat(dir)).toEqual([]);
    fs.writeFileSync(path.join(dir, 'chat.json'), 'kaputt', 'utf8');
    expect(readChat(dir)).toEqual([]);
  });

  it('nimmt chat.json von Git aus — ein Revert spult den Dialog nicht zurück', async () => {
    writeAppState(dir, META, [{ path: 'src/index.html', content: 'v1' }], 'v1');
    await ensureRepo(dir);
    await commitAll(dir, 'erste');
    const v1 = (await listVersions(dir))[0].sha;

    writeAppState(dir, META, [{ path: 'src/index.html', content: 'v2' }], 'v2');
    await commitAll(dir, 'zweite');

    // Dialog wächst NACH dem zweiten Commit weiter.
    writeChat(dir, chat);

    await restoreVersion(dir, v1, 'Zurück zu: erste');

    expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toBe('v1');
    expect(readChat(dir)).toEqual(chat); // unangetastet
  });
});

describe('loadAppFromDisk', () => {
  it('liefert null ohne Manifest', async () => {
    expect(await loadAppFromDisk(dir)).toBeNull();
  });

  it('lädt eine App im neuen Format samt Dialogverlauf', async () => {
    writeAppState(dir, META, [{ path: 'src/index.html', content: '<html>q</html>' }], '<html>art</html>');
    writeChat(dir, [{ role: 'user', text: 'hi', time: 1 }]);
    const app = await loadAppFromDisk(dir);
    expect(app).not.toBeNull();
    expect(app!.id).toBe('app-1');
    expect(app!.files).toEqual([{ path: 'src/index.html', content: '<html>q</html>' }]);
    expect(app!.html).toBe('<html>art</html>');
    expect(app!.chat).toEqual([{ role: 'user', text: 'hi', time: 1 }]);
  });

  it('migriert das Alt-Format zu Git: ein Commit je alter Version, Original-Wunsch und -Zeit', async () => {
    const legacy = {
      id: 'app-1',
      name: 'App',
      icon: '🧩',
      createdAt: 1,
      updatedAt: 3,
      activeId: 'v2',
      history: [
        { id: 'v1', prompt: 'erste', html: '<html>1</html>', time: new Date('2024-01-01T10:00:00Z').getTime() },
        { id: 'v2', prompt: 'zweite', html: '<html>2</html>', time: new Date('2024-01-02T10:00:00Z').getTime() },
      ],
    };
    fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(legacy), 'utf8');

    const app = await loadAppFromDisk(dir);

    expect(app).not.toBeNull();
    expect(app!.html).toBe('<html>2</html>');
    expect(app!.files).toEqual([{ path: 'src/index.html', content: '<html>2</html>' }]);

    const versions = await listVersions(dir);
    expect(versions).toHaveLength(2);
    expect(versions[1].prompt).toBe('erste');
    expect(versions[0].prompt).toBe('zweite');
    expect(versions[1].time).toBe(legacy.history[0].time);

    // Das Manifest ist bereinigt (keine Historie mehr im JSON).
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'));
    expect(manifest.history).toBeUndefined();
  });

  it('stellt bei der Migration eine aktive ältere Version als Wiederherstell-Commit her', async () => {
    const legacy = {
      id: 'app-1',
      name: 'App',
      icon: '🧩',
      createdAt: 1,
      updatedAt: 3,
      activeId: 'v1',
      history: [
        { id: 'v1', prompt: 'erste', html: '<html>1</html>', time: 1000 },
        { id: 'v2', prompt: 'zweite', html: '<html>2</html>', time: 2000 },
      ],
    };
    fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(legacy), 'utf8');

    const app = await loadAppFromDisk(dir);

    expect(app!.html).toBe('<html>1</html>');
    const versions = await listVersions(dir);
    expect(versions).toHaveLength(3);
    expect(versions[0].prompt).toBe('Zurück zu: erste');
  });

  it('migriert nicht doppelt (idempotent beim erneuten Laden)', async () => {
    const legacy = {
      id: 'app-1',
      name: 'App',
      icon: '🧩',
      createdAt: 1,
      updatedAt: 2,
      activeId: 'v1',
      history: [{ id: 'v1', prompt: 'erste', html: '<html>1</html>', time: 1000 }],
    };
    fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(legacy), 'utf8');

    await loadAppFromDisk(dir);
    await loadAppFromDisk(dir);

    expect(await listVersions(dir)).toHaveLength(1);
  });
});
