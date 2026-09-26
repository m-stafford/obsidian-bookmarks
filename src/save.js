// Orchestrates one save: classify the tab, talk to arXiv if it's a paper, and
// append a line to the target note through the Obsidian client. Never throws;
// every outcome is a { status, message?, code? } result.

import { parseArxivUrl, absUrl, pdfUrl, fetchArxivTitle } from './arxiv.js';
import { formatLine, pdfVaultPath, cleanTabTitle, localDate } from './format.js';
import { createClient, ObsidianError } from './obsidian.js';

const HTTP_URL_RE = /^https?:\/\//i;
// Stays under Chrome's 30 s limit on a single service-worker fetch.
const PDF_TIMEOUT_MS = 25_000;
// Characters that can legitimately follow a URL in markdown/plain text.
const URL_BOUNDARY = String.raw`(?=$|[\s)\]>"'<])`;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function noteHasUrl(note, url) {
  return new RegExp(escapeRegExp(url) + URL_BOUNDARY).test(note);
}

// Matches arxiv.org/abs/<id>, optionally versioned, but not a longer id that
// merely starts with this one.
export function noteHasArxivId(note, id) {
  return new RegExp(String.raw`arxiv\.org/abs/${escapeRegExp(id)}(?:v\d+)?(?![0-9])`, 'i').test(note);
}

function looksLikePdf(bytes) {
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
}

function tidyTitle(title) {
  return String(title ?? '').replace(/\s+/g, ' ').trim();
}

function dup(settings) {
  return { status: 'dup', message: `Already in ${settings.targetNote}` };
}

async function savePage({ url, title }, settings, { client, date }) {
  const note = (await client.getNote(settings.targetNote)) ?? '';
  if (noteHasUrl(note, url)) return dup(settings);
  const line = formatLine({ title: tidyTitle(title) || url, url, date });
  await client.appendToNote(settings.targetNote, line);
  return { status: 'ok' };
}

// Downloads the PDF into the vault. Resolves to null on success or a reason
// string on failure. Auth errors are rethrown: they'd fail the append too and
// the user needs to know about them, not a "partial" save.
async function downloadPdf(id, pdfPath, { client, fetchFn }) {
  try {
    const res = await fetchFn(pdfUrl(id), { signal: AbortSignal.timeout(PDF_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`arXiv responded ${res.status}`);
    const bytes = await res.arrayBuffer();
    if (!looksLikePdf(bytes)) throw new Error('arXiv response was not a PDF');
    await client.putBinary(pdfPath, bytes, 'application/pdf');
    return null;
  } catch (err) {
    if (err instanceof ObsidianError && err.kind === 'auth') throw err;
    if (err?.name === 'TimeoutError') return 'arXiv PDF download timed out';
    return err?.message || String(err);
  }
}

async function savePaper({ id, title }, settings, { client, fetchFn, fetchTitle, date }) {
  const apiTitle = await fetchTitle(id, fetchFn);
  // A PDF-viewer tab titled "<id>v2.pdf" carries no real title.
  let tabTitle = cleanTabTitle(title);
  if (new RegExp(String.raw`^${escapeRegExp(id)}(v\d+)?(\.pdf)?$`, 'i').test(tabTitle)) tabTitle = '';
  // The file name only carries a real title; the link text falls back to the id.
  const knownTitle = apiTitle || tabTitle;
  const paperTitle = knownTitle || id;
  const pdfPath = pdfVaultPath(settings.papersFolder, id, knownTitle);

  const note = (await client.getNote(settings.targetNote)) ?? '';
  const inNote = noteHasArxivId(note, id);
  let pdfExists = await client.fileExists(pdfPath);
  if (inNote && pdfExists) return dup(settings);

  let pdfError = null;
  if (!pdfExists) {
    pdfError = await downloadPdf(id, pdfPath, { client, fetchFn });
    pdfExists = pdfError === null;
  }

  if (!inNote) {
    const line = formatLine({
      title: paperTitle,
      url: absUrl(id),
      date,
      pdfPath: pdfExists ? pdfPath : undefined,
    });
    await client.appendToNote(settings.targetNote, line);
  }

  if (pdfExists) return { status: 'ok' };
  return { status: 'partial', message: `Saved link; PDF failed: ${pdfError}` };
}

export async function saveTab(tab, settings, deps = {}) {
  const url = String(tab?.url ?? '');
  if (!HTTP_URL_RE.test(url)) return { status: 'error', message: "Can't save this page" };
  if (!settings?.apiKey) return { status: 'error', message: 'No API key configured', code: 'no-api-key' };

  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const ctx = {
    client: deps.client ?? createClient({ baseUrl: settings.apiBaseUrl, apiKey: settings.apiKey, fetchFn }),
    fetchFn,
    fetchTitle: deps.fetchTitle ?? fetchArxivTitle,
    date: localDate((deps.now ?? (() => new Date()))()),
  };

  try {
    const paper = parseArxivUrl(url);
    if (paper) return await savePaper({ id: paper.id, title: tab.title }, settings, ctx);
    return await savePage({ url, title: tab.title }, settings, ctx);
  } catch (err) {
    if (err instanceof ObsidianError) return { status: 'error', message: err.message };
    return { status: 'error', message: `Unexpected error: ${err?.message ?? String(err)}` };
  }
}
