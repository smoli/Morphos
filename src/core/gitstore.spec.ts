import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureRepo, commitAll, cloneRepo, listVersions, restoreVersion, countVersions } from './gitstore';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-git-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}
function read(rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

describe('gitstore', () => {
  it('initialisiert ein Repository genau einmal', async () => {
    await ensureRepo(dir);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
    await ensureRepo(dir); // idempotent
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
  });

  it('committet alle Änderungen mit der Botschaft und listet Versionen (neueste zuerst)', async () => {
    await ensureRepo(dir);
    write('src/index.html', 'v1');
    await commitAll(dir, 'Ein Taschenrechner');
    write('src/index.html', 'v2');
    write('src/app.js', 'x');
    await commitAll(dir, 'Mit Prozent-Taste');

    const versions = await listVersions(dir);
    expect(versions).toHaveLength(2);
    expect(versions[0].prompt).toBe('Mit Prozent-Taste');
    expect(versions[1].prompt).toBe('Ein Taschenrechner');
    expect(versions[0].sha).toMatch(/^[0-9a-f]{40}$/);
    expect(versions[0].time).toBeGreaterThan(0);
    expect(await countVersions(dir)).toBe(2);
  });

  it('übernimmt einen expliziten Zeitstempel (für die Migration)', async () => {
    await ensureRepo(dir);
    write('a.txt', 'x');
    const t = new Date('2024-05-01T10:00:00Z').getTime();
    await commitAll(dir, 'alt', t);
    const versions = await listVersions(dir);
    expect(versions[0].time).toBe(t);
  });

  it('überspringt Commits ohne Änderungen, ohne zu scheitern', async () => {
    await ensureRepo(dir);
    write('a.txt', 'x');
    await commitAll(dir, 'eins');
    await commitAll(dir, 'nichts neues'); // keine Änderung
    expect(await countVersions(dir)).toBe(1);
  });

  it('stellt eine frühere Version als NEUEN Commit wieder her (linear, verlustfrei)', async () => {
    await ensureRepo(dir);
    write('src/index.html', 'v1');
    await commitAll(dir, 'erste');
    const v1 = (await listVersions(dir))[0].sha;

    write('src/index.html', 'v2');
    write('src/neu.js', 'nur in v2');
    await commitAll(dir, 'zweite');

    await restoreVersion(dir, v1, 'Zurück zu: erste');

    // Arbeitsverzeichnis entspricht v1 — auch die später hinzugekommene Datei ist weg.
    expect(read('src/index.html')).toBe('v1');
    expect(fs.existsSync(path.join(dir, 'src/neu.js'))).toBe(false);

    // Historie ist linear gewachsen, nichts wurde verworfen.
    const versions = await listVersions(dir);
    expect(versions).toHaveLength(3);
    expect(versions[0].prompt).toBe('Zurück zu: erste');
    expect(versions[1].prompt).toBe('zweite');
  });

  it('liefert 0 Versionen für ein Verzeichnis ohne Repository', async () => {
    expect(await countVersions(dir)).toBe(0);
    expect(await listVersions(dir)).toEqual([]);
  });

  it('meldet einen Fehler bei unbekannter Version', async () => {
    await ensureRepo(dir);
    write('a.txt', 'x');
    await commitAll(dir, 'eins');
    await expect(restoreVersion(dir, '0000000000000000000000000000000000000000', 'zurück')).rejects.toThrow();
  });

  describe('cloneRepo', () => {
    let target: string;

    beforeEach(() => {
      target = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-clone-'));
    });
    afterEach(() => {
      fs.rmSync(target, { recursive: true, force: true });
    });

    it('holt ein Repository samt Historie und origin', async () => {
      await ensureRepo(dir);
      write('app.json', '{"id":"a","name":"A"}');
      await commitAll(dir, 'erste');
      write('app.json', '{"id":"a","name":"A2"}');
      await commitAll(dir, 'zweite');

      const into = path.join(target, 'klon');
      await cloneRepo(dir, into);

      expect(fs.readFileSync(path.join(into, 'app.json'), 'utf8')).toContain('A2');
      expect(fs.existsSync(path.join(into, '.git'))).toBe(true);
      const versions = await listVersions(into);
      expect(versions.map((v) => v.prompt)).toEqual(['zweite', 'erste']);
      expect(fs.readFileSync(path.join(into, '.git', 'config'), 'utf8')).toContain('[remote "origin"]');
    });

    it('legt den Zielordner samt fehlender Elternordner an', async () => {
      await ensureRepo(dir);
      write('a.txt', 'x');
      await commitAll(dir, 'eins');

      const into = path.join(target, 'tief', 'klon');
      await cloneRepo(dir, into);
      expect(fs.existsSync(path.join(into, 'a.txt'))).toBe(true);
    });

    it('scheitert mit einer Meldung, wenn es die Gegenstelle nicht gibt', async () => {
      await expect(cloneRepo(path.join(target, 'nichts'), path.join(target, 'klon'))).rejects.toThrow();
    });
  });
});
