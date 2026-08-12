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

**Update from c0085 (2026-08-13) — it is no longer only comfort.** Morphos now
forces Chromium's audio buffer to 128 frames process-wide, which is worth
−9,2 ms on Windows and −8,6 ms on macOS *for free*. But a page that asks for a
**numeric** `latencyHint` opts out of it: measured on Windows, the
`latencyHint: 0.001` arm kept 480 frames and 52,0 ms while `'interactive'` and
`'balanced'` dropped to 128 frames and 42,8 ms. So the prompt must say
`'interactive'` **and rule out a number** — a generated app that tries to be
clever loses 9 ms on every platform.

## Acceptance criteria

- [ ] The prompt carries the pattern, with a test covering that it appears.
- [ ] The prompt rules out a *numeric* `latencyHint` (it defeats the shell's
      forced buffer — c0085), with a test.
- [ ] A newly generated sound app measurably uses `interactive` (check with
      `tools/audio-latency`).
