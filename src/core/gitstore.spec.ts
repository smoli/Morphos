import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  aheadBehind,
  ensureRepo,
  commitAll,
  cloneRepo,
  countVersions,
  fetchRemote,
  findGh,
  getUpstream,
  ghCredentialArgs,
  hasRemote,
  listVersions,
  pullFastForward,
  pushRemote,
  remoteUrl,
  restoreVersion,
} from './gitstore';
import { writeChat } from './appstore';

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

  // c0082: Abgleich mit der Gegenstelle — nur im Vorlauf, nie mit Gewalt.
  // Gespielt wird mit echten Repositories im Dateisystem: ein nacktes als
  // Gegenstelle und zwei Klone davon, die einander in die Quere kommen.
  describe('Gegenstelle (fetch/push/pull)', () => {
    let tmp: string;
    let origin: string;
    let alice: string;
    let bob: string;

    /** Der Stand einer Datei im nackten Repository — was dort wirklich ankam. */
    function onOrigin(rel: string): string {
      return execFileSync('git', ['-C', origin, 'show', `HEAD:${rel}`]).toString();
    }

    function put(repo: string, rel: string, content: string): void {
      fs.writeFileSync(path.join(repo, rel), content, 'utf8');
    }

    beforeEach(async () => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-sync-'));
      // Eine App mit einer Version wird zur Gegenstelle …
      const seed = path.join(tmp, 'seed');
      fs.mkdirSync(seed);
      await ensureRepo(seed);
      put(seed, 'app.json', '{"id":"a","name":"A"}');
      await commitAll(seed, 'erste');
      origin = path.join(tmp, 'origin.git');
      execFileSync('git', ['clone', '--bare', '--quiet', seed, origin]);

      // … und zwei Anwender holen sie sich.
      alice = path.join(tmp, 'alice');
      bob = path.join(tmp, 'bob');
      await cloneRepo(origin, alice);
      await cloneRepo(origin, bob);
    });

    afterEach(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('erkennt eine Gegenstelle am Klon — und keine bei einer eigenen App', async () => {
      expect(hasRemote(alice)).toBe(true);
      expect(await remoteUrl(alice)).toBe(origin);

      await ensureRepo(dir);
      expect(hasRemote(dir)).toBe(false);
      expect(await remoteUrl(dir)).toBe(null);
      expect(hasRemote(path.join(tmp, 'gibtesnicht'))).toBe(false);
    });

    it('kennt den verfolgten Zweig — und nur den auf origin', async () => {
      const up = (await getUpstream(alice))!;
      expect(up.remoteBranch).toBe(up.branch);
      expect(up.name).toBe(`origin/${up.branch}`);

      await ensureRepo(dir);
      write('a.txt', 'x');
      await commitAll(dir, 'eins');
      expect(await getUpstream(dir)).toBe(null);
    });

    it('zählt nach dem Klonen Gleichstand', async () => {
      expect(await aheadBehind(alice)).toEqual({ ahead: 0, behind: 0 });
    });

    it('schiebt eigene Versionen zur Gegenstelle', async () => {
      put(alice, 'app.json', '{"id":"a","name":"A2"}');
      await commitAll(alice, 'zweite');
      expect(await aheadBehind(alice)).toEqual({ ahead: 1, behind: 0 });

      const up = (await getUpstream(alice))!;
      await pushRemote(alice, up.remoteBranch);

      expect(onOrigin('app.json')).toContain('A2');
      expect(await aheadBehind(alice)).toEqual({ ahead: 0, behind: 0 });
    });

    it('sieht fremde Versionen erst NACH dem Holen', async () => {
      put(bob, 'app.json', '{"id":"a","name":"von Bob"}');
      await commitAll(bob, 'Bobs Fassung');
      await pushRemote(bob, (await getUpstream(bob))!.remoteBranch);

      // Ungeholt weiß Alice von nichts — es wird nicht im Hintergrund gefragt.
      expect(await aheadBehind(alice)).toEqual({ ahead: 0, behind: 0 });
      await fetchRemote(alice);
      expect(await aheadBehind(alice)).toEqual({ ahead: 0, behind: 1 });
    });

    it('spult auf den Stand der Gegenstelle vor', async () => {
      put(bob, 'app.json', '{"id":"a","name":"von Bob"}');
      await commitAll(bob, 'Bobs Fassung');
      await pushRemote(bob, (await getUpstream(bob))!.remoteBranch);

      await fetchRemote(alice);
      await pullFastForward(alice);

      expect(fs.readFileSync(path.join(alice, 'app.json'), 'utf8')).toContain('von Bob');
      expect(await aheadBehind(alice)).toEqual({ ahead: 0, behind: 0 });
      expect((await listVersions(alice)).map((v) => v.prompt)).toEqual(['Bobs Fassung', 'erste']);
    });

    it('schiebt nicht mit Gewalt: Ist die Gegenstelle weiter, scheitert der Push', async () => {
      put(bob, 'app.json', '{"id":"a","name":"von Bob"}');
      await commitAll(bob, 'Bobs Fassung');
      await pushRemote(bob, (await getUpstream(bob))!.remoteBranch);

      put(alice, 'app.json', '{"id":"a","name":"von Alice"}');
      await commitAll(alice, 'Alices Fassung');
      await fetchRemote(alice);
      expect(await aheadBehind(alice)).toEqual({ ahead: 1, behind: 1 });

      await expect(pushRemote(alice, (await getUpstream(alice))!.remoteBranch)).rejects.toThrow();
      // Bobs Fassung steht unversehrt auf der Gegenstelle.
      expect(onOrigin('app.json')).toContain('von Bob');
    });

    it('spult nicht vor, wenn beide Seiten weitergegangen sind — und ändert nichts', async () => {
      put(bob, 'app.json', '{"id":"a","name":"von Bob"}');
      await commitAll(bob, 'Bobs Fassung');
      await pushRemote(bob, (await getUpstream(bob))!.remoteBranch);

      put(alice, 'app.json', '{"id":"a","name":"von Alice"}');
      await commitAll(alice, 'Alices Fassung');
      await fetchRemote(alice);

      await expect(pullFastForward(alice)).rejects.toThrow();
      expect(fs.readFileSync(path.join(alice, 'app.json'), 'utf8')).toContain('von Alice');
      expect((await listVersions(alice)).map((v) => v.prompt)).toEqual(['Alices Fassung', 'erste']);
    });

    it('holt und schiebt nur, wo es eine Gegenstelle gibt', async () => {
      await ensureRepo(dir);
      write('a.txt', 'x');
      await commitAll(dir, 'eins');
      await expect(fetchRemote(dir)).rejects.toThrow(/Gegenstelle/);
      await expect(pushRemote(dir, 'main')).rejects.toThrow(/Gegenstelle/);
      expect(await aheadBehind(dir)).toBe(null);
    });

    it('lässt den Dialogverlauf zu Hause — chat.json reist nicht mit', async () => {
      // Wie beim Speichern einer App (core/appstore): chat.json ist von Git
      // ausgenommen und hat auf der Gegenstelle nichts verloren.
      writeChat(alice, [{ role: 'user', text: 'geheim', time: 1 }]);
      put(alice, 'app.json', '{"id":"a","name":"A2"}');
      await commitAll(alice, 'zweite');
      await pushRemote(alice, (await getUpstream(alice))!.remoteBranch);

      expect(onOrigin('app.json')).toContain('A2');
      expect(() => onOrigin('chat.json')).toThrow();
    });

    it('lässt sich keinen Zweignamen unterschieben, der eine Option wäre', async () => {
      await expect(pushRemote(alice, '--mirror')).rejects.toThrow(/Ungültiger Zweig/);
      await expect(pushRemote(alice, 'refs/tags/v1')).rejects.toThrow(/Ungültiger Zweig/);
    });
  });

  // i0007: Wer sich mit `gh auth login` angemeldet hat, hat damit noch keinen
  // Credential-Helfer in seiner Git-Konfiguration — https-Klone scheiterten,
  // obwohl der Anwender „eingeloggt" war.
  describe('ghCredentialArgs', () => {
    it('trägt gh als Helfer für die Gegenstelle der https-Adresse ein', () => {
      expect(ghCredentialArgs('https://github.com/jemand/app.git', '/opt/homebrew/bin/gh')).toEqual([
        '-c',
        "credential.https://github.com.helper=!'/opt/homebrew/bin/gh' auth git-credential",
      ]);
    });

    it('bleibt bei der Gegenstelle der Adresse — auch Firmen-Server und Port', () => {
      expect(ghCredentialArgs('http://git.firma.local:8080/team/app', '/usr/bin/gh')[1])
        .toBe("credential.http://git.firma.local:8080.helper=!'/usr/bin/gh' auth git-credential");
      expect(ghCredentialArgs('https://Jemand@GitHub.com/x/y', '/usr/bin/gh')[1])
        .toBe("credential.https://github.com.helper=!'/usr/bin/gh' auth git-credential");
    });

    it('hält sich heraus, wo kein Passwort gefragt ist (ssh, Pfad) oder gh fehlt', () => {
      expect(ghCredentialArgs('https://github.com/x/y', null)).toEqual([]);
      expect(ghCredentialArgs('git@github.com:x/y.git', '/usr/bin/gh')).toEqual([]);
      expect(ghCredentialArgs('ssh://git@github.com/x/y.git', '/usr/bin/gh')).toEqual([]);
      expect(ghCredentialArgs('/Volumes/Austausch/app', '/usr/bin/gh')).toEqual([]);
      expect(ghCredentialArgs('file:///Volumes/Austausch/app', '/usr/bin/gh')).toEqual([]);
    });

    it('macht aus einem Pfad kein Shell-Schlupfloch', () => {
      expect(ghCredentialArgs('https://github.com/x/y', "/opt/mein 'gh'/gh")[1])
        .toBe("credential.https://github.com.helper=!'/opt/mein '\\''gh'\\''/gh' auth git-credential");
      expect(ghCredentialArgs('https://github.com/x/y', '/opt/gh\nrm -rf /')).toEqual([]);
    });
  });

  describe('findGh', () => {
    let bin: string;
    let gh: string;

    beforeEach(() => {
      bin = path.join(dir, 'mein ordner');
      fs.mkdirSync(bin, { recursive: true });
      gh = path.join(bin, 'gh');
      fs.writeFileSync(gh, '#!/bin/sh\nexit 0\n', 'utf8');
      fs.chmodSync(gh, 0o755);
    });

    it('findet die GitHub-CLI im PATH', () => {
      expect(findGh({ PATH: `${path.join(dir, 'leer')}${path.delimiter}${bin}` }, [])).toBe(gh);
    });

    it('sieht auch an den üblichen Plätzen nach — ein Programm aus dem Dock hat kaum PATH', () => {
      expect(findGh({}, [path.join(dir, 'leer'), bin])).toBe(gh);
    });

    it('meldet null, wenn es sie nicht gibt (dann bleibt alles wie bisher)', () => {
      expect(findGh({ PATH: path.join(dir, 'leer') }, [])).toBe(null);
    });
  });

  // Beweist, dass git die erzeugten Argumente wirklich annimmt und den Helfer
  // ruft — der Fehler von i0007 lag genau in dieser Verdrahtung.
  it.skipIf(process.platform === 'win32')('lässt git den Zugang wirklich bei gh holen', () => {
    const gh = path.join(dir, 'gh');
    fs.writeFileSync(gh, '#!/bin/sh\necho username=x-access-token\necho password=geheim\n', 'utf8');
    fs.chmodSync(gh, 0o755);

    const out = execFileSync(
      'git',
      // `credential.helper=` leert die Kette zuvor: Der Test soll nicht die
      // Helfer der Maschine befragen, auf der er läuft.
      ['-c', 'credential.helper=', ...ghCredentialArgs('https://git.example.org/x/y.git', gh), 'credential', 'fill'],
      { input: 'protocol=https\nhost=git.example.org\n\n', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
    ).toString();

    expect(out).toContain('username=x-access-token');
    expect(out).toContain('password=geheim');
  });
});
