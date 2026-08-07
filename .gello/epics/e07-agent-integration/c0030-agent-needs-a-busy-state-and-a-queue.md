---
id: c0030
title: Agent needs a busy state and a queue
status: discuss
created: 2026-08-06
updated: 2026-08-07
status-changed: 2026-08-07T22:37:49
epic: e07
---

Agent integration needs a busy state and a queue so the user does not run too many agents in parallel and burns through tokens.

When no agent slot is available, queue requests and show this to the user. 

With this the user should be able to switch apps, add prompts to them and leave the individual apps before the prompt is done. Show a "working" indicator on the app icons and some status info on how many agents are running

## Log

- 2026-08-07 status → discuss (app)
