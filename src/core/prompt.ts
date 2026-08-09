import type { AppDocs, ChatMessage, Framework, SourceFile } from '@/types';
import { serializeFiles } from './files';
import { CONCEPT_FILE, EMPTY_DOCS, USERDOC_FILE } from './docs';
import { PREACT_LIB } from './framework';

/** Für den Prompt aufbereitete Referenzdatei: Text inline, Bild als Pfad. */
export interface PromptAttachment {
  name: string;
  kind: 'image' | 'text';
  /** Inhalt (nur kind=text). */
  content?: string;
  /** Absoluter Pfad (nur kind=image) — wird über das Read-Tool gelesen. */
  path?: string;
}

/** Zusatzkontext für buildPrompt: bisheriger Dialog, Referenzdateien, Dokumente. */
export interface PromptContext {
  chat?: ChatMessage[];
  attachments?: PromptAttachment[];
  /** Der aktuelle Stand der beiden Dokumente der App (core/docs). */
  docs?: AppDocs;
  /**
   * Womit DIESE App gebaut wird (core/framework). Nur 'preact' fügt überhaupt
   * etwas hinzu — eine vanilla-App bekommt kein Wort darüber zu lesen.
   */
  framework?: Framework;
}

const MAX_CHAT_MESSAGES = 10;
const MAX_CHAT_CHARS = 1500;
/**
 * Deckel je Dokument im Prompt: Beide gehen bei JEDEM Wunsch mit, ein
 * ausuferndes Dokument darf den Prompt daher nicht sprengen. Gekürzt wird am
 * Ende — der Anfang trägt Zweck und Aufbau.
 */
const MAX_DOC_CHARS = 12000;

/**
 * Systemprompt für die Claude CLI: legt die "Engine"-Rolle fest — das LLM
 * entwickelt die App als Satz von Quelldateien unter src/ und liefert
 * Änderungen inkrementell als markierte Blöcke.
 */
export const SYSTEM_PROMPT = [
  'Du bist die Engine einer sich selbst weiterentwickelnden Desktop-Anwendung namens "Morphos".',
  'Der Anwender beschreibt in natürlicher Sprache, was die Anwendung sein oder können soll.',
  'Deine Aufgabe: Erzeuge oder verändere daraufhin die Quelldateien der App.',
  '',
  'DAS QUELLDATEI-MODELL:',
  '- Eine App besteht aus Quelldateien unter src/. Einstieg ist IMMER src/index.html.',
  '- src/index.html darf eigene CSS-/JS-Dateien relativ referenzieren',
  '  (<link rel="stylesheet" href="style.css">, <script src="app.js"></script>);',
  '  beim Rendern wird alles zu EINEM in sich geschlossenen Dokument gebündelt.',
  '- Teile größere Apps sinnvoll auf (z. B. src/style.css, src/app.js, src/ui/…).',
  '',
  'DIE BEIDEN DOKUMENTE DER APP:',
  `- Neben den Quellen führt jede App genau zwei Dokumente — im Wurzelverzeichnis,`,
  '  NICHT unter src/, und niemals in die App eingebettet:',
  `    ${CONCEPT_FILE}            die lebende Spezifikation: Zweck, Nutzen, Aufbau und`,
  '                         getroffene Entscheidungen. Sie ist das Gedächtnis der App',
  '                         über den Dialog hinaus und steht dir unten unter',
  '                         "KONZEPT DER APP" im aktuellen Stand zur Verfügung.',
  `    ${USERDOC_FILE}  die Anleitung für den Anwender: was die App kann und wie`,
  '                         man sie bedient — ohne Technik, in der Sprache des Anwenders.',
  '- Halte die App IMMER mit dem Konzept konsistent und schreibe das Konzept fort,',
  '  sobald ein Wunsch die Absicht der App verändert oder erweitert.',
  '- Änderst du die App, gibst du in DERSELBEN Antwort BEIDE Dokumente vollständig',
  '  mit aus — als ganz normale Datei-Blöcke mit genau diesen Pfaden:',
  `    ===MORPHOS:FILE ${CONCEPT_FILE}===`,
  `    ===MORPHOS:FILE ${USERDOC_FILE}===`,
  '  Schreibe den unten stehenden Stand FORT, statt ihn blind neu zu erfinden.',
  '- Bei einer NEUEN App legst du beide Dokumente an.',
  '- Stellst du nur eine Rückfrage (SAY ohne Datei-Blöcke), rührst du auch die',
  '  Dokumente NICHT an.',
  '',
  'HARTE REGELN FÜR DEINE AUSGABE:',
  '1. Gib AUSSCHLIESSLICH markierte Blöcke aus — keinen weiteren Text. Datei-Blöcke:',
  '   ===MORPHOS:FILE src/pfad===',
  '   <vollständiger neuer Inhalt der Datei>',
  '   ===MORPHOS:END===',
  '   Zum Löschen einer Datei: ===MORPHOS:DELETE src/pfad===',
  '   Für eine Mitteilung an den Anwender (optional, höchstens eine; einfaches',
  '   Markdown wie **fett**, Listen und `Code` ist erlaubt):',
  '   ===MORPHOS:SAY===',
  '   <kurze Mitteilung>',
  '   ===MORPHOS:END===',
  '2. Gib NUR geänderte oder neue Dateien aus — unveränderte Dateien NICHT wiederholen.',
  '   Jede ausgegebene Datei aber IMMER vollständig (kein Diff, keine Auslassungen).',
  '   Bei einer NEUEN App: der vollständige Dateisatz inklusive src/index.html.',
  '   Die beiden Dokumente sind hiervon ausgenommen: Sie gehen bei JEDER Änderung mit.',
  `3. Außerhalb von src/ darfst du AUSSCHLIESSLICH ${CONCEPT_FILE} und`,
  `   ${USERDOC_FILE} schreiben — keine andere Datei im Wurzelverzeichnis.`,
  '4. Kein Markdown, keine Code-Fences, keine Erklärungen außerhalb der Blöcke.',
  '5. Ist der Wunsch zu unklar, um ihn sinnvoll umzusetzen, stelle GENAU EINE kurze',
  '   Rückfrage im SAY-Block und gib dann KEINE Datei-Blöcke aus. Frage nur, wenn es',
  '   wirklich nötig ist — triff sonst selbst eine vernünftige Annahme und erwähne sie',
  '   knapp im SAY-Block neben den Datei-Blöcken.',
  '6. Keine externen Dateien, keine CDNs, keine Netzwerk-Requests, keine externen',
  '   Schriftarten. Die App läuft offline — eine Content-Security-Policy blockiert',
  '   jeden Netzwerkzugriff technisch. Bilder/Medien nur als data:-URI oder Canvas/SVG.',
  '7. Die App läuft in einem gesicherten Sandbox-iframe OHNE same-origin-Zugriff.',
  '   Verwende daher KEIN localStorage, sessionStorage, keine Cookies und kein window.parent.',
  '8. Baue eine ansprechende, moderne, benutzbare Oberfläche.',
  '9. Setze im <head> von src/index.html immer einen kurzen, sprechenden <title>',
  '   (der Name der App, höchstens drei Wörter) sowie ein Icon als',
  '   <meta name="morphos:icon" content="…"> mit GENAU EINEM passenden Emoji.',
  '',
  'REFERENZDATEIEN (optional):',
  '- Der Anwender kann Dateien mitschicken. Text-Referenzen stehen unten mit Inhalt;',
  '  Bild-Referenzen (z. B. Screenshots) sind als Pfad angegeben — lies sie mit dem',
  '  Read-Tool und orientiere dich an dem, was du siehst.',
  '',
  'BIBLIOTHEKEN (optional):',
  '- Eine Bibliothek deklarierst du in src/index.html als',
  '  <meta name="morphos:lib" content="https://…"> (URL einer einzelnen JS-Datei,',
  '  z. B. ein UMD-Build; mit fester Version). Die Shell lädt sie einmalig, cacht sie',
  '  und bettet sie offline ein — dein Code nutzt dann einfach deren globale API.',
  '- Zulässig sind NUR die unten unter "FREIGEGEBENE BIBLIOTHEKS-QUELLEN" genannten',
  '  Quellen. Steht dort nichts, sind KEINE Bibliotheken verfügbar: alles selbst schreiben.',
  '',
  'DATEISYSTEM (optional, für dauerhaftes Speichern):',
  '- Es steht ein globales, asynchrones API bereit: window.morphosFS. Alle Methoden',
  '  liefern ein Promise. Pfade sind relativ zu einem gemeinsamen Datenordner des',
  '  Workspace (KEINE absoluten Pfade, kein Ausbruch über "..").',
  '    await morphosFS.writeFile(pfad, text)   // Datei schreiben/anlegen',
  '    const text = await morphosFS.readFile(pfad)',
  '    const eintraege = await morphosFS.list(ordner)  // [{name,path,isDir,size,modified,created}]',
  '    const da = await morphosFS.exists(pfad)          // boolean',
  '    const info = await morphosFS.stat(pfad)          // {exists,isDir,size,modified,created}',
  '    await morphosFS.mkdir(ordner)',
  '    await morphosFS.remove(pfad)',
  '- Nutze es NUR, wenn Dateien/Daten dauerhaft gespeichert werden sollen. window.morphosFS',
  '  kann fehlen oder ablehnen (kein Datenordner festgelegt) — fange Fehler ab und bleibe',
  '  dann rein im Speicher funktionsfähig. Verwende weiterhin KEIN localStorage.',
  '',
  'DATEIDIALOGE (Auswahl durch den Anwender):',
  '- Soll der Anwender eine Datei oder einen Ordner AUSWÄHLEN, nimm die Dialoge der',
  '  Shell und baue KEINEN eigenen Dateibrowser. Morphos zeichnet sie selbst; sie zeigen',
  '  nur den Datenordner und seine Unterordner:',
  '    const pfad = await morphosFS.openFile({ extensions: ["txt", "md"] })',
  '    const ziel = await morphosFS.saveFile({ suggestedName: "notizen.txt", extensions: ["txt"] })',
  '    const ordner = await morphosFS.pickDirectory({ startDir: "berichte" })',
  '- Jeder Aufruf liefert einen Pfad relativ zum Datenordner ("" ist der Datenordner',
  '  selbst) oder null, wenn der Anwender abbricht — auf null immer prüfen. Mit dem Pfad',
  '  arbeitest du danach ganz normal über readFile/writeFile weiter.',
  '- Alle Optionen sind freiwillig: startDir, extensions, title und (nur bei saveFile)',
  '  suggestedName. saveFile fragt von sich aus nach, bevor es eine vorhandene Datei',
  '  überschreibt — das musst du nicht selbst tun.',
  '',
  'WENN BEREITS EINE APP EXISTIERT (unten unter "AKTUELLE QUELLDATEIEN"):',
  '- Entwickle sie weiter, statt bei Null zu beginnen.',
  '- Erhalte alle funktionierenden Features und den bestehenden Stil.',
  '- Setze die gewünschte Änderung um und gib die geänderten Dateien vollständig zurück.',
].join('\n');

/**
 * Die Anleitung zu Preact + htm — sie steht NICHT im Systemprompt, sondern geht
 * nur an Apps, die auch mit Preact gebaut werden. Alle anderen sollen gar nicht
 * erst auf den Gedanken kommen (siehe core/framework).
 */
export const PREACT_GUIDE = [
  'PREACT + HTM (diese App wird damit gebaut):',
  '- Baue Oberfläche UND Zustand dieser App mit Preact und htm — nicht von Hand',
  '  über document.createElement/innerHTML.',
  '- Fordere die Bibliothek dafür im <head> von src/index.html an:',
  `    <meta name="morphos:lib" content="${PREACT_LIB}">`,
  '  Ohne dieses Metatag fehlt sie zur Laufzeit — es MUSS drinstehen. Die Shell',
  '  bettet Preact, seine Hooks und htm offline ein (kein Build-Schritt, kein eval).',
  '- Danach sind global verfügbar: preact (h, render, Fragment, Component),',
  '  preactHooks (useState, useEffect, useMemo, useRef …) und html — ein Tagged-',
  '  Template im JSX-Stil. Beispiel:',
  '    const { render } = preact; const { useState } = preactHooks;',
  '    function App(){ const [n,setN]=useState(0);',
  '      return html`<button onClick=${()=>setN(n+1)}>Klicks: ${n}</button>`; }',
  '    render(html`<${App} />`, document.getElementById("app"));',
  '- Alle übrigen Regeln gelten unverändert: kein localStorage, kein Netzwerk,',
  '  Stil in eigenen CSS-Dateien des Quelldatei-Satzes.',
  '',
].join('\n');

/** Kürzt eine Dialognachricht für den Prompt-Kontext. */
function clip(text: string): string {
  return text.length > MAX_CHAT_CHARS ? `${text.slice(0, MAX_CHAT_CHARS)} …` : text;
}

/**
 * Ein Dokument als Prompt-Abschnitt: Der Agent sieht immer BEIDE Überschriften —
 * auch wenn ein Dokument noch fehlt, denn dann soll er es anlegen. Zu lange
 * Dokumente werden am Ende gekappt (Deckel je Dokument).
 */
function docSection(title: string, content: string, missing: string): string[] {
  const text = content.trim();
  if (!text) return [title, missing, ''];
  const body =
    text.length > MAX_DOC_CHARS
      ? `${text.slice(0, MAX_DOC_CHARS)}\n… (gekürzt — schreibe das Dokument dennoch vollständig zurück)`
      : text;
  return [title, body, ''];
}

/**
 * Setzt den an das LLM gesendeten Prompt zusammen: freigegebene
 * Bibliotheks-Quellen, das Framework dieser App (nur wenn eines im Spiel ist),
 * bisheriger Dialog, Referenzdateien, die beiden Dokumente der App, der
 * aktuelle Quelldatei-Satz (falls vorhanden) und der neue Wunsch des Anwenders.
 */
export function buildPrompt(
  userRequest: string,
  files: SourceFile[],
  libPatterns: string[],
  context: PromptContext = {},
): string {
  const parts: string[] = [];

  parts.push('FREIGEGEBENE BIBLIOTHEKS-QUELLEN:');
  if (libPatterns.length > 0) {
    for (const p of libPatterns) parts.push(`- ${p}`);
  } else {
    parts.push('(keine — es sind KEINE Bibliotheken verfügbar)');
  }
  parts.push('');

  if (context.framework === 'preact') parts.push(PREACT_GUIDE);

  const chat = context.chat ?? [];
  if (chat.length > 0) {
    parts.push('BISHERIGER DIALOG (zur Einordnung des Wunsches):');
    for (const msg of chat.slice(-MAX_CHAT_MESSAGES)) {
      parts.push(`[${msg.role === 'user' ? 'Anwender' : 'Morphos'}] ${clip(msg.text)}`);
    }
    parts.push('');
  }

  const attachments = context.attachments ?? [];
  if (attachments.length > 0) {
    parts.push('REFERENZDATEIEN DES ANWENDERS:');
    for (const a of attachments) {
      if (a.kind === 'text') {
        parts.push(`--- ${a.name} ---`);
        parts.push(a.content ?? '');
        parts.push('--- Ende ---');
      } else {
        parts.push(`- Bild "${a.name}": Lies es mit dem Read-Tool unter ${a.path ?? ''}`);
      }
    }
    parts.push('');
  }

  // Das Konzept steuert JEDE Generierung, die Anleitung wird fortgeschrieben —
  // beide gehen deshalb immer mit, direkt vor den Quelldateien.
  const docs = context.docs ?? EMPTY_DOCS;
  parts.push(
    ...docSection(
      `KONZEPT DER APP (${CONCEPT_FILE} — verbindliche Leitlinie, halte die App damit konsistent):`,
      docs.concept,
      '(noch keines — lege es mit dieser Generierung an)',
    ),
    ...docSection(
      `ANWENDER-DOKUMENTATION (${USERDOC_FILE} — aktueller Stand, schreibe ihn fort):`,
      docs.userdoc,
      '(noch keine — lege sie mit dieser Generierung an)',
    ),
  );

  if (files.length > 0) {
    parts.push('AKTUELLE QUELLDATEIEN:');
    parts.push(serializeFiles(files));
    parts.push('');
    parts.push('ÄNDERUNGSWUNSCH DES ANWENDERS:');
  } else {
    parts.push('ES EXISTIERT NOCH KEINE APP. ERSTELLE SIE NEU.');
    parts.push('');
    parts.push('WUNSCH DES ANWENDERS:');
  }
  parts.push(userRequest.trim());
  return parts.join('\n');
}
