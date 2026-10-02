import { HashRouter, Link, NavLink, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, type CSSProperties } from 'react';
import { db, getChapters, storagePersistent } from './db';

import type { Chapter, Project } from './types';
import { PERSONAS } from './personas';
import { Avatar, ToastProvider } from './components/ui';
import Library from './pages/Library';
import Overview from './pages/Overview';
import Write from './pages/Write';
import Edit from './pages/Edit';
import Format from './pages/Format';
import Design from './pages/Design';
import Publish from './pages/Publish';

interface BookCtx {
  project: Project;
  chapters: Chapter[];
}
const BookContext = createContext<BookCtx | null>(null);
export const useBook = () => useContext(BookContext)!;

function BookLayout() {
  const { id = '' } = useParams();
  const project = useLiveQuery(() => db.projects.get(id), [id]);
  const chapters = useLiveQuery(() => getChapters(id), [id]);

  if (project === undefined || chapters === undefined) return <div className="page faint">Opening…</div>;
  if (!project) {
    return (
      <div className="page empty">
        <h2>This book isn’t here</h2>
        <p>It may have been deleted. <Link to="/">Back to your library</Link></p>
      </div>
    );
  }

  return (
    <BookContext.Provider value={{ project, chapters }}>
      <header className="topbar">
        <Link to="/" className="brand">Pen <span>&</span> Sword</Link>
        <span className="faint">/</span>
        <Link to={`/book/${id}`} className="crumb">{project.title}</Link>
      </header>
      <nav className="journey" aria-label="Your publishing team">
        {PERSONAS.map((p) => (
          <NavLink key={p.stage} to={`/book/${id}/${p.stage}`} style={{ '--persona': p.color } as CSSProperties}>
            <Avatar p={p} />
            <span className="who">{p.name} · {p.role.replace('The ', '')}</span>
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </BookContext.Provider>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  return (
    <ToastProvider>
      {import.meta.env.VITE_PREVIEW && (
        <div className="preview-banner">
          Preview. Writing, importing, editing checks, page layout, and cover design all work here. AI help, dictation, transcription, and file downloads need the app running on your computer.
        </div>
      )}
      {!storagePersistent && (
        <div className="preview-banner" style={{ color: 'var(--warn)' }}>
          This browser isn’t letting Pen and Sword save, so your work will be lost when you close this tab. Use a regular (not private) window, or allow site data for this page.
        </div>
      )}
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/book/:id" element={<BookLayout />}>
            <Route index element={<Overview />} />
            <Route path="write" element={<Write />} />
            <Route path="edit" element={<Edit />} />
            <Route path="format" element={<Format />} />
            <Route path="design" element={<Design />} />
            <Route path="publish" element={<Publish />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
