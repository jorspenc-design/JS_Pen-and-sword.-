// Renders the typeset interior to a print-ready PDF using the Chrome or Edge
// already installed on this computer (no extra browser download). Fonts are
// embedded and the page size comes from the book's trim size.
import { chromium, type Browser } from 'playwright-core';

let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const attempts: (() => Promise<Browser>)[] = [];
  if (process.env.CHROME_PATH) attempts.push(() => chromium.launch({ executablePath: process.env.CHROME_PATH }));
  for (const channel of ['chrome', 'msedge', 'chromium']) attempts.push(() => chromium.launch({ channel }));
  let last: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      last = err;
    }
  }
  throw new NoBrowserError(last instanceof Error ? last.message : String(last));
}

export class NoBrowserError extends Error {}

function getBrowser(): Promise<Browser> {
  browserPromise ??= launch().then((b) => {
    b.on('disconnected', () => { browserPromise = null; });
    return b;
  });
  browserPromise.catch(() => { browserPromise = null; });
  return browserPromise;
}

export interface PdfResult {
  pdf: Buffer;
  pages: number;
  missingFonts: string[];
}

export async function renderPdf(html: string): Promise<PdfResult> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.addInitScript(() => { (window as unknown as { __fontWaitMs: number }).__fontWaitMs = 20000; });
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    // Long books take a while to paginate.
    const handle = await page.waitForFunction(() => (window as unknown as { __pagedResult?: unknown }).__pagedResult, null, { timeout: 10 * 60_000 });
    const result = (await handle.jsonValue()) as { pages: number; missingFonts: string[] };
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return { pdf, pages: result.pages, missingFonts: result.missingFonts };
  } finally {
    await context.close();
  }
}
