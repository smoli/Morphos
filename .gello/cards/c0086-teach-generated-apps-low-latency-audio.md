---
id: c0086
title: "Teach generated apps the low-latency audio pattern"
status: inbox
tags: [audio, latency, prompt]
depends: [c0081]
created: 2026-08-12
---

# Teach generated apps the low-latency audio pattern

c0081 found that the app's own hit path is never the problem (≤ 0,8 ms measured)
— but the `latencyHint` still buys **−11,7 ms on macOS**, and it is free. Right
now nothing tells a generated sound app to ask for it, so whether an app is fast
on macOS is luck.

## What

Put the pattern into the generation prompt (`src/core/prompt.ts`), so every app
that makes sound is born with it:

- `new AudioContext({ latencyHint: 'interactive' })`
- sounds pre-decoded once into `AudioBuffer`s, played through a fresh
  `AudioBufferSourceNode` per hit — never `decodeAudioData` on the hit path
- trigger on `keydown`, not `keyup`; nothing expensive between event and
  `start()`

Keep it short — it is three lines of guidance, and it should only fire for apps
that actually make sound, not bloat every prompt.

Note this is a *comfort* fix, not the Windows fix: on Windows the hint is
ignored entirely (that is c0085). Worth doing anyway because it is free and it
is the correct way to write the code.

## Acceptance criteria

- [ ] The prompt carries the pattern, with a test covering that it appears.
- [ ] A newly generated sound app measurably uses `interactive` (check with
      `tools/audio-latency`).
