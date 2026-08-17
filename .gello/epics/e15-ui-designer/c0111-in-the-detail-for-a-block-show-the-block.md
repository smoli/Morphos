---
id: c0111
title: In the detail for a block show the block hierarchy
status: in-progress
ref: c0110
epic: e15
created: 2026-08-17
updated: 2026-08-17
status-changed: 2026-08-17T21:13:33
---

# In the detail for a block show the block hierarchy

## What

Das Feld zum ausgewählten Kasten (`DesignInspector`, c0108) sagt bisher nur,
wie der Kasten heißt — nicht, wo er im Baum steht. Es soll seinen Weg von der
Wurzel bis zu ihm zeigen und die Kästen, die er unmittelbar enthält; ein Klick
darauf wechselt zu jenem Kasten.

## Acceptance criteria

- [ ] Das Feld zeigt den Weg des ausgewählten Kastens von der Wurzel bis zu ihm
      (`Entwurf › Inhalt › Liste`); ein Wurzelkasten steht unmittelbar am
      Entwurf.
- [ ] Es zeigt die unmittelbaren Kinder des Kastens; hat er keine, steht dort
      nichts.
- [ ] Ein Klick auf einen Vorfahren oder ein Kind wählt jenen Kasten aus — das
      Feld redet fortan von ihm.
- [ ] Der Weg kommt aus `core/design` (ein Helfer, keine zweite Rechnung in der
      Ansicht).
- [ ] Ein `.spec.ts` deckt Weg, Kinder und das Wechseln ab.

## Log

- 2026-08-17 status → in-progress (agent)
