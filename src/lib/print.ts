// Builds the print interior as a single HTML document that Paged.js paginates
// into real pages (mirrored margins, running heads, page numbers, TOC page refs).
import type { Chapter, Project } from '../types';
import { getTrim } from './kdp';
import { buildSections, copyrightLines, googleFontsHref, type BookSection } from './book';
import { escapeHtml, smartenHtml } from './util';

export function printCss(project: Project): string {
  const f = project.format;
  const trim = getTrim(f.trimId);
  const m = f.margins;
  const head = `"${f.headingFont}", "${f.bodyFont}", Georgia, serif`;
  const body = `"${f.bodyFont}", Georgia, serif`;
  const author = (project.author || '').replace(/"/g, '\\"');
  const title = (project.title || '').replace(/"/g, '\\"');
  const folio = f.pageNumbers ? 'counter(page)' : 'none';

  const headingCss: Record<string, string> = {
    classic: `
      .ch-head { text-align: center; padding-top: 18%; margin-bottom: 2.6em; }
      .ch-label { font-variant: small-caps; letter-spacing: .18em; font-size: .95em; text-transform: lowercase; margin-bottom: .6em; }
      .ch-name { font-size: 1.7em; font-style: italic; font-weight: 400; }`,
    modern: `
      .ch-head { text-align: left; padding-top: 14%; margin-bottom: 2.4em; }
      .ch-label { font-size: .8em; letter-spacing: .25em; text-transform: uppercase; margin-bottom: .8em; opacity: .75; }
      .ch-name { font-size: 2em; font-weight: 700; line-height: 1.15; }`,
    elegant: `
      .ch-head { text-align: center; padding-top: 20%; margin-bottom: 2.8em; }
      .ch-label { font-size: .9em; letter-spacing: .3em; text-transform: uppercase; }
      .ch-label::after { content: "❦"; display: block; font-size: 1.2em; letter-spacing: 0; margin: .5em 0; }
      .ch-name { font-size: 1.6em; font-weight: 400; letter-spacing: .04em; }`,
    minimal: `
      .ch-head { text-align: center; padding-top: 22%; margin-bottom: 3em; }
      .ch-label { display: none; }
      .ch-name { font-size: 1.4em; font-weight: 400; letter-spacing: .12em; text-transform: uppercase; }
      .ch-head.numbered-only .ch-label { display: block; font-size: 1.4em; letter-spacing: .12em; text-transform: uppercase; }`,
    bold: `
      .ch-head { text-align: left; padding-top: 12%; margin-bottom: 2.4em; border-bottom: 1.5pt solid #000; padding-bottom: .6em; }
      .ch-label { font-size: 3.2em; font-weight: 700; line-height: 1; margin-bottom: .2em; }
      .ch-name { font-size: 1.3em; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }`,
  };

  return `
@page {
  size: ${trim.width}in ${trim.height}in;
  margin: ${m.top}in ${m.outside}in ${m.bottom}in ${m.inside}in;
  @bottom-center { content: ${folio}; font-family: ${body}; font-size: 9pt; }
}
@page :left {
  margin-left: ${m.outside}in; margin-right: ${m.inside}in;
  ${f.runningHeads ? `@top-center { content: "${author}"; font-family: ${body}; font-size: 8pt; letter-spacing: .15em; text-transform: uppercase; }` : ''}
}
@page :right {
  margin-left: ${m.inside}in; margin-right: ${m.outside}in;
  ${f.runningHeads ? `@top-center { content: "${title}"; font-family: ${body}; font-size: 8pt; letter-spacing: .15em; text-transform: uppercase; }` : ''}
}
@page front { @top-center { content: none; } @bottom-center { content: none; } }
@page chapter:first { @top-center { content: none; } }
@page :blank { @top-center { content: none; } @bottom-center { content: none; } }

html { font-family: ${body}; font-size: ${f.fontSize}pt; line-height: ${f.lineHeight}; color: #000; }
body { margin: 0; }
p { margin: 0; text-align: ${f.justify ? 'justify' : 'left'}; hyphens: ${f.hyphenate ? 'auto' : 'manual'}; orphans: 2; widows: 2; }
p { text-indent: ${f.indent}em; }
h2, h3 { font-family: ${head}; font-weight: 600; break-after: avoid; }
h2 { font-size: 1.2em; margin: 1.4em 0 .6em; text-align: center; }
h3 { font-size: 1.05em; margin: 1.2em 0 .4em; }
blockquote { margin: .8em 1.6em; font-size: .95em; }
blockquote p { text-indent: 0 !important; }
ul, ol { margin: .6em 0 .6em 1.4em; padding: 0; }
hr { border: 0; text-align: center; margin: 1em 0; height: auto; break-after: avoid; }
hr::after { content: "${f.sceneBreak.replace(/"/g, '\\"') || '* * *'}"; font-size: 1em; letter-spacing: .4em; }
/* Paged.js clones the chapter wrapper onto each page, so :first-child would match every page;
   the opening paragraph is marked .lead instead, and split continuations carry data-split-from. */
.ch-body > p.lead, p[data-split-from], hr + p, h2 + p, h3 + p, blockquote + p, ul + p, ol + p, li p { text-indent: 0; }

.front-page { page: front; break-before: ${f.startOnRight ? 'right' : 'page'}; }
.title-page { break-before: auto; display: flex; flex-direction: column; text-align: center; height: 100%; }
.title-page .t { font-family: ${head}; font-size: 2.4em; line-height: 1.15; margin-top: 30%; }
.title-page .st { font-family: ${head}; font-style: italic; font-size: 1.2em; margin-top: .8em; }
.title-page .a { font-family: ${head}; font-size: 1.3em; letter-spacing: .12em; text-transform: uppercase; margin-top: 3em; }
.title-page .pub { margin-top: auto; font-size: .8em; letter-spacing: .2em; text-transform: uppercase; }
.copyright-page { break-before: page; font-size: .75em; line-height: 1.5; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
.copyright-page p { text-indent: 0; text-align: left; margin-bottom: .7em; hyphens: manual; }
.dedication-page { text-align: center; font-style: italic; padding-top: 30%; }
.dedication-page p { text-align: center; text-indent: 0; }
.toc h1 { font-family: ${head}; text-align: center; font-weight: 400; font-size: 1.3em; letter-spacing: .2em; text-transform: uppercase; margin: 10% 0 2em; }
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc li { margin: 0 0 .45em; display: flex; }
.toc a { color: inherit; text-decoration: none; flex: 1; display: flex; }
.toc a .dots { flex: 1; border-bottom: 1px dotted #888; margin: 0 .4em .3em; }
.toc a::after { content: target-counter(attr(href), page); }

.chapter { page: chapter; break-before: ${f.startOnRight ? 'right' : 'page'}; }
.ch-head { font-family: ${head}; }
.ch-label, .ch-name { display: block; }
${headingCss[f.headingStyle] ?? headingCss.classic}
${f.dropCaps ? `.ch-body > p.lead:not([data-split-from])::first-letter { float: left; font-family: ${head}; font-size: 3.4em; line-height: .82; padding: .06em .08em 0 0; }` : ''}
${f.smallCapsLead ? `.ch-body > p.lead:not([data-split-from])::first-line { font-variant: small-caps; letter-spacing: .03em; }` : ''}
`;
}

function sectionHtml(s: BookSection, cls: string): string {
  const numberedOnly = s.label && !s.name;
  return `<section class="chapter ${cls}" id="${s.anchor}">
  <header class="ch-head${numberedOnly ? ' numbered-only' : ''}">
    ${s.label ? `<span class="ch-label">${escapeHtml(s.label)}</span>` : ''}
    ${s.name ? `<span class="ch-name">${escapeHtml(s.name)}</span>` : ''}
  </header>
  <div class="ch-body">${smartenHtml(s.chapter.content).replace(/^(\s*)<p(?=[\s>])/, '$1<p class="lead"')}</div>
</section>`;
}

export function buildInteriorBody(project: Project, chapters: Chapter[]): string {
  const f = project.format;
  const { preToc, front, body, back } = buildSections(project, chapters);
  const parts: string[] = [];

  if (f.titlePage) {
    parts.push(`<section class="front-page title-page">
      <div class="t">${escapeHtml(project.title)}</div>
      ${project.subtitle ? `<div class="st">${escapeHtml(project.subtitle)}</div>` : ''}
      <div class="a">${escapeHtml(project.author)}</div>
      ${project.meta.publisher ? `<div class="pub">${escapeHtml(project.meta.publisher)}</div>` : ''}
    </section>`);
  }
  if (f.copyrightPage) {
    parts.push(`<section class="front-page copyright-page">${copyrightLines(project).map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</section>`);
  }
  if (project.meta.dedication.trim() && !preToc.some((s) => /dedication/i.test(s.chapter.title))) {
    parts.push(`<section class="front-page dedication-page"><p>${escapeHtml(project.meta.dedication)}</p></section>`);
  }
  for (const s of preToc) {
    parts.push(`<section class="front-page dedication-page" id="${s.anchor}">${smartenHtml(s.chapter.content)}</section>`);
  }
  const tocEntries = [...front, ...body, ...back];
  if (f.toc && tocEntries.length > 1) {
    parts.push(`<section class="front-page toc"><h1>Contents</h1><ol>${tocEntries
      .map((s) => `<li><a href="#${s.anchor}">${escapeHtml(s.tocText)}<span class="dots"></span></a></li>`)
      .join('')}</ol></section>`);
  }
  front.forEach((s) => parts.push(sectionHtml(s, '')));
  body.forEach((s, i) => parts.push(sectionHtml(s, i === 0 ? 'body-start' : '')));
  // Pages are numbered continuously from the title page (Paged.js can't reliably restart the counter).
  back.forEach((s) => parts.push(sectionHtml(s, '')));
  return parts.join('\n');
}

/**
 * Full srcdoc for the preview iframe. Paged.js is embedded (not loaded by URL, which
 * srcdoc frames resolve unreliably) and posts the final page count back to the parent.
 */
export function buildPrintDocument(project: Project, chapters: Chapter[], pagedCode: string): string {
  const f = project.format;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(project.title)}</title>
<style>${printCss(project)}</style>
<style>
@media screen {
  body { background: #eceae6; }
  .pagedjs_pages { display: flex; flex-wrap: wrap; justify-content: center; gap: 28px 0; padding: 32px 0; }
  .pagedjs_page { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.06); }
  .pagedjs_page.pagedjs_left_page { margin-left: 24px; }
  .pagedjs_page.pagedjs_right_page { margin-right: 24px; }
  .pagedjs_first_page { margin-left: calc(var(--pagedjs-width) + 24px); }
}
</style>
<script>
  // Load web fonts without blocking: if they're slow or offline, paginate with fallbacks.
  var fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = ${JSON.stringify(googleFontsHref([f.bodyFont, f.headingFont]))};
  var fontsLoaded = false;
  var fontsReady = new Promise(function (resolve) {
    fontLink.onload = function () { document.fonts.ready.then(function () { fontsLoaded = true; resolve(); }); };
    fontLink.onerror = resolve;
  });
  document.head.appendChild(fontLink);
  window.PagedConfig = {
    auto: true,
    before: function () {
      return Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 4000); })]).then(function () {
        // A stalled font request keeps document.fonts.ready pending, which Paged.js waits on.
        if (!fontsLoaded) fontLink.remove();
      });
    },
    after: function (flow) { parent.postMessage({ type: 'paged-done', pages: flow.total }, '*'); },
  };
</script>
<script>${pagedCode.replace(/<\/script/gi, '<\\/script')}</script>
</head><body>
${buildInteriorBody(project, chapters)}
</body></html>`;
}
