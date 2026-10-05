// Amazon KDP print specifications used by the formatter and cover designer.
// Source: KDP help pages "Set Trim Size, Bleed, and Margins" and "Cover Calculator".

export interface TrimSize {
  id: string;
  label: string;
  width: number; // inches
  height: number;
  note?: string;
  /** KDP also offers this size as a hardcover. */
  hardcover?: boolean;
}

// KDP's 16 standard paperback trim sizes; five are also offered in hardcover.
export const TRIM_SIZES: TrimSize[] = [
  { id: '5x8', label: '5" × 8"', width: 5, height: 8, note: 'Pocket fiction, poetry' },
  { id: '5.06x7.81', label: '5.06" × 7.81"', width: 5.06, height: 7.81, note: 'Mass-market fiction' },
  { id: '5.25x8', label: '5.25" × 8"', width: 5.25, height: 8, note: 'Fiction' },
  { id: '5.5x8.5', label: '5.5" × 8.5"', width: 5.5, height: 8.5, note: 'Fiction, memoir, devotionals', hardcover: true },
  { id: '6x9', label: '6" × 9"', width: 6, height: 9, note: 'Most popular — fiction & nonfiction', hardcover: true },
  { id: '6.14x9.21', label: '6.14" × 9.21"', width: 6.14, height: 9.21, note: 'Royal — nonfiction', hardcover: true },
  { id: '6.69x9.61', label: '6.69" × 9.61"', width: 6.69, height: 9.61, note: 'Pinched crown — nonfiction' },
  { id: '7x10', label: '7" × 10"', width: 7, height: 10, note: 'Textbooks, study guides', hardcover: true },
  { id: '7.44x9.69', label: '7.44" × 9.69"', width: 7.44, height: 9.69, note: 'Crown quarto' },
  { id: '7.5x9.25', label: '7.5" × 9.25"', width: 7.5, height: 9.25, note: 'Workbooks, cookbooks' },
  { id: '8x10', label: '8" × 10"', width: 8, height: 10, note: 'Photo books, children’s' },
  { id: '8.25x6', label: '8.25" × 6"', width: 8.25, height: 6, note: 'Landscape' },
  { id: '8.25x8.25', label: '8.25" × 8.25"', width: 8.25, height: 8.25, note: 'Square — picture books' },
  { id: '8.25x11', label: '8.25" × 11"', width: 8.25, height: 11, note: 'Large workbooks', hardcover: true },
  { id: '8.5x8.5', label: '8.5" × 8.5"', width: 8.5, height: 8.5, note: 'Square — picture books' },
  { id: '8.5x11', label: '8.5" × 11"', width: 8.5, height: 11, note: 'Workbooks, journals, manuals' },
];

export type Edition = 'paperback' | 'hardcover';

export const EDITION_LIMITS: Record<Edition, { min: number; max: number }> = {
  paperback: { min: 24, max: 828 },
  hardcover: { min: 75, max: 550 },
};

/** KDP's threshold for the "Large print" label: body text 16pt or larger. */
export const LARGE_PRINT_MIN_PT = 16;

export const PAPER_TYPES = {
  white: { label: 'Black ink · white paper', perPage: 0.002252, hardcover: true },
  cream: { label: 'Black ink · cream paper', perPage: 0.0025, hardcover: true },
  'color-standard': { label: 'Standard color · white paper', perPage: 0.002252, hardcover: false },
  'color-premium': { label: 'Premium color · white paper', perPage: 0.002347, hardcover: true },
} as const;

export type PaperType = keyof typeof PAPER_TYPES;

export const BLEED = 0.125;
export const MIN_PAGES = EDITION_LIMITS.paperback.min;
export const MAX_PAGES = EDITION_LIMITS.paperback.max;
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

export interface InteriorSpec {
  margins: { top: number; bottom: number; inside: number; outside: number };
  edition?: Edition;
  trimId?: string;
  paper?: PaperType;
  fontSize?: number;
  largePrint?: boolean;
}

/** Everything KDP checks about a print interior that we can know before upload. */
export function checkInterior(spec: InteriorSpec, pages: number): MarginCheck {
  const { margins } = spec;
  const edition = spec.edition ?? 'paperback';
  const limits = EDITION_LIMITS[edition];
  const messages: string[] = [];
  const gutter = minGutter(pages);
  if (margins.inside < gutter) {
    messages.push(`KDP requires an inside (gutter) margin of at least ${gutter}" for ${pages} pages; yours is ${margins.inside}".`);
  }
  for (const side of ['top', 'bottom', 'outside'] as const) {
    if (margins[side] < MIN_OUTSIDE) messages.push(`The ${side} margin must be at least ${MIN_OUTSIDE}".`);
  }
  if (pages > 0 && pages < limits.min) messages.push(`KDP ${edition}s need at least ${limits.min} pages (currently ${pages}).`);
  if (pages > limits.max) messages.push(`KDP ${edition}s allow at most ${limits.max} pages (currently ${pages}).`);
  if (edition === 'hardcover' && spec.trimId && !getTrim(spec.trimId).hardcover) {
    messages.push(`${getTrim(spec.trimId).label} isn’t offered in hardcover. Choose 5.5×8.5, 6×9, 6.14×9.21, 7×10, or 8.25×11.`);
  }
  if (edition === 'hardcover' && spec.paper && !PAPER_TYPES[spec.paper].hardcover) {
    messages.push('Standard color isn’t offered in hardcover. Choose black ink or premium color.');
  }
  if (spec.largePrint && (spec.fontSize ?? 0) < LARGE_PRINT_MIN_PT) {
    messages.push(`Large print editions need body text of at least ${LARGE_PRINT_MIN_PT}pt (yours is ${spec.fontSize}pt).`);
  }
  return { ok: messages.length === 0, messages };
}

/** Margin-only check, kept for callers that don't know the edition. */
export function checkMargins(margins: InteriorSpec['margins'], pages: number): MarginCheck {
  return checkInterior({ margins }, pages);
}

/** KDP ebook cover recommendation: 1600 × 2560 px (1 : 1.6). */
export const EBOOK_COVER = { width: 1600, height: 2560 };
