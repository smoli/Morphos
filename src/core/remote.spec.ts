import { describe, it, expect } from 'vitest';
import {
  accessProblem,
  hasOriginSection,
  nonFastForward,
  parseAheadBehind,
  pullProblem,
  pushProblem,
  remoteBadge,
  syncErrorMessage,
  syncState,
  upstreamBranchName,
} from './remote';
import type { RemoteStatus } from '@/types';

/** Ein Stand mit Gegenstelle und gezählten Versionen. */
function status(extra: Partial<RemoteStatus> = {}): RemoteStatus {
  return { hasRemote: true, url: 'https://github.com/jemand/app.git', upstream: 'origin/main', ...extra };
}

describe('remote (rein)', () => {
  describe('parseAheadBehind', () => {
    it('liest die Zählung von git (links HEAD, rechts die Gegenstelle)', () => {
      expect(parseAheadBehind('2\t3\n')).toEqual({ ahead: 2, behind: 3 });
      expect(parseAheadBehind('0\t0\n')).toEqual({ ahead: 0, behind: 0 });
      expect(parseAheadBehind(' 7 0 ')).toEqual({ ahead: 7, behind: 0 });
    });

    it('nimmt nichts an, was keine zwei Zahlen sind', () => {
      for (const out of ['', '\n', 'fatal: no upstream', '3', '1\t2\t3', '-1\t2']) {
        expect(parseAheadBehind(out)).toBe(null);
      }
    });
  });

  describe('syncState', () => {
    it('benennt die vier Lagen', () => {
      expect(syncState(status({ ahead: 0, behind: 0 }))).toBe('synced');
      expect(syncState(status({ ahead: 2, behind: 0 }))).toBe('ahead');
      expect(syncState(status({ ahead: 0, behind: 3 }))).toBe('behind');
      expect(syncState(status({ ahead: 2, behind: 3 }))).toBe('diverged');
    });

    it('bleibt „unknown“, solange nichts gezählt wurde', () => {
      expect(syncState(status())).toBe('unknown');
      expect(syncState(status({ ahead: 1 }))).toBe('unknown');
      expect(syncState(null)).toBe('unknown');
      expect(syncState({ hasRemote: false })).toBe('unknown');
    });
  });

  describe('remoteBadge', () => {
    it('schweigt für eine App ohne Gegenstelle', () => {
      expect(remoteBadge({ hasRemote: false })).toBe(null);
      expect(remoteBadge(null)).toBe(null);
    });

    it('zeigt vor dem ersten Nachsehen nur, DASS es eine Gegenstelle gibt', () => {
      const badge = remoteBadge(status())!;
      expect(badge.text).toBe('⇅');
      expect(badge.title).toMatch(/noch nicht/i);
    });

    it('zählt eigene und fremde Versionen mit Richtung', () => {
      expect(remoteBadge(status({ ahead: 2, behind: 0 }))!.text).toBe('↑2');
      expect(remoteBadge(status({ ahead: 0, behind: 3 }))!.text).toBe('↓3');
      expect(remoteBadge(status({ ahead: 2, behind: 3 }))!.text).toBe('↑2↓3');
      expect(remoteBadge(status({ ahead: 0, behind: 0 }))!.text).toBe('✓');
    });

    it('meldet einen Fehlschlag, solange nichts gezählt werden konnte', () => {
      const badge = remoteBadge(status({ error: 'Kein Zugang zu github.com.' }))!;
      expect(badge.text).toBe('⚠');
      expect(badge.title).toBe('Kein Zugang zu github.com.');
    });

    it('zeigt trotz Fehlschlag die Zählung des letzten Holens', () => {
      expect(remoteBadge(status({ ahead: 1, behind: 0, error: 'Kein Netz.' }))!.text).toBe('↑1');
    });
  });

  describe('pushProblem', () => {
    it('lässt eigene Versionen schieben', () => {
      expect(pushProblem(status({ ahead: 2, behind: 0 }))).toBe(null);
      // Ungezählt wird es versucht — git selbst lehnt notfalls ab.
      expect(pushProblem(status())).toBe(null);
    });

    it('verweist auf das Ziehen, wenn die Gegenstelle weiter ist — nie mit Gewalt', () => {
      for (const s of [status({ ahead: 0, behind: 3 }), status({ ahead: 2, behind: 3 })]) {
        expect(pushProblem(s)).toMatch(/ziehen/i);
      }
    });

    it('schiebt nicht, wenn es nichts zu schieben gibt', () => {
      expect(pushProblem(status({ ahead: 0, behind: 0 }))).toMatch(/schon/i);
    });

    it('braucht überhaupt eine Gegenstelle', () => {
      expect(pushProblem({ hasRemote: false })).toMatch(/keine Gegenstelle/i);
    });
  });

  describe('pullProblem', () => {
    it('lässt vorspulen, wenn nur die Gegenstelle weiter ist', () => {
      expect(pullProblem(status({ ahead: 0, behind: 3 }))).toBe(null);
    });

    it('hält an, wenn beide Seiten weitergegangen sind (Auflösung: c0084)', () => {
      const msg = pullProblem(status({ ahead: 2, behind: 3 }))!;
      expect(msg).toMatch(/beide/i);
      expect(msg).toMatch(/nichts/i);
    });

    it('zieht nicht, wenn es nichts zu holen gibt', () => {
      expect(pullProblem(status({ ahead: 0, behind: 0 }))).toMatch(/nichts Neues/i);
      expect(pullProblem(status({ ahead: 2, behind: 0 }))).toMatch(/nichts Neues/i);
    });

    it('braucht überhaupt eine Gegenstelle', () => {
      expect(pullProblem({ hasRemote: false })).toMatch(/keine Gegenstelle/i);
    });
  });

  describe('nonFastForward', () => {
    it('erkennt die Absage von git', () => {
      for (const reason of [
        ' ! [rejected]        main -> main (fetch first)',
        ' ! [rejected]        main -> main (non-fast-forward)',
        'error: failed to push some refs to \'https://github.com/x/y.git\'\nhint: Updates were rejected because the remote contains work',
      ]) {
        expect(nonFastForward(reason)).toBe(true);
      }
    });

    it('hält alles Übrige für einen anderen Fehler', () => {
      expect(nonFastForward('fatal: unable to access: Could not resolve host')).toBe(false);
    });
  });

  describe('syncErrorMessage', () => {
    it('macht aus der Absage von git den Weg zurück', () => {
      const msg = syncErrorMessage(' ! [rejected] main -> main (fetch first)', 'https://github.com/x/y.git', 'push');
      expect(msg).toMatch(/ziehen/i);
      expect(msg).not.toContain('[rejected]');
    });

    it('erklärt den fehlenden Zugang wie beim Holen einer App (i0007)', () => {
      const msg = syncErrorMessage(
        "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
        'https://github.com/x/y.git',
        'push',
      );
      expect(msg).toContain('gh auth login');
      expect(msg).not.toContain('terminal prompts disabled');
    });

    it('reicht alles Übrige unverfälscht durch — und sagt, wobei es war', () => {
      expect(syncErrorMessage('fatal: kaputt', 'https://github.com/x/y.git', 'push')).toContain('fatal: kaputt');
      expect(syncErrorMessage('fatal: kaputt', 'https://github.com/x/y.git', 'fetch'))
        .toMatch(/Gegenstelle konnte nicht abgefragt/i);
      expect(syncErrorMessage('fatal: kaputt', 'https://github.com/x/y.git', 'pull'))
        .toMatch(/geholt werden/i);
    });
  });

  describe('accessProblem', () => {
    it('trennt ssh (Schlüssel) von https (gh)', () => {
      expect(accessProblem('Permission denied (publickey).', 'git@github.com:x/y.git')).toMatch(/Schlüssel/);
      expect(accessProblem('Authentication failed', 'https://github.com/x/y.git')).toContain('gh auth login');
    });

    it('hält sich heraus, wo es nicht um den Zugang geht', () => {
      expect(accessProblem('fatal: destination path already exists', 'https://github.com/x/y')).toBe(null);
    });
  });

  describe('upstreamBranchName', () => {
    it('liest den Zweig aus dem, was in der Konfiguration steht', () => {
      expect(upstreamBranchName('refs/heads/main')).toBe('main');
      expect(upstreamBranchName('refs/heads/feature/neu\n')).toBe('feature/neu');
      expect(upstreamBranchName('main')).toBe('main');
    });

    it('nimmt nichts an, was kein Zweig ist', () => {
      for (const ref of ['', '  ', 'refs/tags/v1', '--force', 'refs/heads/', 'mit leer zeichen']) {
        expect(upstreamBranchName(ref)).toBe('');
      }
    });
  });

  describe('hasOriginSection', () => {
    it('findet die Gegenstelle in der Git-Konfiguration', () => {
      expect(hasOriginSection('[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = x\n')).toBe(true);
      expect(hasOriginSection('[remote "upstream"]\n\turl = x\n')).toBe(false);
      expect(hasOriginSection('[core]\n')).toBe(false);
      expect(hasOriginSection('')).toBe(false);
    });
  });
});
