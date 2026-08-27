import { describe, it, expect } from 'vitest';
import { buildPrompt, formatDesign, SYSTEM_PROMPT } from './prompt';
import { mcpToolId } from './mcp';
import { DESIGN_FILE, DESIGN_VERSION, emptyDesign, type Block, type Design, type Rect } from './design';
import type { AssetInfo } from './assets';
import type { ChatMessage } from '@/types';

describe('SYSTEM_PROMPT', () => {
  it('beschreibt die Engine-Rolle und das Quelldatei-Modell', () => {
    expect(SYSTEM_PROMPT).toContain('Morphos');
    expect(SYSTEM_PROMPT).toContain('src/index.html');
    expect(SYSTEM_PROMPT).toMatch(/localStorage/i);
  });

  it('warnt davor, das beim Bündeln gesetzte data-morphos-src selbst zu schreiben', () => {
    expect(SYSTEM_PROMPT).toContain('data-morphos-src');
    expect(SYSTEM_PROMPT).toContain('MARKIERTE ELEMENTE');
  });

  it('stellt den App-Ordner als Arbeitsverzeichnis vor', () => {
    expect(SYSTEM_PROMPT).toMatch(/Arbeitsverzeichnis IST der Ordner dieser App/);
    expect(SYSTEM_PROMPT).toContain('Glob');
    expect(SYSTEM_PROMPT).toContain('Grep');
  });

  it('nennt zum Schreiben NUR die Werkzeuge von Morphos', () => {
    expect(SYSTEM_PROMPT).toContain(mcpToolId('write'));
    expect(SYSTEM_PROMPT).toContain(mcpToolId('edit'));
    expect(SYSTEM_PROMPT).toContain(mcpToolId('delete'));
    // Und sagt ausdrücklich, dass die eigenen der CLI nicht zur Verfügung stehen.
    expect(SYSTEM_PROMPT).toMatch(/Write, Edit und\n\s*Bash der CLI stehen dir NICHT zur Verfügung/);
  });

  it('kennt kein Blockformat mehr — es wird auf der Platte gearbeitet', () => {
    expect(SYSTEM_PROMPT).not.toContain('===MORPHOS:');
    expect(SYSTEM_PROMPT).toMatch(/kein Ausgabeformat für/i);
  });

  it('verlangt Titel und Icon für die Desktop-Kachel', () => {
    expect(SYSTEM_PROMPT).toMatch(/<title>/i);
    expect(SYSTEM_PROMPT).toContain('morphos:icon');
  });

  it('dokumentiert das Dateisystem-API window.morphosFS', () => {
    expect(SYSTEM_PROMPT).toContain('window.morphosFS');
    expect(SYSTEM_PROMPT).toMatch(/writeFile/);
    expect(SYSTEM_PROMPT).toMatch(/readFile/);
  });

  it('dokumentiert die Dateidialoge der Shell', () => {
    expect(SYSTEM_PROMPT).toContain('openFile');
    expect(SYSTEM_PROMPT).toContain('saveFile');
    expect(SYSTEM_PROMPT).toContain('pickDirectory');
    // Der Agent soll sie nutzen, statt einen eigenen Dateibrowser zu bauen.
    expect(SYSTEM_PROMPT).toMatch(/KEINEN eigenen Dateibrowser/i);
    // Und wissen, was zurückkommt: relativer Pfad oder null bei Abbruch.
    expect(SYSTEM_PROMPT).toMatch(/relativ zum Datenordner/i);
    expect(SYSTEM_PROMPT).toMatch(/null/);
  });

  it('dokumentiert Bibliotheken über morphos:lib', () => {
    expect(SYSTEM_PROMPT).toContain('morphos:lib');
  });

  // Preact gilt nur für Apps, die damit gebaut werden — der immer mitlaufende
  // Systemprompt soll es einer vanilla-App nicht dauernd anpreisen.
  it('erwähnt Preact mit keinem Wort — das steht nur im Prompt der Apps, die es nutzen', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/preact/i);
    expect(SYSTEM_PROMPT).not.toMatch(/htm\b/i);
  });

  it('führt die Rückfrage über das ask-Werkzeug — genau eine, ohne Änderung', () => {
    expect(SYSTEM_PROMPT).toContain(mcpToolId('ask'));
    expect(SYSTEM_PROMPT).toMatch(/GENAU EINE kurze/);
    expect(SYSTEM_PROMPT).toMatch(/ändere KEINE Datei/);
  });

  it('verlangt die beiden Dokumente zuletzt und nur bei echtem Anlass', () => {
    expect(SYSTEM_PROMPT).toContain('concept.md');
    expect(SYSTEM_PROMPT).toContain('userdocumentation.md');
    expect(SYSTEM_PROMPT).toMatch(/Aktualisiere sie ZULETZT/);
    expect(SYSTEM_PROMPT).toMatch(/Bei einer NEUEN App legst du beide an/);
  });

  it('macht das Konzept zur Leitlinie, die der Agent selbst liest', () => {
    expect(SYSTEM_PROMPT).toMatch(/lies sie ZU BEGINN jedes Laufs/);
    expect(SYSTEM_PROMPT).toMatch(/halte die App mit ihr konsistent/);
    // Die Anleitung ist für den Anwender, nicht für Technik.
    expect(SYSTEM_PROMPT).toMatch(/Anleitung für den Anwender/);
  });

  it('lässt außerhalb von src/ nur genau diese beiden Dateien zu', () => {
    expect(SYSTEM_PROMPT).toMatch(/Schreiben darfst du AUSSCHLIESSLICH unter src\//);
    expect(SYSTEM_PROMPT).toMatch(/Jeder andere Pfad wird abgewiesen/);
  });

  it('erklärt den UI-Entwurf und dass er nur zu lesen ist', () => {
    expect(SYSTEM_PROMPT).toContain('UI-LAYOUT');
    expect(SYSTEM_PROMPT).toContain(DESIGN_FILE);
    // Der Entwurf gehört dem Anwender: verbindlich für den Aufbau, tabu zum Schreiben.
    expect(SYSTEM_PROMPT).toMatch(/verbindlich/i);
    expect(SYSTEM_PROMPT).toMatch(/NUR ZUM LESEN/i);
    expect(SYSTEM_PROMPT).toMatch(/Anteile des App-Fensters/);
  });

  it('erklärt die Beigaben unter assets/ — Verweis im Code, nur zum Lesen (c0118)', () => {
    expect(SYSTEM_PROMPT).toContain('BEIGABEN DER APP');
    expect(SYSTEM_PROMPT).toContain('assets/');
    // Der Verweis auf eine Beigabe ist die Ausnahme von „nur data:-URIs“ —
    // sonst traute sich der Agent nicht, sie überhaupt zu benutzen.
    expect(SYSTEM_PROMPT).toMatch(/data:-URI/);
    expect(SYSTEM_PROMPT).toMatch(/assets\/[a-z.]+/);
  });

  it('nimmt die Dokumente bei einer reinen Rückfrage ausdrücklich aus', () => {
    expect(SYSTEM_PROMPT).toMatch(/Stellst du nur eine Rückfrage, rührst du weder Code noch Dokumente an/);
  });
});

describe('buildPrompt', () => {
  it('markiert einen Neustart, wenn noch keine App existiert', () => {
    const p = buildPrompt('Ein Taschenrechner', []);
    expect(p).toContain('ES EXISTIERT NOCH KEINE APP');
    expect(p).toContain('Ein Taschenrechner');
    expect(p).not.toContain('DIE APP LIEGT IN DEINEM ARBEITSVERZEICHNIS');
  });

  it('verweist bei einer bestehenden App auf die Platte, statt Dateien mitzuschicken', () => {
    const p = buildPrompt('Füge einen Button hinzu', [], { hasApp: true });
    expect(p).toContain('DIE APP LIEGT IN DEINEM ARBEITSVERZEICHNIS');
    expect(p).toContain('src/index.html');
    expect(p).toContain('concept.md');
    expect(p).toContain('Füge einen Button hinzu');
    expect(p).not.toContain('ES EXISTIERT NOCH KEINE APP');
    // Kein Dateiinhalt, kein Blockformat — nichts davon geht mehr durch den Prompt.
    expect(p).not.toContain('===MORPHOS:');
    expect(p).not.toContain('AKTUELLE QUELLDATEIEN');
  });

  it('nennt die freigegebenen Bibliotheks-Quellen', () => {
    const p = buildPrompt('x', ['cdn.jsdelivr.net', 'https://unpkg.com/']);
    expect(p).toContain('FREIGEGEBENE BIBLIOTHEKS-QUELLEN');
    expect(p).toContain('cdn.jsdelivr.net');
    expect(p).toContain('https://unpkg.com/');
  });

  it('weist ohne Freigaben darauf hin, dass keine Bibliotheken verfügbar sind', () => {
    expect(buildPrompt('x', [])).toContain('KEINE Bibliotheken');
  });

  it('legt die Preact-Anleitung bei, wenn die App damit gebaut wird', () => {
    const p = buildPrompt('Ein Zähler', [], { framework: 'preact' });
    expect(p).toContain('PREACT + HTM');
    expect(p).toContain('<meta name="morphos:lib" content="preact">');
    expect(p).toContain('preactHooks');
    // Vor dem Wunsch — er bleibt das Letzte im Prompt.
    expect(p.indexOf('PREACT + HTM')).toBeLessThan(p.indexOf('Ein Zähler'));
  });

  it('schweigt über Preact, wenn die App vanilla ist', () => {
    expect(buildPrompt('Ein Zähler', [], { framework: 'vanilla' })).not.toMatch(/preact/i);
    // Ohne Angabe erst recht — der Prompt bleibt, wie er war.
    expect(buildPrompt('Ein Zähler', [])).not.toMatch(/preact/i);
  });

  it('trimmt den Nutzerwunsch', () => {
    const p = buildPrompt('   Hallo   ', []);
    expect(p).toContain('Hallo');
    expect(p).not.toContain('   Hallo   ');
  });

  it('bettet den bisherigen Dialog ein (Anwender und Morphos)', () => {
    const chat: ChatMessage[] = [
      { role: 'user', text: 'Ein Spiel', time: 1 },
      { role: 'assistant', text: 'Welche Art von Spiel schwebt dir vor?', time: 2 },
    ];
    const p = buildPrompt('Ein Snake-Spiel', [], { chat });
    expect(p).toContain('BISHERIGER DIALOG');
    expect(p).toContain('[Anwender] Ein Spiel');
    expect(p).toContain('[Morphos] Welche Art von Spiel schwebt dir vor?');
    // Der aktuelle Wunsch steht separat am Ende.
    expect(p.indexOf('Ein Snake-Spiel')).toBeGreaterThan(p.indexOf('BISHERIGER DIALOG'));
  });

  it('begrenzt den Dialog auf die letzten Nachrichten', () => {
    const chat: ChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: 'user' as const,
      text: `Nachricht ${i}`,
      time: i,
    }));
    const p = buildPrompt('weiter', [], { chat });
    expect(p).not.toContain('Nachricht 0');
    expect(p).toContain('Nachricht 29');
  });

  it('bettet Text-Referenzen mit Inhalt und Bild-Referenzen mit Pfad ein', () => {
    const p = buildPrompt('Nutze das Design', [], {
      attachments: [
        { name: 'farben.txt', kind: 'text', content: 'primär: #ff0000' },
        { name: 'screenshot.png', kind: 'image', path: '/tmp/screenshot.png' },
      ],
    });
    expect(p).toContain('REFERENZDATEIEN');
    expect(p).toContain('farben.txt');
    expect(p).toContain('primär: #ff0000');
    expect(p).toContain('/tmp/screenshot.png');
    expect(p).toMatch(/Read/);
  });

  it('nennt die markierten Elemente samt Quellort vor dem Wunsch', () => {
    const p = buildPrompt('mach das größer', [], {
      hasApp: true,
      elements: [
        { tag: 'button', selector: 'body > button#go', text: 'Los', source: 'src/index.html:7:3' },
      ],
    });
    expect(p).toContain('REFERENZIERTE ELEMENTE');
    expect(p).toContain('src/index.html:7:3');
    expect(p).toContain('body > button#go');
    expect(p.indexOf('REFERENZIERTE ELEMENTE')).toBeLessThan(p.indexOf('mach das größer'));
  });

  it('lässt den Abschnitt weg, wenn nichts markiert ist', () => {
    expect(buildPrompt('x', [], { hasApp: true })).not.toContain('REFERENZIERTE ELEMENTE');
  });
});

/** Eine Beigabe der App, wie sie core/assetstore ausweist (nur die Auskunft). */
function asset(name: string, mime: string, size = 100): AssetInfo {
  return { name, path: `assets/${name}`, mime, size };
}

describe('buildPrompt mit mitgeschickten Beigaben (c0118)', () => {
  it('nennt jede mitgeschickte Beigabe mit ihrem Pfad in der App', () => {
    const p = buildPrompt('nimm das Logo in die Kopfzeile', [], {
      hasApp: true,
      assets: [asset('logo.png', 'image/png'), asset('daten.json', 'application/json')],
    });
    expect(p).toContain('MITGESCHICKTE BEIGABEN');
    expect(p).toContain('assets/logo.png');
    expect(p).toContain('assets/daten.json');
    expect(p).toContain('image/png');
  });

  it('lässt ein Bild unter GENAU DIESEM Pfad lesen — ohne absoluten Pfad', () => {
    const p = buildPrompt('nimm das Logo', [], { hasApp: true, assets: [asset('logo.png', 'image/png')] });
    const line = p.split('\n').find((l) => l.includes('assets/logo.png')) ?? '';
    expect(line).toMatch(/Read/);
    expect(line).toContain('assets/logo.png');
    expect(p).not.toMatch(/\/(tmp|Users|home)\//);
  });

  it('sagt bei einer Datendatei, dass ihr INHALT in den Code gehört (JS wird nicht gebündelt)', () => {
    const p = buildPrompt('lies die Tabelle ein', [], { hasApp: true, assets: [asset('daten.json', 'application/json')] });
    const line = p.split('\n').find((l) => l.includes('assets/daten.json')) ?? '';
    expect(line).toMatch(/Read/);
    expect(line).toMatch(/Inhalt/);
  });

  it('schickt eine Schrift zum @font-face — dort wird sie eingesetzt, nicht gelesen', () => {
    const p = buildPrompt('nimm die Schrift', [], { hasApp: true, assets: [asset('schrift.woff2', 'font/woff2')] });
    const line = p.split('\n').find((l) => l.includes('assets/schrift.woff2')) ?? '';
    expect(line).toContain('url(assets/schrift.woff2)');
    expect(line).not.toMatch(/Read/);
  });

  it('sagt im Abschnitt selbst, dass die Beigabe schon in der App liegt und ihm nicht gehört', () => {
    const p = buildPrompt('x', [], { hasApp: true, assets: [asset('logo.png', 'image/png')] });
    expect(p).toMatch(/liegen bereits|liegt bereits/);
    expect(p).toMatch(/nur lesen|NUR ZUM LESEN|niemals/i);
  });

  it('steht vor dem Wunsch — er bezieht sich darauf', () => {
    const p = buildPrompt('nimm das Logo', [], { hasApp: true, assets: [asset('logo.png', 'image/png')] });
    expect(p.indexOf('MITGESCHICKTE BEIGABEN')).toBeLessThan(p.indexOf('nimm das Logo'));
  });

  it('lässt den Abschnitt ohne Beigaben weg', () => {
    expect(buildPrompt('x', [], { hasApp: true })).not.toContain('MITGESCHICKTE BEIGABEN');
    expect(buildPrompt('x', [], { hasApp: true, assets: [] })).not.toContain('MITGESCHICKTE BEIGABEN');
  });

  it('steht neben den Referenzdateien — beides geht nebeneinander mit', () => {
    const p = buildPrompt('x', [], {
      hasApp: true,
      attachments: [{ name: 'screenshot.png', kind: 'image', path: '/tmp/screenshot.png' }],
      assets: [asset('logo.png', 'image/png')],
    });
    expect(p).toContain('REFERENZDATEIEN');
    expect(p).toContain('/tmp/screenshot.png');
    expect(p).toContain('MITGESCHICKTE BEIGABEN');
    expect(p).toContain('assets/logo.png');
  });
});

/** Ein Block, wie ihn der Entwurfs-Modus zeichnet (core/design). */
function block(name: string, rect: Rect, over: Partial<Block> = {}): Block {
  return { id: `b-${name}`, name, rect, children: [], ...over };
}

/** Ein Entwurf mit EINER Ansicht — der Normalfall (c0113). */
function design(...blocks: Block[]): Design {
  return { version: DESIGN_VERSION, views: [{ id: 'v1', title: 'Ansicht 1', blocks }] };
}

describe('formatDesign', () => {
  it('schweigt ohne Entwurf und bei einem leeren Entwurf', () => {
    expect(formatDesign(undefined)).toEqual([]);
    expect(formatDesign(emptyDesign())).toEqual([]);
    // Auch eine angelegte, aber noch stumme Ansicht ist keine Ansage.
    expect(formatDesign(design())).toEqual([]);
  });

  it('nennt Namen, Rolle, Lage und Anweisungen eines Blocks', () => {
    const text = formatDesign(
      design(block('Kopfzeile', { x: 0, y: 0, w: 1, h: 0.125 }, { type: 'header', instructions: 'Titel links' })),
    ).join('\n');
    expect(text).toContain('UI-LAYOUT');
    expect(text).toContain('Kopfzeile');
    expect(text).toContain('header');
    expect(text).toContain('Titel links');
    // Anteile werden als Prozent des Fensters gezeigt, nicht als 0…1.
    expect(text).toMatch(/waagerecht 0%…100%/);
    expect(text).toMatch(/senkrecht 0%…12\.5%/);
  });

  it('rückt Kinder unter ihrem Elter ein und behält die Reihenfolge', () => {
    const lines = formatDesign(
      design(
        block('Rumpf', { x: 0, y: 0.1, w: 1, h: 0.9 }, {
          children: [
            block('Liste', { x: 0, y: 0.1, w: 0.3, h: 0.9 }, {
              children: [block('Eintrag', { x: 0, y: 0.1, w: 0.3, h: 0.1 })],
            }),
            block('Inhalt', { x: 0.3, y: 0.1, w: 0.7, h: 0.9 }),
          ],
        }),
      ),
    );
    const at = (name: string): number => lines.findIndex((l) => l.includes(`- ${name}`));
    expect(lines[at('Rumpf')]).toBe('- Rumpf');
    expect(lines[at('Liste')]).toBe('  - Liste');
    expect(lines[at('Eintrag')]).toBe('    - Eintrag');
    expect(lines[at('Inhalt')]).toBe('  - Inhalt');
    // Ein Kind steht unter seinem Elter, Geschwister in Zeichenreihenfolge.
    expect(at('Rumpf')).toBeLessThan(at('Liste'));
    expect(at('Liste')).toBeLessThan(at('Eintrag'));
    expect(at('Eintrag')).toBeLessThan(at('Inhalt'));
  });

  it('rückt auch die Folgezeilen mehrzeiliger Anweisungen ein', () => {
    const lines = formatDesign(
      design(
        block('Rumpf', { x: 0, y: 0, w: 1, h: 1 }, {
          children: [block('Liste', { x: 0, y: 0, w: 0.5, h: 1 }, { instructions: 'erste Zeile\nzweite Zeile' })],
        }),
      ),
    );
    expect(lines).toContain('    Anweisungen: erste Zeile');
    expect(lines).toContain('      zweite Zeile');
  });

  it('nennt einen namenlosen Block trotzdem und lässt die Rolle weg', () => {
    const text = formatDesign(design(block('', { x: 0, y: 0, w: 0.5, h: 0.5 }))).join('\n');
    expect(text).toMatch(/- \(ohne Namen\)/);
    expect(text).not.toContain('()');
  });

  // c0113: Jede Ansicht ist ein eigener Abschnitt — Titel, Beschreibung, Baum.
  it('nennt jede Ansicht mit ihrem Titel und ihrer Beschreibung', () => {
    const lines = formatDesign({
      version: DESIGN_VERSION,
      views: [
        {
          id: 'v1',
          title: 'Liste',
          description: 'alle Einträge\nnach Datum',
          blocks: [block('Kopfzeile', { x: 0, y: 0, w: 1, h: 0.1 })],
        },
        { id: 'v2', title: 'Detail', blocks: [block('Formular', { x: 0, y: 0.1, w: 1, h: 0.9 })] },
      ],
    });
    const text = lines.join('\n');
    expect(text).toContain('ANSICHT: Liste');
    expect(text).toContain('ANSICHT: Detail');
    expect(lines).toContain('Beschreibung: alle Einträge');
    expect(lines).toContain('  nach Datum');
    // Jeder Kasten steht unter SEINER Ansicht.
    const at = (needle: string): number => lines.findIndex((l) => l.includes(needle));
    expect(at('ANSICHT: Liste')).toBeLessThan(at('- Kopfzeile'));
    expect(at('- Kopfzeile')).toBeLessThan(at('ANSICHT: Detail'));
    expect(at('ANSICHT: Detail')).toBeLessThan(at('- Formular'));
    // Und die Kästen jeder Ansicht beginnen wieder an der Wurzel.
    expect(lines).toContain('- Formular');
  });

  it('nennt auch eine Ansicht ohne Kästen, wenn sie beschrieben ist', () => {
    const lines = formatDesign({
      version: DESIGN_VERSION,
      views: [
        { id: 'v1', title: 'Liste', blocks: [block('Kopfzeile', { x: 0, y: 0, w: 1, h: 0.1 })] },
        { id: 'v2', title: 'Einstellungen', description: 'Sprache und Farben', blocks: [] },
      ],
    });
    const text = lines.join('\n');
    expect(text).toContain('ANSICHT: Einstellungen');
    expect(text).toContain('Sprache und Farben');
    expect(text).toContain('noch keine Kästen');
  });

  it('sagt dem Agenten, was eine Ansicht ist und dass er alle bauen soll', () => {
    const text = formatDesign(design(block('Kopfzeile', { x: 0, y: 0, w: 1, h: 0.1 }))).join('\n');
    expect(text).toMatch(/ANSICHT ist ein eigener Bildschirm/);
    expect(text).toMatch(/baue sie alle/i);
  });
});

describe('buildPrompt mit Entwurf', () => {
  const entwurf = design(
    block('Kopfzeile', { x: 0, y: 0, w: 1, h: 0.1 }, {
      type: 'header',
      instructions: 'Der Name der App',
      children: [block('Suchfeld', { x: 0.6, y: 0.02, w: 0.35, h: 0.06 })],
    }),
  );

  it('legt den Entwurf als UI-LAYOUT vor den Wunsch', () => {
    const p = buildPrompt('Baue die Oberfläche', [], { hasApp: true, design: entwurf });
    expect(p).toContain('UI-LAYOUT');
    expect(p).toContain('Kopfzeile');
    expect(p).toContain('Suchfeld');
    expect(p).toContain('Der Name der App');
    expect(p.indexOf('UI-LAYOUT')).toBeLessThan(p.indexOf('Baue die Oberfläche'));
  });

  it('sagt im Abschnitt selbst, dass der Entwurf verbindlich und nur zu lesen ist', () => {
    const p = buildPrompt('x', [], { hasApp: true, design: entwurf });
    expect(p).toContain(DESIGN_FILE);
    expect(p).toMatch(/verbindlich/i);
    expect(p).toMatch(/NIEMALS|nicht ändern|Nur zum Lesen/i);
  });

  it('lässt den Abschnitt ohne Entwurf und bei einem leeren Entwurf weg', () => {
    expect(buildPrompt('x', [], { hasApp: true })).not.toContain('UI-LAYOUT');
    expect(buildPrompt('x', [], { hasApp: true, design: emptyDesign() })).not.toContain('UI-LAYOUT');
  });
});
