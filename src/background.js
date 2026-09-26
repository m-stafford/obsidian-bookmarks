// Service worker: wires the toolbar button and the keyboard shortcut to
// saveTab, then reports the result as a badge (and a notification for
// anything other than a clean save).

import { saveTab } from './save.js';
import { loadSettings } from './settings.js';

const BADGE = {
  ok: { text: '✓', color: '#2E7D32' }, // ✓ green
  partial: { text: '⚠', color: '#F9A825' }, // ⚠ amber
  dup: { text: 'dup', color: '#757575' }, // grey
  error: { text: '!', color: '#C62828' }, // red
  busy: { text: '\u2026', color: '#757575' }, // … grey, while saving
};
const BADGE_TTL_MS = 4000;
const NOTIFICATION_TITLE = 'Obsidian Bookmarks';
const COMMAND_SAVE = 'save-page';

let badgeTimer = null;
let inFlight = false;

async function showBadge(status) {
  const { text, color } = BADGE[status] ?? BADGE.error;
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  if (badgeTimer) clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    badgeTimer = null;
  }, BADGE_TTL_MS);
}

// Shown while a save runs; the result badge replaces it and arms the clear.
async function showBusyBadge() {
  if (badgeTimer) clearTimeout(badgeTimer);
  badgeTimer = null;
  const { text, color } = BADGE.busy;
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

function notify(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: NOTIFICATION_TITLE,
    message: String(message),
  });
}

async function handleSave(tab) {
  if (inFlight) return; // ignore a second click while a save is running
  inFlight = true;
  try {
    await showBusyBadge();
    const settings = await loadSettings();
    const result = await saveTab({ url: tab?.url, title: tab?.title }, settings);
    if (result.code === 'no-api-key') chrome.runtime.openOptionsPage().catch(console.error);
    await showBadge(result.status);
    if (result.status !== 'ok' && result.message) notify(result.message);
  } catch (err) {
    // saveTab never throws; this guards the Chrome calls around it.
    await showBadge('error');
    notify(err?.message ?? String(err));
  } finally {
    inFlight = false;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

chrome.action.onClicked.addListener((tab) => {
  handleSave(tab).catch(console.error);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== COMMAND_SAVE) return;
  (tab ? Promise.resolve(tab) : activeTab()).then(handleSave).catch(console.error);
});
