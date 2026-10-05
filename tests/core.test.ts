import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { coverDimensions, checkMargins, minGutter, spineWidth } from '../src/lib/kdp';
import { splitIntoSections, textToHtml, sanitizeHtml, classifyTitle } from '../src/lib/importers';
import { analyze } from '../src/lib/analysis';
import { applyVoiceCommands } from '../src/lib/dictation';
import { replaceInHtml } from '../src/lib/textops';
import { buildSections } from '../src/lib/book';
import { buildEpub, toXhtml } from '../src/lib/epub';
import { buildInteriorBody, printCss } from '../src/lib/print';
import { htmlToText, countWords, smartenText, numberToWords } from '../src/lib/util';
import { markdownToHtml } from '../src/lib/ai';
import { defaultCover, defaultFormat, defaultMeta } from '../src/db';
import type { Chapter, Project } from '../src/types';

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', title: 'The Long Road', subtitle: 'A Novel', author: 'Joshua Spence', genre: 'Fantasy', notes: '',
  wordGoal: 60000, dailyGoal: 1000, createdAt: 0, updatedAt: 0,
  format: defaultFormat(), cover: defaultCover(), meta: defaultMeta(), progress: {}, ...over,
});
const chapter = (order: number, title: string, content: string, kind: Chapter['kind'] = 'chapter'): Chapter => ({
  id: `c${order}-xxxxxxxx`, projectId: 'p1', order, kind, title, content, notes: '', status: 'draft', updatedAt: 0,
});

describe('KDP specs', () => {
  it('uses KDP gutter minimums by page count', () => {
    expect(minGutter(100)).toBe(0.375);
    expect(minGutter(151)).toBe(0.5);
    expect(minGutter(300)).toBe(0.5);
    expect(minGutter(450)).toBe(0.625);
    expect(minGutter(650)).toBe(0.75);
    expect(minGutter(800)).toBe(0.875);
  });

  it('computes full-wrap cover size with bleed and spine', () => {
    const d = coverDimensions('6x9', 300, 'cream');
    expect(d.spine).toBeCloseTo(0.75, 5);
    expect(d.width).toBeCloseTo(0.125 * 2 + 12 + 0.75, 5);
    expect(d.height).toBeCloseTo(9.25, 5);
    expect(d.spineText).toBe(true);
    expect(coverDimensions('5x8', 60, 'white').spineText).toBe(false);
    expect(spineWidth(200, 'white')).toBeCloseTo(0.4504, 4);
  });

  it('flags margins below KDP minimums', () => {
    expect(checkMargins({ top: 0.75, bottom: 0.75, inside: 0.875, outside: 0.625 }, 320).ok).toBe(true);
    const bad = checkMargins({ top: 0.2, bottom: 0.75, inside: 0.5, outside: 0.625 }, 320);
    expect(bad.ok).toBe(false);
    expect(bad.messages.join(' ')).toMatch(/gutter/);
    expect(bad.messages.join(' ')).toMatch(/top/);
  });
});

describe('Manuscript import', () => {
  it('splits on chapter-like paragraphs and headings, detecting front/back matter', () => {
    const html = '<p>Dedication</p><p>For Mom.</p><p>CHAPTER ONE</p><p>It began.</p><p>* * *</p><p>Later.</p><h1>Chapter 2: The Storm</h1><p>Rain.</p><p>About the Author</p><p>Writes books.</p>';
    const s = splitIntoSections(html);
    expect(s.map((x) => x.title)).toEqual(['Dedication', 'Chapter One', 'Chapter 2: The Storm', 'About the Author']);
    expect(s.map((x) => x.kind)).toEqual(['front', 'chapter', 'chapter', 'back']);
    expect(s[1].content).toContain('<hr>');
  });

  it('joins a bare chapter number with a following heading subtitle', () => {
    const s = splitIntoSections('<h2>Chapter 3</h2><h3>The Return</h3><p>Home again.</p>');
    expect(s[0].title).toBe('Chapter 3: The Return');
  });

  it('keeps an unsplittable manuscript as one section', () => {
    const s = splitIntoSections('<p>Just prose.</p><p>More prose.</p>', 'My Draft');
    expect(s).toHaveLength(1);
    expect(s[0].title).toBe('My Draft');
  });

  it('converts text and markdown', () => {
    expect(textToHtml('# Title\n\nHello *there* and **you**.\n\n***\n\nEnd.')).toBe('<h2>Title</h2><p>Hello <em>there</em> and <strong>you</strong>.</p><hr><p>End.</p>');
    expect(textToHtml('Line one.\nLine two.\nLine three.')).toBe('<p>Line one.</p><p>Line two.</p><p>Line three.</p>');
  });

  it('sanitizes to supported tags', () => {
    expect(sanitizeHtml('<div><p style="x">Hi <span>there</span> <b>bold</b><script>bad()</script></p></div>')).toBe('<p>Hi there <strong>bold</strong></p>');
    expect(classifyTitle('Acknowledgments')).toBe('back');
  });
});

describe('Analysis', () => {
  it('finds adverbs, fillers, passive voice, and long sentences', () => {
    const text = 'She walked very slowly to the door. The letter was written by her father. ' + 'word '.repeat(40).trim() + '.';
    const a = analyze(text);
    expect(a.counts.adverb).toBeGreaterThanOrEqual(1);
    expect(a.counts.filler).toBeGreaterThanOrEqual(1);
    expect(a.counts.passive).toBe(1);
    expect(a.counts['long-sentence']).toBe(1);
    expect(a.words).toBe(countWords(text));
  });
  it('does not flag common -ly non-adverbs', () => {
    expect(analyze('The family ate early in July.').counts.adverb).toBe(0);
  });
});

describe('Dictation', () => {
  it('turns spoken punctuation into marks and capitalizes', () => {
    expect(applyVoiceCommands('hello there comma friend period how are you question mark', true)).toBe('Hello there, friend. How are you?');
    expect(applyVoiceCommands('she said open quote wait close quote', false)).toBe('she said “wait”');
  });
});

describe('Proofreading replacements', () => {
  it('replaces across inline formatting', () => {
    expect(replaceInHtml('<p>Teh <em>quick</em> fox</p>', 'Teh quick', 'The quick')).toBe('<p>The quick<em></em> fox</p>');
    expect(replaceInHtml('<p>He said “hello”</p>', 'said "hello"', 'said “hi”')).toBe('<p>He said “hi”</p>');
    expect(replaceInHtml('<p>abc</p>', 'zzz', 'y')).toBeNull();
  });
});

describe('Book assembly', () => {
  const chapters = [
    chapter(0, 'Dedication', '<p>For you.</p>', 'front'),
    chapter(1, 'Prologue', '<p>Before.</p>'),
    chapter(2, 'Chapter 1', '<p>One.</p>'),
    chapter(3, 'The Storm', '<p>Two.</p><hr><p>After.</p>'),
    chapter(4, 'About the Author', '<p>Bio.</p>', 'back'),
  ];

  it('numbers chapters but not prologues', () => {
    const s = buildSections(project(), chapters);
    expect(s.preToc.map((x) => x.chapter.title)).toEqual(['Dedication']);
    expect(s.body.map((x) => x.tocText)).toEqual(['Prologue', 'Chapter One', 'Chapter Two: The Storm']);
    expect(s.back[0].label).toBe('');
  });

  it('builds a print interior with title, copyright, TOC, and chapters', () => {
    const p = project();
    const html = buildInteriorBody(p, chapters);
    expect(html).toContain('title-page');
    expect(html).toContain('Copyright © ');
    expect(html).toContain('work of fiction');
    expect(html).toContain('front-page toc');
    expect(html).toContain('body-start');
    const css = printCss(p);
    expect(css).toContain('size: 6in 9in');
    expect(css).toContain('counter(page)');
  });

  it('exports a structurally valid EPUB', async () => {
    const blob = await buildEpub(project(), chapters);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names[0]).toBe('mimetype');
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');
    expect(names).toContain('OEBPS/content.opf');
    expect(names).toContain('OEBPS/nav.xhtml');
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>The Long Road</dc:title>');
    const sec = await zip.file('OEBPS/sec4.xhtml')!.async('string');
    expect(sec).toMatch(/<hr ?\/>/);
    // Every content document must be well-formed XML.
    for (const n of names.filter((x) => x.endsWith('.xhtml'))) {
      const xml = await zip.file(n)!.async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length, n).toBe(0);
    }
  });

  it('serializes HTML as XHTML', () => {
    expect(toXhtml('<p>a<br>b &amp; c</p><hr>').replace(/ \/>/g, '/>')).toBe('<p>a<br/>b &amp; c</p><hr/>');
  });
});

describe('Utilities', () => {
  it('handles text, words, quotes, and numbers', () => {
    expect(htmlToText('<p>Hello&nbsp;world</p><p>Bye</p>')).toBe('Hello world\n\nBye');
    expect(countWords("It's a well-known fact.")).toBe(4);
    expect(smartenText(`"Don't," she said -- 'quietly'...`)).toBe('“Don’t,” she said — ‘quietly’…');
    expect(numberToWords(42)).toBe('Forty-Two');
    expect(markdownToHtml('## Notes\n- **One**\n- Two\n\nText')).toBe('<h3>Notes</h3><ul><li><strong>One</strong></li><li>Two</li></ul><p>Text</p>');
  });
});

describe('Editions, themes, and KDP checks', () => {
  it('lists all 16 KDP paperback sizes, five of them hardcover', async () => {
    const { TRIM_SIZES } = await import('../src/lib/kdp');
    expect(TRIM_SIZES).toHaveLength(16);
    expect(TRIM_SIZES.filter((t) => t.hardcover).map((t) => t.id)).toEqual(['5.5x8.5', '6x9', '6.14x9.21', '7x10', '8.25x11']);
  });

  it('applies hardcover page limits, trim and paper rules, and the large-print minimum', async () => {
    const { checkInterior } = await import('../src/lib/kdp');
    const margins = { top: 0.75, bottom: 0.75, inside: 0.875, outside: 0.625 };
    expect(checkInterior({ margins, edition: 'hardcover', trimId: '6x9', paper: 'cream' }, 60).messages.join(' ')).toMatch(/at least 75/);
    expect(checkInterior({ margins, edition: 'hardcover', trimId: '6x9', paper: 'cream' }, 600).messages.join(' ')).toMatch(/at most 550/);
    expect(checkInterior({ margins, edition: 'hardcover', trimId: '5x8', paper: 'cream' }, 200).messages.join(' ')).toMatch(/isn’t offered in hardcover/);
    expect(checkInterior({ margins, edition: 'hardcover', trimId: '6x9', paper: 'color-standard' }, 200).messages.join(' ')).toMatch(/Standard color/);
    expect(checkInterior({ margins, edition: 'paperback', largePrint: true, fontSize: 14 }, 200).messages.join(' ')).toMatch(/16pt/);
    expect(checkInterior({ margins, edition: 'paperback', trimId: '5x8', largePrint: true, fontSize: 16 }, 200).ok).toBe(true);
  });

  it('only uses fonts the formatter offers, and large print meets 16pt', async () => {
    const { THEMES } = await import('../src/lib/themes');
    const { BODY_FONTS, DISPLAY_FONTS } = await import('../src/lib/book');
    for (const t of THEMES) {
      expect(BODY_FONTS, t.id).toContain(t.settings.bodyFont);
      expect(DISPLAY_FONTS, t.id).toContain(t.settings.headingFont);
    }
    expect(THEMES.find((t) => t.id === 'large-print')!.settings.fontSize).toBeGreaterThanOrEqual(16);
  });

  it('spaces block paragraphs instead of indenting them', () => {
    const p = project();
    p.format.paragraphStyle = 'block';
    expect(printCss(p)).toContain('p { text-indent: 0; margin-bottom: .75em; }');
  });
});
