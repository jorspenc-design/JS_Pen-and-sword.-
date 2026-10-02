import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import { useBook } from '../App';
import { addChapter, db, reorderChapters, saveChapterContent, takeSnapshot } from '../db';
import type { Chapter, SectionKind } from '../types';
import { persona } from '../personas';
import { Avatar, PersonaHeader, Says, useToast } from '../components/ui';
import WrenPanel from '../components/WrenPanel';
import TranscribeModal from '../components/TranscribeModal';
import { applyVoiceCommands, dictationSupported, startDictation } from '../lib/dictation';
import { importFile } from '../lib/importers';
import { todayKey, wordsInHtml } from '../lib/util';

export default function Write() {
  const { project, chapters } = useBook();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c') ?? (chapters.find((c) => c.kind === 'chapter') ?? chapters[0])?.id;
  const active = chapters.find((c) => c.id === activeId) ?? chapters[0];
  const [focus, setFocus] = useState(false);
  const [assistOpen, setAssistOpen] = useState(true);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const select = (id: string) => setParams({ c: id }, { replace: true });

  async function newSection(kind: SectionKind) {
    const title = kind === 'front' ? 'Dedication' : kind === 'back' ? 'About the Author' : undefined;
    const c = await addChapter(project.id, { kind, title });
    select(c.id);
  }

  async function onImport(file: File) {
    try {
      const sections = await importFile(file);
      let first: Chapter | null = null;
      for (const s of sections) {
        const c = await addChapter(project.id, s);
        first ??= c;
      }
      toast(`Added ${sections.length} section${sections.length === 1 ? '' : 's'} from ${file.name}.`);
      if (first) select(first.id);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (!active) {
    return (
      <main className="page narrow">
        <PersonaHeader stage="write" />
        <Says stage="write">
          <p style={{ margin: 0 }}>We haven’t started yet. Begin with a blank chapter, or hand me a draft you’ve already written.</p>
          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="btn primary" onClick={() => newSection('chapter')}>Start chapter one</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>Import a draft</button>
          </div>
        </Says>
        <input ref={fileRef} type="file" hidden accept=".docx,.txt,.md,.markdown,.html,.htm" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
      </main>
    );
  }

  return (
    <div className={`writer ${focus ? 'focus' : ''}`}>
      <ChapterList chapters={chapters} activeId={active.id} onSelect={select} onAdd={newSection} onImport={() => fileRef.current?.click()} />
      <ChapterEditor
        key={active.id}
        chapter={active}
        focus={focus}
        onToggleFocus={() => setFocus(!focus)}
        assistOpen={assistOpen}
        onToggleAssist={() => setAssistOpen(!assistOpen)}
        onDeleted={() => {
          const next = chapters.find((c) => c.id !== active.id);
          if (next) select(next.id);
          else setParams({});
        }}
        dailyGoal={project.dailyGoal}
        today={project.progress[todayKey()] ?? 0}
      />
      <input ref={fileRef} type="file" hidden accept=".docx,.txt,.md,.markdown,.html,.htm" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
    </div>
  );
}

function ChapterList({ chapters, activeId, onSelect, onAdd, onImport }: {
  chapters: Chapter[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: (kind: SectionKind) => void;
  onImport: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const p = persona('write');

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = chapters.map((c) => c.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    reorderChapters(ids);
  };

  return (
    <aside className="chapters">
      <div className="row" style={{ padding: '0 .6rem .75rem', gap: '.6rem' }}>
        <Avatar p={p} size="sm" />
        <span className="caps faint">Manuscript</span>
      </div>
      {chapters.map((c) => (
        <div
          key={c.id}
          className={`chapter-item ${c.id === activeId ? 'active' : ''} ${dragId === c.id ? 'dragging' : ''} ${overId === c.id && dragId !== c.id ? 'drop-target' : ''}`}
          onClick={() => onSelect(c.id)}
          draggable
          onDragStart={() => setDragId(c.id)}
          onDragOver={(e) => { e.preventDefault(); setOverId(c.id); }}
          onDragEnd={() => { setDragId(null); setOverId(null); }}
          onDrop={() => { drop(c.id); setDragId(null); setOverId(null); }}
          title="Drag to reorder"
        >
          <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.kind !== 'chapter' && <span className="faint tiny">{c.kind === 'front' ? 'Front · ' : 'Back · '}</span>}
            {c.title || 'Untitled'}
          </span>
          <span className="meta">{wordsInHtml(c.content).toLocaleString()}</span>
        </div>
      ))}
      <div style={{ padding: '.75rem .6rem' }}>
        {adding ? (
          <div className="stack" style={{ gap: '.3rem' }}>
            <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { onAdd('chapter'); setAdding(false); }}>Chapter</button>
            <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { onAdd('front'); setAdding(false); }}>Front matter <span className="faint">(dedication, foreword)</span></button>
            <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { onAdd('back'); setAdding(false); }}>Back matter <span className="faint">(about the author)</span></button>
            <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { onImport(); setAdding(false); }}>Import from a file…</button>
          </div>
        ) : (
          <button className="btn sm ghost" onClick={() => setAdding(true)}>+ Add</button>
        )}
      </div>
    </aside>
  );
}

function ChapterEditor({ chapter, focus, onToggleFocus, assistOpen, onToggleAssist, onDeleted, dailyGoal, today }: {
  chapter: Chapter;
  focus: boolean;
  onToggleFocus: () => void;
  assistOpen: boolean;
  onToggleAssist: () => void;
  onDeleted: () => void;
  dailyGoal: number;
  today: number;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(chapter.title);
  const [saved, setSaved] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const lastSaved = useRef(chapter.content);
  const timer = useRef<number>(undefined);

  const flush = useCallback((ed: Editor) => {
    window.clearTimeout(timer.current);
    const html = ed.getHTML();
    if (html === lastSaved.current) return;
    const prev = lastSaved.current;
    lastSaved.current = html;
    saveChapterContent(chapter, prev, html).then(() => setSaved(true));
  }, [chapter]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false, code: false, codeBlock: false }),
      Placeholder.configure({ placeholder: 'Begin here. Type, or press the microphone and speak.' }),
      CharacterCount,
      Typography,
      Highlight,
    ],
    content: chapter.content,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: ed }) => {
      setSaved(false);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(ed), 700);
    },
  });

  useEffect(() => () => { if (editor && !editor.isDestroyed) flush(editor); }, [editor, flush]);
  useEffect(() => () => stopRef.current(), []);

  const saveTitle = () => {
    if (title.trim() !== chapter.title) db.chapters.update(chapter.id, { title: title.trim() || 'Untitled', updatedAt: Date.now() });
  };

  const insertSpoken = useCallback((text: string, opts: { newParagraph: boolean; sceneBreak: boolean }) => {
    if (!editor) return;
    if (opts.newParagraph) { editor.chain().focus().splitBlock().run(); return; }
    if (opts.sceneBreak) { editor.chain().focus().setHorizontalRule().run(); return; }
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 4), from, '\n', '\n');
    const atStart = before.trim() === '' || /[.?!…]["”’]?\s*$/.test(before);
    let out = applyVoiceCommands(text, atStart);
    if (before && !/\s$/.test(before) && !/^[.,?!;:…”)]/.test(out)) out = ` ${out}`;
    editor.chain().focus().insertContent(out).run();
  }, [editor]);

  const toggleDictation = () => {
    if (listening) {
      stopRef.current();
      setListening(false);
      setInterim('');
      return;
    }
    stopRef.current = startDictation({
      onFinal: insertSpoken,
      onInterim: setInterim,
      onError: (m) => { toast(m, 'error'); setListening(false); setInterim(''); },
      onEnd: () => { setListening(false); setInterim(''); },
    });
    setListening(true);
  };

  if (!editor) return null;
  const words = editor.storage.characterCount.words();
  const tb = (label: string, on: boolean, run: () => void, title?: string) => (
    <button className={`tb ${on ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={run} title={title ?? label}>{label}</button>
  );

  return (
    <>
      <section className="editor-col">
        <div className="toolbar">
          {tb('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
          {tb('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
          {tb('U', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline')}
          <span className="sep" />
          {tb('Heading', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Section heading within a chapter')}
          {tb('Quote', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Block quote')}
          {tb('List', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Bulleted list')}
          {tb('❧', false, () => editor.chain().focus().setHorizontalRule().run(), 'Scene break')}
          <span className="sep" />
          {tb('↶', false, () => editor.chain().focus().undo().run(), 'Undo')}
          {tb('↷', false, () => editor.chain().focus().redo().run(), 'Redo')}
          <span className="spacer" />
          {dictationSupported() && (
            <button className={`tb ${listening ? 'rec' : ''}`} onClick={toggleDictation} title="Dictate: speak and Wren writes. Say “new paragraph”, “period”, “comma”, “scene break”.">
              {listening ? '● Listening' : '🎙 Dictate'}
            </button>
          )}
          <button className="tb" onClick={() => setTranscribing(true)} title="Transcribe a recording into this chapter">Transcribe</button>
          <span className="sep" />
          <button className={`tb ${focus ? 'on' : ''}`} onClick={onToggleFocus} title="Hide everything but the page">Focus</button>
          {!focus && <button className={`tb ${assistOpen ? 'on' : ''}`} onClick={onToggleAssist} title="Ask Wren for help">Ask Wren</button>}
        </div>

        <div className="manuscript">
          <input className="chapter-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), editor.commands.focus('start'))} aria-label="Chapter title" />
          <EditorContent editor={editor} />
        </div>

        <footer className="statusbar">
          <span>{words.toLocaleString()} words</span>
          <span>Today {today.toLocaleString()} / {dailyGoal.toLocaleString()}</span>
          <span>{saved ? 'Saved' : 'Saving…'}</span>
          <span className="spacer" />
          <select className="input-bare" style={{ width: 'auto', fontSize: '.78rem' }} value={chapter.kind} onChange={(e) => db.chapters.update(chapter.id, { kind: e.target.value as SectionKind })} title="Where this section goes in the book">
            <option value="front">Front matter</option>
            <option value="chapter">Chapter</option>
            <option value="back">Back matter</option>
          </select>
          <select className="input-bare" style={{ width: 'auto', fontSize: '.78rem' }} value={chapter.status} onChange={(e) => db.chapters.update(chapter.id, { status: e.target.value as Chapter['status'] })}>
            <option value="draft">Draft</option>
            <option value="revising">Revising</option>
            <option value="edited">Edited</option>
            <option value="final">Final</option>
          </select>
          <button
            className="btn ghost sm danger"
            style={{ padding: '0 .4rem' }}
            onClick={async () => {
              if (!confirm(`Delete “${chapter.title}”? A snapshot will be kept in Elias’s version history.`)) return;
              await takeSnapshot({ ...chapter, content: editor.getHTML() }, 'Before deleting');
              window.clearTimeout(timer.current);
              lastSaved.current = editor.getHTML();
              await db.chapters.delete(chapter.id);
              onDeleted();
            }}
          >
            Delete
          </button>
        </footer>
      </section>

      {!focus && <WrenPanel open={assistOpen} editor={editor} chapter={chapter} />}

      {listening && (
        <div className="interim" aria-live="polite">
          <span className="pulse" />
          <span>{interim || 'Listening… say “new paragraph” or “period” as you go.'}</span>
        </div>
      )}

      <TranscribeModal
        open={transcribing}
        onClose={() => setTranscribing(false)}
        onInsert={(html, where) => {
          if (where === 'cursor') editor.chain().focus().insertContent(html).run();
          else editor.chain().focus('end').insertContent(html).run();
          setTranscribing(false);
        }}
        onNewChapter={async (html, name) => {
          await addChapter(chapter.projectId, { title: name, content: html });
          setTranscribing(false);
          toast('Wren added the transcript as a new chapter.');
        }}
      />
    </>
  );
}
