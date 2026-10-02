import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useBook } from '../App';
import { addChapter, db, saveReport, takeSnapshot } from '../db';
import type { Chapter, Snapshot } from '../types';
import { persona } from '../personas';
import { PersonaHeader, Says, useToast } from '../components/ui';
import { analyze, readabilityLabel, type Finding } from '../lib/analysis';
import { aiHealth, jsonAi, manuscriptText, markdownToHtml, projectContext, streamAi } from '../lib/ai';
import { highlight, replaceInHtml } from '../lib/textops';
import { formatDate, htmlToText, wordsInHtml } from '../lib/util';

type Tab = 'first' | 'developmental' | 'lineEdit' | 'proofread' | 'beta' | 'versions';
const BOOK = 'book';

const TABS: { id: Tab; label: string; blurb: string; whole: boolean }[] = [
  { id: 'first', label: 'First read', blurb: 'An instant pass for long sentences, adverbs, filler, passive voice, clichés, and echoes. No AI needed.', whole: true },
  { id: 'developmental', label: 'Developmental', blurb: 'The big picture: structure, pacing, character, clarity, and the top revisions that matter most.', whole: true },
  { id: 'lineEdit', label: 'Line edit', blurb: 'Sentence-level suggestions for rhythm, clarity, and word choice — in your voice.', whole: false },
  { id: 'proofread', label: 'Proofread', blurb: 'Spelling, grammar, punctuation, and typos, one fix at a time. Accept or skip each.', whole: false },
  { id: 'beta', label: 'Beta reader', blurb: 'How a reader in your audience might experience it: hooked, lost, moved, bored.', whole: true },
  { id: 'versions', label: 'Versions', blurb: 'Snapshots saved before every AI change and whenever you choose. Restore any of them.', whole: false },
];

interface ProofIssue {
  original: string;
  suggestion: string;
  explanation: string;
  category: string;
  state?: 'accepted' | 'skipped' | 'missing';
}

export default function Edit() {
  const { project, chapters } = useBook();
  const [target, setTarget] = useState<string>(chapters[0]?.id ?? BOOK);
  const [tab, setTab] = useState<Tab>('first');
  const chapter = chapters.find((c) => c.id === target) ?? null;
  const tabInfo = TABS.find((t) => t.id === tab)!;

  useEffect(() => {
    if (target !== BOOK && !chapter && chapters[0]) setTarget(chapters[0].id);
  }, [target, chapter, chapters]);

  return (
    <main className="page">
      <PersonaHeader stage="edit" />

      <div className="row wrap" style={{ marginBottom: '2rem', gap: '1rem' }}>
        <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ maxWidth: 360 }}>
          <option value={BOOK}>The whole manuscript</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>{c.title} · {wordsInHtml(c.content).toLocaleString()} words</option>
          ))}
        </select>
        {chapter && (
          <select value={chapter.status} onChange={(e) => db.chapters.update(chapter.id, { status: e.target.value as Chapter['status'] })} style={{ width: 'auto' }}>
            <option value="draft">Draft</option>
            <option value="revising">Revising</option>
            <option value="edited">Edited</option>
            <option value="final">Final</option>
          </select>
        )}
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      <p className="muted" style={{ maxWidth: '62ch', marginBottom: '2rem' }}>{tabInfo.blurb}</p>

      {!chapter && !tabInfo.whole && tab !== 'versions' ? (
        <Says stage="edit">This kind of read works one chapter at a time. Pick a chapter above.</Says>
      ) : tab === 'first' ? (
        <FirstRead text={chapter ? htmlToText(chapter.content) : manuscriptText(chapters)} />
      ) : tab === 'proofread' && chapter ? (
        <Proofread chapter={chapter} />
      ) : tab === 'versions' ? (
        <Versions chapter={chapter} chapters={chapters} projectId={project.id} />
      ) : (
        <AiReport kind={tab as 'developmental' | 'lineEdit' | 'beta'} chapter={chapter} />
      )}
    </main>
  );
}

function FirstRead({ text }: { text: string }) {
  const a = useMemo(() => analyze(text), [text]);
  const [open, setOpen] = useState<Finding['kind'] | null>(null);
  const groups: { kind: Finding['kind']; label: string; why: string }[] = [
    { kind: 'long-sentence', label: 'Long sentences', why: 'Over 35 words. Fine sometimes; tiring in a row.' },
    { kind: 'adverb', label: 'Adverbs', why: 'A stronger verb often does the work alone.' },
    { kind: 'filler', label: 'Filler words', why: '“Very,” “just,” “really,” “began to”… usually cuttable.' },
    { kind: 'passive', label: 'Passive voice', why: 'Sometimes right; often hides who acted.' },
    { kind: 'repetition', label: 'Close echoes', why: 'The same word twice within a few words.' },
    { kind: 'cliche', label: 'Clichés', why: 'Phrases readers have met a thousand times.' },
    { kind: 'weak-start', label: 'Repetitive openings', why: 'Three sentences in a row starting the same way.' },
  ];
  if (!a.words) return <Says stage="edit">There’s nothing here to read yet.</Says>;

  return (
    <div className="stack lg">
      <div className="row wrap" style={{ gap: '2.5rem' }}>
        <div className="stat"><span className="v">{a.words.toLocaleString()}</span><span className="k">words</span></div>
        <div className="stat"><span className="v">{a.readingMinutes}</span><span className="k">min read</span></div>
        <div className="stat"><span className="v">{a.fleschEase}</span><span className="k">{readabilityLabel(a.fleschEase)} · grade {a.gradeLevel}</span></div>
        <div className="stat"><span className="v">{a.avgSentence}</span><span className="k">words / sentence</span></div>
        <div className="stat"><span className="v">{a.dialogueRatio}%</span><span className="k">dialogue</span></div>
      </div>

      <div className="card" style={{ padding: '0 1.5rem' }}>
        {groups.map((g) => {
          const items = a.findings.filter((f) => f.kind === g.kind);
          return (
            <div key={g.kind} className="finding">
              <button className="row between" style={{ width: '100%', background: 'none', border: 0, padding: 0, cursor: items.length ? 'pointer' : 'default', textAlign: 'left' }} onClick={() => items.length && setOpen(open === g.kind ? null : g.kind)}>
                <div>
                  <div>{g.label}</div>
                  <div className="faint small">{g.why}</div>
                </div>
                <span className={`pill ${items.length ? 'warn' : 'ok'}`}>{items.length}</span>
              </button>
              {open === g.kind && (
                <div style={{ marginTop: '.5rem' }}>
                  {items.slice(0, 80).map((f, i) => {
                    const h = highlight(f.excerpt, f.match);
                    return <div key={i} className="excerpt small" style={{ padding: '.4rem 0' }}>{h.before}<mark>{h.match}</mark>{h.after}</div>;
                  })}
                  {items.length > 80 && <p className="faint small">…and {items.length - 80} more.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {a.overused.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '.75rem' }}>Words you lean on</h3>
          <div className="row wrap" style={{ gap: '.5rem' }}>
            {a.overused.map((w) => <span key={w.word} className="pill">{w.word} <span className="faint">{w.count}</span></span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function AiReport({ kind, chapter }: { kind: 'developmental' | 'lineEdit' | 'beta'; chapter: Chapter | null }) {
  const { project, chapters } = useBook();
  const toast = useToast();
  const p = persona('edit');
  const scope = chapter?.id ?? BOOK;
  const saved = useLiveQuery(() => db.reports.where('[chapterId+kind]').equals([scope, kind]).first(), [scope, kind]);
  const [live, setLive] = useState('');
  const [running, setRunning] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => { aiHealth().then((h) => setAiReady(h.ai)); }, []);
  useEffect(() => () => ctrl.current?.abort(), []);
  useEffect(() => { ctrl.current?.abort(); setLive(''); setRunning(false); }, [scope, kind]);

  const words = chapter ? wordsInHtml(chapter.content) : chapters.reduce((n, c) => n + wordsInHtml(c.content), 0);

  async function start() {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setRunning(true);
    setLive('');
    const context = chapter
      ? projectContext(project, chapter)
      : { ...projectContext(project), chapterTitle: 'The whole manuscript', chapterText: manuscriptText(chapters) };
    try {
      const text = await streamAi({ task: kind, context }, (_x, full) => setLive(full), c.signal);
      await saveReport(project.id, scope, kind, text);
      setLive('');
    } catch (e) {
      if (!c.signal.aborted) toast((e as Error).message, 'error');
    } finally {
      setRunning(false);
    }
  }

  const content = live || (typeof saved?.content === 'string' ? saved.content : '');
  const label = kind === 'developmental' ? 'developmental read' : kind === 'lineEdit' ? 'line edit' : 'beta read';

  return (
    <div className="stack lg">
      {aiReady === false && <div className="warn-box">Elias needs an Anthropic API key for this. Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart. The First Read tab works without it.</div>}
      <div className="row wrap">
        <button className="btn primary" disabled={running || aiReady === false || words === 0} onClick={start}>
          {running ? p.working : saved ? `Ask for a fresh ${label}` : `Ask Elias for a ${label}`}
        </button>
        {running && <button className="btn ghost" onClick={() => ctrl.current?.abort()}>Stop</button>}
        {saved && !running && <span className="faint small">Last read {formatDate(saved.createdAt)}</span>}
      </div>
      {!chapter && <p className="faint small" style={{ margin: 0 }}>Reading all {words.toLocaleString()} words takes longer, but Elias sees how the whole book fits together.</p>}
      {content ? (
        <article className="report" dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
      ) : (
        !running && <Says stage="edit">When you’re ready, I’ll read {chapter ? `“${chapter.title}”` : 'the whole manuscript'} and write you an editorial letter. You decide what to change.</Says>
      )}
    </div>
  );
}

function Proofread({ chapter }: { chapter: Chapter }) {
  const { project } = useBook();
  const toast = useToast();
  const p = persona('edit');
  const saved = useLiveQuery(() => db.reports.where('[chapterId+kind]').equals([chapter.id, 'proofread']).first(), [chapter.id]);
  const [running, setRunning] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  useEffect(() => { aiHealth().then((h) => setAiReady(h.ai)); }, []);
  const issues = (saved?.content as ProofIssue[] | undefined) ?? null;

  async function start() {
    setRunning(true);
    try {
      const res = await jsonAi<{ issues: ProofIssue[] }>({ task: 'proofread', context: projectContext(project, chapter) });
      await saveReport(project.id, chapter.id, 'proofread', res.issues);
      if (!res.issues.length) toast('Elias found nothing to correct. Clean copy!');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRunning(false);
    }
  }

  async function setState(i: number, state: ProofIssue['state']) {
    if (!issues || !saved) return;
    const next = issues.map((x, j) => (j === i ? { ...x, state } : x));
    await db.reports.update(saved.id, { content: next });
  }

  async function accept(i: number) {
    if (!issues) return;
    const fresh = await db.chapters.get(chapter.id);
    if (!fresh) return;
    const updated = replaceInHtml(fresh.content, issues[i].original, issues[i].suggestion);
    if (updated === null) {
      await setState(i, 'missing');
      toast('Couldn’t find that phrase anymore. It may have been edited already.');
      return;
    }
    if (!issues.some((x) => x.state === 'accepted')) await takeSnapshot(fresh, 'Before proofreading fixes');
    await db.chapters.update(chapter.id, { content: updated, updatedAt: Date.now() });
    await setState(i, 'accepted');
  }

  async function acceptAll() {
    if (!issues) return;
    const fresh = await db.chapters.get(chapter.id);
    if (!fresh) return;
    await takeSnapshot(fresh, 'Before proofreading fixes');
    let html = fresh.content;
    const next = issues.map((x) => {
      if (x.state) return x;
      const u = replaceInHtml(html, x.original, x.suggestion);
      if (u === null) return { ...x, state: 'missing' as const };
      html = u;
      return { ...x, state: 'accepted' as const };
    });
    await db.chapters.update(chapter.id, { content: html, updatedAt: Date.now() });
    if (saved) await db.reports.update(saved.id, { content: next });
  }

  const open = issues?.filter((x) => !x.state).length ?? 0;

  return (
    <div className="stack lg">
      {aiReady === false && <div className="warn-box">Proofreading uses AI. Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart.</div>}
      <div className="row wrap">
        <button className="btn primary" disabled={running || aiReady === false} onClick={start}>{running ? p.working : issues ? 'Proofread again' : 'Ask Elias to proofread'}</button>
        {issues && open > 1 && <button className="btn" onClick={acceptAll}>Accept all {open}</button>}
        {issues && <span className="faint small">{open} open · {issues.length - open} handled</span>}
      </div>
      {issues?.length === 0 && <Says stage="edit">No corrections needed in this chapter.</Says>}
      {issues && issues.length > 0 && (
        <div>
          {issues.map((x, i) => (
            <div key={i} className={`proof-item ${x.state ? 'done' : ''}`}>
              <div>
                <div className="serif" style={{ fontSize: '1.05rem' }}>
                  <del>{x.original}</del> <span className="faint">→</span> <ins>{x.suggestion}</ins>
                </div>
                <div className="faint small">{x.category} · {x.explanation}</div>
              </div>
              <div className="row" style={{ alignSelf: 'center' }}>
                {x.state ? (
                  <span className="faint small">{x.state === 'accepted' ? 'Fixed' : x.state === 'missing' ? 'Not found' : 'Skipped'}</span>
                ) : (
                  <>
                    <button className="btn sm ghost" onClick={() => setState(i, 'skipped')}>Skip</button>
                    <button className="btn sm" onClick={() => accept(i)}>Accept</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Versions({ chapter, chapters, projectId }: { chapter: Chapter | null; chapters: Chapter[]; projectId: string }) {
  const toast = useToast();
  const snaps = useLiveQuery(
    () => (chapter ? db.snapshots.where('chapterId').equals(chapter.id) : db.snapshots.where('projectId').equals(projectId)).reverse().sortBy('createdAt'),
    [chapter?.id, projectId],
  );
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const ids = new Set(chapters.map((c) => c.id));

  async function restore(s: Snapshot) {
    const current = chapters.find((c) => c.id === s.chapterId);
    if (current) {
      await takeSnapshot(current, 'Before restoring an older version');
      await db.chapters.update(current.id, { content: s.content, updatedAt: Date.now() });
      toast(`Restored “${s.title}” to ${formatDate(s.createdAt)}.`);
    } else {
      await addChapter(projectId, { title: s.title, content: s.content });
      toast(`Brought back “${s.title}” as a new chapter.`);
    }
    setPreview(null);
  }

  return (
    <div className="stack lg">
      {chapter && (
        <div>
          <button className="btn" onClick={async () => { await takeSnapshot(chapter, 'Saved by you'); toast('Snapshot saved.'); }}>Save a snapshot now</button>
        </div>
      )}
      {snaps?.length === 0 && <Says stage="edit">No versions yet. I’ll save one automatically before any AI change.</Says>}
      <div>
        {snaps?.map((s) => (
          <div key={s.id} className="proof-item">
            <div>
              <div>{s.label}{!chapter && <span className="faint"> · {s.title}</span>}{!ids.has(s.chapterId) && <span className="pill warn" style={{ marginLeft: '.5rem' }}>deleted section</span>}</div>
              <div className="faint small">{formatDate(s.createdAt)} · {wordsInHtml(s.content).toLocaleString()} words</div>
            </div>
            <div className="row">
              <button className="btn sm ghost" onClick={() => setPreview(preview?.id === s.id ? null : s)}>{preview?.id === s.id ? 'Hide' : 'View'}</button>
              <button className="btn sm" onClick={() => restore(s)}>Restore</button>
            </div>
            {preview?.id === s.id && (
              <article className="report" style={{ gridColumn: '1 / -1', maxHeight: 420, overflow: 'auto', background: 'var(--wash)', padding: '1.25rem', borderRadius: 10 }} dangerouslySetInnerHTML={{ __html: s.content }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
