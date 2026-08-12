---
id: c0077
title: Create a readme for an app
status: in-progress
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T21:23:31
epic: e11
---

Add the option to create a Readme for the app.

Structure

```
<App Icon centered>

<App Name>

<Quick description of what it is and does.>

# Details

<Reference to user documentation and concept file>

# Morphos

<info on the minimal morphos version/commit this needs to work>


```

## What

Every Morphos app **is** its own git repo (e11: push it to a remote, clone it
back with c0074) — so it needs a **front page**: a `README.md` in the app folder
that shows the app's icon and name, says in a sentence what it is, points to its
two documents and names the Morphos version it came from. Written by the
**shell** from what it already knows (manifest + `concept.md`), not by the LLM,
on an explicit action per app — and committed, so it travels with a push.

## Acceptance criteria

- [x] A per-app action **„Readme erstellen“** (context menu of the app tile)
      writes `README.md` into the app folder; success and failure are reported
      as a toast. Running it again **rewrites** the file (idempotent).
- [x] The README follows the card's structure: **icon centered**, the **app
      name**, a **short description**, a **Details** section linking
      `concept.md` and `userdocumentation.md`, and a **Morphos** section naming
      the version/commit the app needs.
- [x] The short description comes from the app's **`concept.md`** (first
      paragraph, headings/code fences skipped, capped), falling back to
      `userdocumentation.md` and then to a neutral line; a link to a **missing**
      doc is left out.
- [x] An **image icon** travels as a real file next to the README (`icon.png`,
      `.jpg`, `.gif`, `.webp`) so it shows on a repo page; an **emoji** icon is
      rendered centered inline. A stale icon file of an earlier README is
      removed.
- [x] README (and icon file) are **committed** to the app's repo — a clone
      brings them along.
- [x] It works for a **closed** app (manifest and docs are read from disk), and
      only inside a **known workspace folder** (like `diskUsage`/`importApp`);
      an unknown folder or an app without `app.json` is refused with a clear
      message.
- [x] `README.md` stays **shell-written**: the LLM's file protocol still rejects
      it, and a generation neither deletes nor overwrites it.
- [x] Building the readme (structure, description extraction, icon asset,
      version line) and the write+commit are covered by **unit tests**, the menu
      entry and the store action by **component/store tests**.

## Log

- 2026-08-12 status → discuss (app)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
