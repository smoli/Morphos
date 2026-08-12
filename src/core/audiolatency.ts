/**
 * Die Auswertung der Latenzmessung (c0081). Gemessen wird im Browser bzw. in
 * Electron — mit `tools/audio-latency/index.html`; gedeutet wird hier, damit
 * die Deutung prüfbar ist und nicht im Bauchgefühl endet.
 *
 * Das Modell hinter allem: Die Zeit vom Tastendruck bis zum hörbaren Ton
 * zerfällt in vier Abschnitte, die sich addieren.
 *
 * ```
 * Taste ──input──▶ JS-Handler ──dispatch──▶ start() ──render──▶ Puffer ──device──▶ Lautsprecher
 * ```
 *
 * - `input`    Betriebssystem → `keydown` im Handler (`event.timeStamp` bis
 *              `performance.now()`); enthält alles, was der Renderer gerade
 *              sonst noch tat (Layout, Sammlung von Müll).
 * - `dispatch` Was die App selbst im Trefferpfad tut, bis `start()` zurück ist —
 *              hier schlägt ein Dekodieren je Treffer durch.
 * - `render`   `AudioContext.baseLatency`: der Weg vom Graphen in den Puffer,
 *              den Chromium füllt (ein Vielfaches des Renderquantums von 128).
 * - `device`   `AudioContext.outputLatency`: was das Ausgabegerät danach noch
 *              zurückhält — unter Windows der WASAPI-Puffer, der Verdächtige.
 *
 * `render` und `device` zusammen sind der **Plattformboden**: Darunter kommt
 * kein Code auf diesem Weg, egal wie gut die App geschrieben ist.
 */

/** Ein einzelner Tastendruck der Messreihe, in Millisekunden. */
export interface HitSample {
  /** Betriebssystem-Ereignis → Eintritt in den Handler. */
  eventLagMs: number;
  /** Eintritt in den Handler → `start()` ist zurück. */
  dispatchMs: number;
}

/** Eine gemessene Einstellung („interactive mit vorab dekodierten Puffern“). */
export interface LatencyArm {
  label: string;
  /** Was dem `AudioContext` mitgegeben wurde: `interactive`, `balanced`, … */
  latencyHint: string;
  sampleRate: number;
  /** Sekunden (so gibt die Web-Audio-API es her). */
  baseLatency: number;
  /** Sekunden. */
  outputLatency: number;
  hits: HitSample[];
}

/** Ein Lauf des Messwerkzeugs: eine Plattform, mehrere Arme. */
export interface LatencyReport {
  platform: string;
  shell: string;
  arms: LatencyArm[];
}

/** Die Abschnitte des Weges, in der Reihenfolge, in der sie durchlaufen werden. */
export type Contributor = 'input' | 'dispatch' | 'render' | 'device';

const CONTRIBUTORS: readonly Contributor[] = ['input', 'dispatch', 'render', 'device'];

/** Die vier Abschnitte in Millisekunden, plus ihre Summe. */
export type LatencyBudget = Record<Contributor, number> & { total: number };

export interface Stats {
  n: number;
  min: number;
  median: number;
  p95: number;
  max: number;
}

/** Bis hierher hört niemand eine Verzögerung — Ziel für einen Tastenklang. */
export const IMPERCEPTIBLE_MS = 20;

/** Ab hier ist die Verzögerung klar spürbar und das eigentliche Problem. */
export const NOTICEABLE_MS = 40;

/** Chromiums Renderquantum: die kleinste Einheit, in der Web Audio rechnet. */
export const RENDER_QUANTUM = 128;

function usable(values: number[]): number[] {
  return values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
}

/**
 * Anzahl, Spanne, Mitte und 95. Perzentil einer Messreihe. Der Median trägt die
 * Aussage — ein einzelner hängengebliebener Treffer soll das Bild nicht kippen;
 * das p95 zeigt daneben, wie oft es doch passiert.
 */
export function summarize(values: number[]): Stats {
  const sorted = usable(values);
  const n = sorted.length;
  if (n === 0) return { n: 0, min: 0, median: 0, p95: 0, max: 0 };
  const mid = n >> 1;
  const median = n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  // Der kleinste Wert, unter dem 95 % der Reihe liegen (nächster Rang, nicht
  // interpoliert): bei 100 Werten also der 95., nicht der 96.
  const p95 = sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)];
  return { n, min: sorted[0], median, p95, max: sorted[n - 1] };
}

/**
 * Die Puffergröße in Bildern, die hinter der Grundlatenz steckt — die Zahl, die
 * man mit dem Renderquantum (128) vergleicht, um den Puffer einzuordnen.
 */
export function bufferFrames(arm: LatencyArm): number {
  if (!(arm.sampleRate > 0)) return 0;
  return Math.round(arm.baseLatency * arm.sampleRate);
}

/** Die vier Abschnitte eines Arms in Millisekunden. */
export function budgetOf(arm: LatencyArm): LatencyBudget {
  const input = summarize(arm.hits.map((h) => h.eventLagMs)).median;
  const dispatch = summarize(arm.hits.map((h) => h.dispatchMs)).median;
  const render = arm.baseLatency * 1000;
  const device = arm.outputLatency * 1000;
  return { input, dispatch, render, device, total: input + dispatch + render + device };
}

/**
 * Der Abschnitt, an dem die meiste Zeit hängt — die Antwort auf „woher kommt
 * die Verzögerung“. Bei Gleichstand gewinnt der frühere Abschnitt: Er ist der,
 * an dem zuerst gedreht werden kann.
 */
export function dominantOf(budget: LatencyBudget): Contributor {
  return CONTRIBUTORS.reduce((best, key) => (budget[key] > budget[best] ? key : best));
}

/**
 * Was ein Arm gegenüber dem Ausgangsarm bringt, in Millisekunden — negativ ist
 * schneller. Das ist die Zahl, die eine Gegenmaßnahme belegen muss.
 */
export function compareArms(baseline: LatencyArm, candidate: LatencyArm): number {
  return budgetOf(candidate).total - budgetOf(baseline).total;
}

export type Verdict = 'ok' | 'app-code' | 'web-tuning' | 'native-audio';

export interface Recommendation {
  verdict: Verdict;
  dominant: Contributor;
  totalMs: number;
  /** Plattformboden (`render` + `device`) in Millisekunden. */
  floorMs: number;
  reason: string;
}

function ms(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} ms`;
}

/**
 * Der Spruch zu einem Arm: Reicht es so, liegt es am Code der App, ist noch ein
 * billiger Web-Hebel offen — oder bleibt nur ein nativer Audiopfad?
 *
 * Die Reihenfolge ist die der Kosten: Erst gar nichts tun, dann die App, dann
 * die Web-Einstellung, und erst ganz zuletzt ein eigener Audioweg.
 */
export function recommend(arm: LatencyArm): Recommendation {
  const budget = budgetOf(arm);
  const dominant = dominantOf(budget);
  const floorMs = budget.render + budget.device;
  const appMs = budget.input + budget.dispatch;
  const base = { dominant, totalMs: budget.total, floorMs };

  if (budget.total <= IMPERCEPTIBLE_MS) {
    return { ...base, verdict: 'ok', reason: `${ms(budget.total)} bleiben unhörbar.` };
  }
  if (appMs > floorMs && appMs > IMPERCEPTIBLE_MS) {
    return {
      ...base,
      verdict: 'app-code',
      reason:
        `Von ${ms(budget.total)} entfallen ${ms(appMs)} auf den Trefferpfad der App ` +
        `und nur ${ms(floorMs)} auf die Plattform.`,
    };
  }
  if (arm.latencyHint !== 'interactive') {
    return {
      ...base,
      verdict: 'web-tuning',
      reason:
        `${ms(budget.total)} bei latencyHint „${arm.latencyHint}“ — ` +
        `der billige Hebel (interactive) ist noch nicht gezogen.`,
    };
  }
  if (floorMs >= NOTICEABLE_MS) {
    return {
      ...base,
      verdict: 'native-audio',
      reason:
        `${ms(budget.total)}, davon ${ms(floorMs)} Plattformboden trotz interactive — ` +
        `web-seitig ist nichts mehr zu holen.`,
    };
  }
  return {
    ...base,
    verdict: 'ok',
    reason: `${ms(budget.total)} liegen über dem Ideal, aber unter dem klar Spürbaren.`,
  };
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseHits(raw: unknown): HitSample[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const hit = entry as Partial<HitSample>;
    const eventLagMs = num(hit?.eventLagMs);
    const dispatchMs = num(hit?.dispatchMs);
    return eventLagMs === null || dispatchMs === null ? [] : [{ eventLagMs, dispatchMs }];
  });
}

function parseArm(raw: unknown): LatencyArm[] {
  const a = raw as Partial<LatencyArm>;
  const sampleRate = num(a?.sampleRate);
  const baseLatency = num(a?.baseLatency);
  const outputLatency = num(a?.outputLatency);
  if (sampleRate === null || baseLatency === null || outputLatency === null) return [];
  return [
    {
      label: typeof a.label === 'string' ? a.label : 'unbenannt',
      latencyHint: typeof a.latencyHint === 'string' ? a.latencyHint : 'unbekannt',
      sampleRate,
      baseLatency,
      outputLatency,
      hits: parseHits(a.hits),
    },
  ];
}

/** Kennung, mit der sich das Messwerkzeug in seinem Bericht ausweist. */
export const REPORT_TOOL = 'morphos-audio-latency';

/**
 * Liest den Bericht des Messwerkzeugs — als Objekt oder als der Text, den der
 * Mensch aus dem Werkzeug kopiert hat. Was kein Bericht ist oder keinen einzigen
 * brauchbaren Arm enthält, ist `null`: Lieber nichts auswerten als Erfundenes.
 */
export function parseReport(raw: unknown): LatencyReport | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const report = value as { tool?: unknown; platform?: unknown; shell?: unknown; arms?: unknown };
  if (report.tool !== REPORT_TOOL) return null;
  const arms = Array.isArray(report.arms) ? report.arms.flatMap(parseArm) : [];
  if (arms.length === 0) return null;
  return {
    platform: typeof report.platform === 'string' ? report.platform : 'unbekannt',
    shell: typeof report.shell === 'string' ? report.shell : 'unbekannt',
    arms,
  };
}

function cell(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/**
 * Der Bericht als Markdown-Tabelle — so, wie er auf die Karte kommt: je Arm
 * eine Zeile mit den vier Abschnitten, der Summe und dem überwiegenden Anteil.
 */
export function formatReport(report: LatencyReport): string {
  const head =
    '| Arm | input | dispatch | render | device | **gesamt** | überwiegt |\n' +
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |';
  const rows = report.arms.map((arm) => {
    const b = budgetOf(arm);
    return (
      `| ${arm.label} | ${cell(b.input)} | ${cell(b.dispatch)} | ${cell(b.render)} | ` +
      `${cell(b.device)} | **${cell(b.total)}** | ${dominantOf(b)} |`
    );
  });
  return [head, ...rows].join('\n');
}
