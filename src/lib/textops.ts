// Find-and-replace inside chapter HTML that works across inline formatting,
// so a proofreading fix lands even when the phrase spans <em> or <strong>.

const normalize = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[—–]/g, '-').replace(/ /g, ' ');

export function replaceInHtml(html: string, original: string, replacement: string): string | null {
  if (!original) return null;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let full = '';
  const starts: number[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    starts.push(full.length);
    nodes.push(n as Text);
    full += n.textContent ?? '';
  }
  let index = full.indexOf(original);
  if (index === -1) index = normalize(full).indexOf(normalize(original));
  if (index === -1) return null;
  const end = index + original.length;

  let replaced = false;
  nodes.forEach((node, i) => {
    const s = starts[i];
    const e = s + (node.textContent ?? '').length;
    if (e <= index || s >= end) return;
    const text = node.textContent ?? '';
    const localStart = Math.max(0, index - s);
    const localEnd = Math.min(text.length, end - s);
    node.textContent = text.slice(0, localStart) + (replaced ? '' : replacement) + text.slice(localEnd);
    replaced = true;
  });
  return doc.body.innerHTML;
}

/** Wraps the first occurrence of `needle` in <mark> for display (text-only excerpts). */
export function highlight(excerpt: string, needle: string): { before: string; match: string; after: string } {
  const i = excerpt.indexOf(needle);
  if (i === -1) return { before: excerpt, match: '', after: '' };
  return { before: excerpt.slice(0, i), match: needle, after: excerpt.slice(i + needle.length) };
}
