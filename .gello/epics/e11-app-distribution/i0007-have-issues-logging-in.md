---
id: i0007
title: Have issues logging in
status: in-progress
type: issue
ref: c0074
epic: e11
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T20:53:34
---

used gh auth login to log into GitHub using the browser method.

Get this error when trying to load an app

Das Repository konnte nicht geholt werden: fatal: could not read Username for 'https://github.com': terminal prompts disabled

## Ursache

`gh auth login` legt das Token **in gh** ab (Keyring) — in der Git-Konfiguration
steht davon nichts. Das täte erst `gh auth setup-git`, und danach fragt niemand.
git kannte hier also nur den `osxkeychain`-Helfer aus der System-Konfiguration
von Xcode, der für github.com nichts hinterlegt hat; also wollte git nachfragen —
und lief in das `GIT_TERMINAL_PROMPT=0` aus c0074. Aus Sicht des Anwenders:
„Ich bin doch angemeldet."

Nachgestellt mit einem privaten Repository (`smoli/morphos-looper`): Der Klon,
wie Morphos ihn absetzte, scheiterte wortgleich; mit gh in der Helfer-Kette kam
er durch.

## Akzeptanzkriterien

- [x] Wer mit `gh auth login` angemeldet ist, kann ein **privates** Repository
      über https holen, ohne zusätzlich `gh auth setup-git` aufzurufen.
- [x] Die eigenen Credential-Helfer des Anwenders werden **zuerst** gefragt; gh
      ist nur der Nachschlag. Ohne gh bleibt alles wie bisher.
- [x] Morphos sieht das Token **nie** und speichert nichts davon — git holt es
      sich bei gh.
- [x] Steht wirklich kein Zugang bereit, sagt die Meldung, **was fehlt und wo es
      herkommt** — statt „could not read Username … terminal prompts disabled".
      Über ssh sagt sie das Passende (Schlüssel, ssh-agent), nicht „gh auth login".
- [x] Unit-Tests für die reinen Teile; dass git die Argumente wirklich annimmt
      und den Helfer ruft, prüft ein Test mit einem untergeschobenen `gh`.

## Notes

- `core/gitstore`: `ghCredentialArgs(url, ghPath)` (rein) erzeugt
  `-c credential.<schema>://<host>.helper=!'<pfad>' auth git-credential` — nur
  für http(s)-Adressen und nur auf die Gegenstelle DIESER Adresse bezogen (mit
  Port, ohne Benutzer, kleingeschrieben). Über `-c` steht der Helfer in der
  Rangfolge **hinter** allem Konfigurierten, ist also der Nachschlag, nicht der
  Vordrängler. Kennt gh die Gegenstelle nicht (gitlab.com…), schweigt der Helfer
  und git macht weiter wie ohne ihn — nachgeprüft, es kommt nicht einmal
  zusätzliches Rauschen in die Fehlermeldung.
- `findGh(env, places)` sucht die CLI im PATH und danach an den üblichen Plätzen
  (`/opt/homebrew/bin`, `/usr/local/bin`, …) — ein aus dem Dock gestartetes
  Programm erbt den PATH der Anmeldeschale nicht. Beide Parameter gibt es nur,
  damit der Test nicht von der Maschine abhängt, auf der er läuft.
- Der Pfad geht **einfach gequotet** in die Helfer-Zeile (git führt sie über die
  Shell aus); Steuerzeichen im Pfad → gar kein Helfer.
- `core/appimport`: `cloneErrorMessage(reason, url)` (rein) übersetzt die zwei
  Fälle, in denen git nur „keine Zugangsdaten" meint (https bzw. ssh), in eine
  Meldung mit Weg — alles Übrige bleibt wörtlich, da weiß git es besser.
- Bewusst **nicht** getan: `gh auth setup-git` von Morphos aus aufrufen (das
  schriebe in die Git-Konfiguration des Anwenders) oder das Token selbst holen
  und in die URL schreiben. Die Haltung aus c0074 („kein Zugang-Handling in
  Morphos") bleibt: Morphos sagt git nur, wen es fragen soll.
- Nebenwirkung, wie bei `gh auth setup-git` auch: Nach erfolgreichem Klon meldet
  git den Zugang der ganzen Helfer-Kette (`credential approve`), ein
  osxkeychain-Eintrag entsteht also mit. Kein neuer Zustand gegenüber dem von
  GitHub empfohlenen Weg.

## Log

- 2026-08-12 status → in-progress (agent)
