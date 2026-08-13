---
id: c0085
title: "Test --audio-buffer-size on Windows, then set it in main.ts"
status: done
tags: [audio, latency, performance]
depends: [c0081]
created: 2026-08-12
status-changed: 2026-08-13T16:32:15
epic: e12
updated: 2026-08-13
commit: 9321c53
usage-tokens: 55539
usage-cost: 7.168606
---

# Test --audio-buffer-size on Windows, then set it in main.ts

c0081 measured the Windows floor at **50 ms** (40 ms `outputLatency` + 10 ms
`baseLatency`) and showed that `latencyHint` is **ignored** by Chromium's
Windows audio backend — all four arms report the same 480-frame buffer. The one
cheap lever left is Chromium's `--audio-buffer-size=<frames>` switch, which
Morphos can set itself.

On macOS it works: forcing 128 frames pulls `interactive` from 16,4 to 7,8 ms
(`tools/audio-latency/measurements/macos-electron33-buffer128.json`). Whether it
moves the Windows floor is **untested** — that is the whole point of this card.

## What

1. On the Windows machine, with the repo checked out:
   ```
   npx electron tools/audio-latency/measure.mjs --hits=15 > win.json
   npx electron tools/audio-latency/measure.mjs --hits=15 --audio-buffer-size=128 > win-128.json
   npx vite-node -c vitest.config.ts tools/audio-latency/report.ts win.json win-128.json
   ```
   The first run also confirms the Chrome-151 numbers in Electron/Chromium 130.
2. If the floor moves: set the switch in `electron/main.ts` via
   `app.commandLine.appendSwitch('audio-buffer-size', …)`. It is process-wide,
   so it fixes every generated app at once. Weigh the trade-off — smaller
   buffers mean more wakeups and a higher risk of dropouts on weak machines;
   consider making it a setting rather than a hard 128.
3. While on Windows, also settle the open question from c0081: does that
   Chromium build still expose a WASAPI exclusive-mode / `IAudioClient3`
   low-latency path? (`chrome://flags`, `--enable-features=…`, and the switch
   list in the Windows binary.) This could not be checked from the macOS build.
4. If nothing moves the floor, say so on this card — that is the trigger for the
   native-audio option, and the input c0079 needs.

## Acceptance criteria

- [x] Measured Windows numbers with and without `--audio-buffer-size`, stored in
      `tools/audio-latency/measurements/`.
- [x] Either the switch is set in `electron/main.ts` (with the dropout trade-off
      considered), or it is recorded that it does not help.
- [x] The exclusive-mode / `IAudioClient3` question from c0081 is answered.
- [x] The outcome is fed back to c0081's recommendation and to c0079.

## Notes

### Measured: Windows 11, Electron 33.4.11 / Chromium 130, 48 kHz

Self-run (`measure.mjs`, synthesized keys), 15 hits/arm. Raw files
`measurements/windows-electron33-auto.json` and `…-buffer128.json`.

| Arm | render | device | **total** | buffer |
| --- | ---: | ---: | ---: | ---: |
| **without the switch** | | | | |
| balanced (default), pre-decoded | 10,0 | 42,0 | **52,0** | 480 |
| interactive, pre-decoded | 10,0 | 42,0 | **52,0** | 480 |
| interactive, decode per hit | 10,0 | 42,0 | **52,3** | 480 |
| latencyHint 0.001, pre-decoded | 10,0 | 42,0 | **52,1** | 480 |
| **`--audio-buffer-size=128`** | | | | |
| balanced (default), pre-decoded | 2,7 | 41,0 | **43,9** | 128 |
| interactive, pre-decoded | 2,7 | 40,0 | **42,8** | 128 |
| interactive, decode per hit | 2,7 | 41,0 | **44,1** | 128 |
| latencyHint 0.001, pre-decoded | 10,0 | 42,0 | **52,0** | **480** |

`input` and `dispatch` are ≤ 0,3 ms in every arm, as on macOS.

### Findings

1. **The Chrome-151 numbers hold in the shipped shell.** Electron 33 / Chromium
   130 on Windows measures 52,0 ms with 480 frames in every arm — c0081's
   50,7 ms (Chrome 151, hand-typed) carries over, and its caveat is settled.
2. **The switch works on Windows: 52,0 → 42,8 ms (−9,2 ms, −18 %).** It is a
   real, repeatable win, but not the fix: the whole saving comes from `render`
   (10 → 2,7 ms). `device` stays at 40–42 ms. The floor is still 5,5× macOS.
3. **A numeric `latencyHint` defeats the switch.** The 0.001 s arm keeps its
   480 frames and its 52,0 ms even when the process forces 128 — reproduced in
   all four runs that set the switch. `'interactive'` and `'balanced'` take it.
   So the switch is process-wide but *not* unconditional, and a generated app
   can lose it by asking for something too clever. **Input for c0086:** the
   generation prompt must teach `latencyHint: 'interactive'` and forbid a number.
4. **Exclusive mode is reachable — and 3× worse.** `enable-exclusive-audio` is
   in the shipped Windows binary and it engages: `device` 40 → 128 ms, total
   **133,4 ms** (`…-exclusive.json`); with the small buffer still 130,8 ms
   (`…-exclusive-buffer128.json`). On this hardware Chromium's exclusive path
   picks a 128 ms period, i.e. it trades latency away rather than winning it.
5. **`IAudioClient3` buys nothing.** `AllowIAudioClient3` is a feature in the
   binary; enabling it changes not one number (52,0 ms alone, 43,5 ms with the
   switch — the switch's own result). Either it is already on, or this driver's
   minimum period is the default period.
6. **Two further shell levers are dead too:** audio service in-process
   (`disable-features=AudioServiceOutOfProcess`) 43,2 ms — the IPC hop is not
   the cost; `--force-wave-audio` 130,8 ms — much worse.

**Conclusion: the 40 ms `device` is the WASAPI shared-mode path itself, and no
Chromium switch reaches it.** Everything the shell can do is now done, and it
is worth 9 ms.

### What was changed

`electron/main.ts` appends `audio-buffer-size` before `whenReady`, from
`forcedBufferFrames(process.platform, process.env.MORPHOS_AUDIO_BUFFER_SIZE)`
in `src/core/audiolatency.ts` (11 new tests, 45 in that file now). Verified
end-to-end in the built app over the DevTools protocol: a fresh
`AudioContext` in Morphos reports **128 frames** (2,67 ms) instead of 480, and
**480 again** with `MORPHOS_AUDIO_BUFFER_SIZE=aus`.

**The dropout trade-off, as weighed.** A smaller buffer means more wakeups for
the audio thread, and on a weak machine that can crackle. Against a hard 128
everywhere, two limits:

- **Only where it is measured.** `win32` and `darwin` get 128 unasked; every
  other platform (Linux/PulseAudio is untested here) is left alone. Forcing a
  buffer on a platform nobody measured would be guessing with someone's sound.
- **An escape hatch, not a setting.** `MORPHOS_AUDIO_BUFFER_SIZE=aus` switches
  it off, a number overrides it (clamped to 128…8192 frames). A user-facing
  setting was considered and rejected *for now*: it is a knob nobody can reason
  about without a measurement, and the risk it guards against is theoretical —
  no dropout has been observed. If one ever is, promoting the env var to a real
  setting is a small step, and the decision function is already tested.

Note the residual risk honestly: the 40 ms WASAPI buffer downstream still
cushions the render thread, which is why 128 frames is far less daring on
Windows than the same number is on macOS — but this was measured on one
machine, not on a fleet.

### Feedback to c0081 and c0079

- **c0081, step 1 of its recommendation:** done, and it is a partial success —
  9 ms of the 52, not the 40 ms that matter. Its step 3 (native audio) is
  therefore **still on the table**, now with the extra knowledge that
  Chromium's own exclusive-mode path is not the shortcut: it is measurably
  worse, so a native path means a real WASAPI implementation at a small period,
  not a switch.
- **c0086** gains a hard requirement from finding 3 (no numeric `latencyHint`).
- **c0079 (Tauri):** unchanged and, if anything, firmer. The lever that worked
  is a Chromium switch, and WebView2 takes it too
  (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`). Latency still argues neither for
  nor against Tauri.

### Caveats

- One machine, one sound card. The 128 ms exclusive-mode period especially is a
  property of this driver, not of Windows.
- The switch runs synthesized keydowns, so `input` reads ~0; c0081's hand-typed
  Windows run puts the real value at 0,6 ms, i.e. it changes no conclusion.
- `outputLatency` remains Chromium's own estimate; the acoustic loopback check
  in the harness is still unrun.
- The repo's test suite is **not green on this Windows machine**, independently
  of this card: 13 failures (symlink tests that need admin privileges, `gh` not
  in PATH, two git tests) fail identically on a clean checkout. `audiolatency`
  is 45/45 green, `npm run typecheck` is clean.
- `win.json` / `win-128.json` in the repo root are the card's own example
  command run earlier; my runs reproduce them exactly and are stored properly
  under `measurements/`. The two root files are untracked leftovers and can be
  deleted.

## Review

### 2026-08-13T00:16:33 — pass

Checked: all four acceptance criteria, the raw measurement files against the
card's tables, the diff of `9321c53`, `npm test`, `npm run typecheck`,
`npm run build`. There is no lint script in this repo, so none was run.

- Criterion 1 (measurements stored) is met: eight Windows runs under
  `tools/audio-latency/measurements/`, with and without the switch plus the
  exclusive/IAudioClient3/in-process/waveOut arms. Re-running the repo's own
  report tool on `windows-electron33-auto.json` and `…-buffer128.json`
  reproduces the card's table verbatim — 52,0 ms at 480 frames, and
  43,9 / 42,8 / 44,1 ms at 128 frames with the numeric-hint arm left at 480.
  Every `userAgent` says Electron 33.4.11 / Chromium 130, as claimed.
- Criterion 2 (switch set, trade-off weighed) is met: `electron/main.ts:112-126`
  appends `audio-buffer-size` at module scope, i.e. before `whenReady`, from
  `forcedBufferFrames()` in `src/core/audiolatency.ts:369`. The trade-off is
  bounded twice and both bounds are tested: unasked only on `win32`/`darwin`,
  and `MORPHOS_AUDIO_BUFFER_SIZE` overrides in both directions (`aus`/`off`/`0`
  off, a number clamped to 128…8192, garbage falling back to the platform
  default). 11 new tests, `audiolatency.spec.ts` green at 45/45. The switch and
  the env var both survive into `dist-electron/main.js`.
- Criterion 3 (exclusive mode / `IAudioClient3`) is met and answered with
  measurements, not prose: `outputLatency` is 0,128 s in both
  `…-exclusive.json` files versus 0,042 s in `…-auto.json`, and
  `…-iaudioclient3.json` is numerically identical to `…-auto.json`.
- Criterion 4 (feedback) is met on all three targets, not just on this card:
  c0081 has "Outcome of step 1 — measured in c0085", c0079 has "Follow-up from
  c0085", c0086 has "Update from c0085" with the no-numeric-`latencyHint`
  requirement.
- Diff stays inside the What: main process, the decision function plus its
  tests, the `--switch=` passthrough the exclusive-mode measurements needed,
  eight raw runs, the README table. No `.only`, `.skip` or removed assertion —
  the spec diff is purely additive (+61/-0).
- The suite's red is confirmed pre-existing, not this card's: 13 failures
  (symlinks needing admin, `gh` absent, two git tests) reproduce identically at
  the pre-c0085 commit `839646e` in a clean worktree. Nothing in `src/` imports
  `audiolatency` except its own spec.

Three things for the record, none blocking:

- Finding 3 says the numeric-`latencyHint` opt-out was "reproduced in all four
  runs that set the switch" — there are five such runs, and in
  `…-exclusive-buffer128.json` that arm *did* take 128 frames (`baseLatency`
  2,67 ms). The claim holds for the four shared-mode runs, which is the case
  c0086 cares about; the wording is wider than the data.
- The caveat's "13 failures" is exact at the baseline, but a full run at `HEAD`
  shows 15–16: `DesktopView.spec.ts` loses two or three different tests per run
  under load and passes 148/148 in isolation. Flaky, and older than this card.
- The built-app DevTools check (128 vs 480 frames inside Morphos) was not
  independently re-run here; what I verified is the code path, the bundle, and
  that `measure.mjs` proves the same switch works from a main process.
  `win.json` / `win-128.json` are still untracked in the repo root — left for
  whoever cleans up, as the card notes.

## Log

- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-13 measured on Windows: the switch is worth −9,2 ms, exclusive mode and
  `IAudioClient3` are dead ends; switch set in `electron/main.ts` behind a tested
  decision, with an escape hatch (agent)
- 2026-08-13 status → review (agent)
- 2026-08-13 reviewed → pass; stays in `review` because this board has no
  `signoff` column — the move to `done` is the human's (agent)
- 2026-08-13 status → done (app)
