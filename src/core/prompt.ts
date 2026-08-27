import type { ChatMessage, ElementRef, Framework } from '@/types';
import { CONCEPT_FILE, USERDOC_FILE } from './docs';
import { mcpToolId } from './mcptools';
import { PREACT_LIB } from './framework';
import { formatElementRefs } from './pick';
import { DESIGN_FILE, hasContent, type Block, type Design } from './design';
import { ASSETS_DIR, type AssetInfo } from './assets';

/** Für den Prompt aufbereitete Referenzdatei: Text inline, Bild als Pfad. */
export interface PromptAttachment {
  name: string;
  kind: 'image' | 'text';
  /** Inhalt (nur kind=text). */
  content?: string;
  /** Absoluter Pfad (nur kind=image) — wird über das Read-Tool gelesen. */
  path?: string;
}

/** Zusatzkontext für buildPrompt: bisheriger Dialog, Referenzdateien, Framework. */
export interface PromptContext {
  chat?: ChatMessage[];
  attachments?: PromptAttachment[];
  /** In der laufenden App markierte Elemente, auf die sich der Wunsch bezieht (core/pick). */
  elements?: ElementRef[];
  /**
   * Womit DIESE App gebaut wird (core/framework). Nur 'preact' fügt überhaupt
   * etwas hinzu — eine vanilla-App bekommt kein Wort darüber zu lesen.
   */
  framework?: Framework;
  /**
   * Steht im Arbeitsverzeichnis schon eine App? Ihre Dateien gehen NICHT in den
   * Prompt — der Agent liest sie selbst (c0087).
   */
  hasApp?: boolean;
  /**
   * Die zu DIESEM Wunsch mitgeschickten Beigaben der App (e16/c0118) — nur die
   * Auskunft über sie, nie ihre Bytes. Anders als eine Referenzdatei
   * (`attachments`) liegt eine Beigabe schon in der App: Sie wird über ihren
   * Pfad in der App genannt, und ein Bild liest der Agent unter genau diesem
   * Pfad — sein Arbeitsverzeichnis IST der Ordner der App.
   */
  assets?: AssetInfo[];
  /**
   * Der UI-Entwurf der App (core/design). Anders als die Quellen geht er sehr
   * wohl in den Prompt — nicht als JSON, sondern als lesbarer Baum: Er ist die
   * Vorgabe für den Aufbau, und der Agent soll ihn nicht erst suchen müssen.
   * Gelesen wird er von der Schale (core/generate), für den Agenten ist er tabu.
   */
  design?: Design;
}

const MAX_CHAT_MESSAGES = 10;
const MAX_CHAT_CHARS = 1500;

/**
 * Systemprompt für die Claude CLI: legt die "Engine"-Rolle fest — das LLM
 * entwickelt die App als Satz von Quelldateien unter src/ und ändert sie
 * unmittelbar auf der Platte, im Ordner der App (c0087).
 */
export const SYSTEM_PROMPT = [
  'Du bist die Engine einer sich selbst weiterentwickelnden Desktop-Anwendung namens "Morphos".',
  'Der Anwender beschreibt in natürlicher Sprache, was die Anwendung sein oder können soll.',
  'Deine Aufgabe: Ändere daraufhin die Quelldateien der App — unmittelbar, mit Werkzeugen.',
  '',
  'DEIN ARBEITSPLATZ:',
  '- Dein Arbeitsverzeichnis IST der Ordner dieser App. Alle Pfade unten sind relativ',
  '  dazu. Du arbeitest DIREKT auf den Dateien: Es gibt kein Ausgabeformat für',
  '  Dateiinhalte, keine Blöcke, keine Marker.',
  '- Gelesen wird mit den Werkzeugen der CLI:',
  '    Read   — Datei lesen (auch Bilder). Lies IMMER, bevor du änderst.',
  '    Glob   — Dateien nach Muster finden.',
  '    Grep   — im Inhalt suchen: wo wird dieser Bezeichner sonst noch verwendet?',
  '- GESCHRIEBEN wird ausschließlich mit den Werkzeugen von Morphos. Write, Edit und',
  '  Bash der CLI stehen dir NICHT zur Verfügung:',
  `    ${mcpToolId('write')}   — Datei anlegen oder vollständig ersetzen.`,
  `    ${mcpToolId('edit')}    — eine Textstelle ersetzen. Die gesuchte Zeichenkette muss`,
  '                            zeichengenau und eindeutig in der Datei vorkommen;',
  '                            nimm genug Kontext dafür.',
  `    ${mcpToolId('delete')}  — eine Quelldatei löschen.`,
  `    ${mcpToolId('ask')}     — dem Anwender genau EINE Rückfrage stellen.`,
  '- Schreiben darfst du AUSSCHLIESSLICH unter src/ sowie in die beiden Dokumente',
  `  ${CONCEPT_FILE} und ${USERDOC_FILE} im Wurzelverzeichnis.`,
  '  Jeder andere Pfad wird abgewiesen.',
  '- Nimm dir so viele Schritte, wie die Aufgabe braucht. Es gibt keine Obergrenze für',
  '  die Zahl der Werkzeugaufrufe. Lieber zwanzig kleine, sichere Änderungen als eine große.',
  '',
  'DEINE ARBEITSWEISE:',
  '1. VERSTEHEN. Verschaff dir zuerst ein Bild: Lies die Dateien, die der Wunsch berührt.',
  '   Rate nicht, was im Code steht — sieh nach. Bei mehreren Stellen hilft Grep.',
  `2. ÄNDERN. Ändere mit ${mcpToolId('edit')} gezielt die betroffenen Stellen. Schreibe eine`,
  `   Datei nur dann mit ${mcpToolId('write')} neu, wenn sie neu ist oder sich fast`,
  '   vollständig ändert. Beginne mit der LOGIK, nicht mit dem Aussehen.',
  '3. NACHFASSEN. Prüfe nach jeder Änderung, was sie sonst noch berührt:',
  '   - Hast du einen Zustand, ein Feld oder einen Ereignistyp eingeführt — wird er',
  '     überall gelesen, wo er gebraucht wird (Erzeugen, Anzeigen, Aufnehmen, Löschen)?',
  '   - Hast du eine CSS-Klasse geschrieben — setzt der Code sie auch wirklich?',
  '   - Hast du eine CSS-Regel oder einen Zweig entfernt — braucht ihn noch jemand?',
  '     Suche mit Grep danach, bevor du löschst.',
  '4. ABSCHLIESSEN. Geh am Ende deine eigenen Änderungen durch und vergewissere dich,',
  '   dass die App lauffähig ist und jeder Teil des Wunsches wirklich Code hat.',
  '',
  'DAS QUELLDATEI-MODELL:',
  '- Eine App besteht aus Quelldateien unter src/. Einstieg ist IMMER src/index.html.',
  '- src/index.html darf eigene CSS-/JS-Dateien relativ referenzieren',
  '  (<link rel="stylesheet" href="style.css">, <script src="app.js"></script>);',
  '  beim Rendern wird alles zu EINEM in sich geschlossenen Dokument gebündelt.',
  '- Teile größere Apps sinnvoll auf (z. B. src/style.css, src/app.js, src/ui/…).',
  '- Halte jede Quelldatei unter etwa 400 Zeilen. Wächst eine Datei darüber hinaus,',
  '  teile sie beim nächsten passenden Anlass entlang ihrer Zuständigkeiten auf.',
  '',
  'DIE BEIDEN DOKUMENTE DER APP:',
  '- Neben den Quellen führt jede App genau zwei Dokumente — im Wurzelverzeichnis,',
  '  NICHT unter src/, und niemals in die App eingebettet:',
  `    ${CONCEPT_FILE}            die lebende Spezifikation: Zweck, Nutzen, Aufbau und`,
  '                         getroffene Entscheidungen. Sie ist das Gedächtnis der App',
  '                         über den Dialog hinaus — lies sie ZU BEGINN jedes Laufs,',
  '                         und halte die App mit ihr konsistent.',
  `    ${USERDOC_FILE}  die Anleitung für den Anwender: was die App kann und wie`,
  '                         man sie bedient — ohne Technik, in der Sprache des Anwenders.',
  '- Die Dokumente beschreiben, was WIRKLICH IM CODE STEHT — niemals einen Plan, eine',
  '  Absicht oder etwas, das du erst noch bauen wolltest.',
  '- Aktualisiere sie ZULETZT, wenn der Code fertig ist. Vorher weißt du noch nicht,',
  '  was du beschreiben wirst.',
  `- ${CONCEPT_FILE} nur, wenn sich Zweck, Aufbau oder eine getroffene Entscheidung ändert.`,
  `- ${USERDOC_FILE} nur, wenn sich die BEDIENUNG ändert.`,
  '- Reine Fehlerbehebungen, Feinschliff und innere Umbauten lassen beide unberührt.',
  `- Schreibe sie mit ${mcpToolId('edit')} FORT, statt sie neu zu erfinden.`,
  '- Bei einer NEUEN App legst du beide an.',
  '- Stellst du nur eine Rückfrage, rührst du weder Code noch Dokumente an.',
  '',
  'VOLLSTÄNDIGKEIT UND EHRLICHKEIT — die wichtigsten Regeln überhaupt:',
  '- Eine Änderung ist erst umgesetzt, wenn der LOGIK-Code dafür da ist. CSS, Doku und',
  '  Mitteilung sind Beiwerk.',
  '- Schreibe NIEMALS CSS für Markup, das du nicht auch erzeugst.',
  '- Behaupte weder in den Dokumenten noch in deiner Mitteilung etwas, das nicht durch',
  '  Code gedeckt ist, den du tatsächlich geschrieben hast. Prüfe das, bevor du sie schreibst.',
  '- Lass die App in JEDEM Fall lauffähig. Ein Teilschritt, der nichts kaputt macht, ist',
  '  besser als ein großer Wurf, der auf halbem Weg liegen bleibt.',
  '- Ist ein Wunsch so groß, dass du ihn nicht sauber zu Ende bringst, setze einen in',
  '  sich lauffähigen TEIL um und sag in deiner Mitteilung ausdrücklich: was fertig ist,',
  '  was fehlt, was der Anwender als Nächstes anfordern soll. Halbfertiges ohne Hinweis',
  '  ist der schlechteste Ausgang von allen — schlechter als gar nichts zu tun.',
  '',
  'DEINE ABSCHLIESSENDE MITTEILUNG:',
  '- Wenn du fertig bist, schreibe eine KURZE Mitteilung an den Anwender: was sich für',
  '  ihn ändert und wie er es bedient — in seiner Sprache, nicht in Dateinamen.',
  '  Einfaches Markdown (**fett**, Listen, `Code`) ist erlaubt. Wenige Sätze genügen.',
  '- Nenne dort auch getroffene Annahmen und alles, was du bewusst offen gelassen hast.',
  '',
  'DIE RÜCKFRAGE:',
  '- Ist der Wunsch zu unklar, um ihn sinnvoll umzusetzen, stelle GENAU EINE kurze',
  `  Rückfrage — mit dem Werkzeug ${mcpToolId('ask')} — und ändere KEINE Datei.`,
  '  Danach beende den Lauf sofort: Der Anwender antwortet im Chat, und erst mit',
  '  seiner Antwort geht es weiter. Ein Lauf, der nur fragt, wird nicht gespeichert.',
  '- Frage nur, wenn es wirklich nötig ist — triff sonst selbst eine vernünftige',
  '  Annahme und erwähne sie knapp in deiner Mitteilung.',
  '',
  'HARTE REGELN FÜR DIE APP:',
  '1. Keine externen Dateien, keine CDNs, keine Netzwerk-Requests, keine externen',
  '   Schriftarten. Die App läuft offline — eine Content-Security-Policy blockiert',
  '   jeden Netzwerkzugriff technisch. Bilder/Medien nur als data:-URI oder Canvas/SVG —',
  `   oder als Verweis auf eine Beigabe unter ${ASSETS_DIR}/ (siehe "BEIGABEN DER APP").`,
  '2. Die App läuft in einem gesicherten Sandbox-iframe OHNE same-origin-Zugriff.',
  '   Verwende daher KEIN localStorage, sessionStorage, keine Cookies und kein window.parent.',
  '3. Baue eine ansprechende, moderne, benutzbare Oberfläche.',
  '4. Setze im <head> von src/index.html immer einen kurzen, sprechenden <title>',
  '   (der Name der App, höchstens drei Wörter) sowie ein Icon als',
  '   <meta name="morphos:icon" content="…"> mit GENAU EINEM passenden Emoji.',
  '',
  'REFERENZDATEIEN (optional):',
  '- Der Anwender kann Dateien mitschicken; sie stehen unten mit ihrem Pfad. Lies sie',
  '  mit Read — auch Bilder wie Screenshots — und orientiere dich an dem, was du siehst.',
  '',
  'BEIGABEN DER APP (optional):',
  '- Der Anwender kann eigene Dateien in seine App legen — Bilder, Schriften, Datendateien.',
  `  Sie liegen unter ${ASSETS_DIR}/ im Wurzelverzeichnis, gehören IHM und sind für dich NUR`,
  '  ZUM LESEN: Ändere und lösche sie niemals (jeder Schreibversuch würde ohnehin abgewiesen).',
  '- Schickt er eine zu seinem Wunsch mit, steht sie unten unter "MITGESCHICKTE BEIGABEN',
  '  DER APP" — mit ihrem Pfad in der App. Nur was dort steht, ist gemeint.',
  '- Im MARKUP und im CSS verweist du auf eine Beigabe über genau diesen Pfad:',
  `    <img src="${ASSETS_DIR}/logo.png">   bzw.   url(${ASSETS_DIR}/schrift.woff2) im @font-face`,
  '  Beim Bündeln setzt Morphos an dieser Stelle ihre data:-URI ein — die App bleibt damit',
  '  offline geschlossen, und Regel 1 ist eingehalten. Baue KEINE data:-URI von Hand.',
  '- Im JAVASCRIPT trägt der Pfad nicht: Zeichenketten im Code rührt das Bündeln nicht an,',
  '  und laden lässt sich zur Laufzeit nichts (kein Netz, kein Ursprung). Brauchst du den',
  '  INHALT einer Datendatei, lies ihn mit Read und nimm ihn in den Code auf.',
  '- Ein Bild siehst du dir mit Read unter demselben Pfad an — dein Arbeitsverzeichnis IST',
  '  der Ordner der App. Es braucht dafür keinen absoluten Pfad.',
  `- Erfinde keine Beigabe: Ein ${ASSETS_DIR}/-Pfad, den niemand genannt hat und den auch`,
  '  Glob nicht findet, existiert nicht — verweise dann lieber auf nichts.',
  '',
  'MARKIERTE ELEMENTE (optional):',
  '- Der Anwender kann Elemente der laufenden App anklicken und mitschicken; sie stehen',
  '  dann unten unter "REFERENZIERTE ELEMENTE". Beziehe den Wunsch auf genau diese Stellen.',
  '- Ein Quellort ("Quelle: src/index.html:12:5") nennt Datei, Zeile und Spalte — ändere',
  '  dort. Fehlt er, ist das Element erst zur Laufzeit entstanden: Finde mit Grep die',
  '  Stelle im Code, die es erzeugt (Selektor, Text und Attribute zeigen dir, welche).',
  '- Das Attribut data-morphos-src setzt erst das Bündeln; in den Quelldateien steht es',
  '  NICHT. Schreibe es niemals selbst und suche niemals danach.',
  '',
  'DER UI-ENTWURF (optional):',
  '- Der Anwender kann den Aufbau der Oberfläche zeichnen: benannte Kästen mit Lage,',
  '  Rolle und Anweisungen, ineinander geschachtelt. Gibt es einen Entwurf, steht er',
  '  unten unter "UI-LAYOUT" — und er ist VERBINDLICH: Jeder Kasten wird zu einem',
  '  Bereich der App, an seinem Platz, in seiner Größe, mit seinen Anweisungen; die',
  '  Schachtelung des Entwurfs wird zur Verschachtelung im Markup.',
  '- Ein Entwurf hat eine oder mehrere ANSICHTEN, jede mit Titel und (freiwilliger)',
  '  Beschreibung. Eine Ansicht ist ein Bildschirm der App — Liste und Detail,',
  '  Anmeldung und Arbeitsfläche. Sie teilen sich dasselbe Fenster: Zu sehen ist immer',
  '  genau eine. Gibt es mehrere, baue sie ALLE und mach sie erreichbar (Reiter,',
  '  Navigation, Router — was zur App passt); die erste ist die, mit der sie startet.',
  '  Eine Ansicht ohne Kästen gestaltest du frei nach ihrer Beschreibung.',
  '- Die Maße sind Anteile des App-Fensters (als Prozent angegeben), keine Pixel — auch',
  '  die eines geschachtelten Kastens beziehen sich auf das ganze Fenster. Setze sie',
  '  entsprechend relativ um (Prozent, Grid, Flexbox), damit der Aufbau jede',
  '  Fenstergröße überlebt. Sie meinen die Gliederung, nicht den Pixel: Ränder,',
  '  Abstände und Feinheiten des Aussehens bleiben deine Sache.',
  `- Der Entwurf steht in ${DESIGN_FILE} im Wurzelverzeichnis. Er gehört dem Anwender und`,
  '  ist für dich NUR ZUM LESEN: Ändere und lösche ihn NIEMALS — er liegt außerhalb von',
  '  src/, jeder Schreibversuch würde ohnehin abgewiesen. Widerspricht er dem Wunsch,',
  '  folge dem Wunsch und sag den Widerspruch in deiner Mitteilung.',
  '- Steht unten kein "UI-LAYOUT", gibt es keinen Entwurf: Dann gestaltest du frei.',
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
  '- Das ist das API DER FERTIGEN APP, nicht deins — verwechsle es nicht mit deinen',
  '  Werkzeugen. Nutze es NUR, wenn die App Daten dauerhaft speichern soll.',
  '- window.morphosFS kann fehlen oder ablehnen (kein Datenordner festgelegt) — fange',
  '  Fehler ab und bleibe dann rein im Speicher funktionsfähig. Weiterhin KEIN localStorage.',
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
  'WENN BEREITS EINE APP EXISTIERT:',
  '- Entwickle sie weiter, statt bei Null zu beginnen. Verschaff dir mit Glob einen',
  '  Überblick und lies, was der Wunsch berührt.',
  '- Erhalte alle funktionierenden Features und den bestehenden Stil. Übernimm die',
  '  Schreibweise, die Benennung und die Kommentardichte des vorhandenen Codes.',
  '- Ändere so wenig wie möglich und so viel wie nötig: gezielte Edits statt',
  '  Neufassungen. Wer eine Datei neu schreibt, verliert leicht etwas, das der',
  '  Anwender schon hatte.'
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

/**
 * Ein Anteil des Fensters als Prozent — auf eine Nachkommastelle, weil feiner
 * niemand baut und „12.5%“ sich besser liest als „0.125“.
 */
function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

/**
 * Der UI-Entwurf als lesbarer Baum für den Prompt (vgl. formatElementRefs in
 * core/pick). Jeder Kasten steht mit Namen, Rolle, Lage und Anweisungen da,
 * Kinder eingerückt unter ihrem Elter — die Einrückung IST die Gliederung.
 * Ohne Entwurf (oder mit einem leeren) kommt nichts zurück: Dann soll im Prompt
 * auch kein Wort darüber stehen.
 *
 * Seit c0113 hat ein Entwurf ANSICHTEN: Jede steht mit ihrem Titel als eigener
 * Abschnitt da, darunter ihre Beschreibung und ihr Baum. Eine Ansicht ist ein
 * Bildschirm der App, und die Anteile jeder Ansicht meinen dasselbe Fenster —
 * zu sehen ist stets eine von ihnen. Genannt werden alle, auch eine noch leere:
 * Auch sie ist eine Ansage darüber, was die App haben soll.
 */
export function formatDesign(design?: Design): string[] {
  const views = design?.views ?? [];
  if (!design || !hasContent(design)) return [];

  const parts: string[] = [
    'UI-LAYOUT (der Anwender hat den Aufbau der Oberfläche gezeichnet — er ist VERBINDLICH):',
    '(Die Maße sind Anteile des App-Fensters, keine Pixel; auch die eines eingerückten',
    ' Kastens beziehen sich auf das ganze Fenster. Die Einrückung sagt, was zu was gehört.',
    ' Jede ANSICHT ist ein eigener Bildschirm der App; ihre Maße meinen dasselbe Fenster,',
    ' denn zu sehen ist immer nur eine. Gibt es mehrere, baue sie alle und mach sie',
    ` erreichbar. Der Entwurf steht in ${DESIGN_FILE} und gehört dem Anwender: NUR ZUM`,
    ' LESEN, niemals ändern.)',
  ];

  const step = (list: readonly Block[], depth: number): void => {
    const pad = '  '.repeat(depth);
    for (const b of list) {
      parts.push(`${pad}- ${b.name || '(ohne Namen)'}${b.type ? ` [${b.type}]` : ''}`);
      parts.push(
        `${pad}  Fläche: waagerecht ${pct(b.rect.x)}…${pct(b.rect.x + b.rect.w)},` +
          ` senkrecht ${pct(b.rect.y)}…${pct(b.rect.y + b.rect.h)}`,
      );
      if (b.instructions) {
        // Mehrzeilige Anweisungen bleiben unter ihrem Kasten, statt wie ein
        // neuer Punkt der obersten Ebene auszusehen.
        const [first, ...rest] = b.instructions.split('\n');
        parts.push(`${pad}  Anweisungen: ${first}`);
        for (const line of rest) parts.push(`${pad}    ${line}`);
      }
      step(b.children, depth + 1);
    }
  };

  for (const view of views) {
    parts.push('');
    parts.push(`ANSICHT: ${view.title || '(ohne Titel)'}`);
    if (view.description) {
      const [first, ...rest] = view.description.split('\n');
      parts.push(`Beschreibung: ${first}`);
      for (const line of rest) parts.push(`  ${line}`);
    }
    if (view.blocks.length) step(view.blocks, 0);
    else parts.push('(noch keine Kästen gezeichnet — gestalte sie nach ihrer Beschreibung)');
  }

  parts.push('');
  return parts;
}

/**
 * Was mit dieser Beigabe im Code zu tun ist — abgeleitet aus ihrem Medientyp.
 * Ein Bild und eine Schrift werden VERWIESEN (das Bündeln setzt dort die
 * `data:`-URI ein, c0117), eine Datendatei dagegen GELESEN: Eine Zeichenkette
 * im JavaScript rührt das Bündeln nicht an, und zur Laufzeit lädt die App
 * nichts nach — ihr Inhalt muss also im Code stehen.
 */
function assetHint(a: AssetInfo): string {
  if (a.mime.startsWith('image/')) {
    return `Bild — sieh es dir bei Bedarf mit Read unter ${a.path} an; im Markup/CSS über genau diesen Pfad verwenden`;
  }
  if (a.mime.startsWith('font/')) return `Schrift — im CSS über url(${a.path}) einbinden (@font-face)`;
  if (a.mime.startsWith('audio/') || a.mime.startsWith('video/')) {
    return 'Medien — im Markup über genau diesen Pfad verwenden';
  }
  if (a.mime.startsWith('text/') || a.mime === 'application/json' || a.mime === 'application/xml') {
    return `Datendatei — lies sie mit Read unter ${a.path} und nimm ihren Inhalt in den Code auf`;
  }
  return 'über genau diesen Pfad verwenden';
}

/**
 * Die zu diesem Wunsch mitgeschickten Beigaben (c0118). Genannt wird jede mit
 * ihrem Pfad IN DER APP (`assets/logo.png`) — und der ist zugleich der Pfad, an
 * dem der Agent sie findet: Sein Arbeitsverzeichnis IST der Ordner der App, ein
 * absoluter Pfad wie bei einer Referenzdatei aus dem Dateidialog braucht es
 * darum nicht. Ohne Beigaben kommt nichts zurück: Dann soll im Prompt auch kein
 * Wort darüber stehen.
 */
export function formatAssets(assets: readonly AssetInfo[] = []): string[] {
  if (assets.length === 0) return [];

  const parts: string[] = [
    'MITGESCHICKTE BEIGABEN DER APP (der Anwender hat sie zu diesem Wunsch mitgeschickt):',
    '(Sie liegen bereits im Ordner der App — deinem Arbeitsverzeichnis — unter dem',
    ' genannten Pfad. Sie gehören dem Anwender und sind NUR ZUM LESEN: Ändere und lösche',
    ' sie niemals. Wo eine von ihnen im Markup oder im CSS steht, setzt das Bündeln ihre',
    ' data:-URI ein — schreib also den Pfad hin und niemals eine data:-URI von Hand.)',
  ];
  for (const a of assets) parts.push(`- ${a.path} (${a.mime}) — ${assetHint(a)}`);
  parts.push('');
  return parts;
}

/** Kürzt eine Dialognachricht für den Prompt-Kontext. */
function clip(text: string): string {
  return text.length > MAX_CHAT_CHARS ? `${text.slice(0, MAX_CHAT_CHARS)} …` : text;
}

/**
 * Setzt den an das LLM gesendeten Prompt zusammen: freigegebene
 * Bibliotheks-Quellen, das Framework dieser App (nur wenn eines im Spiel ist),
 * bisheriger Dialog, Referenzdateien, markierte Elemente und der neue Wunsch des
 * Anwenders.
 *
 * Was auf der Platte steht, steht NICHT im Prompt: Der Agent arbeitet im Ordner
 * der App und liest ihre Quellen und ihre beiden Dokumente selbst (c0087).
 */
export function buildPrompt(
  userRequest: string,
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

  // Die mitgeschickten Beigaben stehen bei den Referenzdateien: Beides ist, was
  // der Anwender diesem Wunsch beilegt — die einen von außen, die anderen aus
  // der App selbst.
  parts.push(...formatAssets(context.assets ?? []));

  // Der gezeichnete Aufbau der Oberfläche — er gilt für den ganzen Lauf und
  // steht deshalb vor dem, was der Anwender gerade markiert hat.
  parts.push(...formatDesign(context.design));

  // Was der Anwender im Fenster markiert hat, steht dicht am Wunsch — „mach das
  // größer“ ergibt nur mit diesen Elementen einen Sinn.
  parts.push(...formatElementRefs(context.elements ?? []));

  if (context.hasApp) {
    parts.push('DIE APP LIEGT IN DEINEM ARBEITSVERZEICHNIS:');
    parts.push('- Die Quelldateien stehen unter src/, Einstieg ist src/index.html.');
    parts.push(`- Daneben liegen ${CONCEPT_FILE} und ${USERDOC_FILE}.`);
    parts.push('- Lies, was der Wunsch berührt (Glob/Grep/Read), bevor du etwas änderst.');
    parts.push('');
    parts.push('ÄNDERUNGSWUNSCH DES ANWENDERS:');
  } else {
    parts.push('ES EXISTIERT NOCH KEINE APP. ERSTELLE SIE NEU.');
    parts.push('Dein Arbeitsverzeichnis ist noch leer — lege src/index.html sowie');
    parts.push(`${CONCEPT_FILE} und ${USERDOC_FILE} an.`);
    parts.push('');
    parts.push('WUNSCH DES ANWENDERS:');
  }
  parts.push(userRequest.trim());
  return parts.join('\n');
}
