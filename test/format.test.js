import { describe, it, expect } from 'vitest';
import {
  localDate,
  escapeLinkText,
  sanitizeFilename,
  pdfVaultPath,
  cleanTabTitle,
  formatLine,
} from '../src/format.js';

describe('localDate', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 8, 26))).toBe('2026-09-26');
  });
});

describe('escapeLinkText', () => {
  it('escapes square brackets', () => {
    expect(escapeLinkText('A [B] C]')).toBe('A \\[B\\] C\\]');
  });
  it('escapes backslashes', () => {
    expect(escapeLinkText('C:\\dir\\')).toBe('C:\\\\dir\\\\');
  });
  it('leaves other text alone', () => {
    expect(escapeLinkText('Plain (title) & more')).toBe('Plain (title) & more');
  });
});

describe('sanitizeFilename', () => {
  it('strips the spec forbidden characters', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });
  it('strips control characters', () => {
    expect(sanitizeFilename('a\u0000b\u001fc\u007fd')).toBe('abcd');
  });
  it('collapses whitespace and trims', () => {
    expect(sanitizeFilename('  Attention\n  Is   All\tYou Need  ')).toBe('Attention Is All You Need');
  });
  it('caps at 120 characters without a trailing space', () => {
    const long = ('word '.repeat(40)).trim(); // 199 chars
    const out = sanitizeFilename(long);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(' ')).toBe(false);
    expect(out.startsWith('word word')).toBe(true);
  });
  it('does not split a surrogate pair at the cap', () => {
    const out = sanitizeFilename('a'.repeat(119) + '\u{1F600}x');
    expect(out.endsWith('\u{1F600}')).toBe(true);
    expect(() => encodeURIComponent(out)).not.toThrow();
  });
  it('strips Obsidian link-breaking characters [ ] # ^', () => {
    // Review Focus 3: these are illegal in Obsidian file names and would break [[…|PDF]].
    expect(sanitizeFilename('Foo [v2] #tag ^ref')).toBe('Foo v2 tag ref');
  });
});

describe('pdfVaultPath', () => {
  it('builds <folder>/<id> <sanitized title>.pdf', () => {
    expect(pdfVaultPath('Papers', '2401.12345', 'Attention: Is All/You Need?'))
      .toBe('Papers/2401.12345 Attention Is AllYou Need.pdf');
  });
  it('replaces / in old-style ids with _', () => {
    expect(pdfVaultPath('Papers', 'hep-th/9901001', 'Old Paper'))
      .toBe('Papers/hep-th_9901001 Old Paper.pdf');
  });
  it('omits the folder when it is empty', () => {
    expect(pdfVaultPath('', '2401.12345', 'T')).toBe('2401.12345 T.pdf');
  });
  it('strips leading and trailing slashes from the folder', () => {
    expect(pdfVaultPath('/Papers/', '2401.12345', 'T')).toBe('Papers/2401.12345 T.pdf');
  });
  it('drops the space when the title sanitizes to nothing', () => {
    expect(pdfVaultPath('Papers', '2401.12345', '???')).toBe('Papers/2401.12345.pdf');
  });
});

describe('cleanTabTitle', () => {
  it('strips a leading [arXiv id] prefix', () => {
    expect(cleanTabTitle('[2401.12345] Attention Is All You Need')).toBe('Attention Is All You Need');
    expect(cleanTabTitle('[hep-th/9901001] Old Paper')).toBe('Old Paper');
  });
  it('strips trailing [arXiv], | arXiv, - arXiv decorations', () => {
    expect(cleanTabTitle('Attention Is All You Need [arXiv]')).toBe('Attention Is All You Need');
    expect(cleanTabTitle('Attention Is All You Need | arXiv')).toBe('Attention Is All You Need');
    expect(cleanTabTitle('Attention Is All You Need - arXiv')).toBe('Attention Is All You Need');
  });
  it('strips trailing - vN and (vN) version decorations', () => {
    expect(cleanTabTitle('Attention Is All You Need - v2')).toBe('Attention Is All You Need');
    expect(cleanTabTitle('Attention Is All You Need (v3)')).toBe('Attention Is All You Need');
  });
  it('strips stacked decorations and collapses whitespace', () => {
    expect(cleanTabTitle('[2401.12345]  Attention  Is All You Need - v2 | arXiv')).toBe('Attention Is All You Need');
  });
  it('leaves an ordinary title alone and handles null', () => {
    expect(cleanTabTitle('Just a title')).toBe('Just a title');
    expect(cleanTabTitle(null)).toBe('');
  });
});

describe('formatLine', () => {
  it('formats a normal page line', () => {
    expect(formatLine({ title: 'Example Domain', url: 'https://example.com/', date: '2026-09-26' }))
      .toBe('- [Example Domain](https://example.com/) — 2026-09-26');
  });
  it('formats a paper line with a PDF wikilink', () => {
    expect(formatLine({
      title: 'Attention Is All You Need',
      url: 'https://arxiv.org/abs/2401.12345',
      date: '2026-09-26',
      pdfPath: 'Papers/2401.12345 Attention Is All You Need.pdf',
    })).toBe('- [Attention Is All You Need](https://arxiv.org/abs/2401.12345) · [[Papers/2401.12345 Attention Is All You Need.pdf|PDF]] — 2026-09-26');
  });
  it('formats a paper line without a PDF when pdfPath is missing', () => {
    expect(formatLine({ title: 'Attention Is All You Need', url: 'https://arxiv.org/abs/2401.12345', date: '2026-09-26' }))
      .toBe('- [Attention Is All You Need](https://arxiv.org/abs/2401.12345) — 2026-09-26');
    expect(formatLine({ title: 'T', url: 'https://arxiv.org/abs/2401.12345', date: '2026-09-26', pdfPath: undefined }))
      .toBe('- [T](https://arxiv.org/abs/2401.12345) — 2026-09-26');
  });
  it('escapes brackets in the title', () => {
    expect(formatLine({ title: 'Re: [RFC] Thing', url: 'https://example.com/x', date: '2026-09-26' }))
      .toBe('- [Re: \\[RFC\\] Thing](https://example.com/x) — 2026-09-26');
  });
  it('uses an em dash with spaces and a middle dot separator', () => {
    const line = formatLine({ title: 'T', url: 'https://a.b/', date: '2026-09-26', pdfPath: 'P/x.pdf' });
    expect(line).toContain(' — 2026-09-26');
    expect(line).toContain(') · [[');
  });
});
