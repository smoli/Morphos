---
id: c0103
title: Add API for downloading a file to the host
status: discuss
created: 2026-08-16
updated: 2026-08-16
status-changed: 2026-08-16T21:55:14
---

## What

A new bridge API that lets an app **hand the host a file** — content it produced,
saved to the user's **real machine** outside the app's data folder. Unlike
`saveFile` (which stays inside the granted data folder and returns a relative
path), `download` is a deliberate, **user-mediated escape** from the sandbox: the
shell shows the **native OS save dialog**, the user picks the location and
confirms, and the shell writes the app-supplied bytes there.

- **Method:** `morphosFS.download(filename, data, options?)` — `filename` is a
  *suggestion*; `data` is text **or** binary; `options` may carry extension
  filters (like `saveFile`).
- **Authorization:** the **native save dialog per call** is the consent — no
  standing permission; the app never names an absolute host path.
- **Binary:** the bridge gains a binary path (`string | ArrayBuffer | Uint8Array
  | Blob`).

## Acceptance criteria

- [ ] `window.morphosFS.download(filename, data, options?)` exists and, **per
      call**, shows the native OS save dialog seeded with the suggested
      `filename`; the file is written **only** to the user-chosen location.
- [ ] The destination is chosen **solely by the user** via the dialog — the app
      cannot pass an absolute/host path, and **no download happens without the
      dialog** (no standing permission, no silent write).
- [ ] **Text and binary** payloads work: `data` accepts `string` and binary
      (`ArrayBuffer`/`Uint8Array`/`Blob`), written byte-exact.
- [ ] **Cancel** resolves cleanly (cancelled/null), writing nothing; errors
      surface without crashing the app.
- [ ] `options` supports a suggested filename + **extension filters** (reusing the
      dialog's `normalizeExtensions`/`sanitizeFileName`).
- [ ] The dialog is **modal to the requesting app window**; other windows stay
      usable.
- [ ] `saveFile` is **unchanged** (in-sandbox, relative path); the iframe sandbox
      stays **without `allow-downloads`** — the write goes through the bridge, not
      a browser download.
- [ ] Pure pieces (filename/extension sanitising, the request/response contract)
      covered by **unit tests**; the native dialog + write live in the main
      process.

## Discussion

Decisions (interviewed 2026-08-16):

- **Native save dialog per download** is the trust model — per-file user consent,
  no standing permission; matches the browser download model and is the only
  sanctioned way for a sandboxed app to write **outside** its access root.
- **New distinct method** `download`, separate from `saveFile`, so the two trust
  behaviours never blur.
- **Text + binary** — the bridge (today string-only) gains a binary path so real
  exports (images, PDFs, zips) work.

Rejected alternatives:

- **Silent save to a Downloads folder** (even permission-gated) — hands a
  sandboxed generated app unattended write-out; the per-file dialog is safer.
- **Overloading `saveFile`** with an escape flag — two very different trust
  behaviours on one call.

Open questions / notes:

- **Binary transport:** carry binary via structured clone
  (`ArrayBuffer`/`Uint8Array`/`Blob`) rather than base64 — avoids ~33 % bloat over
  `postMessage`; confirm at build. Large payloads have a practical size ceiling —
  note it.
- **e14 parity:** the hosted standalone runtime (e14) should implement `download`
  as a **real browser download** (`showSaveFilePicker` / `<a download>`) — the
  web-native equivalent, so apps behave the same hosted or in-shell.
- **Handler:** a new main-process path (e.g. `morphos:download`) = `showSaveDialog`
  → `fs.writeFile` to the chosen absolute path, beside the existing dialog
  handling.

## Log

- 2026-08-16 status → discuss (app)
