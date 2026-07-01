'use strict';

// ---- Elemente ----
const stage = document.getElementById('stage');
const welcome = document.getElementById('welcome');
const canvas = document.getElementById('canvas');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const promptForm = document.getElementById('promptForm');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const errorBox = document.getElementById('errorBox');
const historyBtn = document.getElementById('historyBtn');
const historyPanel = document.getElementById('historyPanel');
const historyList = document.getElementById('historyList');
const historyCount = document.getElementById('historyCount');
const closeHistory = document.getElementById('closeHistory');

// ---- Zustand ----
let history = [];         // [{ id, prompt, html, time }]
let currentHtml = '';     // aktuell angezeigtes Dokument (Basis für Weiterentwicklung)
let activeId = null;
let busy = false;

// ---- Hilfsfunktionen ----
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}
function clearError() {
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}

function setBusy(state, text) {
  busy = state;
  sendBtn.disabled = state;
  promptInput.disabled = state;
  loadingText.textContent = text || 'Die Anwendung wird entwickelt …';
  loading.classList.toggle('hidden', !state);
}

function renderApp(html) {
  currentHtml = html;
  canvas.srcdoc = html;
  canvas.classList.remove('hidden');
  welcome.classList.add('hidden');
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function renderHistory() {
  historyCount.textContent = String(history.length);
  historyList.innerHTML = '';
  // Neueste zuerst
  [...history].reverse().forEach((entry) => {
    const li = document.createElement('li');
    if (entry.id === activeId) li.classList.add('active');
    const p = document.createElement('div');
    p.className = 'hist-prompt';
    p.textContent = entry.prompt;
    const t = document.createElement('div');
    t.className = 'hist-time';
    t.textContent = fmtTime(entry.time);
    li.append(p, t);
    li.addEventListener('click', () => revertTo(entry.id));
    historyList.appendChild(li);
  });
}

function revertTo(id) {
  const entry = history.find((e) => e.id === id);
  if (!entry) return;
  activeId = id;
  renderApp(entry.html);
  renderHistory();
}

async function persist() {
  try {
    await window.morphos.saveState({ history, activeId });
  } catch { /* nicht kritisch */ }
}

// ---- Generierung ----
async function generate(prompt) {
  if (busy) return;
  clearError();
  setBusy(true, currentHtml ? 'Die Änderung wird umgesetzt …' : 'Die Anwendung wird entwickelt …');

  const res = await window.morphos.generate(prompt, currentHtml);

  setBusy(false);

  if (!res || !res.ok) {
    showError((res && res.error) || 'Unbekannter Fehler.');
    return;
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    prompt,
    html: res.html,
    time: Date.now(),
  };
  history.push(entry);
  activeId = entry.id;
  renderApp(res.html);
  renderHistory();
  persist();
  promptInput.value = '';
}

// ---- Events ----
promptForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = promptInput.value.trim();
  if (value) generate(value);
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    if (busy) return;
    generate(chip.dataset.example);
  });
});

historyBtn.addEventListener('click', () => {
  historyPanel.classList.toggle('hidden');
  renderHistory();
});
closeHistory.addEventListener('click', () => historyPanel.classList.add('hidden'));

// ---- Start: gespeicherten Zustand laden ----
(async function init() {
  try {
    const state = await window.morphos.loadState();
    if (state && Array.isArray(state.history) && state.history.length) {
      history = state.history;
      activeId = state.activeId || history[history.length - 1].id;
      const active = history.find((e) => e.id === activeId) || history[history.length - 1];
      renderApp(active.html);
      renderHistory();
    }
  } catch { /* frischer Start */ }
  promptInput.focus();
})();
