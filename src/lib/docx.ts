// Word exports:
//  • "manuscript" — Standard Manuscript Format for agents and publishers
//    (Times New Roman 12pt, double-spaced, 1" margins, slug-line header).
//  • "print"      — a typeset Word file at the chosen trim size, accepted by KDP.
import {
  AlignmentType,
  Document,
  Header,
  Footer,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import JSZip from 'jszip';
import type { Chapter, Project } from '../types';
import { buildSections, copyrightLines } from './book';
import { getTrim } from './kdp';
import { smartenHtml, wordsInHtml } from './util';

const IN = 1440; // twips per inch

type RunStyle = { -readonly [K in 'bold' | 'italics' | 'underline' | 'strike' | 'superScript' | 'subScript']?: IRunOptions[K] };

interface BlockOpts {
  font: string;
  size: number; // half-points
  line: number; // 240 = single
  firstLine: number; // twips
  justify: boolean;
  sceneBreak: string;
}

function runsFrom(node: Node, style: RunStyle, opts: BlockOpts, out: ParagraphChild[]) {
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = (n.textContent ?? '').replace(/\s+/g, ' ');
      if (text) out.push(new TextRun({ text, font: opts.font, size: opts.size, ...style }));
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      out.push(new TextRun({ text: '', break: 1 }));
      return;
    }
    const next: RunStyle = { ...style };
    if (tag === 'strong' || tag === 'b') next.bold = true;
    if (tag === 'em' || tag === 'i') next.italics = true;
    if (tag === 'u') next.underline = {};
    if (tag === 's') next.strike = true;
    if (tag === 'sup') next.superScript = true;
    if (tag === 'sub') next.subScript = true;
    runsFrom(el, next, opts, out);
  });
}

/** Converts chapter HTML into Word paragraphs. */
export function htmlToParagraphs(html: string, opts: BlockOpts): Paragraph[] {
  const doc = new DOMParser().parseFromString(`<body>${smartenHtml(html)}</body>`, 'text/html');
  const paras: Paragraph[] = [];
  let indentNext = false;
  const spacing = { line: opts.line, lineRule: LineRuleType.AUTO, before: 0, after: 0 };

  const block = (el: Element, extra: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}, style: RunStyle = {}) => {
    const children: ParagraphChild[] = [];
    runsFrom(el, style, opts, children);
    if (!children.length) return;
    paras.push(
      new Paragraph({
        children,
        spacing,
        alignment: opts.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
        indent: { firstLine: indentNext ? opts.firstLine : 0 },
        ...extra,
      }),
    );
    indentNext = true;
  };

  Array.from(doc.body.children).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'p') block(el);
    else if (tag === 'hr') {
      paras.push(new Paragraph({ children: [new TextRun({ text: opts.sceneBreak, font: opts.font, size: opts.size })], alignment: AlignmentType.CENTER, spacing }));
      indentNext = false;
    } else if (tag === 'h2' || tag === 'h3') {
      indentNext = false;
      block(el, { alignment: AlignmentType.CENTER, spacing: { ...spacing, before: 240, after: 120 }, indent: { firstLine: 0 } }, { bold: true });
      indentNext = false;
    } else if (tag === 'blockquote') {
      el.querySelectorAll(':scope > p').forEach((p) => {
        indentNext = false;
        block(p, { indent: { left: 720, right: 720, firstLine: 0 } });
      });
      if (!el.querySelector(':scope > p')) block(el, { indent: { left: 720, right: 720, firstLine: 0 } });
      indentNext = false;
    } else if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll(':scope > li').forEach((li, i) => {
        const children: ParagraphChild[] = [new TextRun({ text: tag === 'ul' ? '•\t' : `${i + 1}.\t`, font: opts.font, size: opts.size })];
        runsFrom(li, {}, opts, children);
        paras.push(new Paragraph({ children, spacing, indent: { left: 720, hanging: 360 } }));
      });
      indentNext = false;
    } else block(el);
  });
  return paras;
}

function centered(text: string, opts: { font: string; size: number; bold?: boolean; italics?: boolean; before?: number; after?: number; pageBreakBefore?: boolean; allCaps?: boolean }) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    pageBreakBefore: opts.pageBreakBefore,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 0 },
    children: [new TextRun({ text, font: opts.font, size: opts.size, bold: opts.bold, italics: opts.italics, allCaps: opts.allCaps })],
  });
}

export async function buildManuscriptDocx(project: Project, chapters: Chapter[], contact: string): Promise<Blob> {
  const font = 'Times New Roman';
  const size = 24;
  const opts: BlockOpts = { font, size, line: 480, firstLine: 720, justify: false, sceneBreak: '#' };
  const { preToc, front, body, back } = buildSections(project, chapters);
  const sections = [...preToc, ...front, ...body, ...back];
  const words = chapters.reduce((n, c) => n + wordsInHtml(c.content), 0);
  const rounded = words < 10000 ? Math.round(words / 100) * 100 : Math.round(words / 1000) * 1000;
  const surname = (project.author.trim().split(/\s+/).pop() || 'Author');
  const shortTitle = project.title.split(/[:—–]/)[0].trim().toUpperCase();

  const titlePage: Paragraph[] = [
    ...contact.split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line, font, size })] })),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0 }, children: [new TextRun({ text: `Approx. ${rounded.toLocaleString()} words`, font, size })] }),
    centered(project.title.toUpperCase(), { font, size, before: 3600 }),
    ...(project.subtitle ? [centered(project.subtitle, { font, size, before: 240 })] : []),
    centered(`by ${project.author || '[Author Name]'}`, { font, size, before: 480 }),
  ];

  const bodyParas: Paragraph[] = [];
  sections.forEach((s) => {
    bodyParas.push(centered(s.label || s.name, { font, size, before: 2880, after: s.label && s.name ? 0 : 480, pageBreakBefore: true }));
    if (s.label && s.name) bodyParas.push(centered(s.name, { font, size, after: 480 }));
    bodyParas.push(...htmlToParagraphs(s.chapter.content, opts));
  });
  bodyParas.push(centered('END', { font, size, before: 480 }));

  const doc = new Document({
    creator: project.author,
    title: project.title,
    styles: { default: { document: { run: { font, size } } } },
    sections: [
      {
        properties: { page: { size: { width: 8.5 * IN, height: 11 * IN }, margin: { top: IN, bottom: IN, left: IN, right: IN } }, titlePage: true },
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ font, size, children: [`${surname} / ${shortTitle} / `, PageNumber.CURRENT] })] })],
          }),
          first: new Header({ children: [] }),
        },
        children: [...titlePage, ...bodyParas],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export async function buildPrintDocx(project: Project, chapters: Chapter[]): Promise<Blob> {
  const f = project.format;
  const trim = getTrim(f.trimId);
  const font = f.bodyFont;
  const size = Math.round(f.fontSize * 2);
  const opts: BlockOpts = { font, size, line: Math.round(240 * f.lineHeight * 0.85), firstLine: Math.round(f.indent * f.fontSize * 20), justify: f.justify, sceneBreak: f.sceneBreak || '* * *' };
  const { preToc, front, body, back } = buildSections(project, chapters);
  const head = f.headingFont;

  const children: Paragraph[] = [];
  if (f.titlePage) {
    children.push(centered(project.title, { font: head, size: size * 2.2, before: 2400 }));
    if (project.subtitle) children.push(centered(project.subtitle, { font: head, size: Math.round(size * 1.2), italics: true, before: 240 }));
    children.push(centered(project.author, { font: head, size: Math.round(size * 1.2), allCaps: true, before: 1200 }));
  }
  if (f.copyrightPage) {
    copyrightLines(project).forEach((l, i) =>
      children.push(new Paragraph({ pageBreakBefore: i === 0, spacing: { after: 160 }, children: [new TextRun({ text: l, font, size: Math.round(size * 0.8) })] })),
    );
  }
  if (project.meta.dedication.trim()) {
    children.push(centered(project.meta.dedication, { font, size, italics: true, before: 2400, pageBreakBefore: true }));
  }
  [...preToc, ...front, ...body, ...back].forEach((s) => {
    if (s.label) children.push(centered(s.label, { font: head, size, allCaps: true, before: 2000, pageBreakBefore: true }));
    if (s.name) children.push(centered(s.name, { font: head, size: Math.round(size * 1.6), italics: f.headingStyle === 'classic', before: s.label ? 160 : 2000, after: 600, pageBreakBefore: !s.label }));
    else children.push(new Paragraph({ spacing: { after: 600 }, children: [] }));
    children.push(...htmlToParagraphs(s.chapter.content, opts));
  });

  const m = f.margins;
  const doc = new Document({
    creator: project.author,
    title: project.title,
    styles: { default: { document: { run: { font, size } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(trim.width * IN), height: Math.round(trim.height * IN) },
            margin: { top: m.top * IN, bottom: m.bottom * IN, left: m.inside * IN, right: m.outside * IN, header: 0.4 * IN, footer: 0.4 * IN },
          },
          titlePage: true,
        },
        footers: f.pageNumbers
          ? {
              default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ font, size: Math.round(size * 0.8), children: [PageNumber.CURRENT] })] })] }),
              first: new Footer({ children: [] }),
            }
          : undefined,
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return withMirrorMargins(blob);
}

/** Word supports mirrored (book) margins via settings.xml; docx.js doesn't expose it, so patch it in. */
async function withMirrorMargins(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  const settings = zip.file('word/settings.xml');
  if (!settings) return blob;
  const xml = await settings.async('string');
  if (!xml.includes('w:mirrorMargins')) {
    zip.file('word/settings.xml', xml.replace(/(<w:settings[^>]*>)/, '$1<w:mirrorMargins/>'));
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** A plain, professional Word document for synopses, query letters, and bios. */
export async function buildSimpleDocx(title: string, body: string, author: string): Promise<Blob> {
  const font = 'Times New Roman';
  const size = 24;
  const paras = body.split(/\n\s*\n|\n/).filter((t) => t.trim());
  const doc = new Document({
    creator: author,
    title,
    sections: [
      {
        properties: { page: { size: { width: 8.5 * IN, height: 11 * IN }, margin: { top: IN, bottom: IN, left: IN, right: IN } } },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [new TextRun({ text: title, font, size: 28, bold: true })] }),
          ...paras.map((t) => {
            const children: ParagraphChild[] = t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
              /^\*\*.*\*\*$/.test(part) ? new TextRun({ text: part.slice(2, -2), font, size, bold: true }) : new TextRun({ text: part, font, size }),
            );
            return new Paragraph({ spacing: { after: 200, line: 276 }, children });
          }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}
