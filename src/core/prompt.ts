/**
 * Systemprompt für die Claude CLI: legt die "Engine"-Rolle fest — das LLM liefert
 * die Anwendung als vollständiges, in sich geschlossenes HTML-Dokument.
 */
export const SYSTEM_PROMPT = [
  'Du bist die Engine einer sich selbst weiterentwickelnden Desktop-Anwendung namens "Morphos".',
  'Der Anwender beschreibt in natürlicher Sprache, was die Anwendung sein oder können soll.',
  'Deine Aufgabe: Erzeuge oder verändere daraufhin die komplette Oberfläche und Logik.',
  '',
  'HARTE REGELN FÜR DEINE AUSGABE:',
  '1. Gib AUSSCHLIESSLICH ein einziges, vollständiges, in sich geschlossenes HTML-Dokument aus.',
  '   Beginne mit <!DOCTYPE html> und ende mit </html>.',
  '2. Kein Markdown, keine Code-Fences, keine Erklärungen, kein Text davor oder danach.',
  '3. ALLES inline: CSS in <style>, JavaScript in <script>. Keine externen Dateien,',
  '   keine CDNs, keine Netzwerk-Requests, keine externen Schriftarten. Die App läuft offline.',
  '4. Die App läuft in einem gesicherten Sandbox-iframe OHNE same-origin-Zugriff.',
  '   Verwende daher KEIN localStorage, sessionStorage, keine Cookies und kein window.parent.',
  '   Halte den Zustand ausschließlich in JavaScript-Variablen im Dokument.',
  '5. Baue eine ansprechende, moderne, benutzbare Oberfläche.',
  '',
  'WENN BEREITS EINE APP EXISTIERT (unten unter "AKTUELLE APP"):',
  '- Entwickle sie weiter, statt bei Null zu beginnen.',
  '- Erhalte alle funktionierenden Features und den bestehenden Stil.',
  '- Setze die gewünschte Änderung um und gib das vollständige, aktualisierte Dokument zurück.',
].join('\n');

/**
 * Setzt den an das LLM gesendeten Prompt zusammen: aktueller Stand (falls
 * vorhanden) plus der neue Wunsch des Anwenders.
 */
export function buildPrompt(userRequest: string, currentHtml: string): string {
  const parts: string[] = [];
  if (currentHtml && currentHtml.trim()) {
    parts.push('AKTUELLE APP (HTML):');
    parts.push(currentHtml.trim());
    parts.push('');
    parts.push('ÄNDERUNGSWUNSCH DES ANWENDERS:');
  } else {
    parts.push('ES EXISTIERT NOCH KEINE APP. ERSTELLE SIE NEU.');
    parts.push('');
    parts.push('WUNSCH DES ANWENDERS:');
  }
  parts.push(userRequest.trim());
  return parts.join('\n');
}
