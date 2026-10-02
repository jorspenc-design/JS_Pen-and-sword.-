import type { SectionKind } from '../types';
import { escapeHtml } from './util';

export interface ImportedSection {
  title: string;
  kind: SectionKind;
  content: string;
}

const CHAPTER_RE = /^(chapter|ch\.)\s+([0-9]+|[ivxlcdm]+|[a-z-]+)\b[\s:.\-–—]*(.*)$/i;
const SPECIAL_RE = /^(prologue|epilogue|interlude|introduction|preface|foreword|prelude|afterword|dedication|acknowledg(e)?ments?|about the author|epigraph|author'?s note|a note from the author|glossary|bibliography|notes|appendix\b.*|part\s+([0-9]+|[ivxlcdm]+|[a-z-]+)\b.*)$/i;
const FRONT_RE = /^(dedication|epigraph|foreword|preface|prelude)$/i;
const BACK_RE = /^(afterword|acknowledg(e)?ments?|about the author|glossary|bibliography|notes|appendix\b.*|author'?s note|a note from the author)$/i;
const SCENE_BREAK_RE = /^\s*([*#~•·⁂❧✦-]\s*){1,5}\s*$/;

const ALLOWED = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'BR', 'HR', 'SUP', 'SUB']);
const RENAME: Record<string, string> = { B: 'strong', I: 'em', H1: 'h2', H4: 'h3' };

export function classifyTitle(title: string): SectionKind {
  const t = title.trim();
  if (FRONT_RE.test(t)) return 'front';
  if (BACK_RE.test(t)) return 'back';
  return 'chapter';
}

/** Is this short block of text a chapter/section heading in disguise? */
export function looksLikeHeading(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 90) return false;
  return CHAPTER_RE.test(t) || SPECIAL_RE.test(t);
}

/** Cleans arbitrary HTML down to the small set of tags the editor and exporters support. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = doc.createElement('div');
  const walk = (src: Node, dst: Node) => {
    src.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        dst.appendChild(doc.createTextNode(n.textContent ?? ''));
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n as Element;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
      if (ALLOWED.has(tag)) {
        const copy = doc.createElement(RENAME[tag] ?? tag.toLowerCase());
        dst.appendChild(copy);
        walk(el, copy);
      } else if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE') {
        walk(el, dst);
      } else {
        walk(el, dst); // unwrap spans, anchors, fonts, etc.
      }
    });
  };
  walk(doc.body, out);
  return out.innerHTML;
}

/**
 * Splits a manuscript (as HTML) into chapters by headings and by paragraphs that
 * read like chapter headings ("Chapter 3", "Prologue", "About the Author").
 */
export function splitIntoSections(html: string, fallbackTitle = 'Manuscript'): ImportedSection[] {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}</body>`, 'text/html');
  const blocks = Array.from(doc.body.children);
  const sections: { title: string; parts: string[] }[] = [];
  let current: { title: string; parts: string[] } | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const el = blocks[i];
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const isHeadingTag = /^H[1-3]$/.test(el.tagName);
    const isHeading = (isHeadingTag && text.length > 0 && text.length <= 120) || (el.tagName === 'P' && looksLikeHeading(text));

    if (isHeading) {
      let title = text;
      // "Chapter 1" followed by a heading-styled subtitle → "Chapter 1: Subtitle"
      const next = blocks[i + 1];
      const nextText = (next?.textContent ?? '').trim();
      if (CHAPTER_RE.test(text) && !CHAPTER_RE.exec(text)![3] && next && /^H[1-4]$/.test(next.tagName) && nextText && !looksLikeHeading(nextText)) {
        title = `${text}: ${nextText}`;
        i++;
      }
      current = { title, parts: [] };
      sections.push(current);
      continue;
    }

    if (!text && el.tagName === 'P') continue; // empty paragraph
    if (!current) {
      current = { title: fallbackTitle, parts: [] };
      sections.push(current);
    }
    if (el.tagName === 'P' && SCENE_BREAK_RE.test(text)) {
      current.parts.push('<hr>');
    } else {
      current.parts.push(el.outerHTML);
    }
  }

  return sections
    .filter((s) => s.parts.length > 0 || sections.length === 1)
    .map((s) => ({
      title: titleCase(s.title),
      kind: classifyTitle(s.title),
      content: s.parts.join('') || '<p></p>',
    }));
}

function titleCase(t: string): string {
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s:—–-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** Plain text or Markdown → simple HTML. */
export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  const blankLineCount = (normalized.match(/\n\s*\n/g) ?? []).length;
  const lineCount = (normalized.match(/\n/g) ?? []).length;
  // Files with one paragraph per line (few blank lines) split on single newlines.
  const chunks = blankLineCount < lineCount / 4 ? normalized.split(/\n+/) : normalized.split(/\n\s*\n/);
  return chunks
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const h = /^(#{1,3})\s+(.*)$/.exec(c);
      if (h) return `<h${Math.min(3, h[1].length + 1)}>${inlineMd(h[2])}</h${Math.min(3, h[1].length + 1)}>`;
      if (/^>\s?/.test(c)) return `<blockquote><p>${inlineMd(c.replace(/^>\s?/gm, ''))}</p></blockquote>`;
      if (SCENE_BREAK_RE.test(c)) return '<hr>';
      return `<p>${inlineMd(c.replace(/\n/g, ' '))}</p>`;
    })
    .join('');
}

function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, '$1<em>$2</em>');
}

export async function importFile(file: File): Promise<ImportedSection[]> {
  const name = file.name.toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, '');
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Chapter Title'] => h2:fresh",
          "p[style-name='Chapter Heading'] => h2:fresh",
          "p[style-name='Block Text'] => blockquote > p:fresh",
          "p[style-name='Quote'] => blockquote > p:fresh",
        ],
      },
    );
    return splitIntoSections(result.value, base);
  }
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    return splitIntoSections(await file.text(), base);
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.text')) {
    return splitIntoSections(textToHtml(await file.text()), base);
  }
  throw new Error('Unsupported file type. Import .docx, .txt, .md, or .html files.');
}
