import { describe, it, expect } from 'vitest';
import {
  summarize,
  bufferFrames,
  budgetOf,
  dominantOf,
  compareArms,
  recommend,
  parseReport,
  formatReport,
  judgeReport,
  forcedBufferFrames,
  BUFFER_SIZE_ENV,
  FORCED_BUFFER_FRAMES,
  MAX_BUFFER_FRAMES,
  type LatencyArm,
  type LatencyReport,
} from './audiolatency';

/** Ein Messarm, wie ihn tools/audio-latency liefert — hier mit runden Zahlen. */
function arm(over: Partial<LatencyArm> = {}): LatencyArm {
  return {
    label: 'interactive',
    latencyHint: 'interactive',
    sampleRate: 48000,
    baseLatency: 0.005, // 5 ms
    outputLatency: 0.01, // 10 ms
    hits: [
      { eventLagMs: 1, dispatchMs: 1 },
      { eventLagMs: 1, dispatchMs: 1 },
      { eventLagMs: 1, dispatchMs: 1 },
    ],
    ...over,
  };
}

describe('summarize', () => {
  it('beschreibt eine Messreihe über Anzahl, Spanne und Mitte', () => {
    expect(summarize([3, 1, 2])).toEqual({ n: 3, min: 1, median: 2, p95: 3, max: 3 });
  });

  it('nimmt bei gerader Anzahl die Mitte zwischen den beiden inneren Werten', () => {
    expect(summarize([1, 2, 3, 4]).median).toBe(2.5);
  });

  it('liest das 95. Perzentil als den Wert, unter dem 95 % liegen', () => {
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(summarize(hundred).p95).toBe(95);
  });

  it('lässt sich von unbrauchbaren Werten nicht verderben', () => {
    expect(summarize([1, Number.NaN, 3, Number.POSITIVE_INFINITY])).toEqual({
      n: 2,
      min: 1,
      median: 2,
      p95: 3,
      max: 3,
    });
  });

  it('gibt für eine leere Reihe Nullen statt NaN', () => {
    expect(summarize([])).toEqual({ n: 0, min: 0, median: 0, p95: 0, max: 0 });
  });
});

describe('bufferFrames', () => {
  it('rechnet die Grundlatenz in die Puffergröße des Geräts um', () => {
    // 5 ms bei 48 kHz sind 240 Bilder — Chromiums Puffer ist ein Vielfaches
    // des Renderquantums von 128.
    expect(bufferFrames(arm())).toBe(240);
  });

  it('bleibt bei fehlender Abtastrate bei null', () => {
    expect(bufferFrames(arm({ sampleRate: 0 }))).toBe(0);
  });
});

describe('budgetOf', () => {
  it('teilt die Zeit vom Tastendruck bis zum Ton in ihre vier Abschnitte', () => {
    expect(budgetOf(arm())).toEqual({
      input: 1,
      dispatch: 1,
      render: 5,
      device: 10,
      total: 17,
    });
  });

  it('nimmt je Abschnitt den Median, nicht den Ausreißer', () => {
    const budget = budgetOf(
      arm({
        hits: [
          { eventLagMs: 2, dispatchMs: 1 },
          { eventLagMs: 2, dispatchMs: 1 },
          { eventLagMs: 90, dispatchMs: 40 }, // ein hängengebliebener Treffer
        ],
      }),
    );
    expect(budget.input).toBe(2);
    expect(budget.dispatch).toBe(1);
  });

  it('kommt ohne einen einzigen Treffer aus und zeigt nur den Plattformboden', () => {
    expect(budgetOf(arm({ hits: [] }))).toEqual({
      input: 0,
      dispatch: 0,
      render: 5,
      device: 10,
      total: 15,
    });
  });
});

describe('dominantOf', () => {
  it('benennt den größten Abschnitt', () => {
    expect(dominantOf(budgetOf(arm()))).toBe('device');
  });

  it('zeigt auf den Code der App, wenn deren Trefferpfad überwiegt', () => {
    const slow = arm({ hits: [{ eventLagMs: 2, dispatchMs: 60 }] }); // Dekodieren je Treffer
    expect(dominantOf(budgetOf(slow))).toBe('dispatch');
  });

  it('entscheidet Gleichstand zugunsten des früheren Abschnitts', () => {
    const even = { input: 5, dispatch: 5, render: 5, device: 5, total: 20 };
    expect(dominantOf(even)).toBe('input');
  });
});

describe('compareArms', () => {
  it('nennt die Ersparnis eines Arms gegenüber dem Ausgangsarm', () => {
    const before = arm({ label: 'balanced', latencyHint: 'balanced', outputLatency: 0.1 });
    const after = arm();
    // 107 ms gegen 17 ms
    expect(compareArms(before, after)).toBe(-90);
  });

  it('nennt eine Verschlechterung mit umgekehrtem Vorzeichen', () => {
    expect(compareArms(arm(), arm({ outputLatency: 0.02 }))).toBe(10);
  });
});

describe('recommend', () => {
  it('sieht bei einem unhörbar kurzen Weg keinen Handlungsbedarf', () => {
    const fast = arm({ baseLatency: 0.003, outputLatency: 0.005 });
    expect(recommend(fast).verdict).toBe('ok');
  });

  it('schickt einen langsamen Trefferpfad zurück in den Code der App', () => {
    const slow = arm({ hits: [{ eventLagMs: 3, dispatchMs: 60 }] });
    const result = recommend(slow);
    expect(result.verdict).toBe('app-code');
    expect(result.dominant).toBe('dispatch');
  });

  it('rät zuerst zum billigen Web-Hebel, solange der nicht gezogen ist', () => {
    const untuned = arm({ latencyHint: 'balanced', outputLatency: 0.09 });
    expect(recommend(untuned).verdict).toBe('web-tuning');
  });

  it('ruft nach einem nativen Pfad, wenn der Boden trotz interactive spürbar bleibt', () => {
    const floored = arm({ latencyHint: 'interactive', outputLatency: 0.06 });
    const result = recommend(floored);
    expect(result.verdict).toBe('native-audio');
    expect(result.dominant).toBe('device');
  });

  it('begründet den Spruch mit der gemessenen Zahl', () => {
    expect(recommend(arm()).reason).toContain('17');
  });
});

describe('parseReport', () => {
  const valid = {
    tool: 'morphos-audio-latency',
    version: 1,
    platform: 'Windows',
    shell: 'Electron 33',
    arms: [
      {
        label: 'interactive',
        latencyHint: 'interactive',
        sampleRate: 48000,
        baseLatency: 0.005,
        outputLatency: 0.01,
        hits: [{ eventLagMs: 1, dispatchMs: 1 }],
      },
    ],
  };

  it('nimmt einen vollständigen Bericht des Messwerkzeugs an', () => {
    const report = parseReport(valid);
    expect(report?.platform).toBe('Windows');
    expect(report?.arms).toHaveLength(1);
    expect(report?.arms[0].outputLatency).toBe(0.01);
  });

  it('liest denselben Bericht auch als Zeichenkette', () => {
    expect(parseReport(JSON.stringify(valid))?.platform).toBe('Windows');
  });

  it('weist zurück, was kein Bericht ist', () => {
    expect(parseReport(null)).toBeNull();
    expect(parseReport('{')).toBeNull();
    expect(parseReport({ ...valid, arms: [] })).toBeNull();
    expect(parseReport({ ...valid, tool: 'etwas anderes' })).toBeNull();
  });

  it('überspringt einen Arm ohne brauchbare Zahlen, statt ihn zu erfinden', () => {
    const mixed = { ...valid, arms: [{ label: 'kaputt' }, ...valid.arms] };
    expect(parseReport(mixed)?.arms).toHaveLength(1);
  });

  it('nimmt einen Arm ohne Treffer an — der Plattformboden steht auch so fest', () => {
    const noHits = { ...valid, arms: [{ ...valid.arms[0], hits: undefined }] };
    expect(parseReport(noHits)?.arms[0].hits).toEqual([]);
  });
});

describe('judgeReport', () => {
  function report(arms: LatencyArm[]): LatencyReport {
    return { platform: 'Prüfstand', shell: 'Prüfstand', arms };
  }

  it('nimmt den schnellsten Arm als das, was erreichbar ist', () => {
    const judged = judgeReport(
      report([arm({ label: 'langsam', outputLatency: 0.1 }), arm({ label: 'schnell' })]),
    );
    expect(judged.best.label).toBe('schnell');
    expect(judged.bestMs).toBeCloseTo(17, 5);
  });

  it('misst am Abstand der Arme, ob der latencyHint überhaupt etwas bewegt', () => {
    const spread = judgeReport(
      report([arm({ latencyHint: 'balanced', outputLatency: 0.1 }), arm()]),
    );
    expect(spread.hintEffectMs).toBeCloseTo(90, 5);
  });

  it('erkennt eine Plattform, die den latencyHint schlicht überhört', () => {
    // Windows: alle Arme melden denselben Puffer, egal was erbeten wurde.
    const deaf = report([
      arm({ label: 'balanced', latencyHint: 'balanced', baseLatency: 0.01, outputLatency: 0.04 }),
      arm({ label: 'interactive', baseLatency: 0.01, outputLatency: 0.04 }),
      arm({ label: '0.001', latencyHint: '0.001', baseLatency: 0.01, outputLatency: 0.04 }),
    ]);
    const judged = judgeReport(deaf);
    expect(judged.hintEffectMs).toBe(0);
    expect(judged.verdict).toBe('native-audio');
    expect(judged.reason).toContain('latencyHint');
  });

  it('rät nicht zum Web-Hebel, wenn der Hebel nachweislich ins Leere greift', () => {
    // Der schnellste Arm ist zufällig der mit „balanced“ — ohne den Blick über
    // alle Arme hinweg käme hier fälschlich „probier doch interactive“ heraus.
    const deaf = report([
      arm({ latencyHint: 'balanced', baseLatency: 0.01, outputLatency: 0.04 }),
      arm({ latencyHint: 'interactive', baseLatency: 0.01, outputLatency: 0.0401 }),
    ]);
    expect(recommend(deaf.arms[0]).verdict).toBe('web-tuning');
    expect(judgeReport(deaf).verdict).toBe('native-audio');
  });

  it('lässt den Web-Hebel stehen, wo er messbar zieht', () => {
    // Interactive wurde in diesem Lauf gar nicht gemessen, aber der Abstand
    // zwischen den Armen zeigt: Der Hint bewegt hier etwas — also erst den.
    const worth = report([
      arm({ latencyHint: 'balanced', baseLatency: 0.01, outputLatency: 0.02 }),
      arm({ latencyHint: '0.001', baseLatency: 0.01, outputLatency: 0.09 }),
    ]);
    const judged = judgeReport(worth);
    expect(judged.hintEffectMs).toBeCloseTo(70, 5);
    expect(judged.verdict).toBe('web-tuning');
  });

  it('bleibt bei einem einzigen Arm bei dessen eigenem Spruch', () => {
    const single = judgeReport(report([arm()]));
    expect(single.hintEffectMs).toBe(0);
    expect(single.verdict).toBe('ok');
  });
});

describe('formatReport', () => {
  it('schreibt je Arm eine Zeile einer Markdown-Tabelle', () => {
    const table = formatReport({
      platform: 'macOS',
      shell: 'Electron 33',
      arms: [arm(), arm({ label: 'balanced', latencyHint: 'balanced', outputLatency: 0.1 })],
    });
    const lines = table.trim().split('\n');
    expect(lines[0]).toContain('| Arm |');
    expect(lines).toHaveLength(4); // Kopf, Trennzeile, zwei Arme
    expect(lines[2]).toContain('interactive');
    expect(lines[2]).toContain('17,0');
    expect(lines[3]).toContain('107,0');
  });

  it('markiert je Zeile den überwiegenden Abschnitt', () => {
    const table = formatReport({ platform: 'macOS', shell: 'Electron', arms: [arm()] });
    expect(table).toContain('device');
  });
});

describe('forcedBufferFrames', () => {
  it('erzwingt auf Windows das Renderquantum — dort sind es gemessen 9 ms', () => {
    expect(forcedBufferFrames('win32', undefined)).toBe(FORCED_BUFFER_FRAMES);
  });

  it('erzwingt es auf macOS ebenso', () => {
    expect(forcedBufferFrames('darwin', undefined)).toBe(128);
  });

  it('lässt ungemessene Plattformen in Ruhe', () => {
    expect(forcedBufferFrames('linux', undefined)).toBeNull();
    expect(forcedBufferFrames('freebsd', undefined)).toBeNull();
  });

  it('lässt sich auf jeder Plattform von Hand einschalten', () => {
    expect(forcedBufferFrames('linux', '256')).toBe(256);
  });

  it('lässt sich abschalten — der Notausgang für schwache Maschinen', () => {
    expect(forcedBufferFrames('win32', '0')).toBeNull();
    expect(forcedBufferFrames('win32', 'aus')).toBeNull();
    expect(forcedBufferFrames('win32', 'off')).toBeNull();
    expect(forcedBufferFrames('win32', 'OFF')).toBeNull();
  });

  it('nimmt einen eigenen Wert an', () => {
    expect(forcedBufferFrames('win32', '480')).toBe(480);
  });

  it('lässt niemanden unter das Renderquantum — darunter kann Chromium nicht', () => {
    expect(forcedBufferFrames('win32', '64')).toBe(128);
  });

  it('deckelt nach oben, damit ein Tippfehler nicht das Gehör kostet', () => {
    expect(forcedBufferFrames('win32', '999999')).toBe(MAX_BUFFER_FRAMES);
  });

  it('rundet Kommazahlen auf ganze Bilder', () => {
    expect(forcedBufferFrames('win32', '256.7')).toBe(257);
  });

  it('fällt bei Unsinn auf die Vorgabe der Plattform zurück', () => {
    expect(forcedBufferFrames('win32', 'viel')).toBe(FORCED_BUFFER_FRAMES);
    expect(forcedBufferFrames('linux', 'viel')).toBeNull();
    expect(forcedBufferFrames('win32', '-8')).toBe(FORCED_BUFFER_FRAMES);
  });

  it('behandelt Leerraum wie „nichts gesagt“', () => {
    expect(forcedBufferFrames('win32', '   ')).toBe(FORCED_BUFFER_FRAMES);
    expect(forcedBufferFrames('win32', ' 256 ')).toBe(256);
  });

  it('nennt die Umgebungsvariable, über die der Notausgang läuft', () => {
    expect(BUFFER_SIZE_ENV).toBe('MORPHOS_AUDIO_BUFFER_SIZE');
  });
});
