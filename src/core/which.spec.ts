import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findOnPath } from './which';

let dir: string;
let bin: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-which-'));
  bin = path.join(dir, 'mein ordner');
  fs.mkdirSync(bin, { recursive: true });
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function program(name: string): string {
  const file = path.join(bin, name);
  fs.writeFileSync(file, '#!/bin/sh\nexit 0\n', 'utf8');
  fs.chmodSync(file, 0o755);
  return file;
}

describe('findOnPath', () => {
  it('findet ein Programm im PATH und liefert seinen vollen Pfad', () => {
    const gh = program('gh');
    expect(findOnPath(['gh'], { PATH: `${path.join(dir, 'leer')}${path.delimiter}${bin}` }, [])).toBe(gh);
  });

  it('sieht auch an den üblichen Plätzen nach — ein Programm aus dem Dock hat kaum PATH', () => {
    const term = program('xterm');
    expect(findOnPath(['xterm'], {}, [path.join(dir, 'leer'), bin])).toBe(term);
  });

  it('nimmt den ersten Namen, den es an einem Platz gibt', () => {
    program('gh.cmd');
    expect(findOnPath(['gh.exe', 'gh.cmd'], { PATH: bin }, [])).toBe(path.join(bin, 'gh.cmd'));
  });

  it('geht die Plätze in ihrer Reihenfolge durch — der PATH zuerst', () => {
    const zweit = path.join(dir, 'zweiter');
    fs.mkdirSync(zweit);
    fs.writeFileSync(path.join(zweit, 'gh'), '', 'utf8');
    const erst = program('gh');
    expect(findOnPath(['gh'], { PATH: bin }, [zweit])).toBe(erst);
  });

  it('meldet null, wenn es das Programm nicht gibt', () => {
    expect(findOnPath(['gibtesnicht'], { PATH: bin }, [])).toBe(null);
  });

  it('hält einen Ordner nicht für ein Programm', () => {
    fs.mkdirSync(path.join(bin, 'konsole'));
    expect(findOnPath(['konsole'], { PATH: bin }, [])).toBe(null);
  });
});
