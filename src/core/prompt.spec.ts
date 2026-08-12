import { describe, it, expect } from 'vitest';
import { buildPrompt, SYSTEM_PROMPT } from './prompt';
import type { ChatMessage, SourceFile } from '@/types';

const FILES: SourceFile[] = [
  { path: 'src/index.html', content: '<!DOCTYPE html><html><body>alt</body></html>' },
  { path: 'src/app.js', content: 'let x = 1;' },
];

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

  it('erklärt das inkrementelle Blockformat für die Ausgabe', () => {
    expect(SYSTEM_PROMPT).toContain('===MORPHOS:FILE');
    expect(SYSTEM_PROMPT).toContain('===MORPHOS:END===');
    expect(SYSTEM_PROMPT).toContain('===MORPHOS:DELETE');
    // Nur geänderte Dateien ausgeben — der Kern der inkrementellen Bearbeitung.
    expect(SYSTEM_PROMPT).toMatch(/NUR .*(geänderte|neue)/i);
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

  it('erlaubt Rückfragen über den SAY-Block', () => {
    expect(SYSTEM_PROMPT).toContain('===MORPHOS:SAY===');
    expect(SYSTEM_PROMPT).toMatch(/Rückfrage/i);
  });

  it('verlangt die beiden Dokumente in derselben Antwort wie die Änderung', () => {
    expect(SYSTEM_PROMPT).toContain('===MORPHOS:FILE concept.md===');
    expect(SYSTEM_PROMPT).toContain('===MORPHOS:FILE userdocumentation.md===');
    expect(SYSTEM_PROMPT).toMatch(/DERSELBEN Antwort BEIDE Dokumente/);
  });

  it('macht das Konzept zur Leitlinie und verlangt seine Fortschreibung', () => {
    expect(SYSTEM_PROMPT).toMatch(/Halte die App IMMER mit dem Konzept konsistent/);
    expect(SYSTEM_PROMPT).toMatch(/schreibe das Konzept fort/);
    // Die Anleitung ist für den Anwender, nicht für Technik.
    expect(SYSTEM_PROMPT).toMatch(/Anleitung für den Anwender/);
  });

  it('lässt außerhalb von src/ nur genau diese beiden Dateien zu', () => {
    expect(SYSTEM_PROMPT).toMatch(/Außerhalb von src\/ darfst du AUSSCHLIESSLICH/);
    expect(SYSTEM_PROMPT).toMatch(/keine andere Datei im Wurzelverzeichnis/);
  });

  it('nimmt die Dokumente bei einer reinen Rückfrage ausdrücklich aus', () => {
    expect(SYSTEM_PROMPT).toMatch(/Rückfrage \(SAY ohne Datei-Blöcke\), rührst du auch die\n\s*Dokumente NICHT an/);
  });
});

describe('buildPrompt', () => {
  it('markiert einen Neustart, wenn noch keine App existiert', () => {
    const p = buildPrompt('Ein Taschenrechner', [], []);
    expect(p).toContain('ES EXISTIERT NOCH KEINE APP');
    expect(p).toContain('Ein Taschenrechner');
    expect(p).not.toContain('AKTUELLE QUELLDATEIEN');
  });

  it('bettet die bestehenden Quelldateien als Blöcke ein', () => {
    const p = buildPrompt('Füge einen Button hinzu', FILES, []);
    expect(p).toContain('AKTUELLE QUELLDATEIEN');
    expect(p).toContain('===MORPHOS:FILE src/index.html===');
    expect(p).toContain('<!DOCTYPE html><html><body>alt</body></html>');
    expect(p).toContain('===MORPHOS:FILE src/app.js===');
    expect(p).toContain('Füge einen Button hinzu');
    expect(p).not.toContain('ES EXISTIERT NOCH KEINE APP');
  });

  it('nennt die freigegebenen Bibliotheks-Quellen', () => {
    const p = buildPrompt('x', FILES, ['cdn.jsdelivr.net', 'https://unpkg.com/']);
    expect(p).toContain('FREIGEGEBENE BIBLIOTHEKS-QUELLEN');
    expect(p).toContain('cdn.jsdelivr.net');
    expect(p).toContain('https://unpkg.com/');
  });

  it('weist ohne Freigaben darauf hin, dass keine Bibliotheken verfügbar sind', () => {
    const p = buildPrompt('x', FILES, []);
    expect(p).toContain('KEINE Bibliotheken');
  });

  it('legt die Preact-Anleitung bei, wenn die App damit gebaut wird', () => {
    const p = buildPrompt('Ein Zähler', [], [], { framework: 'preact' });
    expect(p).toContain('PREACT + HTM');
    expect(p).toContain('<meta name="morphos:lib" content="preact">');
    expect(p).toContain('preactHooks');
    // Vor dem Wunsch — er bleibt das Letzte im Prompt.
    expect(p.indexOf('PREACT + HTM')).toBeLessThan(p.indexOf('Ein Zähler'));
  });

  it('schweigt über Preact, wenn die App vanilla ist', () => {
    expect(buildPrompt('Ein Zähler', [], [], { framework: 'vanilla' })).not.toMatch(/preact/i);
    // Ohne Angabe erst recht — der Prompt bleibt, wie er war.
    expect(buildPrompt('Ein Zähler', [], [])).not.toMatch(/preact/i);
  });

  it('trimmt den Nutzerwunsch', () => {
    const p = buildPrompt('   Hallo   ', [], []);
    expect(p).toContain('Hallo');
    expect(p).not.toContain('   Hallo   ');
  });

  it('bettet den bisherigen Dialog ein (Anwender und Morphos)', () => {
    const chat: ChatMessage[] = [
      { role: 'user', text: 'Ein Spiel', time: 1 },
      { role: 'assistant', text: 'Welche Art von Spiel schwebt dir vor?', time: 2 },
    ];
    const p = buildPrompt('Ein Snake-Spiel', [], [], { chat });
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
    const p = buildPrompt('weiter', [], [], { chat });
    expect(p).not.toContain('Nachricht 0');
    expect(p).toContain('Nachricht 29');
  });

  it('gibt Konzept und Anleitung als Kontext mit — vor den Quelldateien', () => {
    const p = buildPrompt('Runde Knöpfe', FILES, [], {
      docs: { concept: '# Rechner\nRechnet mit vier Grundrechenarten.', userdoc: '# Anleitung\nZahlen tippen.' },
    });
    expect(p).toContain('KONZEPT DER APP (concept.md');
    expect(p).toContain('Rechnet mit vier Grundrechenarten.');
    expect(p).toContain('ANWENDER-DOKUMENTATION (userdocumentation.md');
    expect(p).toContain('Zahlen tippen.');
    expect(p.indexOf('KONZEPT DER APP')).toBeLessThan(p.indexOf('AKTUELLE QUELLDATEIEN'));
  });

  it('weist ohne Dokumente darauf hin, dass sie anzulegen sind', () => {
    const p = buildPrompt('Ein Taschenrechner', [], []);
    expect(p).toContain('KONZEPT DER APP');
    expect(p).toContain('ANWENDER-DOKUMENTATION');
    expect(p).toMatch(/noch keines — lege es mit dieser Generierung an/);
    expect(p).toMatch(/noch keine — lege sie mit dieser Generierung an/);
  });

  it('kappt überlange Dokumente, statt den Prompt zu sprengen', () => {
    const p = buildPrompt('x', FILES, [], {
      docs: { concept: 'K'.repeat(20_000), userdoc: 'kurz' },
    });
    expect(p).toContain('gekürzt');
    expect(p.length).toBeLessThan(20_000);
    // Die Anleitung bleibt davon unberührt.
    expect(p).toContain('kurz');
  });

  it('bettet Text-Referenzen mit Inhalt und Bild-Referenzen mit Pfad ein', () => {
    const p = buildPrompt('Nutze das Design', [], [], {
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
    const p = buildPrompt('mach das größer', FILES, [], {
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
    expect(buildPrompt('x', FILES, [], {})).not.toContain('REFERENZIERTE ELEMENTE');
  });
});
