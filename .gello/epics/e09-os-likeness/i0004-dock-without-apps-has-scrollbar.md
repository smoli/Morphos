---
id: i0004
title: Dock without apps has scrollbar
status: review
type: issue
ref: c0052
epic: e09
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T10:24:22
---

![image](../../assets/i0004/image.png)

it should not

## Notes

- Ursache: `.dock` war mit `overflow-x: auto` eine rollbare Leiste (`overflow-y:
  visible` galt daneben ohnehin nicht — CSS macht daraus `auto`). Die Namens-
  blase jedes Platzes (`.dock-name`) steht immer im Baum, nur unsichtbar, und
  ragt über den rechten Rand hinaus. Sie zählt zum rollbaren Inhalt — also gab
  es dauerhaft einen Balken, selbst wenn nur das ＋ dastand.
- Behoben: Das Dock rollt nicht mehr (`overflow: visible`). Wird es eng, bricht
  es dank `flex-wrap: wrap` mittig in eine zweite Reihe um, statt zu rollen. Als
  Nebenwirkung werden Namensblase und Hover-Vergrößerung nicht mehr beschnitten.
- Geprüft mit einem Test, der die CSS-Regel im Quelltext nachschlägt (jsdom
  rechnet kein SFC-CSS aus): `npx vitest run` (1038 Tests grün) und
  `npx vue-tsc --noEmit`.

## Log

- 2026-08-09 status → in-progress (agent)
- 2026-08-09 `.dock` rollt nicht mehr (Test rot → grün, `overflow: visible` +
  `flex-wrap: wrap`)
- 2026-08-09 status → review (agent)
