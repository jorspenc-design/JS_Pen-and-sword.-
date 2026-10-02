# Pen and Sword

A personal self-publishing studio that takes a book from first word to a print-ready file for **Amazon KDP**, or a submission package for a **traditional publisher**.

Five helpers each handle one stage, so it's always clear where you are and what comes next:

| Helper | Role | What they do |
| --- | --- | --- |
| **Wren** | The Scribe | Distraction-free writing, **live dictation** (speak; say "period", "comma", "new paragraph", "scene break"), **audio transcription** of recordings (runs privately in your browser), import of `.docx` / `.txt` / `.md` / `.html` drafts (split into chapters automatically), and an AI writing partner (continue, rephrase, expand, tighten, show-don't-tell, dialogue, grammar, or just talk it through). |
| **Elias** | The Editor | An instant offline "first read" (readability, long sentences, adverbs, filler, passive voice, clichés, echoes), plus AI **developmental edits**, **line edits**, a **beta-reader** reaction, and a **proofread** you accept or skip one fix at a time. A snapshot is saved before every change, and every version can be restored. |
| **Margot** | The Typesetter | Live paginated preview at KDP trim sizes: chapter-opening styles, drop caps, scene breaks, running heads, page numbers, title/copyright/dedication/contents pages, and KDP margin and gutter checks against the real page count. Exports a **print-ready PDF**, an **EPUB**, a typeset **Word** file, and a **standard manuscript format** `.docx` for agents. |
| **Theo** | The Designer | Cover designer for the front, spine, and back. The spine width comes from your exact page count and paper type, with bleed, safe-area, and barcode guides. Exports a **print cover PDF**, a 300 DPI PNG, and a 1600×2560 **eBook cover**. |
| **Ada** | The Publisher | Book metadata, an AI-drafted **description**, **keywords and categories**, **author bio**, **synopsis**, and **query letter**; a readiness checklist for your path; and one-click **KDP package** or **submission package** downloads. |

## Getting started

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env      # then paste your Anthropic API key into .env
npm run dev               # opens the app at http://localhost:5173
```

Writing, dictation, transcription, the editor's first read, formatting, cover design, and every export work **without** an API key. The key turns on the AI help from Wren, Elias, and Ada (model `claude-opus-5-5`, configurable with `CLAUDE_MODEL`).

To run a built version on one port:

```bash
npm run build
npm start                 # http://localhost:8787
```

## If the page is blank or won't load

- **Use the address, not the file.** Run `npm run dev` and open **http://localhost:5173**. Double-clicking `index.html` in the folder can't run the app.
- **Keep the terminal open.** Closing the window that's running `npm run dev` stops the app.
- **Check the terminal for errors.** If it says Pen and Sword needs a newer Node.js, install the current LTS version from nodejs.org, then run `npm install` and `npm run dev` again.
- **Private windows** may block saving. The app still opens, but shows a warning and won't keep your work after the tab closes.

## Where your work lives

Everything is stored in your browser's local database (IndexedDB) on this computer. Nothing is uploaded except the text you send to the AI when you ask a helper for help. Use **Download backup** on a book's home page now and then, and **Restore backup** on the library page to bring it back or move it to another machine.

## Notes on publishing output

- **Print-ready PDF.** Margot's button opens the print dialog. Choose **Save as PDF**; the page size is set for you. Use Chrome or Edge for the most faithful results.
- **KDP specs used.** These are the gutter minimums by page count (0.375"–0.875"), 0.25" minimum outside margins, a 0.125" cover bleed, spine width per page (white 0.002252", cream 0.0025"), and spine text only above 79 pages. Check KDP's current guidelines before you publish.
- **Fonts.** Book fonts load from Google Fonts. If you're offline, Margot waits a few seconds and then typesets with fallback fonts. Preview again when you're back online before exporting.
- **Dictation** uses the browser's speech recognition (Chrome, Edge, Safari). **Transcription** downloads an open Whisper speech model once (about 80–250 MB) and then runs locally.
- **Cover art.** Use images you own or have licensed for commercial use.

## Development

```bash
npm test          # unit tests (KDP math, import splitting, analysis, EPUB validity, …)
npm run typecheck
```

- `src/pages/`: one page per helper (`Write`, `Edit`, `Format`, `Design`, `Publish`), plus `Library` and `Overview`
- `src/lib/`: import, analysis, KDP specs, print/EPUB/Word builders, cover renderer, and the AI client
- `src/personas.ts`: the five helpers
- `server/`: a small Express server that keeps your API key off the browser and holds every AI prompt (`server/prompts.ts`)
