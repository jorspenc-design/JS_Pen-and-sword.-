import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBook } from '../App';
import { deleteProject, exportBackup, updateProject } from '../db';
import { PERSONAS, type StageId } from '../personas';
import { Avatar, Field, Progress, useToast } from '../components/ui';
import { downloadBlob, slug, todayKey, wordsInHtml } from '../lib/util';
import { getTrim } from '../lib/kdp';
import { publishChecklist } from './Publish';
import type { Project } from '../types';

export default function Overview() {
  const { project, chapters } = useBook();
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState(project);
  useEffect(() => setDraft(project), [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = chapters.reduce((n, c) => n + wordsInHtml(c.content), 0);
  const today = project.progress[todayKey()] ?? 0;
  const edited = chapters.filter((c) => c.status === 'edited' || c.status === 'final').length;
  const checklist = publishChecklist(project, chapters);
  const done = checklist.filter((i) => i.done).length;
  const streak = (() => {
    // Consecutive writing days ending today (or yesterday, if today hasn't started).
    let n = 0;
    const d = new Date();
    if (!(project.progress[todayKey(d)] > 0)) d.setDate(d.getDate() - 1);
    while ((project.progress[todayKey(d)] ?? 0) > 0) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  })();

  const status: Record<StageId, string> = {
    write: chapters.length ? `${chapters.length} section${chapters.length === 1 ? '' : 's'} · ${words.toLocaleString()} words` : 'Nothing written yet',
    edit: chapters.length ? `${edited} of ${chapters.length} sections marked edited` : 'Waiting for pages',
    format: `${getTrim(project.format.trimId).label} · ${project.format.pageCount ? `${project.format.pageCount} pages` : 'not typeset yet'}`,
    design: project.cover.backText || project.cover.imageAssetId || project.cover.tagline ? 'Cover in progress' : 'Ready to start your cover',
    publish: `${done} of ${checklist.length} steps ready`,
  };

  const save = (patch: Partial<Project>) => {
    setDraft({ ...draft, ...patch });
    updateProject(project.id, patch);
  };

  return (
    <main className="page">
      <section className="section" style={{ marginBottom: '3.5rem' }}>
        <input
          className="input-bare serif"
          style={{ fontSize: '2.6rem', width: '100%' }}
          value={draft.title}
          onChange={(e) => save({ title: e.target.value })}
          aria-label="Title"
        />
        <input
          className="input-bare serif muted"
          style={{ fontSize: '1.25rem', width: '100%', fontStyle: 'italic', marginTop: '.25rem' }}
          value={draft.subtitle}
          placeholder="Add a subtitle"
          onChange={(e) => save({ subtitle: e.target.value })}
          aria-label="Subtitle"
        />
        <div className="row wrap" style={{ gap: '3rem', marginTop: '2.5rem' }}>
          <div className="stat"><span className="v">{words.toLocaleString()}</span><span className="k">words of {project.wordGoal.toLocaleString()}</span></div>
          <div className="stat"><span className="v">{today.toLocaleString()}</span><span className="k">today · goal {project.dailyGoal.toLocaleString()}</span></div>
          <div className="stat"><span className="v">{streak}</span><span className="k">day streak</span></div>
          <div className="stat"><span className="v">{Math.max(1, Math.round(words / 250))}</span><span className="k">minutes to read</span></div>
        </div>
        <div style={{ marginTop: '1.25rem', maxWidth: 520 }}><Progress value={words / Math.max(1, project.wordGoal)} /></div>
      </section>

      <section className="section">
        <div className="section-title"><h2>Your team</h2></div>
        <div className="stack">
          {PERSONAS.map((p) => (
            <Link key={p.stage} to={`/book/${project.id}/${p.stage}`} className="card hover row" style={{ gap: '1.25rem', padding: '1.25rem 1.5rem' }}>
              <Avatar p={p} size="lg" />
              <div className="grow">
                <div className="serif" style={{ fontSize: '1.2rem' }}>{p.name} <span className="faint small" style={{ fontFamily: 'var(--sans)' }}>{p.role}</span></div>
                <div className="muted small">{status[p.stage]}</div>
              </div>
              <span className="faint">→</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-title"><h2>About this book</h2></div>
        <div className="grid two">
          <Field label="Author name"><input value={draft.author} onChange={(e) => save({ author: e.target.value })} /></Field>
          <Field label="Genre"><input value={draft.genre} onChange={(e) => save({ genre: e.target.value })} /></Field>
          <Field label="Book word goal"><input type="number" value={draft.wordGoal} onChange={(e) => save({ wordGoal: Number(e.target.value) || 0 })} /></Field>
          <Field label="Daily word goal"><input type="number" value={draft.dailyGoal} onChange={(e) => save({ dailyGoal: Number(e.target.value) || 0 })} /></Field>
        </div>
        <div style={{ marginTop: '1.25rem' }}>
          <Field label="What is this book about? (Your helpers read this for context.)">
            <textarea rows={4} value={draft.notes} onChange={(e) => save({ notes: e.target.value })} placeholder="Premise, audience, themes, what you want readers to feel or learn…" />
          </Field>
        </div>
      </section>

      <hr className="divider" />
      <section className="row wrap between">
        <p className="faint small" style={{ margin: 0, maxWidth: '52ch' }}>
          Your work is saved in this browser automatically. Download a backup now and then to keep a copy somewhere safe.
        </p>
        <div className="row">
          <button className="btn sm" onClick={async () => downloadBlob(await exportBackup(project.id), `${slug(project.title)}-backup.json`)}>Download backup</button>
          <button
            className="btn sm ghost danger"
            onClick={async () => {
              if (!confirm(`Delete “${project.title}” and all its chapters? This can’t be undone.`)) return;
              await deleteProject(project.id);
              toast('Book deleted.');
              navigate('/');
            }}
          >
            Delete book
          </button>
        </div>
      </section>
    </main>
  );
}
