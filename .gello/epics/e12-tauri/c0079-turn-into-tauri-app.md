---
id: c0079
title: Turn into tauri app
status: discuss
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T22:36:39
epic: e12
---

What about turning into a tauri app

Several motivations id like to explore

* Smaller footprint altogether
* Deeper OS-Integration possible over the rust layer
* Could be better suited towards low latency requirements


The initial trigger was the third point. I have one app in morphos that uses keys to trigger sounds. On Windows the latency from pushing the key and hearing the actual sound is significant. (I’d say somewhre from 50 to 150ms, but that’s just a gut feeling). On mac it is noticably smaller.

## Log

- 2026-08-12 status → discuss (app)
