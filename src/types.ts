export type SectionKind = 'front' | 'chapter' | 'back';

export interface Chapter {
  id: string;
  projectId: string;
  order: number;
  kind: SectionKind;
  title: string;
  /** Sanitized HTML from the editor. */
  content: string;
  notes: string;
  status: 'draft' | 'revising' | 'edited' | 'final';
  updatedAt: number;
}

export interface Snapshot {
  id: string;
  projectId: string;
  chapterId: string;
  label: string;
  title: string;
  content: string;
  createdAt: number;
}

export interface Report {
  id: string;
  projectId: string;
  /** Chapter id, or 'book' for whole-manuscript reports. */
  chapterId: string;
  kind: string;
  content: unknown;
  createdAt: number;
}

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  type: string;
  data: Blob;
}

export type ChapterHeadingStyle = 'classic' | 'modern' | 'elegant' | 'minimal' | 'bold';

export interface FormatSettings {
  /** Missing on books created before editions existed; treat as 'paperback'. */
  edition?: 'paperback' | 'hardcover';
  largePrint?: boolean;
  /** Indented paragraphs (fiction) or spaced blocks (much nonfiction). */
  paragraphStyle?: 'indent' | 'block';
  themeId?: string;
  trimId: string;
  paper: 'white' | 'cream' | 'color-standard' | 'color-premium';
  bodyFont: string;
  headingFont: string;
  fontSize: number; // pt
  lineHeight: number; // multiple
  margins: { top: number; bottom: number; inside: number; outside: number }; // inches
  justify: boolean;
  hyphenate: boolean;
  indent: number; // em
  headingStyle: ChapterHeadingStyle;
  chapterNumbering: 'words' | 'numerals' | 'roman' | 'none';
  dropCaps: boolean;
  smallCapsLead: boolean;
  sceneBreak: string;
  startOnRight: boolean;
  runningHeads: boolean;
  pageNumbers: boolean;
  titlePage: boolean;
  copyrightPage: boolean;
  toc: boolean;
  /** Last measured interior page count (from the paginated preview). */
  pageCount: number;
}

export type CoverLayout = 'centered' | 'top-title' | 'bottom-band' | 'split' | 'frame';

export interface CoverSettings {
  layout: CoverLayout;
  bg1: string;
  bg2: string;
  gradient: 'none' | 'vertical' | 'radial' | 'diagonal';
  imageAssetId?: string;
  imageOpacity: number;
  imageFit: 'cover' | 'contain';
  overlay: number; // 0..1 darkening for legibility
  accent: string;
  titleFont: string;
  titleColor: string;
  titleSize: number; // relative 0.5..2
  titleCase: 'as-is' | 'upper';
  subtitle: string;
  authorFont: string;
  authorColor: string;
  tagline: string;
  backText: string;
  backTextColor: string;
  showBarcodeBox: boolean;
  spineColor: string;
  spineTextColor: string;
  ornament: boolean;
}

export interface PublishMeta {
  path: 'kdp' | 'traditional' | 'both';
  series: string;
  seriesNumber: string;
  edition: string;
  publisher: string;
  language: string;
  pubYear: string;
  isbnPrint: string;
  isbnEbook: string;
  description: string;
  keywords: string[];
  categories: string[];
  comps: string[];
  audience: string;
  price: string;
  authorBio: string;
  synopsis: string;
  queryLetter: string;
  dedication: string;
  checklist: Record<string, boolean>;
}

export interface Project {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  genre: string;
  notes: string;
  wordGoal: number;
  dailyGoal: number;
  createdAt: number;
  updatedAt: number;
  format: FormatSettings;
  cover: CoverSettings;
  meta: PublishMeta;
  /** Words written per day, keyed YYYY-MM-DD, for streaks and goals. */
  progress: Record<string, number>;
}
