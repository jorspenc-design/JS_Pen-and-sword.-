// Prompt library for every AI feature in Pen and Sword. The client sends a task
// name plus the author's text; the server owns the instructions so they can be
// tuned in one place.

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface BookContext {
  title?: string;
  subtitle?: string;
  author?: string;
  genre?: string;
  audience?: string;
  synopsis?: string;
  chapterTitle?: string;
  chapterText?: string;
  manuscript?: string;
}

export type PersonaKey = 'scribe' | 'editor' | 'publisher';

export interface TaskSpec {
  label: string;
  persona: PersonaKey;
  effort: Effort;
  instruction: (input: { text?: string; instruction?: string }) => string;
}

export const SYSTEM_PROMPT = `You are the writing partner built into Pen and Sword, a self-publishing studio. You help one author take a book from first draft to a print-ready, publishable manuscript for Amazon KDP or a traditional publisher.

Principles:
- The book belongs to the author. Preserve their voice, diction, point of view, tense, and dialect unless asked to change them.
- Be specific. Point to exact lines, name the craft issue, and explain why it matters to a reader.
- Be honest and encouraging in equal measure; professional editors flag problems clearly without condescension.
- Respect the genre's conventions (including faith-based, literary, nonfiction, memoir, and genre fiction).
- When asked to rewrite or generate prose, return only the prose itself: no preamble, no quotation marks around it, no commentary afterward.
- When asked for an editorial report, use clear Markdown headings and bullet points.`;

const prose = (verb: string) => (i: { text?: string }) =>
  `${verb}\n\nReturn only the revised passage.\n\n<passage>\n${i.text ?? ''}\n</passage>`;

export const STREAM_TASKS: Record<string, TaskSpec> = {
  continue: { persona: 'scribe',
    label: 'Continue writing',
    effort: 'medium',
    instruction: (i) =>
      `Continue the manuscript from where this passage ends, matching the author's voice, pacing, and point of view. Write roughly 150–300 words that the author can keep, cut, or reshape. Do not repeat the passage.\n\n<passage>\n${i.text ?? ''}\n</passage>`,
  },
  rephrase: { persona: 'scribe', label: 'Rephrase', effort: 'low', instruction: prose('Rephrase this passage so it reads more smoothly while keeping its meaning, length, and voice.') },
  expand: { persona: 'scribe', label: 'Expand', effort: 'medium', instruction: prose('Expand this passage with more sensory detail, interiority, or explanation as fits the genre, roughly doubling its length without padding.') },
  tighten: { persona: 'scribe', label: 'Tighten', effort: 'low', instruction: prose('Tighten this passage: cut redundancy, filler, and weak qualifiers while keeping every essential beat and the author’s voice.') },
  grammar: { persona: 'scribe', label: 'Fix grammar & spelling', effort: 'low', instruction: prose('Correct grammar, spelling, punctuation, and usage only. Do not change style or word choice beyond what is needed for correctness.') },
  vivid: { persona: 'scribe', label: 'Show, don’t tell', effort: 'medium', instruction: prose('Revise this passage to show rather than tell: dramatize emotion and action through concrete detail, gesture, and dialogue.') },
  dialogue: { persona: 'scribe', label: 'Polish dialogue', effort: 'medium', instruction: prose('Polish the dialogue in this passage so each speaker sounds distinct and natural, with lean, varied dialogue tags and beats.') },
  custom: { persona: 'scribe',
    label: 'Custom instruction',
    effort: 'medium',
    instruction: (i) =>
      `${i.instruction ?? 'Improve this passage.'}\n\nIf the instruction asks for a rewrite, return only the revised passage; otherwise answer directly.\n\n<passage>\n${i.text ?? ''}\n</passage>`,
  },
  developmental: { persona: 'editor',
    label: 'Developmental edit',
    effort: 'high',
    instruction: () =>
      `Give a developmental edit of the chapter provided above, as a seasoned book editor would in an editorial letter. Cover, with headings:
1. **What's working** — specific strengths to keep.
2. **Structure & pacing** — scene goals, tension, where it drags or rushes.
3. **Character & voice** — motivation, consistency, distinctiveness.
4. **Clarity & logic** — confusing moments, continuity or plot holes, unanswered questions.
5. **Opening & ending hooks** — does it pull the reader in and forward?
6. **Top 5 revision priorities** — ranked, concrete, actionable.
Quote short phrases from the text to anchor each note.`,
  },
  lineEdit: { persona: 'editor',
    label: 'Line edit',
    effort: 'high',
    instruction: () =>
      `Line-edit the chapter provided above. Produce a Markdown report with:
- **Overall style notes** (rhythm, word choice, sentence variety, tone consistency).
- **Line notes**: a numbered list of the 15–30 most valuable sentence-level edits. For each, quote the original sentence, give a suggested revision, and a one-line reason.
Preserve the author's voice; suggest, don't rewrite wholesale.`,
  },
  beta: { persona: 'editor',
    label: 'Beta reader',
    effort: 'medium',
    instruction: () =>
      `React to the chapter provided above as a thoughtful target-audience beta reader. Describe, in first person: where you were hooked, where your attention drifted, what confused you, which characters or ideas you cared about, what you predicted, and what you want next. End with a 1–10 "would keep reading" score and why.`,
  },
  summary: { persona: 'editor',
    label: 'Chapter summary',
    effort: 'low',
    instruction: () =>
      `Summarize the chapter provided above in 3–6 sentences for the author's outline: key events or arguments, character or idea developments, and how it ends. Plain prose, no headings.`,
  },
  blurb: { persona: 'publisher',
    label: 'Book description',
    effort: 'high',
    instruction: (i) =>
      `Write a back-cover / Amazon book description (150–250 words) for this book. Open with a strong hook line, build intrigue or promise for the reader, and close with a compelling call to read. Match genre conventions. Plain paragraphs (you may bold the hook line with **). ${i.instruction ?? ''}`,
  },
  synopsis: { persona: 'publisher',
    label: 'Synopsis',
    effort: 'high',
    instruction: (i) =>
      `Write a one-page synopsis (about 500–700 words) of this book for a literary agent or publisher: present tense, third person, covering the full arc including the ending, main characters' motivations and change (or, for nonfiction, the thesis, structure, and reader takeaway). ${i.instruction ?? ''}`,
  },
  query: { persona: 'publisher',
    label: 'Query letter',
    effort: 'high',
    instruction: (i) =>
      `Draft a professional query letter to a literary agent or acquisitions editor for this book. Structure: personalization placeholder line, hook, 1–2 paragraph pitch, book specs (title, genre, word count, comparable titles placeholders [COMP 1], [COMP 2]), short author bio paragraph, polite close. Under 400 words. ${i.instruction ?? ''}`,
  },
  bio: { persona: 'publisher',
    label: 'Author bio',
    effort: 'medium',
    instruction: (i) =>
      `Write a third-person author bio (80–120 words) suitable for the back cover and Amazon Author Central, using these notes from the author: ${i.instruction ?? '(no notes provided — leave bracketed placeholders for details)'}`,
  },
  chat: { persona: 'scribe',
    label: 'Writing partner',
    effort: 'medium',
    instruction: (i) => i.instruction ?? '',
  },
};

export const JSON_TASKS = {
  proofread: {
    persona: 'editor' as PersonaKey,
    effort: 'medium' as Effort,
    instruction: () =>
      `Proofread the chapter provided above. Find objective errors only: spelling, grammar, punctuation, typos, repeated words, wrong word (e.g. their/there), capitalization, and inconsistent spelling of names. Ignore deliberate stylistic choices and dialect in dialogue.
For each issue, "original" must be copied EXACTLY from the text (a short span of 1–12 words that occurs in the chapter, unique enough to locate), and "suggestion" is the corrected replacement for that exact span. Return at most 60 issues, in order of appearance.`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['issues'],
      properties: {
        issues: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['original', 'suggestion', 'explanation', 'category'],
            properties: {
              original: { type: 'string' },
              suggestion: { type: 'string' },
              explanation: { type: 'string' },
              category: { type: 'string', enum: ['spelling', 'grammar', 'punctuation', 'typo', 'usage', 'consistency'] },
            },
          },
        },
      },
    },
  },
  marketing: {
    persona: 'publisher' as PersonaKey,
    effort: 'high' as Effort,
    instruction: () =>
      `Suggest Amazon KDP discoverability metadata for this book: exactly 7 backend keyword phrases (each under 50 characters, phrases readers actually search, not repeating words from the title, no competitor author names or trademarks), 3 suggested KDP/BISAC category paths, and 3 comparable titles readers of this book also enjoy (well-known books published in the last ~10 years where possible).`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['keywords', 'categories', 'comps'],
      properties: {
        keywords: { type: 'array', items: { type: 'string' } },
        categories: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'why'],
            properties: { path: { type: 'string' }, why: { type: 'string' } },
          },
        },
        comps: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'author', 'why'],
            properties: { title: { type: 'string' }, author: { type: 'string' }, why: { type: 'string' } },
          },
        },
      },
    },
  },
} as const;

export type JsonTaskName = keyof typeof JSON_TASKS;

/** Renders the book/chapter context as a single block placed before the task. */
export function renderContext(ctx: BookContext = {}): string {
  const lines: string[] = ['<book>'];
  if (ctx.title) lines.push(`Title: ${ctx.title}${ctx.subtitle ? ` — ${ctx.subtitle}` : ''}`);
  if (ctx.author) lines.push(`Author: ${ctx.author}`);
  if (ctx.genre) lines.push(`Genre: ${ctx.genre}`);
  if (ctx.audience) lines.push(`Audience: ${ctx.audience}`);
  if (ctx.synopsis) lines.push(`Author's synopsis/notes: ${ctx.synopsis}`);
  lines.push('</book>');
  if (ctx.manuscript) lines.push(`<manuscript>\n${ctx.manuscript}\n</manuscript>`);
  if (ctx.chapterText) {
    lines.push(`<chapter title="${(ctx.chapterTitle ?? 'Untitled').replace(/"/g, "'")}">\n${ctx.chapterText}\n</chapter>`);
  }
  return lines.join('\n');
}

const PERSONA_LINES: Record<PersonaKey, string> = {
  scribe: 'In the app you appear as Wren, the Scribe: a warm, attentive writing companion who helps the author get words on the page.',
  editor: 'In the app you appear as Elias, the Editor: a seasoned, candid, kind book editor.',
  publisher: 'In the app you appear as Ada, the Publisher: a savvy publishing professional who knows Amazon KDP and traditional publishing.',
};

export function systemFor(persona: PersonaKey): string {
  return `${SYSTEM_PROMPT}\n\n${PERSONA_LINES[persona]} Don't introduce yourself or sign your work unless asked.`;
}
