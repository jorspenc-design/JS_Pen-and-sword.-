import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBook } from '../App';
import { db, updateProject } from '../db';
import type { ChapterHeadingStyle, FormatSettings } from '../types';
import { persona } from '../personas';
import { Avatar, Field, Modal, NumberInput, useDebounced, useToast } from '../components/ui';
import { buildPrintDocument } from '../lib/print';
import { BODY_FONTS, DISPLAY_FONTS } from '../lib/book';
import { PAPER_TYPES, TRIM_SIZES, checkMargins, minGutter, type PaperType } from '../lib/kdp';
import { buildEpub } from '../lib/epub';
import { buildManuscriptDocx, buildPrintDocx } from '../lib/docx';
import { canvasToBlob, ensureFonts, loadImage, renderEbookCanvas } from '../lib/cover';
import { downloadBlob, slug } from '../lib/util';

const HEADING_STYLES: { id: ChapterHeadingStyle; label: string; sample: ReactNode }[] = [
  { id: 'classic', label: 'Classic', sample: <><small style={{ letterSpacing: '.15em', fontVariant: 'small-caps' }}>chapter one</small><i>The Road</i></> },
  { id: 'elegant', label: 'Elegant', sample: <><small style={{ letterSpacing: '.2em' }}>CHAPTER ONE</small><span>❦</span></> },
  { id: 'modern', label: 'Modern', sample: <span style={{ fontWeight: 700, alignSelf: 'flex-start', paddingLeft: 8 }}>The Road</span> },
  { id: 'bold', label: 'Bold', sample: <span style={{ fontWeight: 700, fontSize: '1.4rem', alignSelf: 'flex-start', paddingLeft: 8 }}>One</span> },
  { id: 'minimal', label: 'Minimal', sample: <small style={{ letterSpacing: '.15em' }}>THE ROAD</small> },
];

const SCENE_BREAKS = ['❧', '* * *', '⁂', '~', '◆', '❦', '—'];

export default function Format() {
  const { project, chapters } = useBook();
  const toast = useToast();
  const p = persona('format');
  const f = project.format;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pages, setPages] = useState<number | null>(f.pageCount || null);
  const [rendering, setRendering] = useState(true);
  const [exporting, setExporting] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState(() => localStorage.getItem('pns-contact') ?? '');

  const set = (patch: Partial<FormatSettings>) => updateProject(project.id, { format: { ...f, ...patch } });
  const setMargin = (side: keyof FormatSettings['margins'], v: number) => set({ margins: { ...f.margins, [side]: v } });

  // Re-paginate when anything that affects layout changes (not the measured page count itself).
  const layoutKey = useMemo(() => JSON.stringify({ ...f, pageCount: 0, t: project.title, a: project.author, s: project.subtitle, m: project.meta, c: chapters.map((c) => [c.id, c.updatedAt, c.order, c.kind, c.title]) }), [f, project.title, project.author, project.subtitle, project.meta, chapters]);
  const debouncedKey = useDebounced(layoutKey, 600);
  const srcDoc = useMemo(
    () => buildPrintDocument(project, chapters, new URL('vendor/paged.polyfill.js', window.location.href.split('#')[0]).href),
    [debouncedKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => setRendering(true), [srcDoc]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow || e.data?.type !== 'paged-done') return;
      setRendering(false);
      setPages(e.data.pages);
      db.projects.get(project.id).then((proj) => {
        if (proj && proj.format.pageCount !== e.data.pages) db.projects.update(project.id, { format: { ...proj.format, pageCount: e.data.pages } });
      });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [project.id]);

  const check = checkMargins(f.margins, pages ?? 0);
  const gutter = minGutter(pages ?? 0);

  async function run(label: string, fn: () => Promise<void>) {
    setExporting(label);
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); } finally { setExporting(''); }
  }

  const exportEpub = () => run('epub', async () => {
    let cover: Blob | undefined;
    try {
      await ensureFonts(project.cover);
      const asset = project.cover.imageAssetId ? await db.assets.get(project.cover.imageAssetId) : undefined;
      const image = asset ? await loadImage(asset.data) : null;
      cover = await canvasToBlob(renderEbookCanvas({ project, image }), 'image/jpeg', 0.9);
    } catch { /* cover is optional */ }
    downloadBlob(await buildEpub(project, chapters, cover), `${slug(project.title)}.epub`);
    toast('EPUB ready. Upload it to KDP as your eBook manuscript.');
  });

  return (
    <div className="studio">
      <aside className="controls">
        <div className="row" style={{ padding: '1.25rem 0 .75rem', gap: '.75rem' }}>
          <Avatar p={p} />
          <div>
            <div className="serif" style={{ fontSize: '1.15rem' }}>Margot <span className="faint small" style={{ fontFamily: 'var(--sans)' }}>The Typesetter</span></div>
            <div className="faint tiny">{rendering ? p.working : `${pages ?? '—'} pages, set and checked`}</div>
          </div>
        </div>

        <details open>
          <summary>Book size</summary>
          <div className="stack">
            <select value={f.trimId} onChange={(e) => set({ trimId: e.target.value })}>
              {TRIM_SIZES.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.note}</option>)}
            </select>
            <select value={f.paper} onChange={(e) => set({ paper: e.target.value as PaperType })}>
              {Object.entries(PAPER_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}
            </select>
          </div>
        </details>

        <details open>
          <summary>Chapter openings</summary>
          <div className="stack">
            <div className="tile-grid">
              {HEADING_STYLES.map((h) => (
                <button key={h.id} className={`tile ${f.headingStyle === h.id ? 'active' : ''}`} onClick={() => set({ headingStyle: h.id })}>
                  <span className="swatch" style={{ display: 'flex', flexDirection: 'column', fontFamily: `"${f.headingFont}", serif`, background: 'var(--wash)', gap: 2 }}>{h.sample}</span>
                  {h.label}
                </button>
              ))}
            </div>
            <Field label="Chapter numbers">
              <select value={f.chapterNumbering} onChange={(e) => set({ chapterNumbering: e.target.value as FormatSettings['chapterNumbering'] })}>
                <option value="words">Chapter One</option>
                <option value="numerals">Chapter 1</option>
                <option value="roman">Chapter I</option>
                <option value="none">No numbers (titles only)</option>
              </select>
            </Field>
            <label className="check"><input type="checkbox" checked={f.dropCaps} onChange={(e) => set({ dropCaps: e.target.checked })} /> Drop cap on first letter</label>
            <label className="check"><input type="checkbox" checked={f.smallCapsLead} onChange={(e) => set({ smallCapsLead: e.target.checked })} /> Small caps on first line</label>
            <label className="check"><input type="checkbox" checked={f.startOnRight} onChange={(e) => set({ startOnRight: e.target.checked })} /> Start chapters on a right-hand page</label>
            <Field label="Scene break">
              <div className="row wrap" style={{ gap: '.3rem' }}>
                {SCENE_BREAKS.map((s) => (
                  <button key={s} className={`btn sm ${f.sceneBreak === s ? 'active' : ''}`} onClick={() => set({ sceneBreak: s })}>{s}</button>
                ))}
              </div>
            </Field>
          </div>
        </details>

        <details>
          <summary>Typography</summary>
          <div className="stack">
            <Field label="Body font">
              <select value={f.bodyFont} onChange={(e) => set({ bodyFont: e.target.value })}>{BODY_FONTS.map((x) => <option key={x}>{x}</option>)}</select>
            </Field>
            <Field label="Heading font">
              <select value={f.headingFont} onChange={(e) => set({ headingFont: e.target.value })}>{DISPLAY_FONTS.map((x) => <option key={x}>{x}</option>)}</select>
            </Field>
            <div className="grid two" style={{ gap: '.75rem' }}>
              <Field label="Size (pt)"><NumberInput value={f.fontSize} step={0.5} min={8} max={16} onChange={(v) => set({ fontSize: v })} /></Field>
              <Field label="Line spacing"><NumberInput value={f.lineHeight} step={0.05} min={1} max={2} onChange={(v) => set({ lineHeight: v })} /></Field>
              <Field label="Indent (em)"><NumberInput value={f.indent} step={0.25} min={0} max={4} onChange={(v) => set({ indent: v })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={f.justify} onChange={(e) => set({ justify: e.target.checked })} /> Justified text</label>
            <label className="check"><input type="checkbox" checked={f.hyphenate} onChange={(e) => set({ hyphenate: e.target.checked })} /> Hyphenation</label>
          </div>
        </details>

        <details>
          <summary>Pages & front matter</summary>
          <div className="stack">
            <label className="check"><input type="checkbox" checked={f.titlePage} onChange={(e) => set({ titlePage: e.target.checked })} /> Title page</label>
            <label className="check"><input type="checkbox" checked={f.copyrightPage} onChange={(e) => set({ copyrightPage: e.target.checked })} /> Copyright page</label>
            <label className="check"><input type="checkbox" checked={f.toc} onChange={(e) => set({ toc: e.target.checked })} /> Table of contents</label>
            <label className="check"><input type="checkbox" checked={f.runningHeads} onChange={(e) => set({ runningHeads: e.target.checked })} /> Running heads (author / title)</label>
            <label className="check"><input type="checkbox" checked={f.pageNumbers} onChange={(e) => set({ pageNumbers: e.target.checked })} /> Page numbers</label>
            <p className="faint tiny" style={{ margin: 0 }}>Copyright, ISBN, and dedication text come from Ada’s publishing details.</p>
          </div>
        </details>

        <details>
          <summary>Margins</summary>
          <div className="stack">
            <div className="grid two" style={{ gap: '.75rem' }}>
              <Field label="Top (in)"><NumberInput value={f.margins.top} onChange={(v) => setMargin('top', v)} /></Field>
              <Field label="Bottom (in)"><NumberInput value={f.margins.bottom} onChange={(v) => setMargin('bottom', v)} /></Field>
              <Field label="Inside / gutter (in)"><NumberInput value={f.margins.inside} onChange={(v) => setMargin('inside', v)} /></Field>
              <Field label="Outside (in)"><NumberInput value={f.margins.outside} onChange={(v) => setMargin('outside', v)} /></Field>
            </div>
            <p className="faint tiny" style={{ margin: 0 }}>For {pages ?? '…'} pages, KDP needs an inside margin of at least {gutter}".</p>
          </div>
        </details>

        <div className="stack" style={{ padding: '1.5rem 0' }}>
          {pages !== null && !rendering && (check.ok
            ? <div className="ok-box">Margins and page count meet KDP’s print requirements.</div>
            : <div className="warn-box stack" style={{ gap: '.4rem' }}>{check.messages.map((m) => <span key={m}>{m}</span>)}
                {f.margins.inside < gutter && <button className="btn sm" onClick={() => setMargin('inside', gutter + 0.125)}>Fix the gutter for me</button>}
              </div>)}
        </div>
      </aside>

      <section className="preview-pane">
        <div className="preview-bar">
          <span className="small">{rendering ? 'Setting pages…' : `${pages} pages`}</span>
          <span className="faint small">{TRIM_SIZES.find((t) => t.id === f.trimId)?.label}</span>
          <span className="spacer" />
          <button className="btn sm primary" disabled={rendering} onClick={() => iframeRef.current?.contentWindow?.print()} title="Opens the print dialog. Choose “Save as PDF”.">Print-ready PDF</button>
          <button className="btn sm" disabled={!!exporting} onClick={exportEpub}>{exporting === 'epub' ? 'Packing…' : 'EPUB'}</button>
          <button className="btn sm" disabled={!!exporting} onClick={() => run('docx', async () => downloadBlob(await buildPrintDocx(project, chapters), `${slug(project.title)}-${f.trimId}.docx`))}>Word (typeset)</button>
          <button className="btn sm" disabled={!!exporting} onClick={() => setContactOpen(true)}>Manuscript (submission)</button>
        </div>
        <iframe ref={iframeRef} title="Print preview" srcDoc={srcDoc} />
      </section>

      <Modal open={contactOpen} onClose={() => setContactOpen(false)}>
        <div className="stack lg">
          <div>
            <h2>Standard manuscript format</h2>
            <p className="muted small" style={{ marginTop: '.4rem' }}>
              What agents and publishers expect: Times New Roman 12pt, double-spaced, 1" margins, your name / title / page number in the header, and an approximate word count.
            </p>
          </div>
          <Field label="Your contact block (top-left of the title page)">
            <textarea rows={5} value={contact} onChange={(e) => setContact(e.target.value)} placeholder={'Legal Name\nStreet Address\nCity, State ZIP\nemail@example.com\n(555) 555-5555'} />
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setContactOpen(false)}>Cancel</button>
            <button
              className="btn primary"
              onClick={() => run('ms', async () => {
                localStorage.setItem('pns-contact', contact);
                downloadBlob(await buildManuscriptDocx(project, chapters, contact || project.author), `${slug(project.title)}-manuscript.docx`);
                setContactOpen(false);
              })}
            >
              Download .docx
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
