---
id: c0079
title: Turn into tauri app
status: discuss
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T22:36:39
epic: e12
---

## What

Evaluate — **on paper, no code** — whether Morphos should move from Electron to
**Tauri**, and write the finding into **`e12`'s `epic.md`** (this card points at
it). The deliverable is **options + a decision checklist, no verdict**: lay out
the trade-offs and the conditions under which Tauri is a yes/no, and leave the
call to the human.

Original motivations to explore:

* Smaller footprint altogether
* Deeper OS-Integration possible over the rust layer
* Could be better suited towards low latency requirements

> The initial trigger was the third point. I have one app in morphos that uses
> keys to trigger sounds. On Windows the latency from pushing the key and hearing
> the actual sound is significant. (I’d say somewhre from 50 to 150ms, but that’s
> just a gut feeling). On mac it is noticably smaller.

The latency motivation is **decoupled into its own card** (see c0081): Tauri uses
**WebView2 (Chromium)** on Windows, so the Web-Audio→WASAPI path — the likely
cause — is essentially unchanged by the shell. This card weighs Tauri on its
genuine merits (footprint, OS integration) against its costs.

## Acceptance criteria

- [ ] A decision write-up lands in **`.gello/epics/e12-tauri/epic.md`** (its
      *Goal* + *Definition of done*), and **c0079 links to it**.
- [ ] The doc addresses each motivation and whether Tauri actually delivers it —
      explicitly recording that **latency is likely unaffected** (WebView2 =
      Chromium) and is tracked in **c0081**, not here.
- [ ] The doc treats **identical cross-platform rendering as a hard requirement**
      and analyses the **three-webview divergence** (WebView2 / WKWebView /
      WebKitGTK) plus whether the app-isolation model (**sandboxed iframe + blob
      URL + postMessage bridge + CSP**) holds on each engine.
- [ ] The doc estimates migration cost against the assumed shape — a **full Rust
      rewrite** of the **~30 TS core modules + 27 IPC channels** (and the loss of
      the current ~1500-test TS suite) — and names the **footprint delta**
      (bundled Chromium vs OS webview) concretely.
- [ ] The doc ends with **options + a decision checklist** (yes/no trigger
      conditions), **no final verdict**.
- [ ] **No production code** changes — this card is analysis only.

## Discussion

Decisions (interviewed 2026-08-12):

- **Deliverable = decision doc, no code**, written into **`e12/epic.md`**; output
  is **options + criteria, no verdict** (the human keeps the call).
- **Latency decoupled → c0081.** It was the trigger, but is almost certainly not
  a shell effect: on Windows Tauri's WebView2 *is* Chromium, so Web Audio latency
  is the same; the real lever is a native/low-latency audio path, independent of
  Electron-vs-Tauri.
- **Identical cross-platform rendering is a hard requirement** — so the
  three-webview divergence and re-validating the security model per engine is the
  **central risk** the doc must weigh (likely the strongest argument against).
- **Assumed migration shape for costing = full Rust rewrite** of the core (the
  human's preferred end-state), i.e. the maximal-cost path — not a Node sidecar.

Rejected alternatives:

- **A code spike / prototype** — chose a paper decision first.
- **Node-sidecar migration** (keeps the TS core + tests, lower cost) — noted in
  the doc as an option, but the costing assumes the Rust rewrite the human wants.

Open questions for the doc to resolve:

- Concrete **footprint numbers** for Morphos (current Electron bundle vs a Tauri
  build).
- Whether **sandboxed-iframe isolation + blob URL + postMessage + CSP** behave
  identically on **WKWebView / WebKitGTK** — the security-critical unknown.
- How the **LLM-generation path** (`morphos:generate`/`agentEvent`) and **git via
  `child_process`** map onto a Rust backend.
- **Tauri v2 maturity** for the window features Morphos needs (frameless window,
  OS-correct traffic-light/caption layout, overlapping multi-window desktop).

Measured feedback from **c0081** (2026-08-12) — the latency motivation is now
settled with numbers, and it does **not** argue for Tauri:

- Keypress→sound is **~51 ms on Windows** vs **7,8–16,4 ms on macOS**. The whole
  gap is Chromium's audio output buffer (`outputLatency` 40 ms vs 5 ms); the
  app's own hit path is ≤ 0,8 ms on both.
- On Windows Chromium **ignores `latencyHint` entirely** (same 480-frame buffer
  for `balanced`, `interactive` and an explicit 0.001 s).
- WebView2 is the same Chromium with the same WASAPI backend, so **Tauri would
  inherit the identical 50 ms**. Both shells can pass the one cheap lever
  (`--audio-buffer-size`: Electron via `app.commandLine`, WebView2 via
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`), and even a native audio path is
  reachable from Electron via a native addon or sidecar.
- **Conclusion for this doc: strike latency from the list of Tauri arguments.**
  It should appear only as “explicitly not a reason”, with c0081 as the source.

## Log

- 2026-08-12 status → discuss (app)
- 2026-08-12 measured latency feedback from c0081 added (agent)
