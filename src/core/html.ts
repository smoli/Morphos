/**
 * Extrahiert ein vollständiges HTML-Dokument aus der Roh-Ausgabe des LLM.
 * Entfernt eventuelle Markdown-Code-Fences und erklärenden Text vor dem Dokument.
 */
export function extractHtml(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();
  if (!text) return '';

  // ```html ... ```  oder  ``` ... ```  entfernen
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  // Falls Text vor dem Dokument steht: ab <!DOCTYPE oder <html schneiden.
  const docIdx = text.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (docIdx > 0) {
    text = text.slice(docIdx);
  }

  return text.trim();
}
