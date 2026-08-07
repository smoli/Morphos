/**
 * Zeitbudget eines Agentenlaufs: Antwortet die Claude CLI nicht innerhalb
 * dieser Zeit, bricht die Shell den Kindprozess ab. Zehn Minuten, damit auch
 * längere Generierungen mit vielen Werkzeugschritten durchlaufen.
 */
export const AGENT_TIMEOUT_MS = 10 * 60 * 1000;

/** Meldung zum Abbruch — die Minutenangabe folgt dem Zeitbudget. */
export function agentTimeoutMessage(timeoutMs: number = AGENT_TIMEOUT_MS): string {
  const minutes = Math.max(1, Math.round(timeoutMs / 60_000));
  const unit = minutes === 1 ? 'Minute' : 'Minuten';
  return `Zeitüberschreitung: Die Claude CLI hat nicht innerhalb von ${minutes} ${unit} geantwortet.`;
}
