import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useBook } from '../App';
import { takeSnapshot } from '../db';
import type { Chapter } from '../types';
import { persona } from '../personas';
import { Avatar, useToast } from './ui';
import { aiHealth, projectContext, proseToHtml, streamAi } from '../lib/ai';

const ACTIONS: { task: string; label: string; hint: string }[] = [
  { task: 'continue', label: 'Continue', hint: 'Write what comes next' },
  { task: 'rephrase', label: 'Rephrase', hint: 'Smoother, same meaning' },
  { task: 'expand', label: 'Expand', hint: 'More detail and depth' },
  { task: 'tighten', label: 'Tighten', hint: 'Cut the slack' },
  { task: 'vivid', label: 'Show, don’t tell', hint: 'Dramatize it' },
  { task: 'dialogue', label: 'Polish dialogue', hint: 'Distinct voices' },
  { task: 'grammar', label: 'Fix grammar', hint: 'Correctness only' },
];

interface Pending {
  task: string;
  from: number;
  to: number;
  hadSelection: boolean;
}

export default function WrenPanel({ open, editor, chapter }: { open: boolean; editor: Editor; chapter: Chapter }) {
  const { project } = useBook();
  const p = persona('write');
  const toast = useToast();
  const [tab, setTab] = useState<'assist' | 'talk'>('assist');
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [custom, setCustom] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { aiHealth().then((h) => setAiReady(h.ai)); }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  const hasSelection = !editor.state.selection.empty;

  async function run(task: string, instruction?: string) {
    const { from, to, empty } = editor.state.selection;
    let text: string;
    let range = { from, to };
    if (!empty) {
      text = editor.state.doc.textBetween(from, to, '\n\n', '\n');
    } else if (task === 'continue') {
      const end = editor.state.doc.content.size;
      text = editor.state.doc.textBetween(Math.max(0, end - 6000), end, '\n\n', '\n');
      range = { from: end, to: end };
    } else {
      toast('Select a passage first, and Wren will work on it.');
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPending({ task, ...range, hadSelection: !empty });
    setOutput('');
    setRunning(true);
    try {
      await streamAi({ task, text, instruction, context: projectContext(project, chapter) }, (_c, full) => setOutput(full), ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) toast((e as Error).message, 'error');
    } finally {
      setRunning(false);
    }
  }

  async function apply(mode: 'replace' | 'after') {
    if (!pending || !output) return;
    await takeSnapshot({ ...chapter, content: editor.getHTML() }, `Before Wren: ${pending.task}`);
    const html = proseToHtml(output);
    const size = editor.state.doc.content.size;
    const from = Math.min(pending.from, size);
    const to = Math.min(pending.to, size);
    if (mode === 'replace' && pending.hadSelection) editor.chain().focus().insertContentAt({ from, to }, html).run();
    else editor.chain().focus().insertContentAt(mode === 'after' ? to : from, html).run();
    setOutput('');
    setPending(null);
  }

  async function send() {
    const content = message.trim();
    if (!content) return;
    const next = [...history, { role: 'user' as const, content }];
    setHistory([...next, { role: 'assistant', content: '' }]);
    setMessage('');
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamAi({ task: 'chat', history: next, context: projectContext(project, chapter) }, (_c, full) =>
        setHistory([...next, { role: 'assistant', content: full }]), ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) {
        toast((e as Error).message, 'error');
        setHistory(next);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <aside className={`assist ${open ? '' : 'closed'}`} aria-label="Wren, your writing helper">
      <div className="row" style={{ marginBottom: '1.25rem' }}>
        <Avatar p={p} />
        <div className="grow">
          <div className="serif" style={{ fontSize: '1.1rem' }}>Wren</div>
          <div className="faint tiny">{running ? p.working : 'Here when you need me'}</div>
        </div>
        <div className="segmented">
          <button className={tab === 'assist' ? 'active' : ''} onClick={() => setTab('assist')}>Assist</button>
          <button className={tab === 'talk' ? 'active' : ''} onClick={() => setTab('talk')}>Talk</button>
        </div>
      </div>

      {aiReady === false && (
        <div className="warn-box" style={{ marginBottom: '1rem' }}>
          Wren’s AI help is off. Add your <code>ANTHROPIC_API_KEY</code> to the <code>.env</code> file and restart. Writing, dictation, and transcription still work.
        </div>
      )}

      {tab === 'assist' && (
        <div className="stack lg">
          <p className="muted small" style={{ margin: 0 }}>
            {hasSelection ? 'What should I do with the passage you selected?' : 'Select a passage to revise it, or I can continue from the end of the chapter.'}
          </p>
          <div className="action-grid">
            {ACTIONS.map((a) => (
              <button key={a.task} className="btn sm" title={a.hint} disabled={running || aiReady === false || (a.task !== 'continue' && !hasSelection)} onClick={() => run(a.task)}>
                {a.label}
              </button>
            ))}
          </div>
          <form className="stack" style={{ gap: '.4rem' }} onSubmit={(e) => { e.preventDefault(); if (custom.trim()) run('custom', custom.trim()); }}>
            <textarea rows={2} style={{ minHeight: 0 }} placeholder="Or tell me what you need: “make this sound more hopeful”…" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button className="btn sm" disabled={running || aiReady === false || !custom.trim() || !hasSelection}>Ask about the selection</button>
          </form>

          {(output || running) && (
            <div className="stack">
              <div className="ai-output">{output || '…'}</div>
              {running ? (
                <button className="btn sm ghost" onClick={() => abortRef.current?.abort()}>Stop</button>
              ) : (
                <div className="row wrap" style={{ gap: '.4rem' }}>
                  {pending?.hadSelection && <button className="btn sm primary" onClick={() => apply('replace')}>Replace selection</button>}
                  <button className={`btn sm ${pending?.hadSelection ? '' : 'primary'}`} onClick={() => apply('after')}>{pending?.hadSelection ? 'Insert after' : 'Add to chapter'}</button>
                  <button className="btn sm ghost" onClick={() => navigator.clipboard.writeText(output).then(() => toast('Copied.'))}>Copy</button>
                  <button className="btn sm ghost" onClick={() => { setOutput(''); setPending(null); }}>Discard</button>
                </div>
              )}
              {!running && <p className="faint tiny" style={{ margin: 0 }}>Wren keeps a snapshot before changing your text, so you can always go back.</p>}
            </div>
          )}
        </div>
      )}

      {tab === 'talk' && (
        <div className="stack">
          {history.length === 0 && (
            <p className="muted small">Talk through a plot problem, brainstorm titles, or ask what this chapter needs. I’ve read the chapter you’re on.</p>
          )}
          {history.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`} style={{ whiteSpace: 'pre-wrap' }}>{m.content || '…'}</div>
          ))}
          <form className="stack" style={{ gap: '.4rem' }} onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea
              rows={3}
              style={{ minHeight: 0 }}
              value={message}
              placeholder="Ask Wren…"
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <div className="row">
              <button className="btn sm primary" disabled={running || aiReady === false || !message.trim()}>Send</button>
              {history.length > 0 && <button type="button" className="btn sm ghost" onClick={() => setHistory([])}>Start over</button>}
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}
