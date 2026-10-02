// Live dictation through the browser's Web Speech API (Chrome, Edge, Safari).
// Spoken punctuation commands are turned into marks as you talk.

export interface DictationCallbacks {
  onFinal: (text: string, opts: { newParagraph: boolean; sceneBreak: boolean }) => void;
  onInterim: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function dictationSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

const COMMANDS: [RegExp, string][] = [
  [/\s*\b(period|full stop)\b/gi, '.'],
  [/\s*\bcomma\b/gi, ','],
  [/\s*\bquestion mark\b/gi, '?'],
  [/\s*\bexclamation (point|mark)\b/gi, '!'],
  [/\s*\bsemicolon\b/gi, ';'],
  [/\s*\bcolon\b/gi, ':'],
  [/\s*\bellipsis\b/gi, '…'],
  [/\s*\b(em )?dash\b\s*/gi, '—'],
  [/\b(open quote|begin quote)\s*/gi, '“'],
  [/\s*\b(close quote|end quote|unquote)\b/gi, '”'],
  [/\b(open paren|open parenthesis)\s*/gi, '('],
  [/\s*\b(close paren|close parenthesis)\b/gi, ')'],
];

/** Applies spoken punctuation and sentence capitalization. Exported for tests. */
export function applyVoiceCommands(raw: string, capitalizeFirst: boolean): string {
  let s = ` ${raw.trim()} `;
  for (const [re, mark] of COMMANDS) s = s.replace(re, mark);
  s = s.replace(/\s+([.,?!;:…”)])/g, '$1').replace(/([“(])\s+/g, '$1').replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/([.?!…]["”]?\s+)(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  s = s.replace(/\bi\b/g, 'I');
  if (capitalizeFirst) s = s.replace(/^([“(]?)(\p{Ll})/u, (_, a: string, b: string) => a + b.toUpperCase());
  return s;
}

export function startDictation(cb: DictationCallbacks, lang = 'en-US'): () => void {
  const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) {
    cb.onError('Dictation needs Chrome, Edge, or Safari.');
    return () => {};
  }
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = lang;
  let stopped = false;

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = r[0].transcript;
      if (!r.isFinal) {
        interim += text;
        continue;
      }
      const parts = text.split(/\b(new paragraph|next paragraph|new line|scene break)\b/i);
      parts.forEach((part) => {
        const lower = part.trim().toLowerCase();
        if (lower === 'new paragraph' || lower === 'next paragraph' || lower === 'new line') {
          cb.onFinal('', { newParagraph: true, sceneBreak: false });
        } else if (lower === 'scene break') {
          cb.onFinal('', { newParagraph: false, sceneBreak: true });
        } else if (part.trim()) {
          cb.onFinal(part, { newParagraph: false, sceneBreak: false });
        }
      });
    }
    cb.onInterim(interim);
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    cb.onError(e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in your browser’s site settings.' : `Dictation error: ${e.error}`);
  };
  rec.onend = () => {
    // Browsers end sessions after silence; keep listening until the author stops.
    if (!stopped) {
      try { rec.start(); return; } catch { /* fall through */ }
    }
    cb.onEnd();
  };
  rec.start();
  return () => {
    stopped = true;
    rec.stop();
  };
}
