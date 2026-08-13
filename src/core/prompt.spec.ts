import { describe, it, expect } from 'vitest';
import { buildPrompt, SYSTEM_PROMPT } from './prompt';
import { mcpToolId } from './mcp';
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
