// Minimal client for the Obsidian Local REST API plugin. Every HTTP failure
// becomes an ObsidianError with a user-facing message; callers never see raw
// fetch errors or status codes.

const SNIPPET_LENGTH = 200;

export class ObsidianError extends Error {
  constructor(message, { kind, status, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ObsidianError';
    this.kind = kind; // 'unreachable' | 'auth' | 'http'
    this.status = status;
  }
}

export function encodeVaultPath(path) {
  return String(path)
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

// Release the body of a response we don't read so the connection can be reused.
function discard(res) {
  try {
    const p = res.body?.cancel?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // ignore
  }
}

export function createClient({ baseUrl, apiKey, fetchFn = globalThis.fetch }) {
  const base = String(baseUrl ?? '').replace(/\/+$/, '');
  const vaultUrl = (path) => `${base}/vault/${encodeVaultPath(path)}`;

  async function request(method, url, { headers = {}, body } = {}) {
    const init = { method, headers: { Authorization: `Bearer ${apiKey}`, ...headers } };
    if (body !== undefined) init.body = body;
    try {
      return await fetchFn(url, init);
    } catch (cause) {
      throw new ObsidianError(`Can't reach Obsidian Local REST API at ${base}, is Obsidian open?`, {
        kind: 'unreachable',
        cause,
      });
    }
  }

  async function fail(res) {
    if (res.status === 401 || res.status === 403) {
      discard(res);
      throw new ObsidianError('API key rejected, check options', { kind: 'auth', status: res.status });
    }
    let snippet = '';
    try {
      snippet = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH);
    } catch {
      // body unreadable; report the status alone
    }
    throw new ObsidianError(`Obsidian API error ${res.status}${snippet ? `: ${snippet}` : ''}`, {
      kind: 'http',
      status: res.status,
    });
  }

  async function getNote(path) {
    const res = await request('GET', vaultUrl(path), { headers: { Accept: 'text/markdown' } });
    if (res.status === 404) {
      discard(res);
      return null;
    }
    if (!res.ok) await fail(res);
    return res.text();
  }

  async function fileExists(path) {
    const res = await request('GET', vaultUrl(path));
    if (res.status === 404) {
      discard(res);
      return false;
    }
    if (!res.ok) await fail(res);
    discard(res);
    return true;
  }

  // The plugin adds a newline to a note that lacks one before appending, so the
  // text always starts on its own line; we only guarantee the trailing newline.
  async function appendToNote(path, text) {
    const suffix = text.endsWith('\n') ? '' : '\n';
    const res = await request('POST', vaultUrl(path), {
      headers: { 'Content-Type': 'text/markdown' },
      body: `${text}${suffix}`,
    });
    if (!res.ok) await fail(res);
    discard(res);
  }

  async function putBinary(path, bytes, contentType) {
    const res = await request('PUT', vaultUrl(path), {
      headers: { 'Content-Type': contentType },
      body: bytes,
    });
    if (!res.ok) await fail(res);
    discard(res);
  }

  // The plugin's root endpoint answers without auth and reports whether the
  // supplied key was accepted.
  async function ping() {
    const res = await request('GET', `${base}/`, { headers: { Accept: 'application/json' } });
    if (!res.ok) await fail(res);
    let info = {};
    try {
      info = await res.json();
    } catch {
      info = {};
    }
    if (info.authenticated === false) {
      throw new ObsidianError('API key rejected, check options', { kind: 'auth', status: res.status });
    }
    return { version: info?.versions?.self ?? null };
  }

  return { getNote, fileExists, appendToNote, putBinary, ping };
}
