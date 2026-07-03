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

  it('dokumentiert Bibliotheken über morphos:lib', () => {
    expect(SYSTEM_PROMPT).toContain('morphos:lib');
  });

  it('erlaubt Rückfragen über den SAY-Block', () => {
    expect(SYSTEM_PROMPT).toContain('===MORPHOS:SAY===');
    expect(SYSTEM_PROMPT).toMatch(/Rückfrage/i);
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
});
