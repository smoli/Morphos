import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('escapt HTML immer zuerst (kein XSS aus LLM-Ausgaben)', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)> und <script>evil()</script>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&lt;script');
  });

  it('rendert Absätze und Zeilenumbrüche', () => {
    const out = renderMarkdown('Erster Absatz\n\nZweiter Absatz\nmit Umbruch');
    expect(out).toContain('<p>Erster Absatz</p>');
    expect(out).toContain('<p>Zweiter Absatz<br>mit Umbruch</p>');
  });

  it('rendert fett, kursiv und Inline-Code', () => {
    const out = renderMarkdown('**wichtig** und *betont* und `code`');
    expect(out).toContain('<strong>wichtig</strong>');
    expect(out).toContain('<em>betont</em>');
    expect(out).toContain('<code>code</code>');
  });

  it('rendert Überschriften', () => {
    expect(renderMarkdown('## Titel')).toContain('<h2>Titel</h2>');
    expect(renderMarkdown('### Untertitel')).toContain('<h3>Untertitel</h3>');
  });

  it('rendert ungeordnete und geordnete Listen', () => {
    const ul = renderMarkdown('- eins\n- zwei');
    expect(ul).toContain('<ul>');
    expect(ul).toContain('<li>eins</li>');
    expect(ul).toContain('<li>zwei</li>');

    const ol = renderMarkdown('1. eins\n2. zwei');
    expect(ol).toContain('<ol>');
    expect(ol).toContain('<li>zwei</li>');
  });

  it('rendert Code-Blöcke wörtlich (ohne Inline-Formatierung darin)', () => {
    const out = renderMarkdown('```\nconst x = "**kein fett**";\n```');
    expect(out).toContain('<pre><code>');
    expect(out).toContain('const x = &quot;**kein fett**&quot;;');
    expect(out).not.toContain('<strong>');
  });

  it('macht aus URLs KEINE Links (keine Navigation aus dem Chat)', () => {
    const out = renderMarkdown('Siehe [hier](https://example.com) und https://example.org');
    expect(out).not.toContain('<a ');
    expect(out).toContain('hier');
    expect(out).toContain('https://example.org');
  });

  it('liefert leer für leere Eingabe', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('   ')).toBe('');
  });
});
