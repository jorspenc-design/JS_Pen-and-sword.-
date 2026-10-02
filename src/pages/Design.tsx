import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useBook } from '../App';
import { db, updateProject } from '../db';
import type { CoverLayout, CoverSettings } from '../types';
import { persona } from '../personas';
import { Avatar, Field, useToast } from '../components/ui';
import { DISPLAY_FONTS } from '../lib/book';
import { canvasToBlob, drawFront, drawGuides, drawWrap, ensureFonts, getCoverDims, loadImage, renderEbookCanvas, renderWrapCanvas, wrapToPdf } from '../lib/cover';
import { downloadBlob, slug, uid } from '../lib/util';

const LAYOUTS: { id: CoverLayout; label: string }[] = [
  { id: 'centered', label: 'Centered' },
  { id: 'top-title', label: 'Title high' },
  { id: 'bottom-band', label: 'Band' },
  { id: 'split', label: 'Split' },
  { id: 'frame', label: 'Framed' },
];

const PALETTES: { name: string; v: Partial<CoverSettings> }[] = [
  { name: 'Ink & oxblood', v: { bg1: '#1c2433', bg2: '#5a1e24', accent: '#c9a45c', titleColor: '#f4ead5', authorColor: '#e8dcc0', spineColor: '#1c2433', spineTextColor: '#f4ead5', backTextColor: '#f4ead5' } },
  { name: 'Parchment', v: { bg1: '#f1e9d8', bg2: '#d9c9a8', accent: '#7a4b2a', titleColor: '#2b2118', authorColor: '#4a3a2a', spineColor: '#2b2118', spineTextColor: '#f1e9d8', backTextColor: '#2b2118' } },
  { name: 'Forest', v: { bg1: '#1f3a32', bg2: '#0f1f1a', accent: '#d8c27a', titleColor: '#f1ecd9', authorColor: '#d9d2b6', spineColor: '#0f1f1a', spineTextColor: '#f1ecd9', backTextColor: '#f1ecd9' } },
  { name: 'Dawn', v: { bg1: '#f6d6b8', bg2: '#b65a4a', accent: '#ffffff', titleColor: '#2a1712', authorColor: '#2a1712', spineColor: '#b65a4a', spineTextColor: '#ffffff', backTextColor: '#2a1712' } },
  { name: 'Midnight', v: { bg1: '#0b0d17', bg2: '#273058', accent: '#9fb4ff', titleColor: '#ffffff', authorColor: '#c9d1f2', spineColor: '#0b0d17', spineTextColor: '#ffffff', backTextColor: '#e6e9f5' } },
  { name: 'Minimal white', v: { bg1: '#fafaf7', bg2: '#fafaf7', accent: '#1f1e1c', titleColor: '#1f1e1c', authorColor: '#57544f', spineColor: '#1f1e1c', spineTextColor: '#fafaf7', backTextColor: '#1f1e1c', gradient: 'none', overlay: 0 } },
];

type View = 'front' | 'wrap' | 'ebook';

export default function Design() {
  const { project } = useBook();
  const toast = useToast();
  const p = persona('design');
  const c = project.cover;
  const [view, setView] = useState<View>('front');
  const [guides, setGuides] = useState(true);
  const [busy, setBusy] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const asset = useLiveQuery(() => (c.imageAssetId ? db.assets.get(c.imageAssetId) : undefined), [c.imageAssetId]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const dims = getCoverDims(project);

  const set = (patch: Partial<CoverSettings>) => updateProject(project.id, { cover: { ...c, ...patch } });

  useEffect(() => {
    let alive = true;
    if (asset) loadImage(asset.data).then((img) => alive && setImage(img));
    else setImage(null);
    return () => { alive = false; };
  }, [asset]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await ensureFonts(c);
      const canvas = canvasRef.current;
      if (!alive || !canvas) return;
      const ctx = canvas.getContext('2d')!;
      const input = { project, image };
      if (view === 'front') {
        const dpi = 110;
        canvas.width = Math.round(dims.trim.width * dpi);
        canvas.height = Math.round(dims.trim.height * dpi);
        drawFront(ctx, input, 0, 0, canvas.width, canvas.height, dpi);
      } else if (view === 'wrap') {
        const dpi = 70;
        canvas.width = Math.round(dims.width * dpi);
        canvas.height = Math.round(dims.height * dpi);
        drawWrap(ctx, input, dims, dpi);
        if (guides) drawGuides(ctx, dims, dpi);
      } else {
        const src = renderEbookCanvas(input);
        canvas.width = src.width / 3;
        canvas.height = src.height / 3;
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      }
    })();
    return () => { alive = false; };
  }, [project, image, view, guides]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onImage(file: File) {
    const id = uid();
    await db.assets.add({ id, projectId: project.id, name: file.name, type: file.type, data: file });
    if (c.imageAssetId) await db.assets.delete(c.imageAssetId);
    set({ imageAssetId: id, overlay: Math.max(c.overlay, 0.2) });
    const img = await loadImage(file);
    const needW = dims.trim.width * 300;
    if (img.naturalWidth < needW * 0.9) toast(`Theo’s note: this image is ${img.naturalWidth}px wide; ${Math.round(needW)}px or more prints crisply at 300 DPI.`);
  }

  async function exportAs(kind: 'pdf' | 'png' | 'ebook') {
    setBusy(kind);
    try {
      await ensureFonts(c);
      const input = { project, image };
      const name = slug(project.title);
      if (kind === 'pdf') downloadBlob(await wrapToPdf(input), `${name}-cover-${dims.trim.width}x${dims.trim.height}-${dims.pages}p.pdf`);
      if (kind === 'png') downloadBlob(await canvasToBlob(renderWrapCanvas(input, 300)), `${name}-cover-300dpi.png`);
      if (kind === 'ebook') downloadBlob(await canvasToBlob(renderEbookCanvas(input), 'image/jpeg', 0.92), `${name}-ebook-cover.jpg`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="studio">
      <aside className="controls">
        <div className="row" style={{ padding: '1.25rem 0 .75rem', gap: '.75rem' }}>
          <Avatar p={p} />
          <div>
            <div className="serif" style={{ fontSize: '1.15rem' }}>Theo <span className="faint small" style={{ fontFamily: 'var(--sans)' }}>The Designer</span></div>
            <div className="faint tiny">{p.idle}</div>
          </div>
        </div>

        <details open>
          <summary>Layout</summary>
          <div className="stack">
            <div className="tile-grid">
              {LAYOUTS.map((l) => (
                <button key={l.id} className={`tile ${c.layout === l.id ? 'active' : ''}`} onClick={() => set({ layout: l.id })}>
                  <LayoutIcon id={l.id} />
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </details>

        <details open>
          <summary>Color</summary>
          <div className="stack">
            <div className="tile-grid">
              {PALETTES.map((pal) => (
                <button key={pal.name} className="tile" onClick={() => set(pal.v)} title={pal.name}>
                  <span className="swatch" style={{ background: `linear-gradient(160deg, ${pal.v.bg1}, ${pal.v.bg2})`, color: pal.v.titleColor, fontSize: '.9rem' }}>Aa</span>
                  {pal.name}
                </button>
              ))}
            </div>
            <div className="row wrap" style={{ gap: '.75rem' }}>
              <ColorField label="Background" value={c.bg1} onChange={(v) => set({ bg1: v })} />
              <ColorField label="Second" value={c.bg2} onChange={(v) => set({ bg2: v })} />
              <ColorField label="Accent" value={c.accent} onChange={(v) => set({ accent: v })} />
            </div>
            <Field label="Blend">
              <select value={c.gradient} onChange={(e) => set({ gradient: e.target.value as CoverSettings['gradient'] })}>
                <option value="none">Solid</option>
                <option value="vertical">Top to bottom</option>
                <option value="diagonal">Diagonal</option>
                <option value="radial">Glow</option>
              </select>
            </Field>
          </div>
        </details>

        <details open={!!c.imageAssetId}>
          <summary>Artwork</summary>
          <div className="stack">
            <div className="row">
              <button className="btn sm" onClick={() => fileRef.current?.click()}>{c.imageAssetId ? 'Replace image' : 'Add an image'}</button>
              {c.imageAssetId && <button className="btn sm ghost" onClick={async () => { if (c.imageAssetId) await db.assets.delete(c.imageAssetId); set({ imageAssetId: undefined }); }}>Remove</button>}
            </div>
            <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImage(f); }} />
            {c.imageAssetId && (
              <>
                <Field label={`Image strength · ${Math.round(c.imageOpacity * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={c.imageOpacity} onChange={(e) => set({ imageOpacity: Number(e.target.value) })} /></Field>
                <Field label="Fit">
                  <select value={c.imageFit} onChange={(e) => set({ imageFit: e.target.value as CoverSettings['imageFit'] })}><option value="cover">Fill the cover</option><option value="contain">Show whole image</option></select>
                </Field>
              </>
            )}
            <Field label={`Shade for legibility · ${Math.round(c.overlay * 100)}%`}><input type="range" min={0} max={0.8} step={0.05} value={c.overlay} onChange={(e) => set({ overlay: Number(e.target.value) })} /></Field>
            <p className="faint tiny" style={{ margin: 0 }}>Use art you own or have licensed for commercial use.</p>
          </div>
        </details>

        <details open>
          <summary>Words on the cover</summary>
          <div className="stack">
            <Field label="Title font"><select value={c.titleFont} onChange={(e) => set({ titleFont: e.target.value })}>{DISPLAY_FONTS.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <div className="row wrap" style={{ gap: '.75rem' }}>
              <ColorField label="Title" value={c.titleColor} onChange={(v) => set({ titleColor: v })} />
              <ColorField label="Author" value={c.authorColor} onChange={(v) => set({ authorColor: v })} />
              <label className="check" style={{ alignSelf: 'flex-end' }}><input type="checkbox" checked={c.titleCase === 'upper'} onChange={(e) => set({ titleCase: e.target.checked ? 'upper' : 'as-is' })} /> Capitals</label>
            </div>
            <Field label={`Title size · ${Math.round(c.titleSize * 100)}%`}><input type="range" min={0.5} max={1.8} step={0.05} value={c.titleSize} onChange={(e) => set({ titleSize: Number(e.target.value) })} /></Field>
            <Field label="Subtitle" hint={project.subtitle ? 'Leave empty to use the book’s subtitle.' : undefined}><input value={c.subtitle} placeholder={project.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
            <Field label="Tagline or endorsement (top of cover)"><input value={c.tagline} placeholder="“A must-read.” — Name" onChange={(e) => set({ tagline: e.target.value })} /></Field>
            <Field label="Author font"><select value={c.authorFont} onChange={(e) => set({ authorFont: e.target.value })}>{DISPLAY_FONTS.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <label className="check"><input type="checkbox" checked={c.ornament} onChange={(e) => set({ ornament: e.target.checked })} /> Ornament under the title</label>
          </div>
        </details>

        <details>
          <summary>Back cover & spine</summary>
          <div className="stack">
            <Field label="Back cover copy" hint={project.meta.description ? 'Leave empty to use Ada’s book description.' : <>Ada can draft this in <Link to={`/book/${project.id}/publish`}>Publish</Link>.</>}>
              <textarea rows={6} value={c.backText} placeholder={project.meta.description.replace(/\*\*/g, '')} onChange={(e) => set({ backText: e.target.value })} />
            </Field>
            <div className="row wrap" style={{ gap: '.75rem' }}>
              <ColorField label="Back text" value={c.backTextColor} onChange={(v) => set({ backTextColor: v })} />
              <ColorField label="Spine" value={c.spineColor} onChange={(v) => set({ spineColor: v })} />
              <ColorField label="Spine text" value={c.spineTextColor} onChange={(v) => set({ spineTextColor: v })} />
            </div>
            <label className="check"><input type="checkbox" checked={c.showBarcodeBox} onChange={(e) => set({ showBarcodeBox: e.target.checked })} /> Leave the barcode area clear (KDP prints it)</label>
          </div>
        </details>

        <div style={{ padding: '1.5rem 0' }}>
          <dl className="kv">
            <dt>Trim</dt><dd>{dims.trim.label}</dd>
            <dt>Pages</dt><dd>{project.format.pageCount ? dims.pages : `~${dims.pages} (estimate)`}</dd>
            <dt>Spine</dt><dd>{dims.spine.toFixed(3)}"</dd>
            <dt>Full wrap with bleed</dt><dd>{dims.width.toFixed(3)}" × {dims.height.toFixed(3)}"</dd>
            <dt>Spine text</dt><dd>{dims.spineText ? 'Yes' : 'Too thin (needs 80+ pages)'}</dd>
          </dl>
          {!project.format.pageCount && <p className="faint tiny" style={{ marginTop: '.75rem' }}>Visit Margot once to measure your exact page count, so the spine is sized precisely.</p>}
        </div>
      </aside>

      <section className="preview-pane">
        <div className="preview-bar">
          <div className="segmented">
            <button className={view === 'front' ? 'active' : ''} onClick={() => setView('front')}>Front</button>
            <button className={view === 'wrap' ? 'active' : ''} onClick={() => setView('wrap')}>Full wrap</button>
            <button className={view === 'ebook' ? 'active' : ''} onClick={() => setView('ebook')}>eBook</button>
          </div>
          {view === 'wrap' && <label className="check small"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Guides</label>}
          <span className="spacer" />
          <button className="btn sm primary" disabled={!!busy} onClick={() => exportAs('pdf')}>{busy === 'pdf' ? 'Rendering…' : 'Print cover PDF'}</button>
          <button className="btn sm" disabled={!!busy} onClick={() => exportAs('png')}>PNG 300 DPI</button>
          <button className="btn sm" disabled={!!busy} onClick={() => exportAs('ebook')}>eBook JPG</button>
        </div>
        <div className="cover-stage">
          <canvas ref={canvasRef} />
          {view === 'wrap' && guides && (
            <p className="faint tiny" style={{ marginTop: '1rem', textAlign: 'center' }}>
              <span style={{ color: '#e05050' }}>Red</span>: trim line · <span style={{ color: '#3aa8d8' }}>blue</span>: spine · <span style={{ color: '#3fa85a' }}>green</span>: keep text inside. Guides never print.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field" style={{ alignItems: 'flex-start' }}>
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LayoutIcon({ id }: { id: CoverLayout }) {
  const bar = (top: number, w = 60, h = 6) => <rect x={(80 - w) / 2} y={top} width={w} height={h} rx={1} fill="currentColor" opacity={0.7} />;
  return (
    <svg viewBox="0 0 80 110" width="40" height="55" style={{ color: 'var(--ink-2)' }}>
      <rect x={1} y={1} width={78} height={108} rx={2} fill="none" stroke="currentColor" strokeOpacity={0.35} />
      {id === 'centered' && <>{bar(36)}{bar(46, 40)}{bar(94, 36, 4)}</>}
      {id === 'top-title' && <>{bar(14)}{bar(24, 40)}{bar(94, 36, 4)}</>}
      {id === 'bottom-band' && <><rect x={1} y={62} width={78} height={47} fill="currentColor" opacity={0.15} />{bar(70)}{bar(80, 40)}{bar(98, 36, 4)}</>}
      {id === 'split' && <><rect x={1} y={1} width={78} height={54} fill="currentColor" opacity={0.15} />{bar(62)}{bar(72, 40)}{bar(96, 36, 4)}</>}
      {id === 'frame' && <><rect x={8} y={8} width={64} height={94} fill="none" stroke="currentColor" strokeOpacity={0.6} />{bar(34, 48)}{bar(44, 30)}{bar(88, 30, 4)}</>}
    </svg>
  );
}
