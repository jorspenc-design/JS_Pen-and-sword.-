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

## Publishing to Amazon KDP

| What you upload to KDP | Where it comes from |
| --- | --- |
| Paperback or hardcover interior (PDF) | Margot → **Paperback PDF** / **Hardcover PDF** |
| Paperback cover (PDF) | Theo → **Print cover PDF** |
| Kindle eBook (EPUB) | Margot → **All formats** → Kindle eBook |
| eBook cover (JPG, 1600 × 2560) | Theo → **eBook JPG** (also built into the EPUB) |
| Book details, description, keywords | Ada → **Download KDP package** (`kdp-details.txt`) |

- **Editions and sizes.** Margot offers all 16 KDP paperback trim sizes and the 5 hardcover sizes. Each edition is checked against its own page limits: paperback 24–828 pages, hardcover 75–550.
- **Themes.** Eight one-click interior themes (Classic, Devotional, Elegant, Modern, Bold, Minimal, Nonfiction, Large Print). Each one is a starting point you can adjust.
- **Large print.** The Large Print theme meets KDP's 16-point minimum. Tick "Large print" when you set up the book on KDP.
- **KDP checks.** Margot checks the inside (gutter) margin against your exact page count (0.375"–0.875"), 0.25" minimum outside margins, page limits, sizes and paper types offered for hardcover, and the large-print minimum. Upload the interior as **No bleed**.
- **One-click PDF.** The app's local server prints the interior with the Chrome or Edge already on your computer: exact trim size, fonts embedded. If neither browser is installed, it falls back to the print dialog. Choose "Save as PDF", Margins "None", and turn on "Background graphics".
- **Fonts.** Book fonts download from Google Fonts while you're online. If one fails to load, the PDF result tells you a stand-in was used, so you can export again before uploading.
- **Hardcover covers** wrap around the boards and need KDP's own cover template. Download it for your page count from KDP and place Theo's front cover on it.
- **Not yet supported:** images inside the book's pages, so there's no bleed option for the interior.

## How the AI works

Everything except the AI help runs on your own computer: writing, importing, formatting, every export, covers, and in-browser transcription.

- **AI help** (Wren's assistant, Elias's edits, Ada's drafting) calls Anthropic's Claude API through the small server included in this app. That server runs on your computer when you run `npm run dev`, so there's nothing separate to host.
- You need an **Anthropic API key** (console.anthropic.com). It's billed per use, separately from a Claude.ai subscription.
- **Dictation** uses your browser's built-in speech recognition. In Chrome, the audio is processed by Google's speech service.
- **Transcription** of recordings runs on your computer with an open Whisper model, downloaded once.
- **No upload to KDP from the app.** KDP has no public upload API, so you upload the files on kdp.amazon.com yourself.

## Development

```bash
npm test          # unit tests (KDP math, import splitting, analysis, EPUB validity, …)
npm run typecheck
```

- `src/pages/`: one page per helper (`Write`, `Edit`, `Format`, `Design`, `Publish`), plus `Library` and `Overview`
- `src/lib/`: import, analysis, KDP specs, print/EPUB/Word builders, cover renderer, and the AI client
- `src/personas.ts`: the five helpers
- `server/`: a small Express server that keeps your API key off the browser and holds every AI prompt (`server/prompts.ts`)
