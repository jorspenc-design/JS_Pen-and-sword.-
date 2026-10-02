import { useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { addChapter, createProject, db, importBackup } from '../db';
import { importFile } from '../lib/importers';
import { PERSONAS } from '../personas';
import { Avatar, Field, Modal, useToast } from '../components/ui';
import { wordsInHtml } from '../lib/util';

export default function Library() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const wordCounts = useLiveQuery(async () => {
    const all = await db.chapters.toArray();
    const map: Record<string, number> = {};
    for (const c of all) map[c.projectId] = (map[c.projectId] ?? 0) + wordsInHtml(c.content);
    return map;
  }, []);
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', author: '', genre: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function startBook() {
    const p = await createProject({ title: form.title.trim() || 'Untitled Book', author: form.author.trim(), genre: form.genre.trim() });
    await addChapter(p.id, { title: 'Chapter 1' });
    navigate(`/book/${p.id}/write`);
  }

  async function onImport(file: File) {
    setBusy(true);
    try {
      const sections = await importFile(file);
      const title = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/(^|\s)(\p{Ll})/gu, (_, sp: string, c: string) => sp + c.toUpperCase());
      const p = await createProject({ title });
      for (const s of sections) await addChapter(p.id, s);
      toast(`Wren brought in ${sections.length} section${sections.length === 1 ? '' : 's'} from ${file.name}.`);
      navigate(`/book/${p.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">Pen <span>&</span> Sword</span>
      </header>
      <main className="page">
        <section className="section" style={{ marginTop: '2rem', marginBottom: '4rem' }}>
          <h1 style={{ fontSize: '2.8rem', maxWidth: '18ch' }}>From first word to published book.</h1>
          <p className="muted" style={{ maxWidth: '54ch', marginTop: '1rem', fontSize: '1.05rem' }}>
            Five helpers walk with you through every stage. Each one handles a single job, so you always know where you are and what’s next.
          </p>
          <div className="row wrap" style={{ gap: '2.25rem', marginTop: '2.5rem' }}>
            {PERSONAS.map((p) => (
              <div key={p.stage} className="row" style={{ gap: '.7rem', alignItems: 'flex-start', width: 170 }}>
                <Avatar p={p} />
                <div>
                  <div className="serif" style={{ fontSize: '1.05rem' }}>{p.name}</div>
                  <div className="faint small">{p.role.replace('The ', '')}</div>
                  <div className="faint tiny" style={{ marginTop: '.2rem' }}>{p.promise}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">
            <h2>Your books</h2>
            <div className="row">
              <button className="btn ghost sm" onClick={() => backupRef.current?.click()}>Restore backup</button>
              <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? 'Importing…' : 'Import manuscript'}
              </button>
              <button className="btn primary" onClick={() => setCreating(true)}>New book</button>
            </div>
          </div>

          {projects && projects.length === 0 && (
            <div className="card empty" style={{ padding: '4rem 2rem' }}>
              <h2>Your shelf is empty</h2>
              <p>Start a new book, or bring in a Word document, text, or Markdown file you’ve already written.</p>
            </div>
          )}

          <div className="grid auto">
            {projects?.map((p) => {
              const words = wordCounts?.[p.id] ?? 0;
              return (
                <Link key={p.id} to={`/book/${p.id}`} className="card hover book-card">
                  <div className="book-spine" style={{ background: `linear-gradient(160deg, ${p.cover.bg1}, ${p.cover.bg2})` } as CSSProperties} />
                  <div className="grow">
                    <div className="serif" style={{ fontSize: '1.2rem', lineHeight: 1.25 }}>{p.title}</div>
                    {p.author && <div className="muted small">{p.author}</div>}
                    <div className="faint tiny" style={{ marginTop: '.75rem' }}>
                      {words.toLocaleString()} words · edited {new Date(p.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <input ref={fileRef} type="file" hidden accept=".docx,.txt,.md,.markdown,.html,.htm" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
        <input
          ref={backupRef}
          type="file"
          hidden
          accept=".json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const p = await importBackup(f);
              toast(`Restored “${p.title}”.`);
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        />

        <Modal open={creating} onClose={() => setCreating(false)}>
          <form className="stack lg" onSubmit={(e) => { e.preventDefault(); startBook(); }}>
            <div>
              <h2>A new book</h2>
              <p className="muted small" style={{ marginTop: '.4rem' }}>You can change any of this later.</p>
            </div>
            <Field label="Working title">
              <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="The Untold Story" />
            </Field>
            <Field label="Author name (as it will appear on the cover)">
              <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            </Field>
            <Field label="Genre">
              <input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} placeholder="e.g. Christian nonfiction, fantasy, memoir" />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" className="btn primary">Begin writing</button>
            </div>
          </form>
        </Modal>
      </main>
    </>
  );
}
