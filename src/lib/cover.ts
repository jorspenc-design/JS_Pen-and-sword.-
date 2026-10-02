// Cover rendering on <canvas>, shared by the on-screen preview and the
// 300-DPI export. All geometry is in inches and scaled by `dpi`.
import type { CoverSettings, Project } from '../types';
import { BARCODE, BLEED, COVER_SAFE, SPINE_SAFE, coverDimensions, EBOOK_COVER, type CoverDimensions, type PaperType } from './kdp';
import { googleFontsHref } from './book';

export interface CoverRenderInput {
  project: Project;
  image?: HTMLImageElement | ImageBitmap | null;
}

export async function ensureFonts(c: CoverSettings) {
  const href = googleFontsHref([c.titleFont, c.authorFont, 'EB Garamond']);
  if (!document.querySelector(`link[data-cover-fonts="${href}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.coverFonts = href;
    document.head.appendChild(link);
    await new Promise((r) => { link.onload = r; link.onerror = r; });
  }
  await Promise.all([
    document.fonts.load(`700 64px "${c.titleFont}"`),
    document.fonts.load(`400 64px "${c.titleFont}"`),
    document.fonts.load(`400 32px "${c.authorFont}"`),
    document.fonts.load(`italic 400 32px "${c.authorFont}"`),
    document.fonts.load(`400 24px "EB Garamond"`),
  ]).catch(() => undefined);
}

export function getCoverDims(project: Project): CoverDimensions {
  const pages = project.format.pageCount || estimatePages(project);
  return coverDimensions(project.format.trimId, pages, project.format.paper as PaperType);
}

/** Rough page estimate (≈ 300 words/page at 6×9) until the formatter measures the real count. */
export function estimatePages(project: Project, words = 0): number {
  return Math.max(24, Math.round((words || project.wordGoal) / 300));
}

type Ctx = CanvasRenderingContext2D;

function paintBackground(ctx: Ctx, c: CoverSettings, x: number, y: number, w: number, h: number, img?: CoverRenderInput['image']) {
  let fill: string | CanvasGradient = c.bg1;
  if (c.gradient === 'vertical') {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, c.bg1);
    g.addColorStop(1, c.bg2);
    fill = g;
  } else if (c.gradient === 'diagonal') {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, c.bg1);
    g.addColorStop(1, c.bg2);
    fill = g;
  } else if (c.gradient === 'radial') {
    const g = ctx.createRadialGradient(x + w / 2, y + h * 0.4, 0, x + w / 2, y + h * 0.4, Math.max(w, h) * 0.75);
    g.addColorStop(0, c.bg1);
    g.addColorStop(1, c.bg2);
    fill = g;
  }
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);

  if (img) {
    const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
    const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
    const scale = c.imageFit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = c.imageOpacity;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }
  if (c.overlay > 0) {
    ctx.fillStyle = `rgba(0,0,0,${c.overlay})`;
    ctx.fillRect(x, y, w, h);
  }
}

function wrapLines(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws text wrapped within maxWidth, shrinking the font until it fits maxLines. Returns height used. */
function drawFitted(
  ctx: Ctx,
  text: string,
  opts: { x: number; y: number; maxWidth: number; size: number; font: string; weight?: string; style?: string; color: string; maxLines: number; lineHeight?: number; tracking?: number; align?: CanvasTextAlign; baseline?: 'top' | 'bottom' },
): number {
  let size = opts.size;
  let lines: string[] = [];
  for (let i = 0; i < 30; i++) {
    ctx.font = `${opts.style ?? ''} ${opts.weight ?? '400'} ${size}px "${opts.font}", Georgia, serif`;
    (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${(opts.tracking ?? 0) * size}px`;
    lines = wrapLines(ctx, text, opts.maxWidth);
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= opts.maxLines && widest <= opts.maxWidth) break;
    size *= 0.92;
  }
  const lh = size * (opts.lineHeight ?? 1.15);
  const total = lh * lines.length;
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'alphabetic';
  const startY = opts.baseline === 'bottom' ? opts.y - total : opts.y;
  lines.forEach((l, i) => ctx.fillText(l, opts.x, startY + lh * (i + 1) - (lh - size) / 2 - size * 0.12));
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = '0px';
  return total;
}

function ornament(ctx: Ctx, cx: number, y: number, w: number, color: string, unit: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, unit * 0.012);
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, y);
  ctx.lineTo(cx - unit * 0.08, y);
  ctx.moveTo(cx + unit * 0.08, y);
  ctx.lineTo(cx + w / 2, y);
  ctx.stroke();
  ctx.beginPath();
  const d = unit * 0.045;
  ctx.moveTo(cx, y - d);
  ctx.lineTo(cx + d, y);
  ctx.lineTo(cx, y + d);
  ctx.lineTo(cx - d, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draws the front cover into the rectangle (x, y, w, h) — w/h are the trim size in px. */
export function drawFront(ctx: Ctx, input: CoverRenderInput, x: number, y: number, w: number, h: number, dpi: number, paintBg = true) {
  const { project, image } = input;
  const c = project.cover;
  if (paintBg) paintBackground(ctx, c, x, y, w, h, image);
  const safe = COVER_SAFE * dpi;
  const cx = x + w / 2;
  const inner = w - safe * 2;
  const title = c.titleCase === 'upper' ? project.title.toUpperCase() : project.title;
  const titleSize = w * 0.12 * c.titleSize;
  const author = project.author || 'Author Name';
  const sub = c.subtitle || project.subtitle;

  const drawTitleBlock = (top: number) => {
    let yy = top;
    yy += drawFitted(ctx, title, { x: cx, y: yy, maxWidth: inner, size: titleSize, font: c.titleFont, weight: '700', color: c.titleColor, maxLines: 4, lineHeight: 1.08, tracking: c.titleCase === 'upper' ? 0.06 : 0 });
    if (c.ornament) {
      yy += w * 0.05;
      ornament(ctx, cx, yy, w * 0.4, c.accent, w);
      yy += w * 0.03;
    }
    if (sub) {
      yy += w * 0.03;
      yy += drawFitted(ctx, sub, { x: cx, y: yy, maxWidth: inner * 0.9, size: w * 0.045, font: c.authorFont, style: 'italic', color: c.titleColor, maxLines: 3, lineHeight: 1.25 });
    }
    return yy;
  };
  const drawAuthor = (bottom: number) =>
    drawFitted(ctx, author.toUpperCase(), { x: cx, y: bottom, maxWidth: inner, size: w * 0.06, font: c.authorFont, color: c.authorColor, maxLines: 2, tracking: 0.15, baseline: 'bottom' });
  const drawTagline = (top: number) =>
    c.tagline ? drawFitted(ctx, c.tagline, { x: cx, y: top, maxWidth: inner * 0.9, size: w * 0.035, font: c.authorFont, style: 'italic', color: c.authorColor, maxLines: 2 }) : 0;

  switch (c.layout) {
    case 'top-title': {
      drawTagline(y + safe);
      drawTitleBlock(y + safe + h * 0.06);
      drawAuthor(y + h - safe);
      break;
    }
    case 'bottom-band': {
      const bandTop = y + h * 0.58;
      ctx.fillStyle = c.bg2;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(x, bandTop, w, h - (bandTop - y));
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.accent;
      ctx.fillRect(x, bandTop, w, Math.max(2, w * 0.006));
      drawTagline(y + safe);
      drawTitleBlock(bandTop + h * 0.04);
      drawAuthor(y + h - safe);
      break;
    }
    case 'split': {
      ctx.fillStyle = c.bg2;
      ctx.fillRect(x, y, w, h * 0.5);
      ctx.fillStyle = c.accent;
      ctx.fillRect(x + safe, y + h * 0.5 - w * 0.004, w - safe * 2, Math.max(2, w * 0.008));
      drawTagline(y + safe);
      drawTitleBlock(y + h * 0.53);
      drawAuthor(y + h - safe);
      break;
    }
    case 'frame': {
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = Math.max(2, w * 0.006);
      const inset = safe * 0.9;
      ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
      ctx.lineWidth = Math.max(1, w * 0.002);
      ctx.strokeRect(x + inset * 1.25, y + inset * 1.25, w - inset * 2.5, h - inset * 2.5);
      drawTagline(y + safe * 1.6);
      drawTitleBlock(y + h * 0.28);
      drawAuthor(y + h - safe * 1.6);
      break;
    }
    default: {
      drawTagline(y + safe);
      drawTitleBlock(y + h * 0.3);
      drawAuthor(y + h - safe);
    }
  }
}

function drawBack(ctx: Ctx, input: CoverRenderInput, x: number, y: number, w: number, h: number, dpi: number) {
  const { project } = input;
  const c = project.cover;
  const safe = COVER_SAFE * dpi + 0.15 * dpi;
  const text = (c.backText || project.meta.description || '').replace(/\*\*/g, '');
  let yy = y + safe + 0.2 * dpi;
  const paras = text.split(/\n\s*\n|\n/).filter((t) => t.trim());
  const size = 0.13 * dpi;
  ctx.textAlign = 'left';
  for (const [i, para] of paras.entries()) {
    ctx.font = `${i === 0 ? 'italic ' : ''}400 ${size}px "EB Garamond", Georgia, serif`;
    const lines = wrapLines(ctx, para, w - safe * 2);
    ctx.fillStyle = c.backTextColor;
    for (const l of lines) {
      if (yy > y + h - safe - (BARCODE.height + 0.4) * dpi) break;
      ctx.fillText(l, x + safe, yy + size);
      yy += size * 1.4;
    }
    yy += size * 0.8;
  }
  if (c.showBarcodeBox) {
    // KDP prints the ISBN barcode here (2" × 1.2"); keep the area clear.
    const bw = BARCODE.width * dpi;
    const bh = BARCODE.height * dpi;
    const bx = x + w - COVER_SAFE * dpi - bw;
    const by = y + h - COVER_SAFE * dpi - bh;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bw, bh);
  }
}

function drawSpine(ctx: Ctx, input: CoverRenderInput, x: number, y: number, w: number, h: number, dpi: number, showText: boolean) {
  const { project } = input;
  const c = project.cover;
  ctx.fillStyle = c.spineColor;
  ctx.fillRect(x, y, w, h);
  if (!showText) return;
  const usable = w - SPINE_SAFE * 2 * dpi;
  if (usable <= 0.05 * dpi) return;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.spineTextColor;
  const size = Math.min(usable * 0.7, 0.28 * dpi);
  ctx.font = `700 ${size}px "${c.titleFont}", Georgia, serif`;
  ctx.textAlign = 'left';
  const title = c.titleCase === 'upper' ? project.title.toUpperCase() : project.title;
  ctx.fillText(title, -h / 2 + 0.6 * dpi, 0, h * 0.6);
  ctx.font = `400 ${size * 0.8}px "${c.authorFont}", Georgia, serif`;
  ctx.textAlign = 'right';
  ctx.fillText((project.author || '').toUpperCase(), h / 2 - 0.6 * dpi, 0, h * 0.3);
  ctx.restore();
}

export interface WrapGuides {
  bleed: number;
  spineX: number;
  spineW: number;
  safe: number;
}

/** Draws the full KDP wrap (back | spine | front) including bleed. Canvas must be sized by the caller. */
export function drawWrap(ctx: Ctx, input: CoverRenderInput, dims: CoverDimensions, dpi: number): WrapGuides {
  const bleed = BLEED * dpi;
  const tw = dims.trim.width * dpi;
  const th = dims.trim.height * dpi;
  const spineW = dims.spine * dpi;
  const W = dims.width * dpi;
  const H = dims.height * dpi;
  const c = input.project.cover;

  // Background spans the whole wrap so art bleeds continuously.
  paintBackground(ctx, c, 0, 0, W, H, null);
  // Front art sits on the front panel only (plus bleed), as most designers do.
  if (input.image) paintBackground(ctx, { ...c, gradient: 'none', overlay: 0, bg1: 'transparent' }, bleed + tw + spineW, 0, tw + bleed, H, input.image);
  if (input.image && c.overlay > 0) {
    ctx.fillStyle = `rgba(0,0,0,${c.overlay})`;
    ctx.fillRect(bleed + tw + spineW, 0, tw + bleed, H);
  }

  drawBack(ctx, input, bleed, bleed, tw, th, dpi);
  drawSpine(ctx, input, bleed + tw, 0, spineW, H, dpi, dims.spineText);
  drawFront(ctx, input, bleed + tw + spineW, bleed, tw, th, dpi, false);
  return { bleed, spineX: bleed + tw, spineW, safe: COVER_SAFE * dpi };
}

export function drawGuides(ctx: Ctx, dims: CoverDimensions, dpi: number) {
  const g = { bleed: BLEED * dpi, tw: dims.trim.width * dpi, spine: dims.spine * dpi, W: dims.width * dpi, H: dims.height * dpi, safe: COVER_SAFE * dpi };
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 80, 80, .9)';
  ctx.strokeRect(g.bleed, g.bleed, g.W - g.bleed * 2, g.H - g.bleed * 2); // trim
  ctx.strokeStyle = 'rgba(80, 200, 255, .9)';
  ctx.beginPath();
  ctx.moveTo(g.bleed + g.tw, 0); ctx.lineTo(g.bleed + g.tw, g.H);
  ctx.moveTo(g.bleed + g.tw + g.spine, 0); ctx.lineTo(g.bleed + g.tw + g.spine, g.H);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120, 255, 140, .8)';
  ctx.strokeRect(g.bleed + g.safe, g.bleed + g.safe, g.tw - g.safe * 2, g.H - g.bleed * 2 - g.safe * 2);
  ctx.strokeRect(g.bleed + g.tw + g.spine + g.safe, g.bleed + g.safe, g.tw - g.safe * 2, g.H - g.bleed * 2 - g.safe * 2);
  ctx.restore();
}

export function renderWrapCanvas(input: CoverRenderInput, dpi = 300): HTMLCanvasElement {
  const dims = getCoverDims(input.project);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(dims.width * dpi);
  canvas.height = Math.round(dims.height * dpi);
  drawWrap(canvas.getContext('2d')!, input, dims, dpi);
  return canvas;
}

export function renderEbookCanvas(input: CoverRenderInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = EBOOK_COVER.width;
  canvas.height = EBOOK_COVER.height;
  // Treat the ebook as a 6.25" × 10" "page" at 256 dpi for consistent proportions.
  drawFront(canvas.getContext('2d')!, input, 0, 0, EBOOK_COVER.width, EBOOK_COVER.height, EBOOK_COVER.width / 6.25);
  return canvas;
}

export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render image'))), type, quality));

export async function wrapToPdf(input: CoverRenderInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const dims = getCoverDims(input.project);
  const canvas = renderWrapCanvas(input, 300);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [dims.width, dims.height], compress: true });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, dims.width, dims.height);
  return pdf.output('blob');
}

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = URL.createObjectURL(blob);
  });
}
