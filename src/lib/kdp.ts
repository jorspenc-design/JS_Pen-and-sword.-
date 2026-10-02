// Amazon KDP print specifications used by the formatter and cover designer.
// Source: KDP help pages "Set Trim Size, Bleed, and Margins" and "Cover Calculator".

export interface TrimSize {
  id: string;
  label: string;
  width: number; // inches
  height: number;
  note?: string;
}

export const TRIM_SIZES: TrimSize[] = [
  { id: '5x8', label: '5" × 8"', width: 5, height: 8, note: 'Compact fiction, poetry' },
  { id: '5.25x8', label: '5.25" × 8"', width: 5.25, height: 8, note: 'Fiction' },
  { id: '5.5x8.5', label: '5.5" × 8.5"', width: 5.5, height: 8.5, note: 'Fiction, memoir, devotionals' },
  { id: '6x9', label: '6" × 9"', width: 6, height: 9, note: 'Most popular — fiction & nonfiction' },
  { id: '6.14x9.21', label: '6.14" × 9.21"', width: 6.14, height: 9.21, note: 'Royal — nonfiction' },
  { id: '7x10', label: '7" × 10"', width: 7, height: 10, note: 'Workbooks, study guides' },
  { id: '8.5x11', label: '8.5" × 11"', width: 8.5, height: 11, note: 'Manuals, workbooks' },
];

export const PAPER_TYPES = {
  white: { label: 'Black ink · white paper', perPage: 0.002252 },
  cream: { label: 'Black ink · cream paper', perPage: 0.0025 },
  'color-standard': { label: 'Standard color · white paper', perPage: 0.002252 },
  'color-premium': { label: 'Premium color · white paper', perPage: 0.002347 },
} as const;

export type PaperType = keyof typeof PAPER_TYPES;

export const BLEED = 0.125;
export const MIN_PAGES = 24;
export const MAX_PAGES = 828;
export const SPINE_TEXT_MIN_PAGES = 79;
/** KDP keeps spine text at least this far from each spine edge. */
export const SPINE_SAFE = 0.0625;
/** Live area: keep cover text this far inside the trim. */
export const COVER_SAFE = 0.25;
export const BARCODE = { width: 2, height: 1.2 };

export function getTrim(id: string): TrimSize {
  return TRIM_SIZES.find((t) => t.id === id) ?? TRIM_SIZES[3];
}

/** KDP minimum inside (gutter) margin for a given page count. */
export function minGutter(pages: number): number {
  if (pages <= 150) return 0.375;
  if (pages <= 300) return 0.5;
  if (pages <= 500) return 0.625;
  if (pages <= 700) return 0.75;
  return 0.875;
}

export const MIN_OUTSIDE = 0.25;

export function spineWidth(pages: number, paper: PaperType): number {
  return Math.max(0, pages) * PAPER_TYPES[paper].perPage;
}

export interface CoverDimensions {
  trim: TrimSize;
  pages: number;
  spine: number;
  /** Full wrap including bleed, inches. */
  width: number;
  height: number;
  spineText: boolean;
}

export function coverDimensions(trimId: string, pages: number, paper: PaperType): CoverDimensions {
  const trim = getTrim(trimId);
  const effectivePages = Math.max(MIN_PAGES, pages);
  const spine = spineWidth(effectivePages, paper);
  return {
    trim,
    pages: effectivePages,
    spine,
    width: BLEED * 2 + trim.width * 2 + spine,
    height: BLEED * 2 + trim.height,
    spineText: effectivePages > SPINE_TEXT_MIN_PAGES,
  };
}

export interface MarginCheck {
  ok: boolean;
  messages: string[];
}

export function checkMargins(
  margins: { top: number; bottom: number; inside: number; outside: number },
  pages: number,
): MarginCheck {
  const messages: string[] = [];
  const gutter = minGutter(pages);
  if (margins.inside < gutter) {
    messages.push(`KDP requires an inside (gutter) margin of at least ${gutter}" for ${pages} pages; yours is ${margins.inside}".`);
  }
  for (const side of ['top', 'bottom', 'outside'] as const) {
    if (margins[side] < MIN_OUTSIDE) messages.push(`The ${side} margin must be at least ${MIN_OUTSIDE}".`);
  }
  if (pages > 0 && pages < MIN_PAGES) messages.push(`KDP paperbacks need at least ${MIN_PAGES} pages (currently ${pages}).`);
  if (pages > MAX_PAGES) messages.push(`KDP paperbacks allow at most ${MAX_PAGES} pages (currently ${pages}).`);
  return { ok: messages.length === 0, messages };
}

/** KDP ebook cover recommendation: 1600 × 2560 px (1 : 1.6). */
export const EBOOK_COVER = { width: 1600, height: 2560 };
