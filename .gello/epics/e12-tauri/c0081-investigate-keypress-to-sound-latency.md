---
id: c0081
title: "Investigate keypress→sound latency (Windows)"
status: in-progress
created: 2026-08-12
tags: [audio, latency, performance]
status-changed: 2026-08-12T23:00:21
epic: e12
updated: 2026-08-12
usage-tokens: 45935
usage-cost: 3.037866
---

## Die Windows-Messung brauche ich von dir

Alles außer den Windows-Zahlen steht (siehe **Notes** auf der Karte): Messwerkzeug,
Auswertung mit Tests, macOS-Werte, und ein überraschender Fund — Chromiums
`--audio-buffer-size=128` drückt den Boden auf macOS von 16,4 auf 7,8 ms und
wirkt prozessweit, also für **alle** generierten Apps auf einmal.

Auf diesem Rechner läuft kein Windows. Ein Lauf auf der Windows-Kiste beantwortet
die Karte — **Variante A genügt**, Dauer ~2 Minuten.

### A — von Hand (die wichtigste; misst auch den echten Tastenweg)

1. `tools/audio-latency/index.html` auf den Windows-Rechner kopieren und
   **doppelklicken** (Edge reicht, kein Bau, kein Server).
2. „Messung starten“, dann **eine beliebige Taste immer wieder drücken** —
   4 Arme × 15 Treffer, das Feld zählt mit.
3. Unten „JSON kopieren“ und **hier auf die Karte** einfügen.

### B — optional, wenn das Repo auf Windows liegt

{
  "tool": "morphos-audio-latency",
  "version": 1,
  "platform": "Windows",
  "shell": "Chrome 151.0.0.0",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "synthesizedKeys": false,
  "arms": [
    {
      "label": "balanced (Vorgabe), vorab dekodiert",
      "latencyHint": "balanced",
      "sampleRate": 48000,
      "baseLatency": 0.01,
      "outputLatency": 0.04,
      "hits": [
        {
          "eventLagMs": 2.100000001490116,
          "dispatchMs": 0.19999999552965164
        },
        {
          "eventLagMs": 1.3999999985098839,
          "dispatchMs": 0.30000000447034836
        },
        {
          "eventLagMs": 0.29999999701976776,
          "dispatchMs": 0.20000000298023224
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 1.1000000014901161,
          "dispatchMs": 0.19999999552965164
        },
        {
          "eventLagMs": 0.5,
          "dispatchMs": 0
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.20000000298023224
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.19999999552965164
        },
        {
          "eventLagMs": 0.8999999985098839,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.4000000059604645,
          "dispatchMs": 0.09999999403953552
        },
        {
          "eventLagMs": 0.7999999970197678,
          "dispatchMs": 0.20000000298023224
        },
        {
          "eventLagMs": 0.7000000029802322,
          "dispatchMs": 0
        },
        {
          "eventLagMs": 0.5,
          "dispatchMs": 0.20000000298023224
        },
        {
          "eventLagMs": 0.7000000029802322,
          "dispatchMs": 0.19999999552965164
        }
      ]
    },
    {
      "label": "interactive, vorab dekodiert",
      "latencyHint": "interactive",
      "sampleRate": 48000,
      "baseLatency": 0.01,
      "outputLatency": 0.04,
      "hits": [
        {
          "eventLagMs": 0.3999999985098839,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.5,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.4000000059604645,
          "dispatchMs": 0.09999999403953552
        },
        {
          "eventLagMs": 0.6999999955296516,
          "dispatchMs": 0.20000000298023224
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.3999999985098839,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.6999999955296516,
          "dispatchMs": 0.20000000298023224
        },
        {
          "eventLagMs": 0.7999999970197678,
          "dispatchMs": 0
        },
        {
          "eventLagMs": 0.29999999701976776,
          "dispatchMs": 0.20000000298023224
        },
        {
          "eventLagMs": 0.8000000044703484,
          "dispatchMs": 0.09999999403953552
        },
        {
          "eventLagMs": 1.1000000014901161,
          "dispatchMs": 0.20000000298023224
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.19999999552965164
        },
        {
          "eventLagMs": 0.8999999985098839,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.30000000447034836
        }
      ]
    },
    {
      "label": "interactive, je Treffer dekodiert",
      "latencyHint": "interactive",
      "sampleRate": 48000,
      "baseLatency": 0.01,
      "outputLatency": 0.04,
      "hits": [
        {
          "eventLagMs": 0.8999999985098839,
          "dispatchMs": 1.3000000044703484
        },
        {
          "eventLagMs": 0.3999999985098839,
          "dispatchMs": 0.8000000044703484
        },
        {
          "eventLagMs": 2.1999999955296516,
          "dispatchMs": 0.8000000044703484
        },
        {
          "eventLagMs": 0.7000000029802322,
          "dispatchMs": 0.6000000014901161
        },
        {
          "eventLagMs": 0.30000000447034836,
          "dispatchMs": 0.5
        },
        {
          "eventLagMs": 0.5,
          "dispatchMs": 0.7000000029802322
        },
        {
          "eventLagMs": 0.5,
          "dispatchMs": 0.6000000014901161
        },
        {
          "eventLagMs": 0.30000000447034836,
          "dispatchMs": 0.8999999985098839
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.3999999985098839
        },
        {
          "eventLagMs": 0.4000000059604645,
          "dispatchMs": 0.5
        },
        {
          "eventLagMs": 0.3999999985098839,
          "dispatchMs": 0.7000000029802322
        },
        {
          "eventLagMs": 0.7999999970197678,
          "dispatchMs": 1
        },
        {
          "eventLagMs": 0.5,
          "dispatchMs": 0.7999999970197678
        },
        {
          "eventLagMs": 0.8999999985098839,
          "dispatchMs": 0.8000000044703484
        },
        {
          "eventLagMs": 0.8000000044703484,
          "dispatchMs": 0.6999999955296516
        }
      ]
    },
    {
      "label": "0,001 s (kleinster Wunsch), vorab dekodiert",
      "latencyHint": "0.001",
      "sampleRate": 48000,
      "baseLatency": 0.01,
      "outputLatency": 0.04,
      "hits": [
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.4000000059604645,
          "dispatchMs": 0.19999999552965164
        },
        {
          "eventLagMs": 1.3999999985098839,
          "dispatchMs": 0.20000000298023224
        },
        {
          "eventLagMs": 0.30000000447034836,
          "dispatchMs": 0.09999999403953552
        },
        {
          "eventLagMs": 0.29999999701976776,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.7000000029802322,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 0.5,
          "dispatchMs": 0.19999999552965164
        },
        {
          "eventLagMs": 0.8999999985098839,
          "dispatchMs": 0
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.19999999552965164
        },
        {
          "eventLagMs": 2.600000001490116,
          "dispatchMs": 0.19999999552965164
        },
        {
          "eventLagMs": 0.6000000014901161,
          "dispatchMs": 0.10000000149011612
        },
        {
          "eventLagMs": 1.6000000014901161,
          "dispatchMs": 0.19999999552965164
        },
        {
          "eventLagMs": 1.2000000029802322,
          "dispatchMs": 0
        },
        {
          "eventLagMs": 0.3999999985098839,
          "dispatchMs": 0.19999999552965164
        }
      ]
    }
  ],
  "loopback": null
}
npx electron tools/audio-latency/measure.mjs --hits=15 > win.json
npx electron tools/audio-latency/measure.mjs --hits=15 --audio-buffer-size=128 > win-128.json
```

Das prüft direkt, ob der `--audio-buffer-size`-Hebel unter Windows genauso zieht.
Wenn ja, ist die Karte mit einer Zeile in `electron/main.ts` erledigt statt mit
einem nativen Audiopfad.

### C — optional, eine Rückfrage zur Einordnung

Ist die klingende App **eine bestimmte** generierte App? Wenn du ihren Quelltext
(oder nur den Tastatur-/Audio-Teil) hier einfügst, kann ich sagen, ob sie selbst
etwas Teures tut — oder ob sie sauber ist und es rein an der Plattform liegt.

- [ ] A gemacht, JSON steht unten
- [ ] A + B gemacht
- [ ] Ich komme gerade nicht an den Windows-Rechner — trag ein, was du ohne die
      Zahlen empfehlen würdest, und lass die Messung als eigene Karte offen
```

# Investigate keypress→sound latency (Windows)

A Morphos app that triggers sounds from keys has a **noticeable keypress→sound
delay on Windows** (gut estimate ~50–150ms), much smaller on macOS. Decoupled
from the Tauri question (c0079): the app runs in a webview and makes sound via
the **Web Audio API**, so on Windows the delay is almost certainly the
**Web Audio → WASAPI output buffer**, not the Electron shell — Tauri's WebView2
is the same Chromium engine and would not change it.

## What

**Measure** where the latency actually comes from and find the cheapest real fix,
independent of any shell migration. First establish a number (not a gut feeling),
then try the low-cost levers before anything native.

Likely levers, cheapest first:

- `new AudioContext({ latencyHint: 'interactive' })` and inspect
  `AudioContext.baseLatency` / `outputLatency`.
- Ensure sounds are **pre-decoded** `AudioBuffer`s played via
  `AudioBufferSourceNode` (no per-hit decode), scheduled at `currentTime`.
- Capture keys on `keydown` (not `keyup`), avoid layout/GC stalls on the hit path.
- Only if the web path floors out: evaluate a **native low-latency audio path**
  (WASAPI exclusive / a native host) — this is where a Rust layer *could* matter,
  and would feed back into c0079.

## Acceptance criteria

- [ ] A **measured** keypress→sound figure on Windows and macOS (method noted),
      replacing the gut estimate.
- [ ] The dominant contributor is identified (Web Audio output buffer vs input
      event vs per-hit decode/scheduling).
- [ ] The cheapest web-only mitigation is tried and its measured effect recorded.
- [ ] A recommendation: web-side fix suffices, or a native audio path is needed
      (with the finding fed back to c0079 if it argues for Rust).

## Notes

### Method

No audio code exists in the repo — the sound app is a *generated* app, so the
measurement needs its own minimal repro. Built one:

- `tools/audio-latency/index.html` — a single self-contained page (no build, no
  server: double-click it on any machine). Runs four arms × N keypresses and
  records, per hit, `event.timeStamp → handler` (**input**) and
  `handler → start() returned` (**dispatch**), plus `baseLatency` (**render**)
  and the median `outputLatency` (**device**) of the arm.
- `tools/audio-latency/measure.mjs` — runs the same page unattended inside
  **Electron**, i.e. Morphos' actual shell (`npx electron … > messung.json`).
- `src/core/audiolatency.ts` (+ 27 tests) — the interpretation: budget, dominant
  contributor, arm-to-arm delta, verdict. Measuring is in the browser, judging
  is in tested code.
- `tools/audio-latency/report.ts` — prints the table below from a raw run.

The model: `input + dispatch + render + device`. `render + device` is the
**platform floor** — no app code gets below it.

### Measured: macOS (Electron 33.4.11 / Chromium 130, 48 kHz)

`tools/audio-latency/measurements/macos-electron33-auto.json`, 15 hits/arm:

| Arm | input | dispatch | render | device | **total** | dominant |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| balanced (default), pre-decoded | 0,0 | 0,1 | 10,0 | 18,0 | **28,1** | device |
| interactive, pre-decoded | 0,1 | 0,0 | 5,3 | 11,0 | **16,4** | device |
| interactive, decode per hit | 0,0 | 0,2 | 5,3 | 11,0 | **16,5** | device |
| latencyHint 0.001, pre-decoded | 0,0 | 0,1 | 2,7 | 5,0 | **7,8** | device |

Buffer: 480 / 256 / 256 / **128 frames** (128 = one render quantum, the floor).

Caveats, stated plainly: these are **synthesized** keydowns, so `input` reads ~0
and the real OS key path (USB polling + input pipeline, typically 5–20 ms) is
**not** in these numbers — it is platform-side and roughly equal on both OSes.
The per-hit decode arm decodes a tiny 20 ms click; a real 1 s sample costs more.

### Findings so far

1. **`device` (`outputLatency`) dominates every arm** — the app's own hit path
   (`input + dispatch`) is ≤ 0,3 ms. The card's hypothesis holds: it is the
   audio output buffer, not the app and not the shell.
2. **`latencyHint: 'interactive'` is worth −11,7 ms** on macOS (28,1 → 16,4).
   That is the cheapest lever and it is real.
3. **Pre-decoding is *not* the lever here** (−0,1 ms) — at least not for short
   samples. Worth doing, but it is not where the 50–150 ms would come from.
4. **A shell-level lever exists and Morphos owns it**: Chromium's
   `--audio-buffer-size=128` switch (verified present in the shipped Electron
   binary). Measured on macOS it pulls `interactive` from 16,4 → **7,8 ms** —
   it overrides the page's `latencyHint` process-wide, so it fixes *every*
   generated app at once, without touching generated code.
   (`measurements/macos-electron33-buffer128.json`; trade-off: more wakeups,
   higher risk of dropouts on weak machines.)
5. **WASAPI exclusive mode is not reachable from Chromium** — no such switch
   exists in the binary (checked). So if `--audio-buffer-size` does not fix
   Windows, the remaining option really is a native audio path, which is the
   part that would feed back into c0079.

### Still open

The Windows numbers — the actual subject of the card. They cannot be produced on
this machine; the harness is built so one run on the Windows box answers it.
See the question below.

## Discussion

- Split out of **c0079** (Tauri): latency was the trigger for exploring Tauri,
  but is almost certainly a Web-Audio/WASAPI issue, not a shell issue.
- Open: is this general (all sound apps) or specific to the one app's code? The
  measurement should use a minimal repro to separate the platform floor from the
  app's own scheduling.

## Log

- 2026-08-12 created (decoupled from c0079)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
