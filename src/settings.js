// Settings live in chrome.storage.local (not synced: the API key is local to
// this machine). normalizeSettings is pure so it can be tested in Node.

export const DEFAULTS = Object.freeze({
  apiBaseUrl: 'http://127.0.0.1:27123',
  apiKey: '',
  targetNote: 'Reading List.md',
  papersFolder: 'Papers',
});

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const stripSlashes = (s) => s.replace(/^\/+|\/+$/g, '');

export function normalizeSettings(raw = {}) {
  const src = raw ?? {};
  let apiBaseUrl = (str(src.apiBaseUrl) || DEFAULTS.apiBaseUrl).replace(/\/+$/, '');
  // A scheme-less "127.0.0.1:27123" is not fetchable; assume plain http.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(apiBaseUrl)) apiBaseUrl = `http://${apiBaseUrl}`;
  const apiKey = str(src.apiKey);
  let targetNote = stripSlashes(str(src.targetNote) || DEFAULTS.targetNote);
  if (!/\.md$/i.test(targetNote)) targetNote += '.md';
  // An empty folder is a deliberate choice (vault root); only undefined means "use the default".
  const papersFolder = stripSlashes(src.papersFolder === undefined ? DEFAULTS.papersFolder : str(src.papersFolder));
  return { apiBaseUrl, apiKey, targetNote, papersFolder };
}

export async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return normalizeSettings(stored);
}

export async function saveSettings(values) {
  const settings = normalizeSettings(values);
  await chrome.storage.local.set(settings);
  return settings;
}
