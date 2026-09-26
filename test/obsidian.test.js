import { describe, it, expect, vi } from 'vitest';
import { createClient, encodeVaultPath, ObsidianError } from '../src/obsidian.js';

const BASE = 'http://127.0.0.1:27123';
const KEY = 'secret-key';

// Response bodies must be null for 204.
function res(status, body = null, headers = {}) {
  return new Response(body, { status, headers });
}

function client(fetchFn, baseUrl = BASE) {
  return createClient({ baseUrl, apiKey: KEY, fetchFn });
}

function lastCall(fetchFn) {
  const [url, init] = fetchFn.mock.calls.at(-1);
  return { url, init, headers: init.headers };
}

describe('encodeVaultPath', () => {
  it('encodes each segment but keeps slashes', () => {
    expect(encodeVaultPath('Reading List.md')).toBe('Reading%20List.md');
    expect(encodeVaultPath('Papers/2401.12345 Foo & Bar.pdf')).toBe('Papers/2401.12345%20Foo%20%26%20Bar.pdf');
  });
  it('drops a leading slash', () => {
    expect(encodeVaultPath('/Papers/x.pdf')).toBe('Papers/x.pdf');
  });
});

describe('getNote', () => {
  it('GETs /vault/<encoded path> with bearer auth and returns the text', async () => {
    const fetchFn = vi.fn(async () => res(200, '- line\n'));
    await expect(client(fetchFn).getNote('Reading List.md')).resolves.toBe('- line\n');
    const { url, init, headers } = lastCall(fetchFn);
    expect(url).toBe(`${BASE}/vault/Reading%20List.md`);
    expect(init.method).toBe('GET');
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers.Accept).toBe('text/markdown');
  });
  it('returns null on 404', async () => {
    const fetchFn = vi.fn(async () => res(404, '{"errorCode":40400,"message":"File does not exist."}'));
    await expect(client(fetchFn).getNote('Missing.md')).resolves.toBeNull();
  });
  it('maps 401 and 403 to an auth ObsidianError', async () => {
    for (const status of [401, 403]) {
      const fetchFn = vi.fn(async () => res(status, '{"message":"Unauthorized"}'));
      const err = await client(fetchFn).getNote('X.md').catch((e) => e);
      expect(err).toBeInstanceOf(ObsidianError);
      expect(err.kind).toBe('auth');
      expect(err.status).toBe(status);
      expect(err.message).toBe('API key rejected, check options');
    }
  });
  it('maps other statuses to an http ObsidianError with a body snippet', async () => {
    const fetchFn = vi.fn(async () => res(500, '  Internal\n   Server Error  '));
    const err = await client(fetchFn).getNote('X.md').catch((e) => e);
    expect(err).toBeInstanceOf(ObsidianError);
    expect(err.kind).toBe('http');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Obsidian API error 500: Internal Server Error');
  });
  it('truncates long body snippets', async () => {
    const fetchFn = vi.fn(async () => res(502, 'x'.repeat(1000)));
    const err = await client(fetchFn).getNote('X.md').catch((e) => e);
    expect(err.message.length).toBeLessThan(260);
    expect(err.message.startsWith('Obsidian API error 502: xxxx')).toBe(true);
  });
  it('maps a rejected fetch to an unreachable ObsidianError naming the base URL', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const err = await client(fetchFn).getNote('X.md').catch((e) => e);
    expect(err).toBeInstanceOf(ObsidianError);
    expect(err.kind).toBe('unreachable');
    expect(err.message).toBe(`Can't reach Obsidian Local REST API at ${BASE}, is Obsidian open?`);
  });
  it('strips a trailing slash from the base URL', async () => {
    const fetchFn = vi.fn(async () => res(200, ''));
    await client(fetchFn, `${BASE}/`).getNote('X.md');
    expect(lastCall(fetchFn).url).toBe(`${BASE}/vault/X.md`);
  });
});

describe('fileExists', () => {
  it('returns true on 200', async () => {
    const fetchFn = vi.fn(async () => res(200, '%PDF-1.4'));
    await expect(client(fetchFn).fileExists('Papers/a b.pdf')).resolves.toBe(true);
    const { url, init } = lastCall(fetchFn);
    expect(url).toBe(`${BASE}/vault/Papers/a%20b.pdf`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
  });
  it('returns false on 404', async () => {
    const fetchFn = vi.fn(async () => res(404, '{}'));
    await expect(client(fetchFn).fileExists('Papers/a.pdf')).resolves.toBe(false);
  });
  it('throws an auth error on 403', async () => {
    const fetchFn = vi.fn(async () => res(403, '{}'));
    await expect(client(fetchFn).fileExists('Papers/a.pdf')).rejects.toMatchObject({ kind: 'auth' });
  });
  it('throws an unreachable error when fetch rejects', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    await expect(client(fetchFn).fileExists('Papers/a.pdf')).rejects.toMatchObject({ kind: 'unreachable' });
  });
});

describe('appendToNote', () => {
  it('POSTs text/markdown and appends a trailing newline', async () => {
    const fetchFn = vi.fn(async () => res(204));
    await client(fetchFn).appendToNote('Reading List.md', '- line');
    const { url, init, headers } = lastCall(fetchFn);
    expect(url).toBe(`${BASE}/vault/Reading%20List.md`);
    expect(init.method).toBe('POST');
    expect(headers['Content-Type']).toBe('text/markdown');
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).toBe('- line\n');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('POSTs the text alone with no pre-GET and no leading newline', async () => {
    const fetchFn = vi.fn(async () => res(204));
    await client(fetchFn).appendToNote('R.md', '- line');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(lastCall(fetchFn).init.method).toBe('POST');
    expect(lastCall(fetchFn).init.body).toBe('- line\n');
  });
  it('does not double a trailing newline already on the text', async () => {
    const fetchFn = vi.fn(async () => res(204));
    await client(fetchFn).appendToNote('R.md', '- line\n');
    expect(lastCall(fetchFn).init.body).toBe('- line\n');
  });
  it('maps a failed POST', async () => {
    const fetchFn = vi.fn(async () => res(401, '{}'));
    await expect(client(fetchFn).appendToNote('R.md', '- line')).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('putBinary', () => {
  it('PUTs the bytes with the given content type to the encoded path', async () => {
    const fetchFn = vi.fn(async () => res(204));
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    await client(fetchFn).putBinary('Papers/2401.12345 Foo.pdf', bytes, 'application/pdf');
    const { url, init, headers } = lastCall(fetchFn);
    expect(url).toBe(`${BASE}/vault/Papers/2401.12345%20Foo.pdf`);
    expect(init.method).toBe('PUT');
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).toBe(bytes);
  });
  it('maps a failed PUT', async () => {
    const fetchFn = vi.fn(async () => res(500, 'disk full'));
    await expect(client(fetchFn).putBinary('P/a.pdf', new ArrayBuffer(4), 'application/pdf'))
      .rejects.toMatchObject({ kind: 'http', status: 500, message: 'Obsidian API error 500: disk full' });
  });
});

describe('ping', () => {
  const info = (authenticated, version = '3.1.0') =>
    JSON.stringify({ status: 'OK', authenticated, versions: { obsidian: '1.6.0', self: version } });

  it('GETs the root and returns the plugin version when authenticated', async () => {
    const fetchFn = vi.fn(async () => res(200, info(true)));
    await expect(client(fetchFn).ping()).resolves.toEqual({ version: '3.1.0' });
    const { url, init } = lastCall(fetchFn);
    expect(url).toBe(`${BASE}/`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
  });
  it('throws an auth error when the root reports authenticated: false', async () => {
    const fetchFn = vi.fn(async () => res(200, info(false)));
    await expect(client(fetchFn).ping()).rejects.toMatchObject({ kind: 'auth', message: 'API key rejected, check options' });
  });
  it('throws an auth error on 401', async () => {
    const fetchFn = vi.fn(async () => res(401, '{}'));
    await expect(client(fetchFn).ping()).rejects.toMatchObject({ kind: 'auth' });
  });
  it('throws unreachable when fetch rejects', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(client(fetchFn).ping()).rejects.toMatchObject({ kind: 'unreachable' });
  });
  it('returns a null version when the body is not JSON', async () => {
    const fetchFn = vi.fn(async () => res(200, 'OK'));
    await expect(client(fetchFn).ping()).resolves.toEqual({ version: null });
  });
});
