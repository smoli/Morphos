---
id: c0081
title: "Investigate keypress→sound latency (Windows)"
status: ready
created: 2026-08-12
tags: [audio, latency, performance]
status-changed: 2026-08-12T23:00:00
epic: e12
order: 10
updated: 2026-08-12
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

- [ ] A **measured** keypress→sound figure on Windows and macOS (method noted),
      replacing the gut estimate.
- [ ] The dominant contributor is identified (Web Audio output buffer vs input
      event vs per-hit decode/scheduling).
- [ ] The cheapest web-only mitigation is tried and its measured effect recorded.
- [ ] A recommendation: web-side fix suffices, or a native audio path is needed
      (with the finding fed back to c0079 if it argues for Rust).

## Discussion

- Split out of **c0079** (Tauri): latency was the trigger for exploring Tauri,
  but is almost certainly a Web-Audio/WASAPI issue, not a shell issue.
- Open: is this general (all sound apps) or specific to the one app's code? The
  measurement should use a minimal repro to separate the platform floor from the
  app's own scheduling.

## Log

- 2026-08-12 created (decoupled from c0079)
- 2026-08-12 status → ready (app)
