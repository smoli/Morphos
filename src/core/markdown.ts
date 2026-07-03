/**
 * Minimaler, sicherer Markdown-Renderer für Chat-Antworten des LLM.
 *
 * Sicherheit vor Vollständigkeit: Der GESAMTE Text wird zuerst HTML-escapt;
 * erst danach werden eigene, feste Tags erzeugt. LLM-Ausgaben können so nie
 * eigenes Markup einschleusen (kein XSS). Links werden bewusst NICHT erzeugt —
 * eine Navigation aus dem Chat heraus würde die Host-App verlassen.
 *
 * Unterstützt: Absätze, Zeilenumbrüche, **fett**, *kursiv*, `Code`,
 * ```Codeblöcke```, # Überschriften, -/* Listen, 1. Listen.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline-Formatierung auf bereits escaptem Text. */
function inline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // [Text](URL) → nur der Text; die URL bleibt sichtbar lesbar dahinter weg.
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

export function renderMarkdown(raw: string): string {
  const text = (raw ?? '').trim();
  if (!text) return '';

  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    // ``` Codeblock ```
    if (/^```/.test(line)) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // schließendes ```
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // Überschriften
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2].trim()))}</h${level}>`);
      i += 1;
      continue;
    }

    // Listen
    const isUl = (l: string): boolean => /^\s*[-*]\s+/.test(l);
    const isOl = (l: string): boolean => /^\s*\d+\.\s+/.test(l);
    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line);
      const matches = ordered ? isOl : isUl;
      const items: string[] = [];
      while (i < lines.length && matches(lines[i])) {
        items.push(lines[i].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ''));
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join('')}</${tag}>`);
      continue;
    }

    // Absatz (bis zur nächsten Leerzeile / Sonderzeile)
    const para: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${para.map((l) => inline(escapeHtml(l))).join('<br>')}</p>`);
  }

  return out.join('');
}
