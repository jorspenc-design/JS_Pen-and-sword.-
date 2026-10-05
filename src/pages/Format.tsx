import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBook } from '../App';
import { db, updateProject } from '../db';
import type { ChapterHeadingStyle, FormatSettings } from '../types';
import { persona } from '../personas';
import { Avatar, Field, Modal, NumberInput, useDebounced, useToast } from '../components/ui';
import { buildPrintDocument } from '../lib/print';
import { BODY_FONTS, DISPLAY_FONTS } from '../lib/book';
import { EDITION_LIMITS, LARGE_PRINT_MIN_PT, PAPER_TYPES, TRIM_SIZES, checkInterior, getTrim, minGutter, type Edition, type PaperType } from '../lib/kdp';
import { THEMES } from '../lib/themes';
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

// The page-layout engine, fetched once and embedded into the preview frame.
let pagedPromise: Promise<string> | null = null;
function loadPaged(): Promise<string> {
  pagedPromise ??= fetch(new URL('vendor/paged.polyfill.js', window.location.href.split('#')[0]).href).then((r) => {
    if (!r.ok) throw new Error(`Couldn’t load the page-layout engine (${r.status}).`);
    return r.text();
  });
  pagedPromise.catch(() => { pagedPromise = null; });
  return pagedPromise;
}

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
  const [contact, setContact] = useState(() => { try { return localStorage.getItem('pns-contact') ?? ''; } catch { return ''; } });
  const [exportOpen, setExportOpen] = useState(false);
  const [missingFonts, setMissingFonts] = useState<string[]>([]);
  const [pdfReport, setPdfReport] = useState<{ pages: number; missingFonts: string[]; name: string } | null>(null);
  const edition: Edition = f.edition ?? 'paperback';

  const set = (patch: Partial<FormatSettings>) => updateProject(project.id, { format: { ...f, ...patch } });
  const setMargin = (side: keyof FormatSettings['margins'], v: number) => set({ margins: { ...f.margins, [side]: v } });

  // Re-paginate when anything that affects layout changes (not the measured page count itself).
  const layoutKey = useMemo(() => JSON.stringify({ ...f, pageCount: 0, t: project.title, a: project.author, s: project.subtitle, m: project.meta, c: chapters.map((c) => [c.id, c.updatedAt, c.order, c.kind, c.title]) }), [f, project.title, project.author, project.subtitle, project.meta, chapters]);
  const debouncedKey = useDebounced(layoutKey, 600);
  const [pagedCode, setPagedCode] = useState<string | null>(null);
  const [pagedError, setPagedError] = useState('');
  useEffect(() => {
    loadPaged().then(setPagedCode, (e: Error) => setPagedError(e.message));
  }, []);
  const srcDoc = useMemo(
    () => (pagedCode ? buildPrintDocument(project, chapters, pagedCode) : ''),
    [debouncedKey, pagedCode], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => { setRendering(true); }, [srcDoc]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow || e.data?.type !== 'paged-done') return;
      setRendering(false);
      setPages(e.data.pages);
      setMissingFonts(e.data.missingFonts ?? []);
      db.projects.get(project.id).then((proj) => {
        if (proj && proj.format.pageCount !== e.data.pages) db.projects.update(project.id, { format: { ...proj.format, pageCount: e.data.pages } });
      });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [project.id]);

  const check = checkInterior({ margins: f.margins, edition, trimId: f.trimId, paper: f.paper, fontSize: f.fontSize, largePrint: f.largePrint }, pages ?? 0);
  const gutter = minGutter(pages ?? 0);

  async function run(label: string, fn: () => Promise<void>) {
    setExporting(label);
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); } finally { setExporting(''); }
  }

  const pdfName = `${slug(project.title)}-${edition}-interior-${f.trimId}.pdf`;

  // One click: the local server prints with this computer's Chrome or Edge at the exact trim size.
  // Without it (or in the online preview), fall back to the browser's print dialog.
  const exportPdf = () => run('pdf', async () => {
    if (!pagedCode) return;
    let res: Response;
    try {
      res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: buildPrintDocument(project, chapters, pagedCode) }),
      });
    } catch {
      res = new Response(null, { status: 503 });
    }
    if (res.status === 503 || res.status === 404) {
      const err = await res.json().catch(() => null);
      toast(err?.error ?? 'Opening the print dialog: choose “Save as PDF”, Margins “None”, and turn on “Background graphics”.');
      iframeRef.current?.contentWindow?.print();
      return;
    }
    if (!res.ok) throw new Error((await res.json().catch(() => ({ error: `PDF failed (${res.status})` }))).error);
    const blob = await res.blob();
    const missing = decodeURIComponent(res.headers.get('X-Missing-Fonts') ?? '').split(',').filter(Boolean);
    downloadBlob(blob, pdfName);
    setPdfReport({ pages: Number(res.headers.get('X-Pages')) || 0, missingFonts: missing, name: pdfName });
  });

  const applyTheme = (id: string) => {
    const t = THEMES.find((x) => x.id === id);
    if (t) set({ ...t.settings, themeId: id });
  };

  const setEdition = (next: Edition) => {
    const patch: Partial<FormatSettings> = { edition: next };
    if (next === 'hardcover' && !getTrim(f.trimId).hardcover) patch.trimId = '6x9';
    if (next === 'hardcover' && !PAPER_TYPES[f.paper].hardcover) patch.paper = 'white';
    set(patch);
  };

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
          <summary>Theme</summary>
          <div className="stack">
            <div className="tile-grid">
              {THEMES.map((t) => (
                <button key={t.id} className={`tile ${f.themeId === t.id ? 'active' : ''}`} onClick={() => applyTheme(t.id)} title={t.bestFor}>
                  <span className="swatch" style={{ background: 'var(--wash)', fontFamily: `"${t.settings.headingFont}", serif`, fontSize: t.id === 'large-print' ? '1.2rem' : '.95rem' }}>Aa</span>
                  {t.name}
                </button>
              ))}
            </div>
            <p className="faint tiny" style={{ margin: 0 }}>{THEMES.find((t) => t.id === f.themeId)?.bestFor ?? 'Pick a starting point, then adjust anything below.'}</p>
          </div>
        </details>

        <details open>
          <summary>Edition & size</summary>
          <div className="stack">
            <div className="segmented" style={{ alignSelf: 'flex-start' }}>
              <button className={edition === 'paperback' ? 'active' : ''} onClick={() => setEdition('paperback')}>Paperback</button>
              <button className={edition === 'hardcover' ? 'active' : ''} onClick={() => setEdition('hardcover')}>Hardcover</button>
            </div>
            <select value={f.trimId} onChange={(e) => set({ trimId: e.target.value })}>
              {TRIM_SIZES.filter((t) => edition === 'paperback' || t.hardcover).map((t) => <option key={t.id} value={t.id}>{t.label} — {t.note}</option>)}
            </select>
            <select value={f.paper} onChange={(e) => set({ paper: e.target.value as PaperType })}>
              {Object.entries(PAPER_TYPES).filter(([, v]) => edition === 'paperback' || v.hardcover).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}
            </select>
            <p className="faint tiny" style={{ margin: 0 }}>
              KDP {edition}s: {EDITION_LIMITS[edition].min}–{EDITION_LIMITS[edition].max} pages. The Kindle eBook (EPUB) reflows to any screen, so size doesn’t apply to it.
            </p>
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
              <Field label="Size (pt)"><NumberInput value={f.fontSize} step={0.5} min={8} max={24} onChange={(v) => set({ fontSize: v })} /></Field>
              <Field label="Line spacing"><NumberInput value={f.lineHeight} step={0.05} min={1} max={2} onChange={(v) => set({ lineHeight: v })} /></Field>
              <Field label="Indent (em)"><NumberInput value={f.indent} step={0.25} min={0} max={4} onChange={(v) => set({ indent: v })} /></Field>
              <Field label="Paragraphs">
                <select value={f.paragraphStyle ?? 'indent'} onChange={(e) => set({ paragraphStyle: e.target.value as FormatSettings['paragraphStyle'] })}>
                  <option value="indent">Indented</option>
                  <option value="block">Spaced blocks</option>
                </select>
              </Field>
            </div>
            <label className="check">
              <input type="checkbox" checked={!!f.largePrint} onChange={(e) => set(e.target.checked ? { largePrint: true, fontSize: Math.max(f.fontSize, LARGE_PRINT_MIN_PT) } : { largePrint: false })} />
              Large print edition ({LARGE_PRINT_MIN_PT}pt or larger)
            </label>
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
          {!rendering && missingFonts.length > 0 && (
            <div className="warn-box">The preview is using stand-in type because {missingFonts.join(' and ')} didn’t load. Check your internet connection; the PDF export waits longer for fonts.</div>
          )}
          {pages !== null && !rendering && (check.ok
            ? <div className="ok-box">Meets KDP’s {edition} requirements: {getTrim(f.trimId).label}, {pages} pages, margins and gutter checked{f.largePrint ? ', large print' : ''}.</div>
            : <div className="warn-box stack" style={{ gap: '.4rem' }}>{check.messages.map((m) => <span key={m}>{m}</span>)}
                {f.margins.inside < gutter && <button className="btn sm" onClick={() => setMargin('inside', gutter + 0.125)}>Fix the gutter for me</button>}
              </div>)}
        </div>
      </aside>

      <section className="preview-pane">
        <div className="preview-bar">
          <span className="small">{rendering ? 'Setting pages…' : `${pages} pages`}</span>
          <span className="faint small">{getTrim(f.trimId).label} · {edition}</span>
          <span className="spacer" />
          <button className="btn sm primary" disabled={rendering || !!exporting} onClick={exportPdf}>{exporting === 'pdf' ? 'Making PDF…' : `${edition === 'hardcover' ? 'Hardcover' : 'Paperback'} PDF`}</button>
          <button className="btn sm" onClick={() => setExportOpen(true)}>All formats</button>
        </div>
        {pagedError ? (
          <div className="page narrow"><div className="warn-box">{pagedError} Reload the page to try again.</div></div>
        ) : (
          <iframe ref={iframeRef} title="Print preview" srcDoc={srcDoc} />
        )}
      </section>

      <Modal open={exportOpen || !!pdfReport} onClose={() => { setExportOpen(false); setPdfReport(null); }}>
        {pdfReport ? (
          <div className="stack lg">
            <h2>Your print PDF is ready</h2>
            <dl className="kv" style={{ fontSize: '.9rem' }}>
              <dt>File</dt><dd style={{ overflowWrap: 'anywhere' }}>{pdfReport.name}</dd>
              <dt>Edition</dt><dd>{edition}</dd>
              <dt>Page size</dt><dd>{getTrim(f.trimId).label} (no bleed)</dd>
              <dt>Pages</dt><dd>{pdfReport.pages}</dd>
              <dt>Fonts</dt><dd>{pdfReport.missingFonts.length ? 'Stand-ins used' : 'Embedded'}</dd>
            </dl>
            {pdfReport.missingFonts.length > 0 ? (
              <div className="warn-box">{pdfReport.missingFonts.join(' and ')} didn’t download, so a stand-in typeface was used. Check your internet connection and export again before uploading.</div>
            ) : checkInterior({ margins: f.margins, edition, trimId: f.trimId, paper: f.paper, fontSize: f.fontSize, largePrint: f.largePrint }, pdfReport.pages).ok ? (
              <div className="ok-box">Ready for KDP. Upload it as the manuscript on the {edition} content page, and choose “No bleed” and {getTrim(f.trimId).label}.</div>
            ) : (
              <div className="warn-box">Check Margot’s notes in the sidebar before uploading.</div>
            )}
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => setPdfReport(null)}>Done</button></div>
          </div>
        ) : (
          <div className="stack lg">
            <div>
              <h2>Export your book</h2>
              <p className="muted small" style={{ marginTop: '.4rem' }}>Every file below is made from the same manuscript and settings.</p>
            </div>
            {[
              { title: `${edition === 'hardcover' ? 'Hardcover' : 'Paperback'} interior · PDF`, use: 'Upload to KDP as your print manuscript. Exact trim size, fonts embedded.', action: exportPdf, busy: 'pdf' },
              { title: 'Kindle eBook · EPUB', use: 'Upload to KDP as your eBook manuscript. Includes your cover and a linked table of contents.', action: exportEpub, busy: 'epub' },
              { title: 'Word, typeset · DOCX', use: 'Also accepted by KDP, and editable in Word if you want to make final tweaks yourself.', action: () => run('docx', async () => downloadBlob(await buildPrintDocx(project, chapters), `${slug(project.title)}-${f.trimId}.docx`)), busy: 'docx' },
              { title: 'Manuscript for agents · DOCX', use: 'Standard manuscript format for literary agents and traditional publishers.', action: () => { setExportOpen(false); setContactOpen(true); }, busy: 'ms' },
            ].map((x) => (
              <div key={x.title} className="row between" style={{ gap: '1rem', alignItems: 'flex-start' }}>
                <div className="grow">
                  <div>{x.title}</div>
                  <div className="faint small">{x.use}</div>
                </div>
                <button className="btn sm" disabled={!!exporting || (x.busy === 'pdf' && rendering)} onClick={x.action}>{exporting === x.busy ? 'Working…' : 'Download'}</button>
              </div>
            ))}
            <p className="faint tiny" style={{ margin: 0 }}>Covers are made by Theo in the Design step.</p>
          </div>
        )}
      </Modal>

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
                try { localStorage.setItem('pns-contact', contact); } catch { /* storage blocked */ }
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
