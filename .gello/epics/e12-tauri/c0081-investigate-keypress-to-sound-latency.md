---
id: c0081
title: "Investigate keypress→sound latency (Windows)"
status: review
created: 2026-08-12
tags: [audio, latency, performance]
status-changed: 2026-08-12T23:29:01
epic: e12
updated: 2026-08-12
usage-tokens: 78472
usage-cost: 7.643452
---

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

- [x] A **measured** keypress→sound figure on Windows and macOS (method noted),
      replacing the gut estimate.
- [x] The dominant contributor is identified (Web Audio output buffer vs input
      event vs per-hit decode/scheduling).
- [x] The cheapest web-only mitigation is tried and its measured effect recorded.
- [x] A recommendation: web-side fix suffices, or a native audio path is needed
      (with the finding fed back to c0079 if it argues for Rust).

## Notes

### Method

No audio code exists in the repo — the sound app is a *generated* app, so the
measurement needed its own minimal repro. Built one:

- `tools/audio-latency/index.html` — a single self-contained page (no build, no
  server: double-click it on any machine). Runs four arms × N keypresses and
  records, per hit, `event.timeStamp → handler` (**input**) and
  `handler → start() returned` (**dispatch**), plus `baseLatency` (**render**)
  and the median `outputLatency` (**device**) of the arm.
- `tools/audio-latency/measure.mjs` — runs the same page unattended inside
  **Electron**, i.e. Morphos' actual shell, and can force Chromium's
  `--audio-buffer-size`.
- `src/core/audiolatency.ts` (+ 33 tests) — the interpretation: budget, dominant
  contributor, arm-to-arm delta, per-arm and whole-run verdict. Measuring is in
  the browser, judging is in tested code.
- `tools/audio-latency/report.ts` — prints the tables below from a raw run.

The model: `input + dispatch + render + device`. `render + device` is the
**platform floor** — no app code gets below it.

Raw runs are checked in under `tools/audio-latency/measurements/`.

### Measured: Windows (Chrome 151, 48 kHz) — **real keypresses**

`measurements/windows-chrome151-manual.json`, 15 hits/arm, hand-typed:

| Arm | input | dispatch | render | device | **total** | dominant |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| balanced (default), pre-decoded | 0,6 | 0,2 | 10,0 | 40,0 | **50,8** | device |
| interactive, pre-decoded | 0,6 | 0,1 | 10,0 | 40,0 | **50,7** | device |
| interactive, decode per hit | 0,5 | 0,7 | 10,0 | 40,0 | **51,2** | device |
| latencyHint 0.001, pre-decoded | 0,6 | 0,1 | 10,0 | 40,0 | **50,7** | device |

Buffer: **480 frames in every arm.** Verdict over the whole run:
`native-audio` — best arm 50,7 ms, and the `latencyHint` moves 0,5 ms in total.

### Measured: macOS (Electron 33.4.11 / Chromium 130, 48 kHz)

`measurements/macos-electron33-auto.json`, 15 hits/arm, synthesized keys:

| Arm | input | dispatch | render | device | **total** | dominant |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| balanced (default), pre-decoded | 0,0 | 0,1 | 10,0 | 18,0 | **28,1** | device |
| interactive, pre-decoded | 0,1 | 0,0 | 5,3 | 11,0 | **16,4** | device |
| interactive, decode per hit | 0,0 | 0,2 | 5,3 | 11,0 | **16,5** | device |
| latencyHint 0.001, pre-decoded | 0,0 | 0,1 | 2,7 | 5,0 | **7,8** | device |

Buffer: 480 / 256 / 256 / **128 frames** (128 = one render quantum, the floor).

With `--audio-buffer-size=128` forced on the Electron process
(`measurements/macos-electron33-buffer128.json`), `interactive` drops
**16,4 → 7,8 ms**.

### Findings

1. **The gut estimate was right, at its low end: Windows is ~51 ms**, macOS is
   7,8–16,4 ms depending on the hint. Windows is **6,5× the macOS best**, and
   the whole gap is `device` (40 vs 5 ms) plus `render` (10 vs 2,7 ms).
2. **`device` (`outputLatency`) dominates every single arm on both platforms.**
   The app's own hit path is ≤ 0,8 ms everywhere. The card's hypothesis holds:
   it is the audio output buffer — not the app, not the input event, not the
   scheduling, and not the Electron shell.
3. **On Windows the `latencyHint` is simply ignored.** `balanced`,
   `interactive` and an explicit `0.001 s` all report the *same* 480-frame
   buffer and the *same* 40 ms `outputLatency`. The cheapest web lever — the
   first thing the card proposed — measurably buys **0,1 ms**. On macOS the same
   lever is worth −11,7 ms, so this is a Windows-backend property, not a
   measurement artefact.
4. **Pre-decoding is not the lever either** (+0,4 ms on Windows for a 20 ms
   click). Still the right way to write the app, but it is not the cause.
   Caveat: a real 1 s sample costs more to decode than this click does.
5. **A shell-level lever exists and Morphos owns it**: Chromium's
   `--audio-buffer-size=<frames>` switch, verified present in the shipped
   Electron binary. On macOS it forces the 128-frame floor and overrides the
   page's hint process-wide — so it would fix *every* generated app at once
   without touching generated code. **Whether it moves the Windows floor is
   untested** and is the one cheap experiment left (see c0085).
6. **Correction to an earlier note on this card:** I first wrote that WASAPI
   exclusive mode "is not reachable from Chromium, no such switch exists in the
   binary". That inference was unsound — the binary I searched is the *macOS*
   build, which cannot contain Windows-only switches. Whether Chromium still
   exposes an exclusive-mode or `IAudioClient3` low-latency path on Windows is
   **unverified**, and it belongs in the same follow-up experiment.

### Caveats, stated plainly

- The Windows run is **Chrome 151**; Morphos ships **Chromium 130** (Electron
  33). The floor is a property of the Windows audio backend and driver, so it
  should carry over, but the confirming run in Electron is part of c0085.
- The macOS run uses **synthesized** keydowns, so its `input` reads ~0. The
  Windows run is hand-typed and shows the real value: **0,6 ms** — i.e. the OS
  key path is negligible on both, and the macOS totals are not flattered by more
  than a millisecond.
- `outputLatency` is Chromium's own estimate. An independent acoustic check
  (mic loopback) is built into the harness but was not run; the fact that the
  reported number tracks the forced buffer size on macOS is decent corroboration.

### Recommendation

**A web-side fix does not suffice on Windows.** It is measured, not assumed: the
two levers the card proposed are worth 0,1 ms and −0,4 ms there. Ordered by cost:

1. **Cheap and decisive — try `--audio-buffer-size` on Windows first** (c0085).
   One command with the harness already in the repo. If it moves the 50 ms
   floor, this card's problem is a **one-line change in `electron/main.ts`**
   that fixes every sound app Morphos will ever generate. Do this before
   anything else.
2. **Free and correct regardless** — teach generated sound apps to use
   `latencyHint: 'interactive'` with pre-decoded `AudioBuffer`s on `keydown`.
   Worth −11,7 ms on macOS, harmless on Windows. Belongs in the generation
   prompt, not in a hand-edit (c0086).
3. **Only if 1 fails: a native audio path.** WASAPI at a genuinely small period
   (or exclusive mode) is the only thing left that can reach the 40 ms. That is
   a real native component and a real cost.

**Feedback to c0079 (Tauri):** this does **not** argue for Tauri. The floor is
Chromium's Windows audio backend, and WebView2 is the same Chromium with the
same WASAPI path — Tauri would inherit the identical 50 ms. Both shells can pass
the `--audio-buffer-size` switch (Electron via `app.commandLine`, WebView2 via
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`), so step 1 is shell-neutral. Even step 3
is shell-neutral: native audio can be reached from Electron via a native addon or
a sidecar just as it can from Rust. **Latency is off the list of Tauri arguments**
— which is what c0079 already assumed, now with numbers behind it.

## Discussion

- Split out of **c0079** (Tauri): latency was the trigger for exploring Tauri,
  but is almost certainly a Web-Audio/WASAPI issue, not a shell issue.
  → Confirmed by measurement.
- Open: is this general (all sound apps) or specific to the one app's code? The
  measurement should use a minimal repro to separate the platform floor from the
  app's own scheduling.
  → **Answered: general.** The minimal repro — which does nothing but play a
  pre-decoded 20 ms click — already sits at 50,7 ms on Windows. No app can beat
  that, so the specific app's code is not the cause.
- Question to the human (2026-08-12): asked for a Windows run, since this machine
  has no Windows. Answered with variant A, hand-typed in Chrome 151; stored as
  `measurements/windows-chrome151-manual.json`. Variants B (Electron +
  `--audio-buffer-size`) and C (the app's own source) were not run — B is now
  c0085, and C turned out not to be needed, see above.
- Follow-ups captured: **c0085** (test `--audio-buffer-size` on Windows, then set
  it in `electron/main.ts`) and **c0086** (teach the generation prompt the
  low-latency audio pattern). Both left in `inbox` for triage.

## Review

### 2026-08-12T23:31:38 — pass

Checked: all four acceptance criteria, the raw measurements against the card's
tables, the two commits (`0946024`, `15af125`), `npm run test`, `npm run
typecheck`, and a re-run of the harness on this machine.

- Criterion 1 (measured figure, method noted) is met and **reproducible**: I
  re-ran `npx electron tools/audio-latency/measure.mjs --hits=4` here and got
  28,7 / 16,5 / 18,1 / 8,0 ms with buffers 480 / 256 / 256 / 128 — the same
  picture as `measurements/macos-electron33-auto.json` (28,1 / 16,4 / 16,5 /
  7,8). Every number in both tables on the card recomputes exactly from the
  checked-in JSON (independent median calculation, not the repo's own code).
  The Windows file's `userAgent` confirms Chrome 151 / hand-typed
  (`synthesizedKeys: false`), as the caveat says.
- Criterion 2 (dominant contributor) is met: `dominantOf` reports `device` for
  all four arms in all three runs; app-side `input + dispatch` is ≤ 0,8 ms.
- Criterion 3 (cheapest web lever, measured effect) is met: `npx vite-node -c
  vitest.config.ts tools/audio-latency/report.ts …` on the Windows run prints
  −0,1 ms for `interactive`, +0,4 ms for decode-per-hit, and the whole-run
  verdict `native-audio` — the card's claims verbatim.
- Criterion 4 (recommendation, feedback to c0079) is met: the recommendation is
  ordered by cost, the follow-ups `c0085` and `c0086` exist as cards, and c0079
  carries the feedback block ("strike latency from the list of Tauri
  arguments").
- Finding 5 spot-checked: `audio-buffer-size` really is a switch in the shipped
  `Electron Framework` binary.
- Checks green: `npm run test` 1584 passed / 86 files, `npm run typecheck`
  clean. `src/core/audiolatency.spec.ts` alone is 33 tests, as claimed — no
  `.only`, `.skip` or weakened assertion anywhere in the diff. There is no lint
  script in this repo, so none was run.
- Diff stays inside the What: a measuring tool, a tested interpretation module,
  three raw runs, and the `tools/**/*.ts` line in `tsconfig.json` that the new
  tool needs. No production code touched — correctly deferred to c0085/c0086.
- Two things for the record, neither blocking: the invocation in `report.ts`'s
  own header comment (line 6) omits `-c vitest.config.ts` and fails with
  `require is not defined` — the README's version is the working one; and the
  acoustic loopback check is present but unrun (`loopback: null` in all three
  files), which the card's caveats already state.

## Log

- 2026-08-12 created (decoupled from c0079)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 harness + tested analysis built, macOS measured (agent)
- 2026-08-12 question to the human: Windows run (agent)
- 2026-08-12 Windows measured (Chrome 151, hand-typed) — floor 50 ms, latencyHint
  has no effect there; findings and recommendation written (agent)
- 2026-08-12 status → review (agent)
