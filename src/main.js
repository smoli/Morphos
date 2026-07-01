'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const IS_DEV = process.argv.includes('--dev');

// Datei, in der die zuletzt erzeugte App + Versionshistorie liegt.
function stateFile() {
  return path.join(app.getPath('userData'), 'morphos-state.json');
}

/**
 * Systemprompt für die Claude CLI. Er legt die "Engine"-Rolle fest: Das LLM ist
 * der Baukasten, der die Anwendung als vollständiges HTML-Dokument liefert.
 */
const SYSTEM_PROMPT = [
  'Du bist die Engine einer sich selbst weiterentwickelnden Desktop-Anwendung namens "Morphos".',
  'Der Anwender beschreibt in natürlicher Sprache, was die Anwendung sein oder können soll.',
  'Deine Aufgabe: Erzeuge oder verändere daraufhin die komplette Oberfläche und Logik.',
  '',
  'HARTE REGELN FÜR DEINE AUSGABE:',
  '1. Gib AUSSCHLIESSLICH ein einziges, vollständiges, in sich geschlossenes HTML-Dokument aus.',
  '   Beginne mit <!DOCTYPE html> und ende mit </html>.',
  '2. Kein Markdown, keine Code-Fences (```), keine Erklärungen, kein Text davor oder danach.',
  '3. ALLES inline: CSS in <style>, JavaScript in <script>. Keine externen Dateien,',
  '   keine CDNs, keine Netzwerk-Requests, keine externen Schriftarten. Die App läuft offline.',
  '4. Die App läuft in einem gesicherten Sandbox-iframe OHNE same-origin-Zugriff.',
  '   Verwende daher KEIN localStorage, sessionStorage, keine Cookies und kein window.parent.',
  '   Halte den Zustand ausschließlich in JavaScript-Variablen im Dokument.',
  '5. Baue eine ansprechende, moderne, benutzbare Oberfläche. Achte auf gutes Layout,',
  '   Kontraste, sinnvolle Abstände und ein aufgeräumtes Design.',
  '',
  'WENN BEREITS EINE APP EXISTIERT (unten unter "AKTUELLE APP"):',
  '- Entwickle sie weiter, statt bei Null zu beginnen.',
  '- Erhalte alle funktionierenden Features und den bestehenden Stil.',
  '- Setze die gewünschte Änderung um und gib das vollständige, aktualisierte Dokument zurück.',
].join('\n');

/** Zusammengesetzter Prompt aus aktueller App (falls vorhanden) und Nutzerwunsch. */
function buildPrompt(userRequest, currentHtml) {
  const parts = [];
  if (currentHtml && currentHtml.trim()) {
    parts.push('AKTUELLE APP (HTML):');
    parts.push(currentHtml.trim());
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

/** Entfernt evtl. doch vorhandene Markdown-Fences und extrahiert das HTML-Dokument. */
function extractHtml(raw) {
  if (!raw) return '';
  let text = raw.trim();

  // ```html ... ```  oder  ``` ... ```  entfernen
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  // Falls Text vor dem Dokument steht: ab <!DOCTYPE oder <html schneiden.
  const docIdx = text.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (docIdx > 0) {
    text = text.slice(docIdx);
  }
  return text.trim();
}

/**
 * Ruft die Claude CLI im Print-Modus auf und liefert das erzeugte HTML zurück.
 * Der zusammengesetzte Prompt wird über stdin übergeben (keine Argument-Längenlimits).
 */
function runClaude(userRequest, currentHtml) {
  return new Promise((resolve) => {
    const prompt = buildPrompt(userRequest, currentHtml);
    const args = ['-p', '--output-format', 'json', '--append-system-prompt', SYSTEM_PROMPT];

    let child;
    try {
      child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, error: `Claude CLI konnte nicht gestartet werden: ${err.message}` });
      return;
    }

    let stdout = '';
    let stderr = '';

    child.on('error', (err) => {
      const hint = err.code === 'ENOENT'
        ? 'Der Befehl "claude" wurde nicht gefunden. Ist die Claude CLI installiert und im PATH?'
        : err.message;
      resolve({ ok: false, error: hint });
    });

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code !== 0 && !stdout) {
        resolve({ ok: false, error: stderr.trim() || `Claude CLI endete mit Code ${code}.` });
        return;
      }

      let resultText = '';
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.subtype && parsed.subtype !== 'success') {
          resolve({ ok: false, error: parsed.result || `Claude-Ergebnis: ${parsed.subtype}` });
          return;
        }
        resultText = parsed.result || '';
      } catch (e) {
        // Fallback: stdout war doch kein JSON – direkt verwenden.
        resultText = stdout;
      }

      const html = extractHtml(resultText);
      if (!html) {
        resolve({ ok: false, error: 'Es wurde kein HTML-Dokument erzeugt. Bitte den Wunsch anders formulieren.' });
        return;
      }
      resolve({ ok: true, html });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0f1115',
    title: 'Morphos',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (IS_DEV) win.webContents.openDevTools({ mode: 'detach' });
}

// ---- IPC ----

ipcMain.handle('morphos:generate', async (_event, { prompt, currentHtml }) => {
  if (!prompt || !prompt.trim()) {
    return { ok: false, error: 'Bitte gib einen Wunsch ein.' };
  }
  return runClaude(prompt, currentHtml || '');
});

ipcMain.handle('morphos:loadState', async () => {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { history: [] };
  }
});

ipcMain.handle('morphos:saveState', async (_event, state) => {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Links aus dem Renderer im Systembrowser öffnen (nicht in der App).
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
