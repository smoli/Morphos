/**
 * Framework-unabhängige Warteschlangen-Logik der Agentenläufe.
 *
 * Zwei Regeln bestimmen, was starten darf: ein globaler Deckel (wie viele
 * `claude`-Prozesse gleichzeitig laufen dürfen) und die Reihung je App — für
 * eine App arbeitet nie mehr als ein Agent, sonst würden zwei Läufe denselben
 * Quelldatei-Satz gegeneinander verändern. Alles Weitere (Fenster, IPC, Pinia)
 * liegt außerhalb; hier stehen nur Listen und Zahlen.
 */

/** Vorgabe: zwei Agenten gleichzeitig — flott, ohne die Token zu verbrennen. */
export const DEFAULT_MAX_AGENTS = 2;

/** Obergrenze der Einstellung (ein sinnvoller Riegel, kein technisches Limit). */
export const MAX_AGENTS_LIMIT = 8;

/** Zustand eines Auftrags: er wartet auf einen Platz oder er arbeitet. */
export type JobState = 'queued' | 'running';

/**
 * Das, was die Warteschlange von einem Auftrag wissen muss. `appKey` ist der
 * Schlüssel, unter dem gereiht wird — die App-Id, bzw. bei einem noch nicht
 * gespeicherten Entwurf die Instanz-Id seines Fensters.
 */
export interface QueueEntry {
  jobId: string;
  appKey: string;
  state: JobState;
}

/** Liest den eingestellten Deckel als ganze Zahl im erlaubten Bereich. */
export function clampMaxAgents(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_MAX_AGENTS;
  return Math.min(MAX_AGENTS_LIMIT, Math.max(1, n));
}

/** Wie viele Agenten gerade arbeiten (= belegte Plätze). */
export function runningCount(jobs: readonly QueueEntry[]): number {
  return jobs.reduce((n, j) => (j.state === 'running' ? n + 1 : n), 0);
}

/** Hat die App einen laufenden ODER wartenden Auftrag? (Grundlage der Arbeitsanzeige.) */
export function isAppBusy(jobs: readonly QueueEntry[], appKey: string): boolean {
  return jobs.some((j) => j.appKey === appKey);
}

/** Die Schlüssel aller Apps mit laufendem oder wartendem Auftrag. */
export function busyAppKeys(jobs: readonly QueueEntry[]): Set<string> {
  return new Set(jobs.map((j) => j.appKey));
}

/**
 * Welche wartenden Aufträge jetzt starten dürfen — in der Reihenfolge ihres
 * Eingangs (FIFO), bis der Deckel erreicht ist. Ein Wunsch an eine bereits
 * beschäftigte App wird übersprungen (er bleibt in der Schlange und kommt dran,
 * sobald ihr laufender Auftrag fertig ist); der nächste Wunsch an eine andere
 * App darf dafür vorziehen.
 */
export function startableJobs<T extends QueueEntry>(jobs: readonly T[], maxAgents: number): T[] {
  let free = Math.max(0, clampMaxAgents(maxAgents) - runningCount(jobs));
  if (free === 0) return [];

  const busy = new Set(jobs.filter((j) => j.state === 'running').map((j) => j.appKey));
  const start: T[] = [];
  for (const j of jobs) {
    if (free === 0) break;
    if (j.state !== 'queued' || busy.has(j.appKey)) continue;
    busy.add(j.appKey);
    start.push(j);
    free -= 1;
  }
  return start;
}
