import type { FsOp, FsRequest, FsResponse } from '@/types';

/**
 * Das in die erzeugte App injizierte SDK. Es stellt `window.morphosFS` bereit und
 * kommuniziert per postMessage mit dem Host (Renderer), der die Anfragen an den
 * Electron-Hauptprozess weiterreicht. Läuft im Sandbox-iframe ohne same-origin.
 */
export const BRIDGE_SDK = `(function(){
  if (window.morphosFS) return;
  var pending = {}, seq = 0;
  window.addEventListener('message', function(e){
    var d = e.data;
    if (!d || d.__morphosFS !== 'response' || !(d.id in pending)) return;
    var p = pending[d.id]; delete pending[d.id];
    if (d.ok) p.resolve(d.result); else p.reject(new Error(d.error || 'Dateisystemfehler'));
  });
  function call(op, path, data){
    return new Promise(function(resolve, reject){
      var id = 'fs' + (++seq);
      pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({ __morphosFS: 'request', id: id, op: op, path: String(path == null ? '' : path), data: data }, '*');
    });
  }
  // Die Dateidialoge zeichnet die Shell. Die Optionen werden hier auf einfache
  // Werte reduziert — so ist die Nachricht immer klonbar (postMessage).
  function dialog(kind, options){
    var o = options || {};
    var opts = {
      startDir: o.startDir == null ? '' : String(o.startDir),
      suggestedName: o.suggestedName == null ? '' : String(o.suggestedName),
      title: o.title == null ? '' : String(o.title),
      extensions: Array.isArray(o.extensions) ? o.extensions.map(String) : []
    };
    return new Promise(function(resolve, reject){
      var id = 'dlg' + (++seq);
      pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({ __morphosFS: 'request', id: id, dialog: kind, options: opts }, '*');
    });
  }
  window.morphosFS = {
    readFile: function(path){ return call('read', path); },
    writeFile: function(path, data){ return call('write', path, String(data)); },
    list: function(path){ return call('list', path || ''); },
    exists: function(path){ return call('exists', path); },
    stat: function(path){ return call('stat', path); },
    mkdir: function(path){ return call('mkdir', path); },
    remove: function(path){ return call('delete', path); },
    openFile: function(options){ return dialog('open', options); },
    saveFile: function(options){ return dialog('save', options); },
    pickDirectory: function(options){ return dialog('directory', options); }
  };
})();`;

/**
 * Content-Security-Policy für die erzeugte App: erzwingt den Offline-Betrieb.
 * Die iframe-Sandbox blockiert KEINE Netzwerk-Requests — erst diese CSP
 * verhindert, dass generierter Code Daten nach außen sendet (img, fetch, …).
 * Inline-Skripte/-Styles bleiben erlaubt, Ressourcen nur als data:/blob:.
 */
export const CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="' +
  [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'media-src data: blob:',
    'font-src data:',
    'worker-src blob:',
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ') +
  '">';

/**
 * Setzt einen Schnipsel so weit vorn wie möglich in ein Dokument: in den Kopf,
 * sonst hinter <html>, sonst ganz nach vorn. Wichtig für die CSP — sie gilt erst
 * für alles, was NACH ihr kommt.
 */
export function insertIntoHead(html: string, snippet: string): string {
  const head = html.match(/<head[^>]*>/i);
  if (head && head.index !== undefined) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }
  const htmlTag = html.match(/<html[^>]*>/i);
  if (htmlTag && htmlTag.index !== undefined) {
    const at = htmlTag.index + htmlTag[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }
  return snippet + html;
}

/** Fügt CSP und Bridge-SDK (<script>) in ein HTML-Dokument ein (einmalig). */
export function injectBridge(html: string): string {
  if (!html) return html;
  if (html.includes('data-morphos-bridge')) return html;
  return insertIntoHead(html, `${CSP_META}<script data-morphos-bridge>${BRIDGE_SDK}</script>`);
}

/** Die erlaubten Dateisystem-Operationen (Whitelist). */
export const ALLOWED_OPS: readonly FsOp[] = ['read', 'write', 'list', 'exists', 'stat', 'delete', 'mkdir'];

/**
 * Validiert eine App-Anfrage und leitet sie an den Host weiter. Der eigentliche
 * Pfad-Schutz passiert im Hauptprozess; hier werden Operation und Verfügbarkeit
 * des Zugriffsordners geprüft und — sofern übergeben — die Berechtigung
 * (`authorize`) eingeholt, bevor die Operation ausgeführt wird.
 */
export async function dispatchFsRequest(
  req: FsRequest,
  accessRoot: string | null,
  host: (root: string, req: FsRequest) => Promise<FsResponse>,
  authorize?: (op: FsRequest['op'], path: string) => Promise<boolean>,
): Promise<FsResponse> {
  if (!accessRoot) {
    return { ok: false, error: 'Für diesen Workspace ist kein Datenordner festgelegt.' };
  }
  if (!ALLOWED_OPS.includes(req.op)) {
    return { ok: false, error: `Unbekannte Operation: ${req.op}` };
  }
  if (authorize) {
    const allowed = await authorize(req.op, req.path);
    if (!allowed) {
      return { ok: false, error: 'Der Zugriff auf das Dateisystem wurde abgelehnt.' };
    }
  }
  return host(accessRoot, { op: req.op, path: req.path, ...(req.data !== undefined ? { data: req.data } : {}) });
}
