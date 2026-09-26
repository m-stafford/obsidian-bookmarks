import { describe, it, expect, vi } from 'vitest';
import { saveTab, noteHasUrl, noteHasArxivId } from '../src/save.js';
import { ObsidianError } from '../src/obsidian.js';

const SETTINGS = {
  apiBaseUrl: 'http://127.0.0.1:27123',
  apiKey: 'k',
  targetNote: 'Reading List.md',
  papersFolder: 'Papers',
};
const DATE = '2026-09-26';
const now = () => new Date(2026, 8, 26, 10, 0);

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]).buffer; // "%PDF-1.4"
const HTML_BYTES = new TextEncoder().encode('<html>PDF unavailable</html>').buffer;

// A fake obsidian client. `note` is the target note's text (null = missing);
// `files` is a set of vault paths that exist.
function fakeClient({ note = null, files = [] } = {}) {
  const existing = new Set(files);
  return {
    getNote: vi.fn(async () => note),
    fileExists: vi.fn(async (p) => existing.has(p)),
    appendToNote: vi.fn(async () => {}),
    putBinary: vi.fn(async (p) => { existing.add(p); }),
    ping: vi.fn(async () => ({ version: '1' })),
  };
}

function pdfFetch(bytes = PDF_BYTES, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes,
  }));
}

const okTitle = async () => 'Attention Is All You Need';
const noTitle = async () => null;

function deps(client, extra = {}) {
  return { client, fetchFn: pdfFetch(), fetchTitle: okTitle, now, ...extra };
}

describe('noteHasUrl', () => {
  it('matches the URL as a whole token', () => {
    expect(noteHasUrl('- [x](https://example.com/a) — 2026-01-01\n', 'https://example.com/a')).toBe(true);
    expect(noteHasUrl('see https://example.com/a for details', 'https://example.com/a')).toBe(true);
    expect(noteHasUrl('<https://example.com/a>', 'https://example.com/a')).toBe(true);
  });
  it('does not match when the note only has a longer URL sharing the prefix', () => {
    // Review Focus 2
    expect(noteHasUrl('- [x](https://example.com/ab)\n', 'https://example.com/a')).toBe(false);
    expect(noteHasUrl('- [x](https://example.com/a/b)\n', 'https://example.com/a')).toBe(false);
  });
  it('treats regex metacharacters in the URL literally', () => {
    expect(noteHasUrl('- [x](https://example.com/q?a=1&b=2)', 'https://example.com/q?a=1&b=2')).toBe(true);
    expect(noteHasUrl('- [x](https://example.com/qXa=1&b=2)', 'https://example.com/q.a=1&b=2')).toBe(false);
  });
});

describe('noteHasArxivId', () => {
  it('matches arxiv.org/abs/<id> with or without a version', () => {
    expect(noteHasArxivId('- [t](https://arxiv.org/abs/2401.12345) — d', '2401.12345')).toBe(true);
    expect(noteHasArxivId('- [t](https://arxiv.org/abs/2401.12345v2) — d', '2401.12345')).toBe(true);
    expect(noteHasArxivId('- [t](https://arxiv.org/abs/hep-th/9901001) — d', 'hep-th/9901001')).toBe(true);
  });
  it('does not match a different id that extends this one', () => {
    // Review Focus 2
    expect(noteHasArxivId('- [t](https://arxiv.org/abs/2401.12345) — d', '2401.1234')).toBe(false);
  });
  it('does not match pdf links or bare ids', () => {
    expect(noteHasArxivId('https://arxiv.org/pdf/2401.12345', '2401.12345')).toBe(false);
    expect(noteHasArxivId('2401.12345', '2401.12345')).toBe(false);
  });
});

describe('saveTab: guards', () => {
  it('rejects non-http(s) URLs without touching the client', async () => {
    const client = fakeClient();
    for (const url of ['chrome://extensions', 'file:///tmp/x.pdf', 'about:blank', '', undefined]) {
      await expect(saveTab({ url, title: 'x' }, SETTINGS, deps(client))).resolves.toEqual({
        status: 'error',
        message: "Can't save this page",
      });
    }
    expect(client.getNote).not.toHaveBeenCalled();
  });
  it('reports a missing API key with code no-api-key', async () => {
    const client = fakeClient();
    const result = await saveTab({ url: 'https://example.com/', title: 'x' }, { ...SETTINGS, apiKey: '' }, deps(client));
    expect(result).toEqual({ status: 'error', message: 'No API key configured', code: 'no-api-key' });
    expect(client.getNote).not.toHaveBeenCalled();
  });
});

describe('saveTab: normal page', () => {
  it('appends a formatted line when the note is missing', async () => {
    const client = fakeClient({ note: null });
    const result = await saveTab({ url: 'https://example.com/', title: 'Example Domain' }, SETTINGS, deps(client));
    expect(result).toEqual({ status: 'ok' });
    expect(client.appendToNote).toHaveBeenCalledTimes(1);
    expect(client.appendToNote).toHaveBeenCalledWith(
      'Reading List.md',
      `- [Example Domain](https://example.com/) — ${DATE}`,
    );
    expect(client.fileExists).not.toHaveBeenCalled();
    expect(client.putBinary).not.toHaveBeenCalled();
  });
  it('returns dup when the URL is already in the note', async () => {
    const client = fakeClient({ note: '- [Example](https://example.com/) — 2026-01-01\n' });
    const result = await saveTab({ url: 'https://example.com/', title: 'T' }, SETTINGS, deps(client));
    expect(result).toEqual({ status: 'dup', message: 'Already in Reading List.md' });
    expect(client.appendToNote).not.toHaveBeenCalled();
  });
  it('does not report dup for a longer URL sharing the prefix', async () => {
    // Review Focus 2
    const client = fakeClient({ note: '- [x](https://example.com/ab) — 2026-01-01\n' });
    const result = await saveTab({ url: 'https://example.com/a', title: 'T' }, SETTINGS, deps(client));
    expect(result).toEqual({ status: 'ok' });
  });
  it('escapes brackets in the title and collapses whitespace', async () => {
    const client = fakeClient();
    await saveTab({ url: 'https://example.com/x', title: '  Re: [RFC]\n Thing ' }, SETTINGS, deps(client));
    expect(client.appendToNote.mock.calls[0][1]).toBe(`- [Re: \\[RFC\\] Thing](https://example.com/x) — ${DATE}`);
  });
  it('falls back to the URL as link text when the title is empty', async () => {
    // Review Focus 5
    const client = fakeClient();
    for (const title of ['', '   ', undefined, null]) {
      client.appendToNote.mockClear();
      await saveTab({ url: 'https://example.com/x', title }, SETTINGS, deps(client));
      expect(client.appendToNote.mock.calls[0][1]).toBe(`- [https://example.com/x](https://example.com/x) — ${DATE}`);
    }
  });
});

describe('saveTab: arXiv paper', () => {
  const ABS = 'https://arxiv.org/abs/2401.12345';
  const PDF_PATH = 'Papers/2401.12345 Attention Is All You Need.pdf';
  const FULL_LINE = `- [Attention Is All You Need](${ABS}) · [[${PDF_PATH}|PDF]] — ${DATE}`;
  const BARE_LINE = `- [Attention Is All You Need](${ABS}) — ${DATE}`;

  it('downloads the PDF, PUTs it, and appends a line with the PDF link', async () => {
    const client = fakeClient();
    const fetchFn = pdfFetch();
    const result = await saveTab({ url: ABS, title: '[2401.12345] Attention Is All You Need' }, SETTINGS, deps(client, { fetchFn }));
    expect(result).toEqual({ status: 'ok' });
    expect(fetchFn).toHaveBeenCalledWith('https://arxiv.org/pdf/2401.12345', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(client.putBinary).toHaveBeenCalledTimes(1);
    const [putPath, putBytes, putType] = client.putBinary.mock.calls[0];
    expect(putPath).toBe(PDF_PATH);
    expect(putBytes).toBe(PDF_BYTES);
    expect(putType).toBe('application/pdf');
    expect(client.appendToNote).toHaveBeenCalledWith('Reading List.md', FULL_LINE);
  });
  it('canonicalizes versioned /pdf/ URLs to the abs URL without a version', async () => {
    const client = fakeClient();
    await saveTab({ url: 'https://arxiv.org/pdf/2401.12345v2.pdf', title: '2401.12345v2.pdf' }, SETTINGS, deps(client));
    expect(client.appendToNote.mock.calls[0][1]).toBe(FULL_LINE);
    expect(client.fileExists).toHaveBeenCalledWith(PDF_PATH);
  });
  it('uses the cleaned tab title when the arXiv API gives no title', async () => {
    const client = fakeClient();
    await saveTab({ url: ABS, title: '[2401.12345] Attention Is All You Need - v2 | arXiv' }, SETTINGS, deps(client, { fetchTitle: noTitle }));
    expect(client.appendToNote.mock.calls[0][1]).toBe(FULL_LINE);
  });
  it('falls back to the id when both the API and the tab title are empty', async () => {
    const client = fakeClient();
    await saveTab({ url: ABS, title: '' }, SETTINGS, deps(client, { fetchTitle: noTitle }));
    expect(client.appendToNote.mock.calls[0][1]).toBe(`- [2401.12345](${ABS}) · [[Papers/2401.12345.pdf|PDF]] — ${DATE}`);
  });
  it('treats a PDF-viewer tab title that is just the id as no title', async () => {
    const client = fakeClient();
    await saveTab({ url: 'https://arxiv.org/pdf/2401.12345v2.pdf', title: '2401.12345v2.pdf' }, SETTINGS, deps(client, { fetchTitle: noTitle }));
    expect(client.appendToNote.mock.calls[0][1]).toBe(`- [2401.12345](${ABS}) · [[Papers/2401.12345.pdf|PDF]] — ${DATE}`);
    expect(client.putBinary.mock.calls[0][0]).toBe('Papers/2401.12345.pdf');
  });
  it('handles old-style ids in the path and link', async () => {
    const client = fakeClient();
    await saveTab({ url: 'https://arxiv.org/abs/hep-th/9901001', title: 'x' }, SETTINGS, deps(client, { fetchTitle: async () => 'Old Paper' }));
    expect(client.appendToNote.mock.calls[0][1]).toBe(
      `- [Old Paper](https://arxiv.org/abs/hep-th/9901001) · [[Papers/hep-th_9901001 Old Paper.pdf|PDF]] — ${DATE}`,
    );
    expect(client.putBinary.mock.calls[0][0]).toBe('Papers/hep-th_9901001 Old Paper.pdf');
  });
  it('returns partial without a PDF link when the PDF fetch is non-OK', async () => {
    const client = fakeClient();
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client, { fetchFn: pdfFetch(PDF_BYTES, 503) }));
    expect(result.status).toBe('partial');
    expect(result.message).toMatch(/^Saved link; PDF failed: .*503/);
    expect(client.putBinary).not.toHaveBeenCalled();
    expect(client.appendToNote).toHaveBeenCalledWith('Reading List.md', BARE_LINE);
  });
  it('returns partial when the PDF fetch rejects', async () => {
    const client = fakeClient();
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client, { fetchFn }));
    expect(result).toEqual({ status: 'partial', message: 'Saved link; PDF failed: Failed to fetch' });
    expect(client.appendToNote.mock.calls[0][1]).toBe(BARE_LINE);
  });
  it('returns partial with a timeout reason when the PDF download times out', async () => {
    const client = fakeClient();
    const fetchFn = vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError'); });
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client, { fetchFn }));
    expect(result).toEqual({ status: 'partial', message: 'Saved link; PDF failed: arXiv PDF download timed out' });
    expect(client.appendToNote).toHaveBeenCalledWith('Reading List.md', BARE_LINE);
  });
  it('returns partial and does not PUT when the response is not a PDF', async () => {
    // Review Focus 4
    const client = fakeClient();
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client, { fetchFn: pdfFetch(HTML_BYTES) }));
    expect(result.status).toBe('partial');
    expect(result.message).toMatch(/not a PDF/i);
    expect(client.putBinary).not.toHaveBeenCalled();
    expect(client.appendToNote.mock.calls[0][1]).toBe(BARE_LINE);
  });
  it('returns partial when the PUT fails with a non-auth error', async () => {
    const client = fakeClient();
    client.putBinary.mockRejectedValue(new ObsidianError('Obsidian API error 500: disk full', { kind: 'http', status: 500 }));
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client));
    expect(result).toEqual({ status: 'partial', message: 'Saved link; PDF failed: Obsidian API error 500: disk full' });
    expect(client.appendToNote.mock.calls[0][1]).toBe(BARE_LINE);
  });
  it('returns dup when the id is in the note and the PDF exists, without fetching', async () => {
    const client = fakeClient({ note: `${FULL_LINE}\n`, files: [PDF_PATH] });
    const fetchFn = pdfFetch();
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client, { fetchFn }));
    expect(result).toEqual({ status: 'dup', message: 'Already in Reading List.md' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(client.appendToNote).not.toHaveBeenCalled();
    expect(client.putBinary).not.toHaveBeenCalled();
  });
  it('retry after partial: downloads the PDF but does not append or rewrite the line', async () => {
    const client = fakeClient({ note: `${BARE_LINE}\n`, files: [] });
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client));
    expect(result).toEqual({ status: 'ok' });
    expect(client.putBinary).toHaveBeenCalledTimes(1);
    expect(client.appendToNote).not.toHaveBeenCalled();
  });
  it('retry after partial that fails again stays partial without appending', async () => {
    const client = fakeClient({ note: `${BARE_LINE}\n`, files: [] });
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client, { fetchFn: pdfFetch(PDF_BYTES, 404) }));
    expect(result.status).toBe('partial');
    expect(client.appendToNote).not.toHaveBeenCalled();
  });
  it('appends a line with the PDF link when the PDF exists but the id is not in the note', async () => {
    const client = fakeClient({ note: '# Reading\n', files: [PDF_PATH] });
    const fetchFn = pdfFetch();
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client, { fetchFn }));
    expect(result).toEqual({ status: 'ok' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(client.appendToNote).toHaveBeenCalledWith('Reading List.md', FULL_LINE);
  });
  it('does not treat a longer id in the note as a duplicate', async () => {
    // Review Focus 2
    const client = fakeClient({ note: `${FULL_LINE}\n`, files: [] });
    const result = await saveTab({ url: 'https://arxiv.org/abs/2401.1234', title: 'x' }, SETTINGS, deps(client, { fetchTitle: async () => 'Short Id' }));
    expect(result).toEqual({ status: 'ok' });
    expect(client.appendToNote).toHaveBeenCalledTimes(1);
    expect(client.appendToNote.mock.calls[0][1]).toContain('https://arxiv.org/abs/2401.1234)');
  });
  it('matches a versioned abs link in the note as the same paper', async () => {
    const client = fakeClient({ note: `- [t](${ABS}v2) — d\n`, files: [PDF_PATH] });
    const result = await saveTab({ url: ABS, title: 'x' }, SETTINGS, deps(client));
    expect(result.status).toBe('dup');
  });
});

describe('saveTab: errors', () => {
  it('maps an unreachable client error to status error with its message', async () => {
    const client = fakeClient();
    const msg = "Can't reach Obsidian Local REST API at http://127.0.0.1:27123, is Obsidian open?";
    client.getNote.mockRejectedValue(new ObsidianError(msg, { kind: 'unreachable' }));
    await expect(saveTab({ url: 'https://example.com/', title: 'T' }, SETTINGS, deps(client)))
      .resolves.toEqual({ status: 'error', message: msg });
  });
  it('maps an auth error during append to status error', async () => {
    const client = fakeClient();
    client.appendToNote.mockRejectedValue(new ObsidianError('API key rejected, check options', { kind: 'auth', status: 401 }));
    await expect(saveTab({ url: 'https://example.com/', title: 'T' }, SETTINGS, deps(client)))
      .resolves.toEqual({ status: 'error', message: 'API key rejected, check options' });
  });
  it('maps an auth error during a paper PUT to status error (not partial)', async () => {
    const client = fakeClient();
    client.putBinary.mockRejectedValue(new ObsidianError('API key rejected, check options', { kind: 'auth', status: 401 }));
    const result = await saveTab({ url: 'https://arxiv.org/abs/2401.12345', title: 'x' }, SETTINGS, deps(client));
    expect(result).toEqual({ status: 'error', message: 'API key rejected, check options' });
    expect(client.appendToNote).not.toHaveBeenCalled();
  });
  it('wraps unexpected exceptions', async () => {
    const client = fakeClient();
    client.getNote.mockRejectedValue(new RangeError('boom'));
    await expect(saveTab({ url: 'https://example.com/', title: 'T' }, SETTINGS, deps(client)))
      .resolves.toEqual({ status: 'error', message: 'Unexpected error: boom' });
  });
  it('builds a real client from settings when none is injected', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const result = await saveTab({ url: 'https://example.com/', title: 'T' }, SETTINGS, { fetchFn, now });
    expect(result).toEqual({
      status: 'error',
      message: "Can't reach Obsidian Local REST API at http://127.0.0.1:27123, is Obsidian open?",
    });
    expect(fetchFn.mock.calls[0][0]).toBe('http://127.0.0.1:27123/vault/Reading%20List.md');
  });
});
