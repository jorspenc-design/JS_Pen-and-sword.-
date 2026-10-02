// Each stage of the publishing journey is a helper with a name, so the author
// always knows who they're working with and what that stage is for.

export type StageId = 'write' | 'edit' | 'format' | 'design' | 'publish';

export interface Persona {
  stage: StageId;
  name: string;
  role: string;
  monogram: string;
  color: string;
  intro: string;
  promise: string;
  working: string;
  idle: string;
}

export const PERSONAS: Persona[] = [
  {
    stage: 'write',
    name: 'Wren',
    role: 'The Scribe',
    monogram: 'W',
    color: '#5b7a6a',
    intro: 'I keep your words safe while you write them, whether you type, dictate, or bring in a draft you already have.',
    promise: 'Type, dictate, transcribe, import',
    working: 'Wren is writing alongside you…',
    idle: 'Pick up where you left off.',
  },
  {
    stage: 'edit',
    name: 'Elias',
    role: 'The Editor',
    monogram: 'E',
    color: '#7a5b5b',
    intro: 'I read every chapter closely: the big picture first, then the sentences, then the commas. You decide what to keep.',
    promise: 'Developmental, line edits, proofreading',
    working: 'Elias is reading closely…',
    idle: 'Choose a chapter and the kind of read you want.',
  },
  {
    stage: 'format',
    name: 'Margot',
    role: 'The Typesetter',
    monogram: 'M',
    color: '#5b647a',
    intro: 'I set your manuscript into pages: trim size, margins, type, chapter openings. I check everything against KDP’s rules.',
    promise: 'Print PDF, EPUB, manuscript DOCX',
    working: 'Margot is setting your pages…',
    idle: 'Choose a trim size and a style.',
  },
  {
    stage: 'design',
    name: 'Theo',
    role: 'The Designer',
    monogram: 'T',
    color: '#7a6d5b',
    intro: 'I design your cover: front, spine, and back, sized to your exact page count so it’s ready for the printer.',
    promise: 'Full-wrap print cover, ebook cover',
    working: 'Theo is sketching…',
    idle: 'Start from a layout, then make it yours.',
  },
  {
    stage: 'publish',
    name: 'Ada',
    role: 'The Publisher',
    monogram: 'A',
    color: '#6a5b7a',
    intro: 'I get your book out the door: metadata, descriptions, keywords, and a checklist for KDP or a submission package for publishers.',
    promise: 'KDP setup, query letters, synopsis',
    working: 'Ada is drafting…',
    idle: 'Choose your path to readers.',
  },
];

export const persona = (stage: StageId): Persona => PERSONAS.find((p) => p.stage === stage)!;
