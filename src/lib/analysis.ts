// Instant, offline manuscript checks — the editor's "first read" before any AI.
import { countWords } from './util';

export interface Finding {
  kind: 'long-sentence' | 'adverb' | 'passive' | 'filler' | 'repetition' | 'cliche' | 'weak-start';
  label: string;
  excerpt: string;
  match: string;
}

export interface Analysis {
  words: number;
  sentences: number;
  paragraphs: number;
  avgSentence: number;
  readingMinutes: number;
  fleschEase: number;
  gradeLevel: number;
  dialogueRatio: number;
  overused: { word: string; count: number }[];
  findings: Finding[];
  counts: Record<Finding['kind'], number>;
}

const FILLERS = ['very', 'really', 'just', 'quite', 'rather', 'somewhat', 'basically', 'actually', 'literally', 'suddenly', 'totally', 'definitely', 'simply', 'certainly', 'perhaps', 'seemed to', 'began to', 'started to', 'in order to', 'kind of', 'sort of'];
const CLICHES = ['at the end of the day', 'all of a sudden', 'in the nick of time', 'time will tell', 'heart of gold', 'last but not least', 'avoid it like the plague', 'cold as ice', 'dead as a doornail', 'easier said than done', 'every cloud has a silver lining', 'fit as a fiddle', 'in the blink of an eye', 'only time will tell', 'think outside the box', 'a chill ran down', 'let out a breath', 'released a breath', 'heart pounded', 'blood ran cold', 'tip of the iceberg', 'calm before the storm'];
const NOT_ADVERBS = new Set(['only', 'family', 'early', 'holy', 'lovely', 'ugly', 'friendly', 'lonely', 'likely', 'reply', 'supply', 'apply', 'fly', 'belly', 'jelly', 'rally', 'ally', 'bully', 'italy', 'july', 'lily', 'sally', 'holly', 'emily', 'kelly', 'daily', 'weekly', 'monthly', 'costly', 'elderly', 'silly', 'chilly', 'hilly', 'curly', 'surly', 'burly', 'wily', 'oily', 'comply', 'imply', 'multiply', 'rely', 'anomaly', 'assembly', 'butterfly', 'homily', 'jolly', 'folly', 'melancholy', 'unholy', 'godly', 'heavenly', 'worldly', 'ghostly', 'deadly', 'cowardly', 'scholarly', 'orderly', 'kindly', 'lowly', 'manly', 'womanly', 'brotherly', 'sisterly', 'motherly', 'fatherly', 'bodily', 'lively', 'stately', 'timely', 'unlikely', 'gentlemanly', 'saintly', 'princely', 'queenly', 'kingly', 'beastly', 'measly', 'smelly', 'wobbly', 'bubbly', 'prickly', 'crinkly', 'sparkly']);
const STOP = new Set('the a an and or but of to in on at for with as by from that this it is was were be been are i you he she they we his her their our my your me him them us its not no so if then than there here what which who whom when where why how all any each few more most other some such into out up down over under again further once had has have do does did will would should could can may might must shall said says say one two also just very about after before because while through during between against own same too off only now well back even still like'.split(' '));

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 0);
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + length + 50);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
}

export function analyze(text: string): Analysis {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const sentences = splitSentences(text);
  const wordsList = text.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
  const words = countWords(text);
  const syl = wordsList.reduce((n, w) => n + syllables(w), 0);
  const sCount = Math.max(1, sentences.length);
  const wCount = Math.max(1, words);
  const fleschEase = 206.835 - 1.015 * (wCount / sCount) - 84.6 * (syl / wCount);
  const gradeLevel = 0.39 * (wCount / sCount) + 11.8 * (syl / wCount) - 15.59;

  const dialogue = (text.match(/[“"][^”"]{1,800}[”"]/g) ?? []).reduce((n, q) => n + countWords(q), 0);

  const findings: Finding[] = [];
  const lower = text.toLowerCase();

  for (const s of sentences) {
    const n = countWords(s);
    if (n > 35) findings.push({ kind: 'long-sentence', label: `${n}-word sentence`, excerpt: s.length > 240 ? `${s.slice(0, 240)}…` : s, match: s.slice(0, 60) });
  }

  for (const m of text.matchAll(/\b([A-Za-z]{3,}ly)\b/g)) {
    if (NOT_ADVERBS.has(m[1].toLowerCase())) continue;
    findings.push({ kind: 'adverb', label: `Adverb “${m[1]}”`, excerpt: excerptAround(text, m.index!, m[0].length), match: m[1] });
  }

  for (const m of text.matchAll(/\b(am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+ed|known|seen|taken|given|done|made|written|found|told|thrown|shown|broken|chosen|driven|eaten|forgotten|hidden|stolen|sworn|torn|worn|born|beaten|bitten|forgiven|frozen)\b/gi)) {
    findings.push({ kind: 'passive', label: 'Possible passive voice', excerpt: excerptAround(text, m.index!, m[0].length), match: m[0] });
  }

  for (const f of FILLERS) {
    const re = new RegExp(`\\b${f.replace(/ /g, '\\s+')}\\b`, 'gi');
    for (const m of text.matchAll(re)) {
      findings.push({ kind: 'filler', label: `Filler “${m[0]}”`, excerpt: excerptAround(text, m.index!, m[0].length), match: m[0] });
    }
  }

  for (const c of CLICHES) {
    let idx = lower.indexOf(c);
    while (idx !== -1) {
      findings.push({ kind: 'cliche', label: `Cliché “${c}”`, excerpt: excerptAround(text, idx, c.length), match: text.slice(idx, idx + c.length) });
      idx = lower.indexOf(c, idx + c.length);
    }
  }

  // Three or more sentences in a row starting with the same word.
  for (let i = 2; i < sentences.length; i++) {
    const first = (s: string) => (s.replace(/^["“‘(]+/, '').match(/^[\p{L}']+/u)?.[0] ?? '').toLowerCase();
    const a = first(sentences[i - 2]);
    if (a && a === first(sentences[i - 1]) && a === first(sentences[i])) {
      findings.push({ kind: 'weak-start', label: `Three sentences in a row start with “${a}”`, excerpt: sentences[i].slice(0, 200), match: sentences[i].slice(0, 60) });
    }
  }

  // Overused content words.
  const freq = new Map<string, number>();
  for (const w of wordsList) {
    const k = w.toLowerCase().replace(/[’']s$/, '');
    if (k.length < 4 || STOP.has(k)) continue;
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const threshold = Math.max(4, Math.round(words / 600));
  const overused = [...freq.entries()]
    .filter(([, c]) => c >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));

  // Same word repeated within a short window ("the door … the door").
  const tokens = [...text.matchAll(/[\p{L}][\p{L}'’-]*/gu)];
  const lastSeen = new Map<string, number>();
  tokens.forEach((t, i) => {
    const k = t[0].toLowerCase();
    if (k.length < 5 || STOP.has(k)) return;
    const prev = lastSeen.get(k);
    if (prev !== undefined && i - prev <= 12) {
      findings.push({ kind: 'repetition', label: `“${t[0]}” repeated closely`, excerpt: excerptAround(text, t.index!, t[0].length), match: t[0] });
    }
    lastSeen.set(k, i);
  });

  const counts = { 'long-sentence': 0, adverb: 0, passive: 0, filler: 0, repetition: 0, cliche: 0, 'weak-start': 0 } as Analysis['counts'];
  for (const f of findings) counts[f.kind]++;

  return {
    words,
    sentences: sentences.length,
    paragraphs,
    avgSentence: Math.round((wCount / sCount) * 10) / 10,
    readingMinutes: Math.max(1, Math.round(words / 250)),
    fleschEase: Math.round(Math.max(0, Math.min(100, fleschEase))),
    gradeLevel: Math.round(Math.max(0, gradeLevel) * 10) / 10,
    dialogueRatio: words ? Math.round((dialogue / words) * 100) : 0,
    overused,
    findings,
    counts,
  };
}

export function readabilityLabel(ease: number): string {
  if (ease >= 80) return 'Very easy';
  if (ease >= 70) return 'Easy';
  if (ease >= 60) return 'Plain English';
  if (ease >= 50) return 'Fairly difficult';
  if (ease >= 30) return 'Difficult';
  return 'Very difficult';
}
