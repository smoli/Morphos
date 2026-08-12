---
id: i0007
title: Have issues logging in
status: review
type: issue
ref: c0074
epic: e11
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T21:02:22
usage-tokens: 30541
usage-cost: 2.891268
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

## Review

### 2026-08-12T21:04:56 — pass

Checked: alle fünf Akzeptanzkriterien am Code, der Diff von 2d2f490, `npm test`,
`npm run typecheck` (ein Lint-Skript gibt es in `package.json` nicht),
dazu drei eigene Gegenproben mit dem echten git und der echten gh-CLI.

- Kriterium 1 (privates Repository über https ohne `gh auth setup-git`)
  gegengeprüft, nicht nur gelesen: `git -c credential.helper= -c
  "credential.https://github.com.helper=!'/opt/homebrew/bin/gh' auth
  git-credential" clone -- https://github.com/smoli/morphos-looper.git` — also
  genau die Argumente aus `ghCredentialArgs` — kam durch; derselbe Klon ohne das
  `-c`-Paar scheiterte wortgleich mit „could not read Username … terminal
  prompts disabled".
- Kriterium 2 (eigene Helfer zuerst) gegengeprüft: mit einem `credential.helper`
  in `~/.gitconfig` und dem gh-Helfer per `-c` antwortete der Helfer des
  Anwenders, der gh-Helfer wurde nicht gefragt; erst ohne ihn kam gh zum Zug —
  `-c` steht in der Rangfolge also tatsächlich hinten. Ohne gh liefert
  `ghCredentialArgs` `[]` und `cloneRepo` setzt denselben Befehl ab wie zuvor
  (`gitstore.ts:127`). Auch die Notiz „bei fremder Gegenstelle kein zusätzliches
  Rauschen" stimmt: ein gitlab.com-Klon mit und ohne gh-Helfer ergibt Zeichen für
  Zeichen dieselbe Fehlermeldung.
- Kriterium 3 (Token nie bei Morphos): `ghCredentialArgs` erzeugt nur eine
  Konfigurationszeile, kein Aufruf holt ein Token, nichts wird geschrieben; git
  ruft gh selbst. Der Klon läuft weiter über `runGit`, ohne neue Umgebung.
- Kriterium 4 (Meldung mit Weg): `cloneErrorMessage` (`appimport.ts:113`) hängt
  am einzigen Klon-Aufrufer (`appimport.ts:246-252`), trennt https von ssh und
  reicht alles Übrige wörtlich durch — vier Tests in `appimport.spec.ts` decken
  https, abgelehnte Anmeldung, ssh und den Durchreichfall ab.
- Kriterium 5 (Tests): reine Teile in `gitstore.spec.ts` (Gegenstelle mit Port,
  Grossschreibung, Benutzeranteil; ssh/git/file/Pfad; fehlendes gh; Quoting und
  Steuerzeichen im Pfad) und `findGh` gegen ein untergeschobenes Verzeichnis.
  Die Verdrahtung prüft `„lässt git den Zugang wirklich bei gh holen"` mit einem
  echten `git credential fill` und einem untergeschobenen `gh` — kein Mock der
  Stelle, an der der Fehler lag.
- Diff bleibt im Rahmen: vier Dateien, nur `gitstore` und `appimport` plus deren
  Tests, keine Fremdänderung, kein Debug-Rest, kein `.only`/`.skip` ausser dem
  sachlichen `it.skipIf(process.platform === 'win32')` am Shell-Helfer-Test.
- Checks grün: `npm test` 1484 Tests in 80 Dateien, alle bestanden;
  `npm run typecheck` ohne Ausgabe.
- Zwei Kleinigkeiten, kein Grund zum Rückweisen: (a) über ssh greift die
  Schlüssel-Meldung an `NO_KEY`; eine ssh-Fehlermeldung, die nur „Repository not
  found" enthält, ohne die übliche Zeile „Could not read from remote
  repository", bekäme noch den gh-Text — git hängt die Zeile praktisch immer an.
  (b) `runGit`s Notmeldung „git ${args[0]} endete mit Code …" sagt beim Klon nun
  „git -c …", falls git gar nichts auf stderr schreibt.

## Log

- 2026-08-12 status → in-progress (agent)
- 2026-08-12 behoben in 2d2f490 (agent)
- 2026-08-12 status → review (agent)
