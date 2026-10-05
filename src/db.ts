import Dexie, { type EntityTable } from 'dexie';
import type { Asset, Chapter, Report, CoverSettings, FormatSettings, Project, PublishMeta, SectionKind, Snapshot } from './types';
import { todayKey, uid, wordsInHtml } from './lib/util';

// Everything lives in the browser's IndexedDB: the manuscript never leaves the
// device except when the author explicitly asks the AI for help.

/** Some browsers block storage (private windows, strict privacy settings, sandboxed previews). */
async function storageWorks(): Promise<boolean> {
  try {
    if (!globalThis.indexedDB) return false;
    const probe = new Promise<boolean>((resolve) => {
      const req = indexedDB.open('pen-and-sword-probe');
      req.onsuccess = () => { req.result.close(); resolve(true); };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(true);
    });
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000));
    return await Promise.race([probe, timeout]);
  } catch {
    return false;
  }
}

/** False when the browser won't save data; the app then runs in memory for this tab only. */
export const storagePersistent = await storageWorks();
const memory = storagePersistent ? null : await import('fake-indexeddb');

export const db = new Dexie('pen-and-sword', memory ? { indexedDB: memory.indexedDB, IDBKeyRange: memory.IDBKeyRange } : undefined) as Dexie & {
  projects: EntityTable<Project, 'id'>;
  chapters: EntityTable<Chapter, 'id'>;
  snapshots: EntityTable<Snapshot, 'id'>;
  assets: EntityTable<Asset, 'id'>;
  reports: EntityTable<Report, 'id'>;
};

db.version(1).stores({
  projects: 'id, updatedAt',
  chapters: 'id, projectId, [projectId+order]',
  snapshots: 'id, projectId, chapterId, createdAt',
  assets: 'id, projectId',
  reports: 'id, projectId, chapterId, [chapterId+kind]',
});

export const defaultFormat = (): FormatSettings => ({
  edition: 'paperback',
  largePrint: false,
  paragraphStyle: 'indent',
  themeId: 'classic',
  trimId: '6x9',
  paper: 'cream',
  bodyFont: 'EB Garamond',
  headingFont: 'Cormorant Garamond',
  fontSize: 11.5,
  lineHeight: 1.4,
  margins: { top: 0.75, bottom: 0.75, inside: 0.875, outside: 0.625 },
  justify: true,
  hyphenate: true,
  indent: 1.5,
  headingStyle: 'classic',
  chapterNumbering: 'words',
  dropCaps: true,
  smallCapsLead: true,
  sceneBreak: '❧',
  startOnRight: false,
  runningHeads: true,
  pageNumbers: true,
  titlePage: true,
  copyrightPage: true,
  toc: true,
  pageCount: 0,
});

export const defaultCover = (): CoverSettings => ({
  layout: 'centered',
  bg1: '#1c2433',
  bg2: '#5a1e24',
  gradient: 'vertical',
  imageOpacity: 1,
  imageFit: 'cover',
  overlay: 0.25,
  accent: '#c9a45c',
  titleFont: 'Cinzel',
  titleColor: '#f4ead5',
  titleSize: 1,
  titleCase: 'upper',
  subtitle: '',
  authorFont: 'Cormorant Garamond',
  authorColor: '#e8dcc0',
  tagline: '',
  backText: '',
  backTextColor: '#f4ead5',
  showBarcodeBox: true,
  spineColor: '#1c2433',
  spineTextColor: '#f4ead5',
  ornament: true,
});

export const defaultMeta = (): PublishMeta => ({
  path: 'kdp',
  series: '',
  seriesNumber: '',
  edition: 'First Edition',
  publisher: '',
  language: 'English',
  pubYear: String(new Date().getFullYear()),
  isbnPrint: '',
  isbnEbook: '',
  description: '',
  keywords: ['', '', '', '', '', '', ''],
  categories: ['', '', ''],
  comps: [],
  audience: 'Adult',
  price: '',
  authorBio: '',
  synopsis: '',
  queryLetter: '',
  dedication: '',
  checklist: {},
});

export async function createProject(init: Partial<Project> = {}): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: uid(),
    title: 'Untitled Book',
    subtitle: '',
    author: '',
    genre: '',
    notes: '',
    wordGoal: 60000,
    dailyGoal: 1000,
    createdAt: now,
    updatedAt: now,
    format: defaultFormat(),
    cover: defaultCover(),
    meta: defaultMeta(),
    progress: {},
    ...init,
  };
  await db.projects.add(project);
  return project;
}

export async function updateProject(id: string, patch: Partial<Project>) {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() });
}

export async function getChapters(projectId: string): Promise<Chapter[]> {
  return db.chapters.where('[projectId+order]').between([projectId, Dexie.minKey], [projectId, Dexie.maxKey]).toArray();
}

export async function addChapter(
  projectId: string,
  init: { title?: string; content?: string; kind?: SectionKind } = {},
): Promise<Chapter> {
  const existing = await getChapters(projectId);
  const chapter: Chapter = {
    id: uid(),
    projectId,
    order: existing.length ? existing[existing.length - 1].order + 1 : 0,
    kind: init.kind ?? 'chapter',
    title: init.title ?? `Chapter ${existing.filter((c) => c.kind === 'chapter').length + 1}`,
    content: init.content ?? '<p></p>',
    notes: '',
    status: 'draft',
    updatedAt: Date.now(),
  };
  await db.chapters.add(chapter);
  await updateProject(projectId, {});
  return chapter;
}

/** Saves chapter content and credits any newly written words to today's progress. */
export async function saveChapterContent(chapter: Pick<Chapter, 'id' | 'projectId'>, previous: string, content: string) {
  const delta = wordsInHtml(content) - wordsInHtml(previous);
  await db.transaction('rw', db.chapters, db.projects, async () => {
    await db.chapters.update(chapter.id, { content, updatedAt: Date.now() });
    const project = await db.projects.get(chapter.projectId);
    if (!project) return;
    const patch: Partial<Project> = { updatedAt: Date.now() };
    if (delta > 0) {
      const key = todayKey();
      patch.progress = { ...project.progress, [key]: (project.progress[key] ?? 0) + delta };
    }
    await db.projects.update(project.id, patch);
  });
}

export async function reorderChapters(ids: string[]) {
  await db.transaction('rw', db.chapters, async () => {
    for (let i = 0; i < ids.length; i++) await db.chapters.update(ids[i], { order: i });
  });
}

export async function deleteProject(id: string) {
  await db.transaction('rw', [db.projects, db.chapters, db.snapshots, db.assets, db.reports], async () => {
    await db.reports.where('projectId').equals(id).delete();
    await db.chapters.where('projectId').equals(id).delete();
    await db.snapshots.where('projectId').equals(id).delete();
    await db.assets.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

export async function takeSnapshot(chapter: Chapter, label: string) {
  await db.snapshots.add({
    id: uid(),
    projectId: chapter.projectId,
    chapterId: chapter.id,
    label,
    title: chapter.title,
    content: chapter.content,
    createdAt: Date.now(),
  });
}

/** Full-project backup as JSON (assets base64-encoded) for safekeeping or moving machines. */
export async function exportBackup(projectId: string): Promise<Blob> {
  const project = await db.projects.get(projectId);
  const chapters = await getChapters(projectId);
  const snapshots = await db.snapshots.where('projectId').equals(projectId).toArray();
  const assets = await db.assets.where('projectId').equals(projectId).toArray();
  const encoded = await Promise.all(
    assets.map(async (a) => ({ ...a, data: await blobToDataUrl(a.data) })),
  );
  return new Blob([JSON.stringify({ app: 'pen-and-sword', version: 1, project, chapters, snapshots, assets: encoded })], {
    type: 'application/json',
  });
}

export async function importBackup(file: File): Promise<Project> {
  const data = JSON.parse(await file.text());
  if (data.app !== 'pen-and-sword') throw new Error('This is not a Pen and Sword backup file.');
  const newId = uid();
  const idMap = new Map<string, string>();
  const project: Project = { ...data.project, id: newId, title: data.project.title, updatedAt: Date.now() };
  // Decode blobs before opening the transaction: IndexedDB transactions
  // auto-commit if they wait on non-database promises.
  const assets: Asset[] = [];
  for (const a of data.assets as (Omit<Asset, 'data'> & { data: string })[]) {
    const id = uid();
    idMap.set(a.id, id);
    assets.push({ ...a, id, projectId: newId, data: await (await fetch(a.data)).blob() });
  }
  await db.transaction('rw', [db.projects, db.chapters, db.snapshots, db.assets], async () => {
    await db.assets.bulkAdd(assets);
    if (project.cover.imageAssetId) project.cover.imageAssetId = idMap.get(project.cover.imageAssetId);
    await db.projects.add(project);
    for (const c of data.chapters as Chapter[]) {
      const id = uid();
      idMap.set(c.id, id);
      await db.chapters.add({ ...c, id, projectId: newId });
    }
    for (const s of data.snapshots as Snapshot[]) {
      await db.snapshots.add({ ...s, id: uid(), projectId: newId, chapterId: idMap.get(s.chapterId) ?? s.chapterId });
    }
  });
  return project;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function saveReport(projectId: string, chapterId: string, kind: string, content: unknown) {
  await db.reports.where('[chapterId+kind]').equals([chapterId, kind]).delete();
  await db.reports.add({ id: uid(), projectId, chapterId, kind, content, createdAt: Date.now() });
}
