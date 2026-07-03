/**
 * Extrahiert ein vollständiges HTML-Dokument aus der Roh-Ausgabe des LLM.
 * Entfernt eventuelle Markdown-Code-Fences und erklärenden Text vor dem Dokument.
 */
export function extractHtml(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();
  if (!text) return '';

  // Wenn ein echtes Dokument vorhanden ist, an seinen Grenzen schneiden
  // (ab <!DOCTYPE bzw. <html bis zum letzten </html>). Etwaige Code-Fences oder
  // erklärender Text davor/danach fallen dabei weg — und ```-Zeichen INNERHALB
  // des Dokuments (z. B. in einem Regex im <script>) truncaten es nicht mehr.
  const start = text.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (start >= 0) {
    const closeIdx = text.toLowerCase().lastIndexOf('</html>');
    text = closeIdx >= 0 ? text.slice(start, closeIdx + '</html>'.length) : text.slice(start);
    return text.trim();
  }

  // Kein Dokument erkennbar: umschließende ```-Fences entfernen.
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  return text.trim();
}

/** Liest den App-Namen aus dem <title> des Dokuments (leer, wenn keiner). */
export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

/**
 * Liest das App-Icon (ein Emoji) aus dem vom LLM gesetzten
 * <meta name="morphos:icon" content="…"> — unabhängig von der Attributreihenfolge.
 */
export function extractIcon(html: string): string {
  const tag = html.match(/<meta\b[^>]*\bname=["']morphos:icon["'][^>]*>/i);
  if (!tag) return '';
  const content = tag[0].match(/\bcontent=["']([^"']+)["']/i);
  return content ? content[1].trim() : '';
}
