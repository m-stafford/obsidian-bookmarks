# Obsidian Bookmarks (Chrome extension)

Saves the current tab as a dated markdown link at the end of one note in your
local Obsidian vault. For arXiv papers it also downloads the PDF into a folder
in the vault and wikilinks it from the same line.

    - [Example Domain](https://example.com/) — 2026-09-26
    - [Attention Is All You Need](https://arxiv.org/abs/1706.03762) · [[Papers/1706.03762 Attention Is All You Need.pdf|PDF]] — 2026-09-26

It talks to Obsidian through the
[Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)
community plugin, so Obsidian must be open when you save.

## Setup

1. In Obsidian, install and enable the **Local REST API** community plugin.
2. In the plugin's settings, enable **Non-encrypted (HTTP) Server** (default
   port `27123`) and copy the **API Key**.
3. The papers folder (default `Papers`) is created automatically on the first PDF save.
4. In Chrome open `chrome://extensions`, turn on **Developer mode**, click
   **Load unpacked**, and pick this directory.
5. Open the extension's **Details → Extension options**, paste the API key,
   check the base URL (`http://127.0.0.1:27123`), target note, and papers
   folder, click **Test connection**, then **Save**.
6. Optional: set the shortcut at `chrome://extensions/shortcuts` (suggested
   `Alt+Shift+S`; on macOS that is Option+Shift+S).

Click the toolbar icon (or press the shortcut) to save. The badge shows the
result for a few seconds:

| Badge | Meaning |
|---|---|
| `…` grey | Saving (in progress) |
| `✓` green | Saved |
| `⚠` amber | Link saved, PDF failed (see notification); click again to retry the PDF |
| `dup` grey | Already in the note |
| `!` red | Error (see notification) |

## Development

    npm install
    npm test          # Vitest unit tests
    npm run check     # manifest sanity check
    npm run icons     # regenerate icons/*.png

Plain ES modules, no build step. `package.json` exists only for Vitest.

## Manual test checklist

- Load unpacked; the toolbar icon appears and the options page opens from
  **Details → Extension options**.
- Save a normal page → `✓`, a `- [title](url) — date` line at the end of the
  target note.
- Type a line at the end of the target note in Obsidian without pressing Enter
  (no trailing newline), save a page → the new bullet is on its own line with
  no blank line before it.
- Save an arXiv `/abs/` page → `✓`, PDF appears in the papers folder, the line
  has a `· [[…|PDF]]` link that opens the PDF in Obsidian.
- Save the same paper from its `/pdf/` URL → `dup`.
- Save a page that is already in the note → `dup` badge and notification.
- Quit Obsidian, save → `!` and "Can't reach Obsidian Local REST API …".
- Enter a wrong API key, save → `!` and "API key rejected, check options".
- Clear the API key, save → `!` and the options page opens.
- Block `arxiv.org` (e.g. hosts file or offline) and save a new paper → `⚠`,
  line appended without a PDF link.
- Unblock and save the same paper again → `✓`, PDF downloaded, no new line
  (the existing line is not rewritten).
