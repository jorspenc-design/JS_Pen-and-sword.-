// Browser client for the Pen and Sword AI server (see server/index.ts).
import type { Chapter, Project } from '../types';
import { htmlToText } from './util';

export interface AiContext {
  title?: string;
  subtitle?: string;
  author?: string;
  genre?: string;
  audience?: string;
  synopsis?: string;
  chapterTitle?: string;
  chapterText?: string;
  manuscript?: string;
}

export interface AiRequest {
  task: string;
  text?: string;
  instruction?: string;
  context?: AiContext;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export function projectContext(project: Project, chapter?: Chapter | null): AiContext {
  return {
    title: project.title,
    subtitle: project.subtitle,
    author: project.author,
    genre: project.genre,
    audience: project.meta.audience,
    synopsis: project.notes,
    chapterTitle: chapter?.title,
    chapterText: chapter ? htmlToText(chapter.content) : undefined,
  };
}

export function manuscriptText(chapters: Chapter[]): string {
  return chapters
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => `## ${c.title}\n\n${htmlToText(c.content)}`)
    .join('\n\n');
}

let healthCache: Promise<{ ai: boolean; model?: string }> | null = null;
export function aiHealth() {
  healthCache ??= fetch('/api/health')
    .then((r) => (r.ok ? r.json() : { ai: false }))
    .catch(() => ({ ai: false }));
  return healthCache;
}

/** Streams text from the server. Calls onText with each chunk; resolves with the full text. */
export async function streamAi(req: AiRequest, onText: (chunk: string, full: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/ai/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let error: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(raw)?.[1];
      const data = /^data: (.*)$/m.exec(raw)?.[1];
      if (!event || data === undefined) continue;
      const payload = JSON.parse(data);
      if (event === 'text') {
        full += payload;
        onText(payload, full);
      } else if (event === 'error') error = payload;
    }
  }
  if (error) throw new Error(error);
  return full;
}

export async function jsonAi<T>(req: AiRequest, signal?: AbortSignal): Promise<T> {
  const res = await fetch('/api/ai/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Minimal Markdown → HTML for AI reports (headings, bold, italics, lists, paragraphs). */
export function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of md.split('\n')) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = Math.min(4, h[1].length + 1);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (ul) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (ol) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else if (/^\s*>/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('');
}

/** Plain prose from the AI → editor paragraphs. */
export function proseToHtml(text: string): string {
  return text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/^([*#~]\s*){3,}$/.test(p) ? '<hr>' : `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`))
    .join('');
}
