// arXiv URL classification and title lookup. `fetch` is injected so tests
// and the service worker can supply their own.

// New-style "2401.12345" (4 or 5 digit sequence) or old-style "hep-th/9901001",
// "math.GT/0309136".
const ARXIV_ID = String.raw`(\d{4}\.\d{4,5}|[a-z][a-z-]*(?:\.[a-z]{2})?/\d{7})`;

export const ARXIV_URL_RE = new RegExp(
  String.raw`^https?://(?:www\.)?arxiv\.org/(?:abs|pdf)/${ARXIV_ID}(?:v\d+)?(?:\.pdf)?/?(?:[?#].*)?$`,
  'i',
);

export function parseArxivUrl(url) {
  const m = ARXIV_URL_RE.exec(String(url ?? '').trim());
  return m ? { id: m[1] } : null;
}

export function absUrl(id) {
  return `https://arxiv.org/abs/${id}`;
}

export function pdfUrl(id) {
  return `https://arxiv.org/pdf/${id}`;
}

export function apiUrl(id) {
  // ids only contain [A-Za-z0-9.-/], all safe in a query string.
  return `https://export.arxiv.org/api/query?id_list=${id}`;
}

// Chrome kills a service worker whose fetch runs past 30 s; give up well before.
const ARXIV_API_TIMEOUT_MS = 10_000;

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXmlEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = /^#x/i.test(entity) ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function parseAtomTitle(xml) {
  const entry = /<entry\b[^>]*>([\s\S]*?)<\/entry>/i.exec(String(xml ?? ''));
  if (!entry) return null;
  const body = entry[1];
  // Unknown ids come back as an <entry> whose <id> points at api/errors.
  if (/<id>[^<]*\/api\/errors/i.test(body)) return null;
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(body);
  if (!title) return null;
  const text = decodeXmlEntities(title[1]).replace(/\s+/g, ' ').trim();
  return text || null;
}

export async function fetchArxivTitle(id, fetchFn = globalThis.fetch) {
  try {
    const res = await fetchFn(apiUrl(id), { signal: AbortSignal.timeout(ARXIV_API_TIMEOUT_MS) });
    if (!res.ok) return null;
    return parseAtomTitle(await res.text());
  } catch {
    return null;
  }
}
