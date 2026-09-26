import { describe, it, expect, vi } from 'vitest';
import {
  parseArxivUrl,
  absUrl,
  pdfUrl,
  apiUrl,
  parseAtomTitle,
  fetchArxivTitle,
} from '../src/arxiv.js';

describe('parseArxivUrl', () => {
  it.each([
    ['https://arxiv.org/abs/2401.12345', '2401.12345'],
    ['https://arxiv.org/abs/2401.12345v2', '2401.12345'],
    ['https://arxiv.org/pdf/2401.12345', '2401.12345'],
    ['https://arxiv.org/pdf/2401.12345.pdf', '2401.12345'],
    ['https://arxiv.org/pdf/2401.12345v3.pdf', '2401.12345'],
    ['https://www.arxiv.org/abs/2401.12345', '2401.12345'],
    ['http://arxiv.org/abs/2401.12345', '2401.12345'],
    ['https://arxiv.org/abs/2401.1234', '2401.1234'],            // 4-digit sequence (pre-2015)
    ['https://arxiv.org/abs/hep-th/9901001', 'hep-th/9901001'],
    ['https://arxiv.org/pdf/hep-th/9901001v1', 'hep-th/9901001'],
    ['https://arxiv.org/abs/math.GT/0309136', 'math.GT/0309136'],
    ['https://arxiv.org/abs/2401.12345?context=cs', '2401.12345'],
    ['https://arxiv.org/abs/2401.12345#abstract', '2401.12345'],
    ['https://arxiv.org/abs/2401.12345/', '2401.12345'],
  ])('parses %s → %s', (url, id) => {
    expect(parseArxivUrl(url)).toEqual({ id });
  });

  it.each([
    'https://example.com/abs/2401.12345',
    'https://arxiv.org/list/cs.AI/recent',
    'https://arxiv.org/abs/',
    'https://arxiv.org/abs/notanid',
    'https://scholar.google.com/?q=arxiv.org/abs/2401.12345',
    'ftp://arxiv.org/abs/2401.12345',
    '',
    null,
    undefined,
  ])('returns null for %s', (url) => {
    expect(parseArxivUrl(url)).toBeNull();
  });
});

describe('URL builders', () => {
  it('builds canonical abs and pdf URLs without a version', () => {
    expect(absUrl('2401.12345')).toBe('https://arxiv.org/abs/2401.12345');
    expect(pdfUrl('2401.12345')).toBe('https://arxiv.org/pdf/2401.12345');
    expect(absUrl('hep-th/9901001')).toBe('https://arxiv.org/abs/hep-th/9901001');
  });
  it('builds the export API query URL', () => {
    expect(apiUrl('2401.12345')).toBe('https://export.arxiv.org/api/query?id_list=2401.12345');
    expect(apiUrl('hep-th/9901001')).toBe('https://export.arxiv.org/api/query?id_list=hep-th/9901001');
  });
});

const FEED = (entryTitle, entryId = 'http://arxiv.org/abs/2401.12345v1') => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query: search_query=&amp;id_list=2401.12345</title>
  <id>http://arxiv.org/api/abc</id>
  <entry>
    <id>${entryId}</id>
    <title>${entryTitle}</title>
    <summary>Some summary with a &lt;title&gt; word in it.</summary>
  </entry>
</feed>`;

describe('parseAtomTitle', () => {
  it('returns the first entry title, not the feed title', () => {
    expect(parseAtomTitle(FEED('Attention Is All You Need'))).toBe('Attention Is All You Need');
  });
  it('collapses whitespace and newlines', () => {
    expect(parseAtomTitle(FEED('Attention Is\n    All   You\tNeed'))).toBe('Attention Is All You Need');
  });
  it('decodes XML entities', () => {
    // Review Focus 1
    expect(parseAtomTitle(FEED('Bits &amp; Pieces: &lt;3 &quot;Quoted&quot; &#39;s &#x27;t')))
      .toBe('Bits & Pieces: <3 "Quoted" \'s \'t');
  });
  it('returns null when there is no entry', () => {
    expect(parseAtomTitle('<feed><title>ArXiv Query</title></feed>')).toBeNull();
    expect(parseAtomTitle('')).toBeNull();
    expect(parseAtomTitle(null)).toBeNull();
  });
  it('returns null for an arXiv error entry', () => {
    expect(parseAtomTitle(FEED('Error', 'http://arxiv.org/api/errors#incorrect_id_format_for_2401.99999'))).toBeNull();
  });
  it('returns null when the entry title is empty', () => {
    expect(parseAtomTitle(FEED('   '))).toBeNull();
  });
});

describe('fetchArxivTitle', () => {
  it('fetches the export API and returns the parsed title', async () => {
    const fetchFn = vi.fn(async () => new Response(FEED('Attention Is All You Need'), { status: 200 }));
    await expect(fetchArxivTitle('2401.12345', fetchFn)).resolves.toBe('Attention Is All You Need');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe('https://export.arxiv.org/api/query?id_list=2401.12345');
    expect(fetchFn.mock.calls[0][1].signal).toEqual(expect.any(AbortSignal));
  });
  it('returns null on a non-OK response', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 503 }));
    await expect(fetchArxivTitle('2401.12345', fetchFn)).resolves.toBeNull();
  });
  it('returns null when fetch rejects', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(fetchArxivTitle('2401.12345', fetchFn)).resolves.toBeNull();
  });
  it('returns null when the request times out', async () => {
    const fetchFn = vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError'); });
    await expect(fetchArxivTitle('2401.12345', fetchFn)).resolves.toBeNull();
  });
  it('returns null when the body is not parseable', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>blocked</html>', { status: 200 }));
    await expect(fetchArxivTitle('2401.12345', fetchFn)).resolves.toBeNull();
  });
});
