/// <reference lib="webworker" />
// Transcribes recorded audio entirely in the browser with OpenAI's open Whisper
// model (via Transformers.js). Nothing is uploaded; the model downloads once
// and is cached by the browser.

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

type Pipeline = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
let cached: { model: string; pipe: Pipeline } | null = null;

self.onmessage = async (e: MessageEvent<{ audio: Float32Array; model: string; language: string }>) => {
  const { audio, model, language } = e.data;
  try {
    if (!cached || cached.model !== model) {
      self.postMessage({ type: 'status', message: 'Downloading the speech model (first time only)…' });
      const { pipeline } = await import(/* @vite-ignore */ TRANSFORMERS_URL);
      const files = new Map<string, number>();
      const pipe = (await pipeline('automatic-speech-recognition', model, {
        dtype: 'q8',
        progress_callback: (p: { status: string; file?: string; progress?: number }) => {
          if (p.status === 'progress' && p.file) {
            files.set(p.file, p.progress ?? 0);
            const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size;
            self.postMessage({ type: 'progress', value: avg / 100, message: 'Downloading the speech model…' });
          }
        },
      })) as Pipeline;
      cached = { model, pipe };
    }
    self.postMessage({ type: 'status', message: 'Listening to your recording…' });
    const output = await cached.pipe(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: model.endsWith('.en') ? undefined : language,
      task: 'transcribe',
    });
    const text = Array.isArray(output) ? output.map((o) => o.text).join(' ') : output.text;
    self.postMessage({ type: 'done', text: text.trim() });
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
