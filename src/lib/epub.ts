// EPUB 3 export (with an EPUB 2 NCX for older readers). KDP accepts EPUB directly.
import JSZip from 'jszip';
import type { Chapter, Project } from '../types';
import { buildSections, copyrightLines, type BookSection } from './book';
import { escapeHtml, smartenHtml, uid } from './util';

/** Converts editor HTML to well-formed XHTML (closes void tags, escapes entities). */
export function toXhtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  const serializer = new XMLSerializer();
  return Array.from(doc.body.childNodes)
    .map((n) => serializer.serializeToString(n))
    .join('')
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
}

const page = (title: string, body: string, epubType = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><meta charset="UTF-8"/><title>${escapeHtml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body${epubType ? ` epub:type="${epubType}"` : ''}>
${body}
</body>
</html>`;

export function epubCss(project: Project): string {
  const sb = project.format.sceneBreak.replace(/"/g, '\\"') || '* * *';
  return `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
p { margin: 0; text-indent: 1.4em; text-align: justify; }
.ch-head { text-align: center; margin: 3em 0 2em; }
.ch-label { display: block; font-variant: small-caps; letter-spacing: .15em; font-size: .95em; }
.ch-name { display: block; font-size: 1.5em; font-style: italic; margin-top: .4em; }
.ch-body > p:first-child, hr + p, h2 + p, h3 + p, blockquote + p { text-indent: 0; }
hr { border: 0; text-align: center; margin: 1em 0; }
hr::after { content: "${sb}"; letter-spacing: .4em; }
blockquote { margin: 1em 1.5em; }
h2, h3 { text-align: center; }
.title-page { text-align: center; margin-top: 25%; }
.title-page .t { font-size: 2em; }
.title-page .st { font-style: italic; margin-top: .6em; }
.title-page .a { margin-top: 2em; letter-spacing: .1em; text-transform: uppercase; }
.copyright p, .dedication p { text-indent: 0; text-align: left; font-size: .85em; margin-bottom: .8em; }
.dedication { text-align: center; font-style: italic; margin-top: 30%; }
.dedication p { text-align: center; }
nav ol { list-style: none; padding: 0; }
nav li { margin: .4em 0; }
img.cover { width: 100%; height: auto; }`;
}

function sectionBody(s: BookSection): string {
  return `<section epub:type="${s.chapter.kind === 'chapter' ? 'chapter' : s.chapter.kind === 'front' ? 'frontmatter' : 'backmatter'}">
<header class="ch-head">${s.label ? `<span class="ch-label">${escapeHtml(s.label)}</span>` : ''}${s.name ? `<h1 class="ch-name">${escapeHtml(s.name)}</h1>` : ''}</header>
<div class="ch-body">${toXhtml(smartenHtml(s.chapter.content))}</div>
</section>`;
}

export async function buildEpub(project: Project, chapters: Chapter[], cover?: Blob): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );

  const { preToc, front, body, back } = buildSections(project, chapters);
  const items: { id: string; href: string; title: string; xhtml: string; linear?: boolean; nav?: boolean }[] = [];

  if (cover) {
    items.push({ id: 'cover-page', href: 'cover.xhtml', title: 'Cover', xhtml: page('Cover', '<div><img class="cover" src="cover.jpg" alt="Cover"/></div>', 'cover') });
  }
  items.push({
    id: 'title-page', href: 'title.xhtml', title: 'Title Page', nav: false,
    xhtml: page(project.title, `<div class="title-page"><div class="t">${escapeHtml(project.title)}</div>${project.subtitle ? `<div class="st">${escapeHtml(project.subtitle)}</div>` : ''}<div class="a">${escapeHtml(project.author)}</div></div>`, 'titlepage'),
  });
  items.push({
    id: 'copyright', href: 'copyright.xhtml', title: 'Copyright', nav: false,
    xhtml: page('Copyright', `<div class="copyright">${copyrightLines(project).map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>`, 'copyright-page'),
  });
  if (project.meta.dedication.trim() && !preToc.some((s) => /dedication/i.test(s.chapter.title))) {
    items.push({ id: 'dedication', href: 'dedication.xhtml', title: 'Dedication', nav: false, xhtml: page('Dedication', `<div class="dedication"><p>${escapeHtml(project.meta.dedication)}</p></div>`, 'dedication') });
  }
  [...preToc, ...front, ...body, ...back].forEach((s, i) => {
    items.push({ id: `sec${i + 1}`, href: `sec${i + 1}.xhtml`, title: s.tocText, xhtml: page(s.tocText, sectionBody(s)) });
  });

  const navItems = items.filter((i) => i.nav !== false && i.id !== 'cover-page');
  const nav = page(
    'Contents',
    `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems.map((i) => `<li><a href="${i.href}">${escapeHtml(i.title)}</a></li>`).join('')}</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><ol>${cover ? '<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>' : ''}<li><a epub:type="toc" href="nav.xhtml">Contents</a></li>${navItems[0] ? `<li><a epub:type="bodymatter" href="${(items.find((i) => i.id.startsWith('sec')) ?? navItems[0]).href}">Start</a></li>` : ''}</ol></nav>`,
  );

  const bookId = `urn:uuid:${uid()}`;
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${bookId}"/></head>
<docTitle><text>${escapeHtml(project.title)}</text></docTitle>
<navMap>${navItems.map((it, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeHtml(it.title)}</text></navLabel><content src="${it.href}"/></navPoint>`).join('')}</navMap>
</ncx>`;

  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const lang = /spanish|español/i.test(project.meta.language) ? 'es' : 'en';
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="bookid">${project.meta.isbnEbook ? `urn:isbn:${escapeHtml(project.meta.isbnEbook.replace(/[^0-9Xx]/g, ''))}` : bookId}</dc:identifier>
  <dc:title>${escapeHtml(project.title)}</dc:title>
  <dc:creator>${escapeHtml(project.author || 'Unknown')}</dc:creator>
  <dc:language>${lang}</dc:language>
  ${project.meta.publisher ? `<dc:publisher>${escapeHtml(project.meta.publisher)}</dc:publisher>` : ''}
  ${project.meta.description ? `<dc:description>${escapeHtml(project.meta.description.replace(/\*\*/g, ''))}</dc:description>` : ''}
  <dc:rights>Copyright © ${escapeHtml(project.meta.pubYear)} ${escapeHtml(project.author)}</dc:rights>
  <meta property="dcterms:modified">${modified}</meta>
  ${cover ? '<meta name="cover" content="cover-image"/>' : ''}
</metadata>
<manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  <item id="css" href="style.css" media-type="text/css"/>
  ${cover ? '<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>' : ''}
  ${items.map((i) => `<item id="${i.id}" href="${i.href}" media-type="application/xhtml+xml"/>`).join('\n  ')}
</manifest>
<spine toc="ncx">
  ${items.map((i) => `<itemref idref="${i.id}"${i.linear === false ? ' linear="no"' : ''}/>`).join('\n  ')}
</spine>
</package>`;

  zip.file('OEBPS/content.opf', opf);
  zip.file('OEBPS/nav.xhtml', nav);
  zip.file('OEBPS/toc.ncx', ncx);
  zip.file('OEBPS/style.css', epubCss(project));
  for (const it of items) zip.file(`OEBPS/${it.href}`, it.xhtml);
  if (cover) zip.file('OEBPS/cover.jpg', cover);

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
}
