import { describe, it, expect } from 'vitest';
import { isValidOutputPath, isValidSourcePath } from './files';

describe('isValidSourcePath', () => {
  it('erlaubt nur Pfade unter src/', () => {
    expect(isValidSourcePath('src/index.html')).toBe(true);
    expect(isValidSourcePath('src/ui/menu.js')).toBe(true);
    expect(isValidSourcePath('index.html')).toBe(false);
    expect(isValidSourcePath('app.json')).toBe(false);
    expect(isValidSourcePath('.git/config')).toBe(false);
  });

  it('verhindert Traversal und ungültige Zeichen', () => {
    expect(isValidSourcePath('src/../geheim.txt')).toBe(false);
    expect(isValidSourcePath('src/a/../../b')).toBe(false);
    expect(isValidSourcePath('src//doppelt.js')).toBe(false);
    expect(isValidSourcePath('src/')).toBe(false);
    expect(isValidSourcePath('src/ordner/')).toBe(false);
    expect(isValidSourcePath('/src/abs.js')).toBe(false);
    expect(isValidSourcePath('src\\win.js')).toBe(false);
    expect(isValidSourcePath('src/mit leerzeichen.js')).toBe(false);
    expect(isValidSourcePath('')).toBe(false);
  });
});

describe('isValidOutputPath', () => {
  it('lässt zusätzlich GENAU die beiden Dokumente der App zu', () => {
    expect(isValidOutputPath('src/app.js')).toBe(true);
    expect(isValidOutputPath('concept.md')).toBe(true);
    expect(isValidOutputPath('userdocumentation.md')).toBe(true);
  });

  it('weist jeden anderen Pfad außerhalb von src/ weiterhin ab', () => {
    expect(isValidOutputPath('README.md')).toBe(false);
    expect(isValidOutputPath('app.json')).toBe(false);
    expect(isValidOutputPath('.gitignore')).toBe(false);
    expect(isValidOutputPath('index.html')).toBe(false);
    expect(isValidOutputPath('../concept.md')).toBe(false);
    expect(isValidOutputPath('src/../concept.md')).toBe(false);
    expect(isValidOutputPath('/concept.md')).toBe(false);
  });
});
