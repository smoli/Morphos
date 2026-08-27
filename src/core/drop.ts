/**
 * Der Riegel gegen daneben fallengelassene Dateien.
 *
 * Seit die Beigaben-Verwaltung (e16/c0119) Dateien annimmt, zieht der Anwender
 * welche über die Schale — und trifft dabei auch daneben. Ohne diesen Riegel
 * täte Chromium dann das Übliche: Es LÄDT die fallengelassene Datei als Seite.
 * In einer Electron-Schale heißt das, dass der ganze Desktop verschwindet und
 * an seiner Stelle ein Bild oder eine PDF steht — mitsamt allem, was in den
 * Fenstern gerade offen war.
 *
 * Angemeldet wird am Fenster, also ganz außen: Wer die Datei annehmen WILL,
 * sitzt weiter innen und ist damit zuerst an der Reihe — er hält das Ereignis
 * ohnehin selbst auf. Hier steht nur, was übrig bleibt.
 */
export function blockStrayDrops(target: Window): () => void {
  const stop = (event: Event): void => event.preventDefault();
  target.addEventListener('dragover', stop);
  target.addEventListener('drop', stop);
  return () => {
    target.removeEventListener('dragover', stop);
    target.removeEventListener('drop', stop);
  };
}
