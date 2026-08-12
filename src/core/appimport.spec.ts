import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commitAll, countVersions, ensureRepo, listVersions } from './gitstore';
import {
  IMPORT_DIR,
  manifestError,
  repoUrlError,
  resolveImport,
  startImport,
  uniqueAppId,
} from './appimport';

describe('appimport (rein)', () => {
  describe('repoUrlError', () => {
    it('nimmt die gebräuchlichen Adressen an', () => {
      for (const url of [
        'https://github.com/jemand/app.git',
        'http://gitlab.local/team/app',
        'ssh://git@github.com:22/jemand/app.git',
        'git://example.org/app.git',
        'git@github.com:jemand/app.git',
        'file:///Volumes/Austausch/app',
        '/Volumes/Austausch/app',
        'C:\\Repos\\app',
      ]) {
        expect(repoUrlError(url), url).toBe('');
      }
    });

    it('verlangt überhaupt eine Adresse', () => {
      expect(repoUrlError('')).not.toBe('');
      expect(repoUrlError('   ')).not.toBe('');
      expect(repoUrlError(null)).not.toBe('');
    });

    it('weist eine Adresse ab, die als Option durchginge', () => {
      expect(repoUrlError('--upload-pack=touch /tmp/pwned')).not.toBe('');
      expect(repoUrlError('-c')).not.toBe('');
    });

    it('weist die Transport-Helfer ab (ext:: führt Befehle aus)', () => {
      expect(repoUrlError('ext::sh -c "touch /tmp/pwned"')).not.toBe('');
      expect(repoUrlError('EXT::whoami')).not.toBe('');
    });

    it('weist Steuerzeichen und Unfug ab', () => {
      expect(repoUrlError('https://example.org/app\nrm -rf /')).not.toBe('');
      expect(repoUrlError('einfach nur text')).not.toBe('');
    });
  });

  describe('manifestError', () => {
    const ok = { id: 'rechner-ab12c', name: 'Rechner' };

    it('lässt ein gültiges Manifest durch', () => {
      expect(manifestError(ok)).toBe('');
      expect(manifestError({ ...ok, icon: '🧮', history: [] })).toBe('');
    });

    it('weist ein fehlendes Manifest ab', () => {
      expect(manifestError(null)).not.toBe('');
      expect(manifestError(undefined)).not.toBe('');
      expect(manifestError('kein Objekt')).not.toBe('');
    });

    it('verlangt eine Id, die als Ordnername taugt', () => {
      expect(manifestError({ name: 'Rechner' })).not.toBe('');
      expect(manifestError({ ...ok, id: '' })).not.toBe('');
      expect(manifestError({ ...ok, id: '../../evil' })).not.toBe('');
      expect(manifestError({ ...ok, id: 'mit leerzeichen' })).not.toBe('');
      expect(manifestError({ ...ok, id: '..' })).not.toBe('');
    });

    it('verlangt einen Namen', () => {
      expect(manifestError({ id: 'rechner-ab12c' })).not.toBe('');
      expect(manifestError({ ...ok, name: '   ' })).not.toBe('');
      expect(manifestError({ ...ok, name: 7 })).not.toBe('');
    });
  });

  describe('uniqueAppId', () => {
    it('lässt eine freie Id, wie sie ist', () => {
      expect(uniqueAppId(['andere-app'], 'rechner-ab12c')).toBe('rechner-ab12c');
      expect(uniqueAppId([], 'rechner-ab12c')).toBe('rechner-ab12c');
    });

    it('zählt hoch, bis die Id frei ist', () => {
      expect(uniqueAppId(['rechner-ab12c'], 'rechner-ab12c')).toBe('rechner-ab12c-2');
      expect(uniqueAppId(['rechner-ab12c', 'rechner-ab12c-2'], 'rechner-ab12c')).toBe('rechner-ab12c-3');
    });
  });
});

// ---- Der Ablauf: klonen, prüfen, einordnen (Hauptprozess) ----

let tmp: string;
let workspace: string;
let origin: string;

/** Ein Repository, das eine Morphos-App enthält — die „Gegenstelle“. */
function makeRepo(name: string, meta: Record<string, unknown>): string {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(meta, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>Rechner</h1>', 'utf8');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'index.html'), '<h1>Rechner</h1>', 'utf8');
  return dir;
}

async function commitRepo(dir: string, message: string): Promise<void> {
  await ensureRepo(dir);
  await commitAll(dir, message);
}

/** Eine schon vorhandene App im Arbeitsverzeichnis. */
function makeApp(id: string, name: string): string {
  const dir = path.join(workspace, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify({ id, name }, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), `<h1>${name}</h1>`, 'utf8');
  return dir;
}

function manifestOf(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'));
}

/** Was im Arbeitsverzeichnis liegt (ohne den Ablageort der Importe). */
function workspaceDirs(): string[] {
  return fs.readdirSync(workspace).sort();
}

/** Die noch nicht aufgeräumten Klone unter .morphos-import. */
function tempClones(): string[] {
  try {
    return fs.readdirSync(path.join(workspace, IMPORT_DIR)).sort();
  } catch {
    return [];
  }
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-import-'));
  workspace = path.join(tmp, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  origin = makeRepo('origin', { id: 'rechner-ab12c', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 2 });
  await commitRepo(origin, 'Ein Taschenrechner');
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('appimport: startImport', () => {
  it('klont die App mit Historie und origin in das Arbeitsverzeichnis', async () => {
    const res = await startImport(workspace, origin);

    expect(res).toMatchObject({ ok: true, id: 'rechner-ab12c', name: 'Rechner' });
    const dir = path.join(workspace, 'rechner-ab12c');
    expect(fs.existsSync(path.join(dir, 'app.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
    expect(await listVersions(dir)).toHaveLength(1);
    expect(tempClones()).toEqual([]);
  });

  it('merkt sich die Gegenstelle als origin', async () => {
    await startImport(workspace, origin);
    const config = fs.readFileSync(path.join(workspace, 'rechner-ab12c', '.git', 'config'), 'utf8');
    expect(config).toContain('[remote "origin"]');
    expect(config).toContain(origin);
  });

  it('weist eine unbrauchbare Adresse ab, ohne git zu bemühen', async () => {
    const res = await startImport(workspace, 'ext::sh -c whoami');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(workspaceDirs()).toEqual([]);
  });

  it('meldet ein Arbeitsverzeichnis, das es nicht gibt', async () => {
    const res = await startImport('', origin);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('meldet einen gescheiterten Klon und lässt nichts zurück', async () => {
    const res = await startImport(workspace, path.join(tmp, 'gibtesnicht'));
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(workspaceDirs()).toEqual([]);
  });

  it('weist ein Repository ohne app.json ab und räumt den Klon weg', async () => {
    const fremd = path.join(tmp, 'fremd');
    fs.mkdirSync(fremd, { recursive: true });
    fs.writeFileSync(path.join(fremd, 'README.md'), '# kein Morphos', 'utf8');
    await commitRepo(fremd, 'nur ein Repo');

    const res = await startImport(workspace, fremd);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('app.json');
    expect(workspaceDirs()).toEqual([]);
  });

  it('weist ein Manifest mit gefährlicher Id ab', async () => {
    const böse = makeRepo('böse', { id: '../entkommen', name: 'Böse' });
    await commitRepo(böse, 'v1');

    const res = await startImport(workspace, böse);
    expect(res.ok).toBe(false);
    expect(workspaceDirs()).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'entkommen'))).toBe(false);
  });

  it('räumt liegengebliebene Klone eines früheren Laufs weg', async () => {
    const leiche = path.join(workspace, IMPORT_DIR, 'clone-alt');
    fs.mkdirSync(leiche, { recursive: true });
    fs.writeFileSync(path.join(leiche, 'app.json'), '{}', 'utf8');

    await startImport(workspace, origin);
    expect(tempClones()).toEqual([]);
  });

  it('nimmt auch eine App im Alt-Format an (sie migriert beim Öffnen)', async () => {
    const alt = makeRepo('alt', {
      id: 'notiz-xy',
      name: 'Notiz',
      history: [{ id: 'h1', prompt: 'Eine Notiz', html: '<p>x</p>', time: 1 }],
    });
    await commitRepo(alt, 'v1');

    const res = await startImport(workspace, alt);
    expect(res).toMatchObject({ ok: true, id: 'notiz-xy' });
  });
});

describe('appimport: Id-Konflikt', () => {
  it('fragt nach, statt eine vorhandene App anzutasten', async () => {
    makeApp('rechner-ab12c', 'Mein Rechner');

    const res = await startImport(workspace, origin);
    expect(res.ok).toBe(false);
    expect(res.collision).toMatchObject({
      id: 'rechner-ab12c',
      name: 'Rechner',
      existingName: 'Mein Rechner',
      copyId: 'rechner-ab12c-2',
    });
    expect(res.collision?.token).toBeTruthy();
    // Die vorhandene App bleibt, wie sie ist — der Klon wartet.
    expect(manifestOf(path.join(workspace, 'rechner-ab12c')).name).toBe('Mein Rechner');
    expect(tempClones()).toHaveLength(1);
  });

  it('erkennt auch einen belegten Ordner ohne Manifest als Konflikt', async () => {
    fs.mkdirSync(path.join(workspace, 'rechner-ab12c'), { recursive: true });

    const res = await startImport(workspace, origin);
    expect(res.collision?.copyId).toBe('rechner-ab12c-2');
  });

  it('legt „Kopie“ unter neuer Id ab, mit eigenem Commit und altem Namen', async () => {
    makeApp('rechner-ab12c', 'Mein Rechner');
    const first = await startImport(workspace, origin);
    const token = first.collision!.token;

    const res = await resolveImport(token, 'copy');
    expect(res).toMatchObject({ ok: true, id: 'rechner-ab12c-2', name: 'Rechner' });

    const copy = path.join(workspace, 'rechner-ab12c-2');
    expect(manifestOf(copy)).toMatchObject({ id: 'rechner-ab12c-2', name: 'Rechner', icon: '🧮' });
    // Die neue Id ist als Version festgehalten (Klon-Commit + Umbenennung).
    expect(await countVersions(copy)).toBe(2);
    // Die vorhandene App ist unangetastet.
    expect(manifestOf(path.join(workspace, 'rechner-ab12c')).name).toBe('Mein Rechner');
    expect(tempClones()).toEqual([]);
  });

  it('ersetzt auf Wunsch die vorhandene App', async () => {
    const alt = makeApp('rechner-ab12c', 'Mein Rechner');
    fs.writeFileSync(path.join(alt, 'nur-hier.txt'), 'alt', 'utf8');
    const first = await startImport(workspace, origin);

    const res = await resolveImport(first.collision!.token, 'replace');
    expect(res).toMatchObject({ ok: true, id: 'rechner-ab12c', name: 'Rechner' });

    const dir = path.join(workspace, 'rechner-ab12c');
    expect(manifestOf(dir).name).toBe('Rechner');
    expect(fs.existsSync(path.join(dir, 'nur-hier.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
    expect(workspaceDirs()).toEqual(['rechner-ab12c']);
  });

  it('lässt beim Abbrechen alles, wie es war', async () => {
    makeApp('rechner-ab12c', 'Mein Rechner');
    const first = await startImport(workspace, origin);

    const res = await resolveImport(first.collision!.token, 'cancel');
    expect(res.ok).toBe(false);
    expect(res.cancelled).toBe(true);
    expect(manifestOf(path.join(workspace, 'rechner-ab12c')).name).toBe('Mein Rechner');
    expect(workspaceDirs()).toEqual(['rechner-ab12c']);
    expect(tempClones()).toEqual([]);
  });

  it('beantwortet einen Konflikt nur einmal', async () => {
    makeApp('rechner-ab12c', 'Mein Rechner');
    const first = await startImport(workspace, origin);
    const token = first.collision!.token;
    await resolveImport(token, 'copy');

    const again = await resolveImport(token, 'replace');
    expect(again.ok).toBe(false);
    expect(again.error).toBeTruthy();
    expect(manifestOf(path.join(workspace, 'rechner-ab12c')).name).toBe('Mein Rechner');
  });

  it('kennt keine erfundenen Marken', async () => {
    const res = await resolveImport('import-gibtsnicht', 'replace');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
