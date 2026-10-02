import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import JSZip from 'jszip';
import { useBook } from '../App';
import { db, updateProject } from '../db';
import type { Chapter, Project, PublishMeta } from '../types';
import { persona } from '../personas';
import { Field, PersonaHeader, Progress, Says, useToast } from '../components/ui';
import { aiHealth, jsonAi, manuscriptText, projectContext, streamAi } from '../lib/ai';
import { checkMargins } from '../lib/kdp';
import { buildEpub } from '../lib/epub';
import { buildManuscriptDocx, buildPrintDocx, buildSimpleDocx } from '../lib/docx';
import { canvasToBlob, ensureFonts, getCoverDims, loadImage, renderEbookCanvas, wrapToPdf } from '../lib/cover';
import { downloadBlob, slug, wordsInHtml } from '../lib/util';

export interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
  auto: boolean;
  done: boolean;
  path: 'kdp' | 'traditional' | 'both';
  link?: 'write' | 'edit' | 'format' | 'design';
}

export function publishChecklist(project: Project, chapters: Chapter[]): ChecklistItem[] {
  const m = project.meta;
  const f = project.format;
  const manual = (id: string) => Boolean(m.checklist[id]);
  const allEdited = chapters.length > 0 && chapters.every((c) => c.status === 'edited' || c.status === 'final');
  const words = chapters.reduce((n, c) => n + wordsInHtml(c.content), 0);
  const items: ChecklistItem[] = [
    { id: 'complete', label: 'Manuscript complete and edited', detail: 'Every section marked Edited or Final.', auto: true, done: allEdited, path: 'both', link: 'edit' },
    { id: 'proofed', label: 'Final proofread done', detail: 'Elias’s proofread, plus one slow read-through aloud.', auto: false, done: manual('proofed'), path: 'both', link: 'edit' },
    { id: 'details', label: 'Title, author, and genre set', detail: 'Exactly as they’ll appear on the cover.', auto: true, done: Boolean(project.title.trim() && project.author.trim() && project.genre.trim()), path: 'both' },
    { id: 'description', label: 'Book description written', detail: '150–250 words that make a browser click “Buy”.', auto: true, done: m.description.trim().length > 200, path: 'kdp' },
    { id: 'keywords', label: 'Seven keywords chosen', detail: 'Phrases readers type into Amazon search.', auto: true, done: m.keywords.filter((k) => k.trim()).length >= 7, path: 'kdp' },
    { id: 'categories', label: 'Categories picked', detail: 'Up to three on KDP.', auto: true, done: m.categories.some((k) => k.trim()), path: 'kdp' },
    { id: 'interior', label: 'Interior typeset and within KDP limits', detail: 'Page count measured, margins checked.', auto: true, done: f.pageCount > 0 && checkMargins(f.margins, f.pageCount).ok, path: 'kdp', link: 'format' },
    { id: 'cover', label: 'Cover finished: front, spine, back', detail: 'Sized to the final page count.', auto: false, done: manual('cover'), path: 'kdp', link: 'design' },
    { id: 'isbn', label: 'ISBN decided', detail: 'Free KDP ISBN, or your own from Bowker (needed to list your own imprint).', auto: true, done: Boolean(m.isbnPrint.trim()) || manual('isbn'), path: 'kdp' },
    { id: 'price', label: 'Price set', detail: 'Check comparable books in your category.', auto: true, done: Boolean(m.price.trim()), path: 'kdp' },
    { id: 'proof', label: 'Proof copy ordered and checked', detail: 'Hold the real book before you hit Publish.', auto: false, done: manual('proof'), path: 'kdp' },
    { id: 'bio', label: 'Author bio written', detail: 'For the back cover, Amazon Author Central, and queries.', auto: true, done: m.authorBio.trim().length > 60, path: 'both' },
    { id: 'synopsis', label: 'Synopsis written', detail: 'One page, full arc including the ending.', auto: true, done: m.synopsis.trim().length > 300, path: 'traditional' },
    { id: 'query', label: 'Query letter drafted', detail: 'Hook, pitch, specs, bio — under one page.', auto: true, done: m.queryLetter.trim().length > 300, path: 'traditional' },
    { id: 'comps', label: 'Comparable titles chosen', detail: 'Two or three recent books like yours.', auto: true, done: m.comps.filter((c) => c.trim()).length >= 2, path: 'traditional' },
    { id: 'wordcount', label: 'Word count fits the category', detail: `Currently ${words.toLocaleString()} words. Most debut novels run 70–100k.`, auto: false, done: manual('wordcount'), path: 'traditional' },
    { id: 'agents', label: 'Agent or publisher list researched', detail: 'Who represents books like yours, and their submission rules.', auto: false, done: manual('agents'), path: 'traditional' },
  ];
  return items.filter((i) => m.path === 'both' || i.path === 'both' || i.path === m.path);
}

export default function Publish() {
  const { project, chapters } = useBook();
  const toast = useToast();
  const m = project.meta;
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState('');
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => { aiHealth().then((h) => setAiReady(h.ai)); return () => ctrl.current?.abort(); }, []);

  const setMeta = (patch: Partial<PublishMeta>) => updateProject(project.id, { meta: { ...m, ...patch } });
  const items = publishChecklist(project, chapters);
  const done = items.filter((i) => i.done).length;

  async function draft(task: 'blurb' | 'synopsis' | 'query' | 'bio', field: 'description' | 'synopsis' | 'queryLetter' | 'authorBio', instruction?: string) {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(task);
    const original = m[field];
    const context = { ...projectContext(project), manuscript: task === 'bio' ? undefined : manuscriptText(chapters) };
    try {
      let latest = '';
      await streamAi({ task, instruction, context }, (_x, full) => {
        latest = full;
        setMeta({ [field]: full } as Partial<PublishMeta>);
      }, c.signal);
      // Re-read to avoid clobbering edits made elsewhere while streaming.
      const fresh = await db.projects.get(project.id);
      if (fresh) await updateProject(project.id, { meta: { ...fresh.meta, [field]: latest } });
    } catch (e) {
      if (!c.signal.aborted) {
        toast((e as Error).message, 'error');
        setMeta({ [field]: original } as Partial<PublishMeta>);
      }
    } finally {
      setBusy('');
    }
  }

  async function suggestMarketing() {
    setBusy('marketing');
    try {
      const res = await jsonAi<{ keywords: string[]; categories: { path: string; why: string }[]; comps: { title: string; author: string; why: string }[] }>({
        task: 'marketing',
        context: { ...projectContext(project), manuscript: manuscriptText(chapters).slice(0, 400000) },
      });
      const keywords = [...res.keywords.slice(0, 7)];
      while (keywords.length < 7) keywords.push('');
      setMeta({
        keywords: m.keywords.some((k) => k.trim()) ? m.keywords.map((k, i) => k.trim() || keywords[i]) : keywords,
        categories: res.categories.slice(0, 3).map((c) => c.path),
        comps: res.comps.slice(0, 3).map((c) => `${c.title} by ${c.author}`),
      });
      toast('Ada filled in keywords, categories, and comps. Edit freely.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function coverInputs() {
    await ensureFonts(project.cover);
    const asset = project.cover.imageAssetId ? await db.assets.get(project.cover.imageAssetId) : undefined;
    return { project, image: asset ? await loadImage(asset.data) : null };
  }

  async function kdpPackage() {
    setBusy('kdp');
    try {
      const zip = new JSZip();
      const name = slug(project.title);
      const input = await coverInputs();
      const ebookCover = await canvasToBlob(renderEbookCanvas(input), 'image/jpeg', 0.92);
      zip.file(`${name}.epub`, await buildEpub(project, chapters, ebookCover));
      zip.file(`${name}-ebook-cover.jpg`, ebookCover);
      zip.file(`${name}-paperback-cover.pdf`, await wrapToPdf(input));
      zip.file(`${name}-interior.docx`, await buildPrintDocx(project, chapters));
      zip.file('kdp-details.txt', kdpDetailsText(project));
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${name}-kdp-package.zip`);
      toast('Package ready. For the print interior PDF, use Margot’s “Print-ready PDF”.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function submissionPackage() {
    setBusy('sub');
    try {
      const zip = new JSZip();
      const name = slug(project.title);
      let contact = project.author;
      try { contact = localStorage.getItem('pns-contact') || project.author; } catch { /* private mode */ }
      zip.file(`${name}-manuscript.docx`, await buildManuscriptDocx(project, chapters, contact));
      if (m.synopsis.trim()) zip.file(`${name}-synopsis.docx`, await buildSimpleDocx(`${project.title}: Synopsis`, m.synopsis, project.author));
      if (m.queryLetter.trim()) zip.file(`${name}-query-letter.docx`, await buildSimpleDocx('Query Letter', m.queryLetter, project.author));
      if (m.authorBio.trim()) zip.file(`${name}-author-bio.docx`, await buildSimpleDocx('About the Author', m.authorBio, project.author));
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${name}-submission.zip`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }

  const kdp = m.path !== 'traditional';
  const trad = m.path !== 'kdp';
  const disabled = aiReady === false || !!busy;
  const draftBtn = (task: 'blurb' | 'synopsis' | 'query' | 'bio', field: 'description' | 'synopsis' | 'queryLetter' | 'authorBio', label: string, instruction?: string) => (
    <button className="btn sm" disabled={disabled} onClick={() => draft(task, field, instruction)}>{busy === task ? persona('publish').working : m[field].trim() ? `Redraft with Ada` : label}</button>
  );

  return (
    <main className="page">
      <PersonaHeader stage="publish" />

      <section className="section">
        <div className="section-title">
          <h2>Your path to readers</h2>
          <div className="segmented">
            <button className={m.path === 'kdp' ? 'active' : ''} onClick={() => setMeta({ path: 'kdp' })}>Self-publish on KDP</button>
            <button className={m.path === 'traditional' ? 'active' : ''} onClick={() => setMeta({ path: 'traditional' })}>Traditional publisher</button>
            <button className={m.path === 'both' ? 'active' : ''} onClick={() => setMeta({ path: 'both' })}>Both</button>
          </div>
        </div>
        {aiReady === false && <div className="warn-box" style={{ marginBottom: '1rem' }}>Ada’s drafting needs an Anthropic API key in <code>.env</code>. Everything else here works without it.</div>}

        <div className="card">
          <div className="row between" style={{ marginBottom: '.75rem' }}>
            <span className="serif" style={{ fontSize: '1.15rem' }}>Ready to publish</span>
            <span className="faint small">{done} of {items.length}</span>
          </div>
          <Progress value={done / items.length} />
          <div style={{ marginTop: '1rem' }}>
            {items.map((i) => (
              <div key={i.id} className={`checklist-item ${i.auto ? 'auto' : ''}`}>
                <button
                  className={`tick ${i.done ? 'on' : ''}`}
                  aria-label={i.done ? 'Done' : 'Not done'}
                  title={i.auto ? 'Ada checks this automatically' : 'Tick when done'}
                  onClick={() => !i.auto || i.id === 'isbn' ? setMeta({ checklist: { ...m.checklist, [i.id]: !m.checklist[i.id] } }) : undefined}
                >
                  {i.done ? '✓' : ''}
                </button>
                <div className="grow">
                  <div>{i.label}</div>
                  <div className="faint small">{i.detail}</div>
                </div>
                {i.link && !i.done && <Link className="btn sm ghost" to={`/book/${project.id}/${i.link}`}>Go</Link>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title"><h2>Book details</h2></div>
        <div className="grid three">
          <Field label="Series"><input value={m.series} onChange={(e) => setMeta({ series: e.target.value })} /></Field>
          <Field label="Series number"><input value={m.seriesNumber} onChange={(e) => setMeta({ seriesNumber: e.target.value })} /></Field>
          <Field label="Edition"><input value={m.edition} onChange={(e) => setMeta({ edition: e.target.value })} /></Field>
          <Field label="Publisher / imprint"><input value={m.publisher} placeholder="Optional" onChange={(e) => setMeta({ publisher: e.target.value })} /></Field>
          <Field label="Language"><input value={m.language} onChange={(e) => setMeta({ language: e.target.value })} /></Field>
          <Field label="Publication year"><input value={m.pubYear} onChange={(e) => setMeta({ pubYear: e.target.value })} /></Field>
          <Field label="ISBN · paperback"><input value={m.isbnPrint} placeholder="Leave blank for a free KDP ISBN" onChange={(e) => setMeta({ isbnPrint: e.target.value })} /></Field>
          <Field label="ISBN · eBook"><input value={m.isbnEbook} placeholder="Optional for Kindle" onChange={(e) => setMeta({ isbnEbook: e.target.value })} /></Field>
          <Field label="Audience"><select value={m.audience} onChange={(e) => setMeta({ audience: e.target.value })}>{['Adult', 'Young Adult', 'Middle Grade', 'Children'].map((a) => <option key={a}>{a}</option>)}</select></Field>
          {kdp && <Field label="List price"><input value={m.price} placeholder="$14.99" onChange={(e) => setMeta({ price: e.target.value })} /></Field>}
        </div>
        <div style={{ marginTop: '1.25rem' }}>
          <Field label="Dedication (appears on its own page)"><input value={m.dedication} placeholder="For…" onChange={(e) => setMeta({ dedication: e.target.value })} /></Field>
        </div>
      </section>

      {kdp && (
        <section className="section">
          <DraftBlock title="Book description" note="Shown on Amazon and the back cover." action={draftBtn('blurb', 'description', 'Draft with Ada')} copy={() => kdpHtml(m.description)}>
            <textarea rows={9} value={m.description} onChange={(e) => setMeta({ description: e.target.value })} placeholder="The hook, the promise, the reason to read…" />
          </DraftBlock>
        </section>
      )}

      <section className="section">
        <div className="section-title">
          <h2>Discoverability</h2>
          <button className="btn sm" disabled={disabled} onClick={suggestMarketing}>{busy === 'marketing' ? persona('publish').working : 'Suggest with Ada'}</button>
        </div>
        {kdp && (
          <>
            <p className="faint small">Seven keyword phrases for KDP. Use phrases readers search for; skip words already in your title.</p>
            <div className="grid two" style={{ gap: '.6rem' }}>
              {m.keywords.map((k, i) => (
                <input key={i} value={k} maxLength={50} placeholder={`Keyword ${i + 1}`} onChange={(e) => setMeta({ keywords: m.keywords.map((x, j) => (j === i ? e.target.value : x)) })} />
              ))}
            </div>
            <p className="faint small" style={{ marginTop: '1.5rem' }}>Categories (up to three).</p>
            <div className="stack" style={{ gap: '.6rem' }}>
              {[0, 1, 2].map((i) => (
                <input key={i} value={m.categories[i] ?? ''} placeholder="e.g. Religion & Spirituality › Christian Living › Spiritual Growth" onChange={(e) => { const next = [...m.categories]; next[i] = e.target.value; setMeta({ categories: next }); }} />
              ))}
            </div>
          </>
        )}
        <p className="faint small" style={{ marginTop: '1.5rem' }}>Comparable titles: recent books your readers also love.</p>
        <div className="stack" style={{ gap: '.6rem' }}>
          {[0, 1, 2].map((i) => (
            <input key={i} value={m.comps[i] ?? ''} placeholder="Title by Author" onChange={(e) => { const next = [...m.comps]; next[i] = e.target.value; setMeta({ comps: next }); }} />
          ))}
        </div>
      </section>

      <section className="section">
        <DraftBlock title="Author bio" note="Third person, 80–120 words." action={draftBtn('bio', 'authorBio', 'Draft with Ada', m.authorBio || undefined)}>
          <textarea rows={5} value={m.authorBio} onChange={(e) => setMeta({ authorBio: e.target.value })} placeholder="Jot a few notes (where you live, your work, why you wrote this) and Ada will shape them into a bio." />
        </DraftBlock>
      </section>

      {trad && (
        <>
          <section className="section">
            <DraftBlock title="Synopsis" note="One page, present tense, ending included." action={draftBtn('synopsis', 'synopsis', 'Draft with Ada')}>
              <textarea rows={12} value={m.synopsis} onChange={(e) => setMeta({ synopsis: e.target.value })} />
            </DraftBlock>
          </section>
          <section className="section">
            <DraftBlock title="Query letter" note="Personalize the first line for each agent." action={draftBtn('query', 'queryLetter', 'Draft with Ada', `Word count: ${chapters.reduce((n, c) => n + wordsInHtml(c.content), 0).toLocaleString()}. Comparable titles: ${m.comps.filter(Boolean).join('; ') || 'none chosen yet'}. Author bio: ${m.authorBio || 'not provided'}.`)}>
              <textarea rows={14} value={m.queryLetter} onChange={(e) => setMeta({ queryLetter: e.target.value })} />
            </DraftBlock>
          </section>
        </>
      )}

      <section className="section">
        <div className="section-title"><h2>Send it out</h2></div>
        <div className="grid two">
          {kdp && (
            <div className="card stack">
              <h3>Amazon KDP package</h3>
              <p className="muted small" style={{ margin: 0 }}>EPUB with cover, paperback cover PDF ({getCoverDims(project).width.toFixed(2)}" × {getCoverDims(project).height.toFixed(2)}"), typeset Word interior, and every detail KDP asks for in one text file.</p>
              <div className="row wrap">
                <button className="btn primary" disabled={!!busy} onClick={kdpPackage}>{busy === 'kdp' ? 'Packing…' : 'Download KDP package'}</button>
                <Link className="btn ghost" to={`/book/${project.id}/format`}>Interior PDF</Link>
              </div>
              <ol className="small muted" style={{ paddingLeft: '1.1rem', margin: '.5rem 0 0' }}>
                <li>Sign in at kdp.amazon.com and choose <em>Create → Paperback</em> (then Kindle eBook).</li>
                <li>Paste the details from <em>kdp-details.txt</em>.</li>
                <li>Upload the interior PDF and the cover PDF; use the Previewer.</li>
                <li>Order a proof copy, check it, then publish.</li>
              </ol>
            </div>
          )}
          {trad && (
            <div className="card stack">
              <h3>Submission package</h3>
              <p className="muted small" style={{ margin: 0 }}>Standard manuscript format .docx plus your synopsis, query letter, and bio as separate documents.</p>
              <div className="row wrap">
                <button className="btn primary" disabled={!!busy} onClick={submissionPackage}>{busy === 'sub' ? 'Packing…' : 'Download submission package'}</button>
              </div>
              <p className="faint small" style={{ margin: '.5rem 0 0' }}>Always follow each agent’s or publisher’s own guidelines: many want only the query and first pages pasted into an email or form.</p>
            </div>
          )}
        </div>
      </section>

      {done === items.length && <Says stage="publish">Everything’s in order. It’s time to send your book into the world.</Says>}
    </main>
  );
}

function DraftBlock({ title, note, action, copy, children }: { title: string; note: string; action: ReactNode; copy?: () => string; children: ReactNode }) {
  const toast = useToast();
  return (
    <div>
      <div className="section-title">
        <div>
          <h2>{title}</h2>
          <p className="faint small" style={{ margin: '.25rem 0 0' }}>{note}</p>
        </div>
        <div className="row">
          {copy && <button className="btn sm ghost" onClick={() => navigator.clipboard.writeText(copy()).then(() => toast('Copied with KDP formatting.'))}>Copy for KDP</button>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

/** KDP descriptions accept a small subset of HTML. */
function kdpHtml(text: string): string {
  return text
    .split(/\n\s*\n|\n/)
    .filter((p) => p.trim())
    .map((p) => `<p>${p.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')}</p>`)
    .join('');
}

function kdpDetailsText(project: Project): string {
  const m = project.meta;
  const dims = getCoverDims(project);
  return [
    `BOOK DETAILS FOR KDP — ${project.title}`,
    '',
    `Language: ${m.language}`,
    `Title: ${project.title}`,
    `Subtitle: ${project.subtitle}`,
    `Series: ${m.series}${m.seriesNumber ? ` (#${m.seriesNumber})` : ''}`,
    `Edition: ${m.edition}`,
    `Author: ${project.author}`,
    `Publisher/imprint: ${m.publisher}`,
    '',
    'Description (paste into KDP):',
    kdpHtml(m.description),
    '',
    'Keywords:',
    ...m.keywords.filter(Boolean).map((k, i) => `  ${i + 1}. ${k}`),
    '',
    'Categories:',
    ...m.categories.filter(Boolean).map((c) => `  • ${c}`),
    '',
    `Audience: ${m.audience}`,
    `ISBN (paperback): ${m.isbnPrint || 'Use free KDP ISBN'}`,
    `ISBN (eBook): ${m.isbnEbook || 'Not required for Kindle'}`,
    `List price: ${m.price}`,
    '',
    'Print options:',
    `  Trim size: ${dims.trim.label}`,
    `  Paper: ${project.format.paper}`,
    `  Bleed: No bleed (interior); cover includes 0.125" bleed`,
    `  Page count: ${project.format.pageCount || 'measure in the formatter'}`,
    `  Cover size: ${dims.width.toFixed(3)}" × ${dims.height.toFixed(3)}" (spine ${dims.spine.toFixed(3)}")`,
    '',
    'Author bio:',
    m.authorBio,
  ].join('\n');
}
