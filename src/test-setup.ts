// jsdom kennt keine Objekt-URLs. AppCanvas lädt die erzeugte App als
// blob:-Dokument, daher hier eine minimale Attrappe für alle Tests.
if (typeof URL.createObjectURL !== 'function') {
  let seq = 0;
  URL.createObjectURL = () => `blob:jsdom/${++seq}`;
  URL.revokeObjectURL = () => {};
}
