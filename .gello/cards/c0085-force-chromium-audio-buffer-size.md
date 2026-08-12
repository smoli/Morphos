---
id: c0085
title: "Test --audio-buffer-size on Windows, then set it in main.ts"
status: inbox
tags: [audio, latency, performance]
depends: [c0081]
created: 2026-08-12
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

- [ ] Measured Windows numbers with and without `--audio-buffer-size`, stored in
      `tools/audio-latency/measurements/`.
- [ ] Either the switch is set in `electron/main.ts` (with the dropout trade-off
      considered), or it is recorded that it does not help.
- [ ] The exclusive-mode / `IAudioClient3` question from c0081 is answered.
- [ ] The outcome is fed back to c0081's recommendation and to c0079.
