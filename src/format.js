// Pure string helpers: the reading-list line, PDF file names, dates, and
// arXiv tab-title cleanup. No I/O, no Chrome APIs.

// Spec list (/ \ : * ? " < > | and control chars) plus # ^ [ ], which Obsidian
// forbids in file names because they break [[wikilinks]].
const FILENAME_FORBIDDEN = /[\\/:*?"<>|#^[\]\u0000-\u001f\u007f]/g;
const MAX_FILENAME_LENGTH = 120;

// Decorations arXiv pages and PDF viewers add around a paper title. Applied
// repeatedly until nothing changes, so stacked decorations all come off.
const TAB_TITLE_NOISE = [
  /^\[[^\]]*\d{4}[^\]]*\]\s*/,          // leading "[2401.12345] " / "[hep-th/9901001] "
  /\s*\[arxiv\]\s*$/i,                  // trailing "[arXiv]"
  /\s*[|\-–—]\s*arxiv(?:\.org)?\s*$/i, // trailing "| arXiv", "- arXiv", "– arXiv"
  /\s*[|\-–—]\s*v\d+\s*$/i,   // trailing "- v2"
  /\s*\(v\d+\)\s*$/i,                   // trailing "(v2)"
];

export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function escapeLinkText(text) {
  return String(text).replace(/[\\[\]]/g, (c) => `\\${c}`);
}

export function sanitizeFilename(name) {
  const s = String(name ?? '')
    .replace(/\s+/g, ' ') // before the strip: \t \n \r are control chars too
    .replace(FILENAME_FORBIDDEN, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Slice by code point so an emoji at the cap isn't cut in half.
  return Array.from(s).slice(0, MAX_FILENAME_LENGTH).join('').trim();
}

export function pdfVaultPath(folder, id, title) {
  const dir = String(folder ?? '').replace(/^\/+|\/+$/g, '');
  const base = [String(id).replace(/\//g, '_'), sanitizeFilename(title)].filter(Boolean).join(' ');
  const file = `${base}.pdf`;
  return dir ? `${dir}/${file}` : file;
}

export function cleanTabTitle(title) {
  let out = String(title ?? '').replace(/\s+/g, ' ').trim();
  let before;
  do {
    before = out;
    for (const re of TAB_TITLE_NOISE) out = out.replace(re, '');
    out = out.trim();
  } while (out !== before);
  return out;
}

export function formatLine({ title, url, date, pdfPath }) {
  const link = `[${escapeLinkText(title)}](${url})`;
  const pdf = pdfPath ? ` · [[${pdfPath}|PDF]]` : '';
  return `- ${link}${pdf} — ${date}`;
}
