import type { AheadBehind, RemoteStatus } from '@/types';

/**
 * Rein: wie der eigene Stand zur Gegenstelle steht — und was sich damit tun
 * lässt (c0082).
 *
 * Die Historie einer Morphos-App ist eine Kette VOLLSTÄNDIGER Schnappschüsse:
 * Jede Generierung legt den ganzen Stand als Commit ab. Zwei solche Ketten
 * lassen sich nicht zusammenführen — ein zeilenweiser Merge in erzeugtem
 * Quelltext ergibt keinen Sinn und hinterließe Konfliktmarken mitten in der
 * laufenden App. Der Abgleich kennt darum nur den Vorlauf: schieben, wenn die
 * Gegenstelle nichts Neues hat; vorspulen, wenn hier nichts Neues ist. Sind
 * BEIDE Seiten weitergegangen, hält Morphos an und rührt nichts an — das
 * Auflösen ist eine eigene Sache (c0084).
 *
 * Alles hier ist Rechnung auf Zahlen und Texten; das Reden mit git steht in
 * core/gitstore, der Ablauf im Hauptprozess.
 */

/** Wie der eigene Stand zur Gegenstelle steht (nach dem letzten Holen). */
export type SyncState = 'unknown' | 'synced' | 'ahead' | 'behind' | 'diverged';

/** Das Zeichen an der Kachel: was dasteht und was der Tooltip dazu sagt. */
export interface RemoteBadge {
  text: string;
  title: string;
}

const NO_REMOTE = 'Diese App hat keine Gegenstelle (origin).';

/**
 * Die Zählung aus `git rev-list --left-right --count HEAD...@{u}`: links, was
 * nur HIER liegt (ahead), rechts, was nur auf der Gegenstelle liegt (behind).
 * Alles, was nicht genau zwei Zahlen sind, gilt als „nicht gezählt“.
 */
export function parseAheadBehind(out: string): AheadBehind | null {
  const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(out);
  if (!match) return null;
  return { ahead: Number(match[1]), behind: Number(match[2]) };
}

/** Die Lage in einem Wort — ungezählt heißt „unknown“, nicht „gleich“. */
export function syncState(status: RemoteStatus | null | undefined): SyncState {
  const ahead = status?.ahead;
  const behind = status?.behind;
  if (typeof ahead !== 'number' || typeof behind !== 'number') return 'unknown';
  if (ahead > 0 && behind > 0) return 'diverged';
  if (ahead > 0) return 'ahead';
  if (behind > 0) return 'behind';
  return 'synced';
}

/**
 * Das Zeichen an der Kachel. Es steht für den Stand des LETZTEN Holens — geholt
 * wird nur auf Geheiß (Menü, Push, Pull), nie im Hintergrund. Vor dem ersten
 * Nachsehen sagt es darum nur, DASS es eine Gegenstelle gibt.
 *
 * Eine App ohne Gegenstelle bekommt gar keines (das Veröffentlichen ist c0083).
 */
export function remoteBadge(status: RemoteStatus | null | undefined): RemoteBadge | null {
  if (!status?.hasRemote) return null;
  const state = syncState(status);
  // Ein Fehlschlag verdeckt eine Zählung nicht: Was zuletzt gezählt wurde,
  // bleibt die bessere Auskunft als ein Warnzeichen.
  if (state === 'unknown') {
    return status.error
      ? { text: '⚠', title: status.error }
      : { text: '⇅', title: 'Gegenstelle vorhanden — noch nicht nachgesehen.' };
  }
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;
  switch (state) {
    case 'ahead':
      return { text: `↑${ahead}`, title: `${ahead} eigene Version(en) sind noch nicht auf der Gegenstelle.` };
    case 'behind':
      return { text: `↓${behind}`, title: `${behind} neue Version(en) liegen auf der Gegenstelle.` };
    case 'diverged':
      return {
        text: `↑${ahead}↓${behind}`,
        title: `Beide Seiten sind weitergegangen: ${ahead} hier, ${behind} auf der Gegenstelle.`,
      };
    default:
      return { text: '✓', title: 'Gleichstand mit der Gegenstelle.' };
  }
}

/**
 * Der Grund, warum jetzt nicht geschoben wird — leer heißt: schieben. Ist die
 * Gegenstelle weiter, wird NICHT geschoben: Ein erzwungener Push würde fremde
 * Versionen aus der Kette werfen. Ungezählt wird es versucht; dann lehnt git
 * selbst ab (siehe nonFastForward).
 */
export function pushProblem(status: RemoteStatus | null | undefined): string | null {
  if (!status?.hasRemote) return NO_REMOTE;
  switch (syncState(status)) {
    case 'behind':
    case 'diverged':
      return 'Die Gegenstelle ist weiter als dieser Stand — erst ziehen (Pull), dann schieben.'
        + ' Morphos schiebt niemals mit Gewalt.';
    case 'synced':
      return 'Auf der Gegenstelle steht schon alles.';
    default:
      return null;
  }
}

/**
 * Der Grund, warum jetzt nicht gezogen wird — leer heißt: vorspulen. Sind beide
 * Seiten weitergegangen, geschieht ausdrücklich NICHTS: kein Merge, kein
 * Rebase, keine Konfliktmarken im erzeugten Quelltext (Auflösung: c0084).
 */
export function pullProblem(status: RemoteStatus | null | undefined): string | null {
  if (!status?.hasRemote) return NO_REMOTE;
  switch (syncState(status)) {
    case 'diverged':
      return 'Beide Seiten sind weitergegangen — hier UND auf der Gegenstelle.'
        + ' Zusammenführen lassen sich erzeugte Stände nicht, darum ändert Morphos hier nichts.';
    case 'synced':
    case 'ahead':
      return 'Auf der Gegenstelle steht nichts Neues.';
    default:
      return null;
  }
}

/** So klingt es, wenn git einen Push ablehnt, weil die Gegenstelle weiter ist. */
const REJECTED = /\[rejected\]|non-fast-forward|fetch first|Updates were rejected/i;

export function nonFastForward(reason: string): boolean {
  return REJECTED.test(reason);
}

/** Die Gegenstelle einer Adresse, so wie der Anwender sie kennt (`github.com`). */
export function hostOf(url: string): string {
  const value = url.trim();
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/(?:[^/@\s]*@)?([^/?#\s]+)/.exec(value);
  if (scheme) return scheme[1];
  const scp = /^[^@\s]+@([^:\s]+):/.exec(value);
  return scp ? scp[1] : 'der Gegenstelle';
}

/** git kann nicht fragen (siehe gitstore NON_INTERACTIVE) — so klingt das dann. */
const NO_ACCESS = /could not read Username|could not read Password|Authentication failed|terminal prompts disabled|Invalid username or password|repository .* not found|Repository not found|403 Forbidden|401 Unauthorized/i;

/** Dasselbe über ssh: kein Schlüssel, keiner der passt, keine Rückfrage. */
const NO_KEY = /Permission denied \(publickey|Host key verification failed|Could not read from remote repository|Permission denied, please try again/i;

/**
 * Aus dem Klagelaut von git eine Meldung machen, mit der der Anwender etwas
 * anfangen kann (i0007) — oder `null`, wenn es gar nicht um den Zugang geht;
 * dann weiß git es besser und sein Wortlaut bleibt stehen.
 *
 * Zwei Wege gibt es, und sie sind verschieden: über https hilft die GitHub-CLI
 * (Morphos fragt sie von sich aus, siehe gitstore), über ssh nur ein
 * hinterlegter Schlüssel. Dieselbe Auskunft gilt fürs Holen einer App
 * (core/appimport) wie fürs Schieben und Ziehen (c0082).
 */
export function accessProblem(reason: string, url: string): string | null {
  const host = hostOf(url);
  const ssh = !/^https?:\/\//i.test(url.trim());
  if (ssh && NO_KEY.test(reason)) {
    return `Kein Zugang zu ${host}: Der SSH-Schlüssel wird nicht angenommen (oder es gibt das Repository dort nicht).`
      + ` Prüfe im Terminal „ssh -T git@${host}" — ein Schlüssel mit Passwort braucht einen laufenden ssh-agent,`
      + ' denn Morphos fragt bewusst nicht nach.';
  }
  if (NO_ACCESS.test(reason) || NO_KEY.test(reason)) {
    return `Kein Zugang zu ${host}: Entweder ist das Repository privat und es liegt kein Zugang dafür bereit,`
      + ' oder es gibt diese Adresse nicht.'
      + ` Für GitHub genügt „gh auth login" im Terminal (Morphos fragt die GitHub-CLI von sich aus);`
      + ' sonst hilft ein eingerichteter Credential-Helfer oder die SSH-Adresse (git@…) mit hinterlegtem Schlüssel.';
  }
  return null;
}

/** Wobei es war, als es schiefging. */
const DOING = {
  fetch: 'Die Gegenstelle konnte nicht abgefragt werden',
  push: 'Der Stand konnte nicht zur Gegenstelle geschoben werden',
  pull: 'Der Stand konnte nicht von der Gegenstelle geholt werden',
} as const;

/**
 * Die Meldung zu einem gescheiterten Abgleich. Die Absage wegen einer weiter
 * gelaufenen Gegenstelle bekommt ihren eigenen Satz — sie ist kein Fehler,
 * sondern der Hinweis, erst zu ziehen.
 */
export function syncErrorMessage(reason: string, url: string, kind: keyof typeof DOING): string {
  if (kind === 'push' && nonFastForward(reason)) {
    return 'Die Gegenstelle ist weiter als dieser Stand — erst ziehen (Pull), dann schieben.'
      + ' Morphos schiebt niemals mit Gewalt.';
  }
  return accessProblem(reason, url) ?? `${DOING[kind]}: ${reason}`;
}

/**
 * Der verfolgte Zweig aus dem, was `branch.<zweig>.merge` sagt
 * (`refs/heads/main` → `main`) — leer, wenn das kein Zweig ist. Was hier
 * durchkommt, geht als Teil eines Refspec an git; darum nichts mit Leerzeichen,
 * führendem „-“ oder aus einem anderen Namensraum.
 */
export function upstreamBranchName(mergeRef: string): string {
  const value = mergeRef.trim();
  const name = value.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : value;
  if (!name || name.startsWith('-') || name.startsWith('refs/')) return '';
  if (/[\s~^:?*[\\]/.test(name)) return '';
  return name;
}

/**
 * Steht in dieser `.git/config` eine Gegenstelle namens `origin`? So findet die
 * Kachelliste heraus, ob eine App überhaupt zum Abgleichen taugt — ohne für
 * jede App einen git-Prozess zu starten und ohne jeden Netzverkehr. Was
 * tatsächlich geschoben wird, fragt danach ohnehin git selbst.
 */
export function hasOriginSection(config: string): boolean {
  return /^\s*\[remote "origin"\]/m.test(config);
}
