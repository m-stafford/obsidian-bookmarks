// Options page: edit the four settings and test the REST API connection with
// the values currently in the form (before saving).

import { DEFAULTS, loadSettings, normalizeSettings, saveSettings } from '../src/settings.js';
import { createClient } from '../src/obsidian.js';

const FIELDS = Object.keys(DEFAULTS);
const $ = (id) => document.getElementById(id);
const statusEl = $('status');

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = kind;
}

function readForm() {
  return Object.fromEntries(FIELDS.map((key) => [key, $(key).value]));
}

function fillForm(settings) {
  for (const key of FIELDS) $(key).value = settings[key];
}

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const saved = await saveSettings(readForm());
  fillForm(saved);
  setStatus('Saved.', 'ok');
});

$('test').addEventListener('click', async () => {
  const { apiBaseUrl, apiKey } = normalizeSettings(readForm());
  if (!apiKey) {
    setStatus('Enter the API key first.', 'err');
    return;
  }
  setStatus('Testing…');
  try {
    const { version } = await createClient({ baseUrl: apiBaseUrl, apiKey }).ping();
    setStatus(`Connected to Obsidian Local REST API${version ? ` v${version}` : ''}.`, 'ok');
  } catch (err) {
    setStatus(err?.message ?? String(err), 'err');
  }
});

fillForm(await loadSettings());
