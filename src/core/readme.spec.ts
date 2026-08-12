import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeAppState } from './appstore';
import { commitAll, ensureRepo, listVersions } from './gitstore';
import {
  ICON_FILES,
  MORPHOS_URL,
  README_FILE,
  buildReadme,
  iconAsset,
  shortDescription,
  writeReadme,
} from './readme';

/** Ein winziges, echtes Bild-Icon, wie es der Icon-Dialog ablegt. */
const PIXEL = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const IMAGE_ICON = `data:image/png;base64,${PIXEL.toString('base64')}`;

const MORPHOS = { version: '0.1.0', commit: 'abc1234' };

const base = {
  name: 'Rechner',
  icon: '🧮',
  iconFile: null,
  description: 'Ein Taschenrechner für den Alltag.',
  hasConcept: true,
  hasUserdoc: true,
  ...MORPHOS,
};

describe('readme (rein)', () => {
  describe('shortDescription', () => {
    it('nimmt den ersten Absatz des Konzepts, ohne Überschrift', () => {
      const concept = '# Rechner\n\nEin Taschenrechner für den Alltag.\nEr kann Prozent.\n\nMehr dazu…';
      expect(shortDescription({ concept, userdoc: '' })).toBe(
        'Ein Taschenrechner für den Alltag. Er kann Prozent.',
      );
    });

    it('überspringt einen Codeblock am Anfang', () => {
      const concept = '```\nnpm test\n```\n\nEin Taschenrechner.';
      expect(shortDescription({ concept, userdoc: '' })).toBe('Ein Taschenrechner.');
    });

    it('weicht auf die Anleitung aus, wenn es kein Konzept gibt', () => {
      expect(shortDescription({ concept: '   ', userdoc: '## Bedienung\n\nZahlen eintippen.' })).toBe(
        'Zahlen eintippen.',
      );
    });

    it('liefert leer, wenn beide Dokumente nichts hergeben', () => {
      expect(shortDescription({ concept: '', userdoc: '' })).toBe('');
      expect(shortDescription({ concept: '# Nur eine Überschrift', userdoc: '' })).toBe('');
    });

    it('nimmt dem Absatz seine Markdown-Zeichen (er steht später in HTML)', () => {
      const concept = 'Ein **Graph** mit `Knoten` und der [Anleitung](userdocumentation.md).';
      expect(shortDescription({ concept, userdoc: '' })).toBe('Ein Graph mit Knoten und der Anleitung.');
    });

    it('kürzt einen langen Absatz an einer Wortgrenze', () => {
      const long = `Wort ${'sehrlang '.repeat(80)}Ende.`;
      const short = shortDescription({ concept: long, userdoc: '' });
      expect(short.length).toBeLessThanOrEqual(301);
      expect(short.endsWith('…')).toBe(true);
      expect(short).not.toContain('  ');
    });
  });

  describe('iconAsset', () => {
    it('macht aus einem Bild-Icon eine echte Datei', () => {
      const asset = iconAsset(IMAGE_ICON);
      expect(asset?.file).toBe('icon.png');
      expect(asset?.data.equals(PIXEL)).toBe(true);
    });

    it('kennt die übrigen Rasterformate', () => {
      expect(iconAsset(`data:image/jpeg;base64,${PIXEL.toString('base64')}`)?.file).toBe('icon.jpg');
      expect(iconAsset(`data:image/webp;base64,${PIXEL.toString('base64')}`)?.file).toBe('icon.webp');
      expect(iconAsset(`data:image/gif;base64,${PIXEL.toString('base64')}`)?.file).toBe('icon.gif');
    });

    it('liefert nichts für ein Emoji oder Unfug', () => {
      expect(iconAsset('🧮')).toBeNull();
      expect(iconAsset('')).toBeNull();
      expect(iconAsset('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull();
      expect(iconAsset('data:image/png;base64,###')).toBeNull();
    });

    it('deckt sich mit der Liste der aufzuräumenden Dateien', () => {
      expect(ICON_FILES).toEqual(expect.arrayContaining(['icon.png', 'icon.jpg', 'icon.gif', 'icon.webp']));
    });
  });

  describe('buildReadme', () => {
    it('stellt Icon und Namen mittig voran', () => {
      const text = buildReadme(base);
      expect(text.startsWith('<h1 align="center">🧮<br>Rechner</h1>')).toBe(true);
      expect(text).toContain('<p align="center">Ein Taschenrechner für den Alltag.</p>');
    });

    it('bindet ein Bild-Icon als Datei ein', () => {
      const text = buildReadme({ ...base, icon: IMAGE_ICON, iconFile: 'icon.png' });
      expect(text).toContain('<p align="center"><img src="icon.png" alt="Rechner" width="128"></p>');
      expect(text).toContain('<h1 align="center">Rechner</h1>');
      expect(text).not.toContain('data:image');
    });

    it('verweist auf beide Dokumente', () => {
      const text = buildReadme(base);
      expect(text).toContain('## Details');
      expect(text).toContain('[Konzept](concept.md)');
      expect(text).toContain('[Anleitung](userdocumentation.md)');
    });

    it('verschweigt ein Dokument, das es nicht gibt', () => {
      const text = buildReadme({ ...base, hasUserdoc: false });
      expect(text).toContain('[Konzept](concept.md)');
      expect(text).not.toContain('userdocumentation.md');
    });

    it('sagt es, wenn die App noch gar keine Dokumente führt', () => {
      const text = buildReadme({ ...base, hasConcept: false, hasUserdoc: false });
      expect(text).toContain('## Details');
      expect(text).not.toContain('concept.md');
      expect(text).toMatch(/noch kein/i);
    });

    it('nennt den Morphos-Stand, den die App braucht', () => {
      const text = buildReadme(base);
      expect(text).toContain('## Morphos');
      expect(text).toContain(MORPHOS_URL);
      expect(text).toContain('**Morphos 0.1.0**');
      expect(text).toContain('`abc1234`');
    });

    it('kommt ohne bekannten Commit aus', () => {
      const text = buildReadme({ ...base, commit: '' });
      expect(text).toContain('**Morphos 0.1.0**');
      expect(text).not.toContain('Commit');
    });

    it('lässt einen unglaubwürdigen Stand weg, statt ihn zu übernehmen', () => {
      const text = buildReadme({ ...base, version: '0.1.0`; rm -rf /', commit: 'nicht-hex' });
      expect(text).not.toContain('rm -rf');
      expect(text).not.toContain('nicht-hex');
      expect(text).toContain('**Morphos**');
    });

    it('lässt Namen und Beschreibung kein Markup einschleusen', () => {
      const text = buildReadme({
        ...base,
        name: 'Böse <script>alert(1)</script>',
        description: 'Mit "Anführung" & <b>Fett</b>',
      });
      expect(text).not.toContain('<script>');
      expect(text).toContain('&lt;script&gt;');
      expect(text).toContain('&amp;');
      expect(text).toContain('&quot;Anführung&quot;');
    });

    it('lässt auch in der Beschreibung keine Markdown-Zeichen stehen', () => {
      const text = buildReadme({ ...base, description: 'Ein **Graph** mit `Knoten`.' });
      expect(text).toContain('<p align="center">Ein Graph mit Knoten.</p>');
    });

    it('kommt ohne Beschreibung mit einem neutralen Satz aus', () => {
      const text = buildReadme({ ...base, description: '' });
      expect(text).toContain('<p align="center">');
      expect(text).toMatch(/Morphos/);
      expect(text.endsWith('\n')).toBe(true);
    });
  });
});

describe('readme (auf der Platte)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-readme-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Eine App auf der Platte, wie appstore sie ablegt. */
  function makeApp(icon = '🧮', docs: { concept?: string; userdoc?: string } = {}): void {
    fs.writeFileSync(
      path.join(dir, 'app.json'),
      JSON.stringify({ id: 'rechner-ab12c', name: 'Rechner', icon, createdAt: 1, updatedAt: 2 }),
      'utf8',
    );
    if (docs.concept) fs.writeFileSync(path.join(dir, 'concept.md'), docs.concept, 'utf8');
    if (docs.userdoc) fs.writeFileSync(path.join(dir, 'userdocumentation.md'), docs.userdoc, 'utf8');
  }

  it('schreibt das Readme aus Manifest und Konzept', () => {
    makeApp('🧮', { concept: '# Rechner\n\nEin Taschenrechner für den Alltag.' });

    const text = writeReadme(dir, MORPHOS);

    expect(fs.readFileSync(path.join(dir, README_FILE), 'utf8')).toBe(text);
    expect(text).toContain('🧮<br>Rechner');
    expect(text).toContain('Ein Taschenrechner für den Alltag.');
    expect(text).toContain('[Konzept](concept.md)');
    expect(text).not.toContain('userdocumentation.md');
  });

  it('legt ein Bild-Icon als Datei daneben', () => {
    makeApp(IMAGE_ICON);

    const text = writeReadme(dir, MORPHOS);

    expect(fs.readFileSync(path.join(dir, 'icon.png')).equals(PIXEL)).toBe(true);
    expect(text).toContain('src="icon.png"');
  });

  it('räumt ein Bild-Icon weg, das nicht mehr gilt', () => {
    makeApp(IMAGE_ICON);
    writeReadme(dir, MORPHOS);
    fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify({ id: 'rechner-ab12c', name: 'Rechner', icon: '🧮' }), 'utf8');

    writeReadme(dir, MORPHOS);

    expect(fs.existsSync(path.join(dir, 'icon.png'))).toBe(false);
  });

  it('schreibt beim zweiten Mal einfach neu', () => {
    makeApp('🧮', { concept: 'Erster Stand.' });
    writeReadme(dir, MORPHOS);
    fs.writeFileSync(path.join(dir, 'concept.md'), 'Zweiter Stand.', 'utf8');

    const text = writeReadme(dir, MORPHOS);

    expect(text).toContain('Zweiter Stand.');
    expect(text).not.toContain('Erster Stand.');
    expect(fs.readdirSync(dir).filter((f) => f.toLowerCase().startsWith('readme'))).toEqual([README_FILE]);
  });

  it('bleibt stehen, wenn die App neu generiert wird', () => {
    makeApp('🧮', { concept: 'Ein Taschenrechner.' });
    const text = writeReadme(dir, MORPHOS);

    // Eine Generierung schreibt Manifest, Quellen, Artefakt und die Dokumente —
    // das Readme gehört der Schale und wird dabei nicht angefasst.
    writeAppState(
      dir,
      { id: 'rechner-ab12c', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 3 },
      [{ path: 'src/index.html', content: '<h1>neu</h1>' }],
      '<h1>neu</h1>',
      { concept: 'Ein Taschenrechner.', userdoc: '' },
    );

    expect(fs.readFileSync(path.join(dir, README_FILE), 'utf8')).toBe(text);
  });

  it('verlangt ein Manifest', () => {
    expect(() => writeReadme(dir, MORPHOS)).toThrow(/app\.json/);
  });

  it('wird ein Commit im Repository der App', async () => {
    makeApp('🧮', { concept: 'Ein Taschenrechner.' });
    await ensureRepo(dir);
    await commitAll(dir, 'Erste Fassung');

    writeReadme(dir, MORPHOS);
    await commitAll(dir, 'Readme geschrieben');

    // commitAll committet nur, wenn es etwas zu committen gab: Der zweite
    // Commit beweist, dass das Readme im Baum liegt.
    const versions = await listVersions(dir);
    expect(versions.map((v) => v.prompt)).toEqual(['Readme geschrieben', 'Erste Fassung']);
  });
});
